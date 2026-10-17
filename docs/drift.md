# Driftsguide

Denne guiden er for den som administrerer klubb-instansen løpende. Den forutsetter at appen allerede er satt opp — se [docs/oppsett.md](oppsett.md) for førstegangs-oppsett.

---

## 1. Legge til og administrere medlemmer

### Legge til nytt medlem

1. Logg inn som admin.
2. Gå til **Klubbinfo** → **Medlemmer** → «Legg til medlem».
3. Fyll inn navn og e-postadresse. Appen oppretter brukeren og genererer et **midlertidig passord**, som både vises i admin-UI-et og sendes til medlemmet i velkomst-e-post via Resend.
4. Etter første innlogging kan brukeren selv endre passord og redigere profilen (profilbilde, fødselsdato, varsel-innstillinger) under «Rediger profil».

### Deaktivere et medlem

Appen har bevisst en svært tilbakeholden slettings-modell for å bevare historikk i kåringer, påmeldinger og chat. Hard delete er ikke eksponert som vanlig drifts-handling — det finnes en «Slett medlem»-knapp i admin-redigering, men i praksis brukes deaktivering:

1. Klubbinfo → Medlemmer → velg personen → Rediger.
2. Under «Tilgang» → **Status**, velg segmentet **Deaktivert**.

En deaktivert bruker vises ikke i listen over påmeldte og kan ikke logge inn, men historiske data beholdes. Faktisk sletting (hard delete) av en profil bør gjøres via SQL hvis det noen gang trengs — kontakt utvikler.

### Sette generalsekretær

Bare én person kan ha generalsekretær-rollen. Den settes via Klubbinfo → Medlemmer → velg person → Rediger → «Generalsekretær»-toggle. Databasen avviser forsøk på å sette rollen på to personer samtidig.

---

## 2. Testmodus for varsler

Testmodus begrenser varsel-utsendelse til én bestemt e-postadresse i stedet for alle aktive brukere. Nyttig når du vil teste et oppsett uten å sende til hele klubben.

### Slå på/av testmodus

Testmodus styres i appen: **Innstillinger → «Testmodus»** (siden er kun synlig for admins). Togglen skrur testmodus på/av, og nedtrekkslisten rett under velger hvilken admin som mottar varslene. Når togglen er på, sender `sendVarsel()` kun til den valgte test-eposten, uansett hvem som faktisk skal varsles.

Bare aktive admin-profiler kan velges som test-mottaker — det garanterer at varsler i testmodus aldri havner hos et vanlig medlem, og at mottakeren alltid finnes i `profiles` (ellers ville varselet droppes stille).

### Lokalt utviklingsmiljø

Apper som kjører mot `localhost` blokkerer varsler automatisk (for å unngå at testdataene dukker opp på ekte mobiler). Denne sperren overstyres ved å sette `ALLOW_LOCAL_NOTIFICATIONS=true` i `.env.local` — men bruk det med omhu.

---

## 3. Funksjonsflagg

Appen har en generell `app_innstillinger`-tabell for admin-kontrollerte on/off-bryteren. Disse styres fra **Innstillinger** (kun synlig for admins).

### Fond-fanen

Fond-fanen er av som default (kun synlig for admin). Når bryteren **«Vis Fond-fanen for alle medlemmer»** slås på under **Innstillinger**, blir fanen synlig for alle medlemmer. Dette er nyttig når klubben aktiverer Fond-styring eller ønsker en testfase der kun admin ser det.

---

## 4. Varsel-feilsøking

### varsel_logg-tabellen

Alle utsendte push-varsler og e-poster logges i `varsel_logg`-tabellen. Kolonner av interesse:

| Kolonne | Innhold |
|---|---|
| `profil_id` | Hvem varselet ble sendt til |
| `type` | Varseltype (f.eks. `paaminne_7`, `ny_kommentar`, `purring`) |
| `kanal` | `push`, `epost`, eller `begge` |
| `tittel` / `melding` | Innholdet som ble sendt |
| `arrangement_id` | Koblet arrangement, om relevant |
| `opprettet` | Tidspunkt for utsendelse |

