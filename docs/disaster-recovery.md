# Disaster recovery — gjenoppretting av databasen

Prosedyre for å komme tilbake etter tap eller korrupsjon av prod-databasen
(feilslått migrasjon, utilsiktet sletting, RLS-uhell). Skrevet for å følges
under stress — les den én gang i fredstid.

## Nøkkeltall

- **RPO (maks datatap):** inntil 24 timer — `db-backup.yml` dumper daglig kl 03:30 UTC
  (når schedule er aktivert, se [drift.md §5](drift.md)).
- **RTO (gjenopprettingstid):** målt av `db-restore-drill.yml` — se siste
  drill-kjøring i Actions-loggen. Selve pg_restore tar sekunder på en typisk
  klubb-database; total RTO domineres av oppsett av mål-instansen.
- **Dekning:** schemaene `public` (alle appdata), `auth` (brukere/innlogging)
  og `storage` (fil-metadata). Bildefiler ligger i R2/Supabase Storage og
  omfattes ikke.

## Hva som trengs

- Tilgang til GitHub-repoet (dumps ligger som Actions-artifacts, 90 dagers vindu)
- Supabase-konto for å opprette/nullstille mål-instans
- `psql`/`pg_restore` versjon ≥ 17 lokalt, eller kjør fra en maskin som har det

## Prosedyre

### 1. Hent nyeste dump

Via nettleser: Actions → **Database-backup** → nyeste grønne kjøring → Artifacts.

Via CLI:

```bash
id=$(gh api "repos/<eier>/<repo>/actions/artifacts?per_page=100" \
  --jq '[.artifacts[] | select(.name | startswith("db-backup-")) | select(.expired == false)] | sort_by(.created_at) | last | .id')
gh api "repos/<eier>/<repo>/actions/artifacts/$id/zip" > dump.zip && unzip dump.zip
```

### 2. Klargjør mål-instans

- **Samme Supabase-prosjekt (vanligst):** hvis skaden er logisk (dårlig
  migrasjon, slettede rader) og instansen ellers lever, gjenopprett dit.
  Vurder først om et målrettet inngrep (restore av enkelt-tabeller, se steg 4)
  er tryggere enn full overskriving.
- **Nytt Supabase-prosjekt:** opprett prosjekt, kjør **ikke** migrasjonene —
  dumpen inneholder skjemaet. Hent ny DB-URL (session pooler).

### 3. Gjenopprett

```bash
pg_restore \
  --dbname "postgresql://postgres.<ref>:<passord>@aws-0-<region>.pooler.supabase.com:5432/postgres" \
  --no-owner --no-privileges \
  --clean --if-exists \
  db-backup-<dato>.dump
```

- `--clean --if-exists` dropper eksisterende objekter før gjenoppretting —
  riktig ved gjenoppretting til samme prosjekt. Utelat ved helt tomt prosjekt.
- `--no-owner --no-privileges` er nødvendig: dumpen refererer Supabase-interne
  roller. Noen feilmeldinger om roller/grants og `auth`-interne objekter er
  forventet og ufarlige — kjøreregelen er at verifiseringen i steg 5 avgjør.
- Til et **nytt** prosjekt: RLS-policyer og grants følger med dumpen, men
  sjekk at `er_admin()` og RLS virker (logg inn som vanlig medlem og se at
  appen oppfører seg riktig).

### 4. Alternativ: gjenopprett enkelt-tabeller

Custom-formatet støtter selektiv gjenoppretting — nyttig når bare én tabell
er skadet:

```bash
pg_restore --dbname "<url>" --no-owner --no-privileges \
  --data-only --table=kaaring_vinnere db-backup-<dato>.dump
```

(Tøm tabellen først ved behov: `truncate public.kaaring_vinnere cascade;` —
tenk gjennom FK-avhengigheter.)

### 5. Verifiser

Kjør mot gjenopprettet database (drill-workflowen kjører de samme sjekkene):

```sql
select
  (select count(*) from public.profiles)      as profiler,
  (select count(*) from public.arrangementer) as arrangementer,
  (select count(*) from auth.users)           as brukere,
  (select max(aar) from public.kaaring_vinnere) as siste_kaaring;
```

Deretter i appen: logg inn, sjekk agendaen, åpne et arrangement, send en
chat-melding.

### 6. Etterarbeid

- Peker appen på et **nytt** prosjekt: oppdater Vercel-env (`NEXT_PUBLIC_SUPABASE_URL`,
  anon/service-nøkler), GitHub-secreten `SUPABASE_DB_URL`, og regenerer typer.
- Skriv ned hva som skjedde og hvor lang tid det tok — oppdater RTO-anslaget her.

## Kjente fallgruver

- **pg_restore/psql må være ≥ serverens major-versjon** (Postgres 17). Eldre
  klient gir versjonsfeil.
- **GitHub-runnere har ikke IPv6** — bruk alltid session pooler-URL
  (`aws-0-<region>.pooler.supabase.com:5432`), ikke `db.<ref>.supabase.co`.
- **Artifacts utløper etter 90 dager** og forsvinner hvis repoet slettes —
  backupen deler skjebne med GitHub-kontoen. Vurdert akseptabelt; primærtrusselen
  er databasefeil, ikke tap av GitHub.
- **Auth-hemmeligheter:** dumpen inneholder passord-hasher (bcrypt) — behandle
  nedlastede dumps som sensitive filer og slett dem lokalt etter bruk.

## Drill

Kjør **Database restore-drill** fra Actions-fanen (workflow_dispatch) årlig og
etter større skjema-endringer. Den henter siste dump, gjenoppretter i en fersk
postgres:17-container og verifiserer kjernedataene. Feiler drillen: behandle
det som at backup ikke finnes, og feilsøk umiddelbart.