Spørring i SQL-editor for å se de siste varslene:

```sql
SELECT * FROM varsel_logg
ORDER BY opprettet DESC
LIMIT 50;
```

### Vanlige feil

**Push-varsler ankommer ikke:**
- Sjekk at `NEXT_PUBLIC_VAPID_PUBLIC_KEY` og `VAPID_PRIVATE_KEY` er satt og stemmer overens (de genereres som par).
- Sjekk at brukeren har godkjent push-tillatelse i nettleseren og slått på varsler under Profil → Innstillinger → Varsler.
- Push-abonnementer har begrenset levetid — brukeren må åpne appen for å fornye abonnementet.

**E-poster ankommer ikke:**
- Sjekk at `RESEND_API_KEY` er satt.
- Sjekk at domenet ditt er verifisert i Resend Dashboard.
- Resend har sending-kvote på gratis-plan — sjekk om kvoten er nådd.

**Cron-påminnelser kjører ikke:**
- Gå til GitHub → Actions → fanen for `paaminne.yml` og se loggene for siste kjøring.
- `401`-feil betyr at `CRON_SECRET` i GitHub Actions-secrets ikke stemmer med Vercel env-var `CRON_SECRET`.
- Sjekk at `APP_URL` i GitHub Actions-secrets peker til riktig prod-URL uten trailing slash.

---

## 5. Klubb-tabell — engangssteg etter migrasjon 160

Migrasjon 160 introduserer `public.klubb`-tabellen, som oppbevarer informasjon om klubben selv (navn, slug for subdomener, o.l.). Tabellen opprettes med én standardrad med nøytralt navn.

**Etter du har kjørt migrasjonen første gang, må du sette klubbens riktige navn i Supabase SQL-editor:**

```sql
update public.klubb
set navn = '<klubbens navn>', slug = '<slug>'
where id = '00000000-0000-4000-a000-000000000001';
```

**Slug-en** (små bokstaver, tall og bindestrek, 2–40 tegn) velges en gang og blir senere klubbens subdomene, så velg den med omhu.

---

## 6. Migrasjoner ved oppgradering

Når du oppdaterer kodebasen fra repoet, sjekk alltid om det er nye migrasjoner:

```bash
# Se om det er nye filer i supabase/migrations/ siden forrige kjøring
git log --oneline supabase/migrations/

# Kjør migrasjoner mot prod-databasen
npx supabase db push

# Regenerer TypeScript-typer (nødvendig hvis nye tabeller/kolonner er lagt til)
npx supabase gen types typescript --project-id <prosjekt-id> > lib/supabase/database.types.ts
```

Migrasjoner kjøres sekvensielt og er idempotente — det er trygt å kjøre `db push` selv om ingen nye filer er lagt til.

Se [docs/oppsett.md](oppsett.md) for full referanse til oppsett-kommandoene.

### Migrasjon 161: klubb_id på klubbeide tabeller

Denne migrasjonen legger til `klubb_id` (fremmednøkkel til `public.klubb`) på 46 tabeller for å forberede multi-tenant-arkitektur. Den tar korte låser på hver tabell. Gjør dette i rekkefølge:

1. **Backup først.** Kjør `db-backup.yml` (eller `pg_dump`) og bekreft at dumpen er lesbar.
2. **Tidspunkt.** Velg et tidspunkt med lite trafikk, utenfor cron- og backupvinduer.
3. **Dry-run, så ekte kjøring.** `npx supabase db push --dry-run`, deretter ekte kjøring. Migrasjonen setter `lock_timeout` til 3 s — treffer den en lås, rulles hele fila tilbake. Vent noen minutter og kjør på nytt. Vær forberedt på `WARNING 25P01` «SET LOCAL can only be used in transaction blocks» — det er forventet (gjelder likevel for resten av migrasjonen).
4. **Verifiser** i SQL-editoren:

   ```sql
   -- Tabeller uten klubb_id: skal gi nøyaktig 7 rader
   select t.table_name from information_schema.tables t
   where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
     and not exists (select 1 from information_schema.columns c
       where c.table_schema = 'public' and c.table_name = t.table_name and c.column_name = 'klubb_id')
   order by 1;

   -- Fremmednøkler til klubb på klubb_id: skal være 46
   select count(*) from pg_constraint
   where contype = 'f' and confrelid = 'public.klubb'::regclass and conname like '%klubb_id_fkey';

   -- Skal være false
   select has_function_privilege('anon', 'public.standard_klubb_id()', 'execute');
   ```

5. **Rollback** (kun hvis migrasjonen feilet): `alter table public.<t> drop column klubb_id;` for alle tabeller som fikk den, så `drop function public.standard_klubb_id();`, så `delete from supabase_migrations.schema_migrations where version = '161';`. Revert deretter migrasjonsfila og typene i repoet.

### Migrasjon 166: aktiver Custom Access Token-hooken (obligatorisk per instans)

Migrasjonen legger ut funksjonen `public.custom_access_token_hook`, men ingenting kjører den før du slår den på. Uten aktivering mangler `klubb_id`/`rolle`/`klubb_status` i tokenet; instansen kjører da på fallback (standardklubben) til du aktiverer. Fra versjon 2.4b er aktivering et krav: først etter 7 døgn uten `klubb.claim.mangler` i feil-loggen.

**Hva som kan bevises før aktivering, og hva som ikke kan.** Hooken er `security invoker`: databasen kaller den som `supabase_auth_admin`, og det er den rollens grants og RLS-policyen på `medlemskap` som avgjør om oppslaget virker. På Supabase kan du ikke kjøre den stien selv: SQL-editoren kjører som `postgres`, som ikke kan `set role supabase_auth_admin` (gir `42501 permission denied to set role`), og `supabase_auth_admin` sitt passord er ikke tilgjengelig. Bevisene er derfor fordelt slik:

| Hva | Hvor det bevises |
|---|---|
| Hooken virker kalt som `supabase_auth_admin` med migrasjonens grants og policy | CI, steget «Verifiser JWT-hook» (`.github/workflows/pr-check.yml`), som kjører som `supabase_admin` og bytter rolle per kall, mot nøyaktig samme migrasjon |
| De samme grantene, policyen og RLS-innstillingene finnes i denne instansen | Blokk 1 under, som `postgres` |
| Funksjonskroppen og valgregelen gir riktig svar for din bruker | Blokk 2 under, som `postgres`. Dette sier **ingenting** om rettighetsstien, fordi `postgres` eier `medlemskap` og ikke berøres av kolonnegrantene eller policyen |
| Invoker-stien virker i denne instansen, gjennom GoTrue | Først ved aktivering (steg 2). Aktiveringen er den første ekte kjøringen |

1. **Tørrkjøring** i SQL-editoren som `postgres`.

   *Blokk 1 (rettighetene):* kopier [hele `supabase/sjekk/166_toerrkjoering.sql`](../supabase/sjekk/166_toerrkjoering.sql) og kjør den. Alle 17 rader skal ha `ok = true`. CI kjører den samme fila som `postgres` («Tørrkjøring fra runbooken») og krever det samme, så fila og migrasjonen kan ikke komme i utakt uten at CI blir rød. Den kontrollerer at hooken er invoker med tomt `search_path`, at bare `supabase_auth_admin` kan kalle den, at rollen har `usage` på `public` og `select` på nøyaktig de fem kolonnene hooken leser, at policyen finnes, at RLS er på for `medlemskap` (ellers betyr policyen ingenting) og ikke tvunget på eieren, og at rollen **ikke** har noe mer: ingen tabell-select, ingen andre kolonner, ingen skriverett, ingen annen policy. En rad med `false` betyr at noe er annerledes enn det CI testet. Ikke aktiver før alle er `true`.

   *Blokk 2 (funksjonskroppen for din bruker):* skal gi `klubb_status: aktiv`, standardklubbens uuid og din rolle (bytt inn din e-post):

   ```sql
   with u as (select id from auth.users where email = '<din e-post>')
   select public.custom_access_token_hook(jsonb_build_object(
     'user_id', u.id,
     'claims', jsonb_build_object('sub',u.id,'role','authenticated','aud','authenticated','aal','aal1','session_id',gen_random_uuid()),
     'authentication_method','password')) -> 'claims' from u;
   ```

   `set role supabase_auth_admin` foran blokk 2 virker ikke her (42501). Det er grunnen til at invoker-stien bevises i CI og ved aktivering, ikke i SQL-editoren.

2. **Aktiver, og test selv med en gang.** Fordi dette er første gang hooken kjøres som `supabase_auth_admin` i denne instansen:
   - Velg et tidspunkt der du har en time til rådighet.
   - Supabase Dashboard → Authentication → Hooks → Custom Access Token → Postgres → schema `public`, funksjon `custom_access_token_hook` → Enable. Godta grantene Dashboard eventuelt foreslår (forenlige med migrasjonen); kjør blokk 1 på nytt etterpå hvis du godtok noe.
   - Logg ut og inn igjen selv **umiddelbart**.
   - **Feiler innloggingen, slå hooken av igjen i samme panel** (ett klikk). Bare den som logger inn eller får tokenet fornyet mens hooken står på, rammes. Tokenet fornyes omtrent én gang i timen, så slår du den av innen få minutter, merker i praksis ingen andre noe.

3. **Verifiser:** innloggingen virker; Dashboard → Logs → Postgres har ingen `custom_access_token_hook feilet`; dekod `sb-*-auth-token`-cookien (nyttelasten er del 2 av `access_token`) og se `klubb_status: "aktiv"`.
4. **Rollback:** slå av hooken i samme panel. Funksjonen kan stå. Skal den fjernes, deaktiver FØRST hooken i Dashboard (ellers blokkerer GoTrue all innlogging), og drop deretter policyen «Auth-hooken leser medlemskap på tvers av klubber», kolonne-grantet, `custom_access_token_hook(jsonb)` og `jwt_klubb_id()`.

---

## 7. Backup

> **Viktig:** Supabase **free tier har ingen automatiske backups** — det er en
> Pro-plan-funksjon. Uten egen rutine finnes klubbens data kun i prod-databasen.

Repoet har derfor egen backup-rutine (se [disaster-recovery.md](disaster-recovery.md) for full gjenopprettingsprosedyre):

1. Sett GitHub-secreten `SUPABASE_DB_URL` (session pooler-URL — se kommentar
   øverst i `.github/workflows/db-backup.yml`).
2. Test med **Run workflow**-knappen på Database-backup.
3. Fjern kommentaren på `schedule:`-linjene i workflowen for daglig backup
   (03:30 UTC). Dumpen lagres som Actions-artifact med 90 dagers retention.
4. Kjør **Database restore-drill** (Run workflow) etter oppsett og deretter
   årlig — den gjenoppretter siste dump i en testcontainer og verifiserer
   dataene. Utestet backup er ingen backup.

Backup av bilder (Cloudflare R2) er ikke automatisk — R2 har ingen innebygd snapshot-funksjon på fri-tier. Kritiske bilder bør kopieres manuelt ved behov.

---

## 8. Sikkerhet

En fullstendig gjennomgang av sikkerhetsmodellen er dokumentert i [docs/sikkerhetsgjennomgang-2026-06.md](sikkerhetsgjennomgang-2026-06.md). Viktigste punkter for løpende drift:

- Roter `VAPID_PRIVATE_KEY`, `RESEND_API_KEY`, `CRON_SECRET` og R2-nøklene ved mistanke om lekkasje — alle er enkle å regenerere.
- `SUPABASE_SERVICE_ROLE_KEY` omgår RLS. Oppbevar den som «Sensitive» i Vercel og aldri i kildekode.
- Admin-rettigheter i appen er ikke det samme som tilgang til Supabase Dashboard eller Vercel. Kontroller hvem som er invitert til disse tjenestene separat.
