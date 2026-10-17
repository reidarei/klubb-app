# Klubb-app — Løsningsdesign

> **Status:** Implementert og live på Vercel. Oppdatert 2026-04-15 (varsler, tidshåndtering). Koden er autoritativ — dette dokumentet er referanse.

> Basert på kravspesifikasjonen i `HK-app_kravspesifikasjon.md` (låst).
> Arkitektur: **Next.js 15 App Router + Supabase + PWA**.

---

## 1. Tekniske beslutninger

| # | Spørsmål | Beslutning | Begrunnelse |
|---|----------|-----------|-------------|
| T1 | Rollemodell i database | `profiles.rolle` enum (`admin` / `medlem`) | Enklest. RLS-policyer sjekker `rolle` direkte. Ingen ekstra tabell. |
| T2 | Versjonshistorikk vedtekter | Full historikk via `vedtekter_versjoner`-tabell | UC-7.2 krever vedtaksdato og endringsnotat per versjon. |
| T3 | E-post-tjeneste | **Resend** | 100 gratis e-post/dag, moderne API, god Next.js-integrasjon. Mer enn nok for 15–20 brukere. |
| T4 | Triggering av påminnelser | Vercel Cron → `/api/cron/paaminne` | Daglig cron kl. 06:00 UTC. Datobasert sjekk mot norsk tid via `norskDatoNaa()`. |
| T5 | Datamodell for turer | Én `arrangementer`-tabell med `type`-discriminator + nullable tur-felter | 15–20 brukere, enkel modell. Unngår JOIN for de vanligste spørringene. |
| T6 | Datamodell for kåringer | `kaaringer` + `kaaring_vinnere` (junction). Vinner er enten profil eller arrangement. | V1 er manuell registrering. `kaaring_stemmer` legges til i V2. |
| T7 | Editor for vedtekter | Markdown med preview | Balanse mellom formatering og enkelhet. Rendres med `react-markdown`. |
| T8 | Web Push-oppsett | VAPID-nøkler i env, `push_subscriptions`-tabell, service worker i `public/` | Standard Web Push-arkitektur. Service worker håndterer push-events og klikk. |

---

## 2. Databaseskjema

Alle tabeller ligger i `public`-skjemaet. Supabase Auth sin `auth.users`-tabell brukes for autentisering — `profiles` utvider denne med app-spesifikke felter.

Konvensjon: Alle kolonnenavn på norsk, `snake_case`. Tidsstempler i `timestamptz` (UTC).

### 2.1 profiles

Opprettes automatisk via en database-trigger når en ny bruker registreres i `auth.users`.

```sql
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  navn          text not null,
  epost         text not null,
  telefon       text,
  bilde_url     text,
  rolle         text not null default 'medlem' check (rolle in ('admin', 'medlem')),
  aktiv         boolean not null default true,
  opprettet     timestamptz not null default now(),
  oppdatert     timestamptz not null default now()
);
```

**Trigger:** `on auth.users insert` → opprett rad i `profiles` med `id`, `epost` fra auth-bruker, og `rolle = 'medlem'`.

**Merknad:** `aktiv = false` brukes for inaktive medlemmer. De kan ikke logge inn, men historiske data beholdes.

**Fra migrasjon 163 er `rolle`, `aktiv`, `faar_issue_varsler`, `faar_feilvarsler` og `bursdagsgratulasjon_aktiv` et enveis speil av `medlemskap`** (§ 2.12): vernet på verdi, paritetssjekket ved commit og skrivbart kun via `medlemskap`. Speilet fjernes når flere klubber blir aktive.

### 2.2 arrangementer

```sql
create type arrangementstype as enum ('moete', 'tur');

create table arrangementer (
  id              uuid primary key default gen_random_uuid(),
  type            arrangementstype not null,
  tittel          text not null,
  beskrivelse     text,
  start_tidspunkt timestamptz not null,
  oppmoetested    text,
  bilde_url       text,
  opprettet_av    uuid not null references profiles(id),
  opprettet       timestamptz not null default now(),
  oppdatert       timestamptz not null default now(),

  -- Tur-spesifikke felter (nullable, kun relevant når type = 'tur')
  slutt_tidspunkt timestamptz,
  destinasjon     text,
  pris_per_person integer,  -- i hele kroner

  -- Blåtur-sensurering: JSON-objekt med feltnavn → boolean
  -- Eksempel: {"destinasjon": true, "pris_per_person": true}
  sensurerte_felt jsonb not null default '{}'::jsonb
);
```

**Blåtur-sensurering:** `sensurerte_felt` er et JSON-objekt der nøklene er feltnavn og verdiene er `true` for sensurerte felt. Frontend sjekker dette og viser sladdet innhold. Kun arrangøren (`opprettet_av`) ser gjennom sladden.

**Tur-validering:** En `check`-constraint sikrer at tur-felter bare brukes når `type = 'tur'`:

```sql
alter table arrangementer add constraint tur_felt_kun_for_tur check (
  type = 'tur' or (
    slutt_tidspunkt is null and
    destinasjon is null and
    pris_per_person is null and
    sensurerte_felt = '{}'::jsonb
  )
);
```

### 2.3 paameldinger

```sql
create type paameldingsstatus as enum ('ja', 'nei', 'kanskje');

create table paameldinger (
  arrangement_id  uuid not null references arrangementer(id) on delete cascade,
  profil_id       uuid not null references profiles(id) on delete cascade,
  status          paameldingsstatus not null,
  oppdatert       timestamptz not null default now(),
  primary key (arrangement_id, profil_id)
);
```

**Merknad:** Medlemmer som ikke har svart har ingen rad i denne tabellen — frontend viser dem som "Ikke svart".

### 2.4 arrangoransvar

```sql
create table arrangoransvar (
  id               uuid primary key default gen_random_uuid(),
  aar              integer not null,
  arrangement_navn text not null,  -- f.eks. 'januar-februar', 'julebord', 'tur'
  ansvarlig_id     uuid references profiles(id),        -- nullable: kan opprettes uten ansvarlig, fylles inn senere
  arrangement_id   uuid references arrangementer(id),  -- kobles når arrangementet opprettes
  purredato        date,            -- dato for purring; null = ingen purring for dette ansvaret
  opprettet        timestamptz not null default now(),
  oppdatert        timestamptz not null default now(),

  unique (aar, arrangement_navn, ansvarlig_id)
);
```

**`arrangement_navn`** er en fritekst-streng (ikke enum) for å støtte navnene "januar-februar", "mars-april", osv. uten å hardkode dem i databasen.

**`purredato`** settes eksplisitt av admin når ansvar registreres. `null` betyr ingen purring (f.eks. for turer). UI-et foreslår en dato basert på `arrangement_navn` (f.eks. gjenkjenner "mars" → foreslår 1. mars samme år), men admin kan alltid overstyre. pg_cron-jobben trenger ingen tekstparsing — den sjekker bare om `purredato <= CURRENT_DATE` og `arrangement_id IS NULL`.

**UI:** `arrangement_navn` rendres som en combobox — en nedtrekksmeny som henter alle distinkte verdier fra `arrangoransvar`-tabellen som forslag, men tillater fritekst. HTML-primitiv: `<input list="...">` med `<datalist>` populert fra databasen, eller en Radix-basert combobox-komponent.

**`arrangement_id`** er nullable — den fylles inn når den ansvarlige faktisk oppretter arrangementet. Brukes til å vise om arrangementet er lagt inn ennå (UC-4.2) og for purring (UC-5.4).

### 2.5 kaaringer

Kåringer støtter én eller flere vinnere via en egen `kaaring_vinnere`-tabell. En vinner er enten en herr fra `profiles`, eller et arrangement fra `arrangementer` (f.eks. "Årets møte").

```sql
create table kaaringer (
  id           uuid primary key default gen_random_uuid(),
  aar          integer not null,
  kategori     text not null,    -- f.eks. 'Årets herre', 'Årets møte'
  opprettet_av uuid not null references profiles(id),
  opprettet    timestamptz not null default now(),
  oppdatert    timestamptz not null default now()
);

create table kaaring_vinnere (
  id             uuid primary key default gen_random_uuid(),
  kaaring_id     uuid not null references kaaringer(id) on delete cascade,
  profil_id      uuid references profiles(id),       -- settes når vinner er en herr
  arrangement_id uuid references arrangementer(id),  -- settes når vinner er et arrangement
  begrunnelse    text,                                -- fritekst, valgfri begrunnelse per vinner
  check (
    (profil_id is not null)::int +
    (arrangement_id is not null)::int = 1             -- nøyaktig én av de to må være satt
  )
);
```

**Eksempel:** "Årets herre 2024" med to vinnere → én rad i `kaaringer` + to rader i `kaaring_vinnere` med `profil_id`. "Årets møte 2024: mars-april-møtet" → én rad i `kaaringer` + én rad i `kaaring_vinnere` med `arrangement_id`.

### 2.6 vedtekter

Innholdssider (vedtekter, regler, historikk) med full versjonshistorikk.

```sql
create table vedtekter (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,  -- f.eks. 'vedtekter', 'regler', 'historikk'
  tittel      text not null,
  innhold     text not null,         -- markdown
  oppdatert   timestamptz not null default now()
);

create table vedtekter_versjoner (
  id            uuid primary key default gen_random_uuid(),
  vedtekt_id    uuid not null references vedtekter(id) on delete cascade,
  innhold       text not null,         -- markdown-snapshot
  vedtaksdato   date not null,         -- dato for vedtaket som hjemler endringen
  endringsnotat text not null,         -- fritekst: hva ble endret og hvorfor
  endret_av     uuid not null references profiles(id),
  opprettet     timestamptz not null default now()
);
```

**Flyt:** Når admin lagrer en endring (UC-7.2), opprettes en ny rad i `vedtekter_versjoner` med det gamle innholdet, og `vedtekter.innhold` oppdateres til det nye. Slik er `vedtekter`-tabellen alltid oppdatert, mens `vedtekter_versjoner` er historikken.

### 2.7 push_subscriptions

```sql
create table push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  profil_id   uuid not null references profiles(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  opprettet   timestamptz not null default now()
);
```

### 2.8 varsel_innstillinger

Admin-konfigurerbare innstillinger for varsler og purringer.

```sql
create table varsel_innstillinger (
  id              uuid primary key default gen_random_uuid(),
  noekkel         text not null unique,  -- f.eks. 'paaminnelse_7d', 'paaminnelse_1d', 'purring_aktiv'
  aktiv           boolean not null default true,
  dager_foer      integer,               -- antall dager før arrangement (for påminnelser)
  beskrivelse     text,                  -- lesbar beskrivelse for admin-UI
  oppdatert       timestamptz not null default now()
);
```

**Seed-data:**

| noekkel | aktiv | dager_foer | beskrivelse |
|---------|-------|------------|-------------|
| `paaminnelse_7d` | true | 7 | Påminnelse 7 dager før arrangement |
| `paaminnelse_1d` | true | 1 | Påminnelse dagen før arrangement |
| `purring_aktiv` | true | null | Purring til ansvarlige — dato settes per rad i `arrangoransvar.purredato` |

**Merknad:** Purringer har ikke lenger hardkodede datoer per arrangementstype i denne tabellen. `purring_aktiv` er en global bryter — hvis den er `false` sendes ingen purringer uavhengig av `purredato` i `arrangoransvar`. Selve purredatoen eies av den enkelte `arrangoransvar`-raden, satt av admin ved registrering.

---

### 2.9 klubb

Multi-tenant steg 1.1: én rad per klubb appen betjener. Migrasjon 160.

```sql
create table klubb (
  id        uuid primary key default gen_random_uuid(),
  slug      text not null unique,   -- små bokstaver/tall/bindestrek, 2-40 tegn; blir subdomene i 5.1
  navn      text not null,          -- 1-60 tegn
  opprettet timestamptz not null default now()
);
```

**Første rad** har fast id `00000000-0000-4000-a000-000000000001` og er klubben som eier instansen. Migrasjonen setter nøytralt navn («Klubben», slug `klubb`); navn og slug settes med et engangssteg etter migrering (docs/drift.md § 4). Hvordan id-en brukes som default for `klubb_id`: se § 2.10.

**RLS:** alle innloggede kan lese; ingen skrivepolicy for authenticated (klubber opprettes først i 5.3). Innstrammes til egen klubb i 2.3.

### 2.10 klubb_id på klubbeide tabeller

Multi-tenant steg 1.2 (#861, #865). Migrasjon 161.

**Klassifisering av de 53 tabellene i `public`:** 49 er klubbeide og har `klubb_id` (46 fra migrasjon 161, tre til fra 164); 4 står på en eksplisitt unntaksliste.

- *Rot:* `klubb`.
- *Globale:* `profiles` (personen er global; `rolle` og `faar_*` flyttes til medlemskap i 2.1), `push_subscriptions` (per enhet — samme telefon skal få varsler fra alle klubbene), `pass_info` (passet tilhører personen; klubbkonteksten bor i `pass_tilgang_forespørsel`).
- *Tatt inn i 164 (#868):* `varsel_preferanser`, `posisjon_deling` og `posisjon_punkt` sto først på unntakslista fordi de tilhører medlemskapet. De fikk `klubb_id` i migrasjon 164, se § 2.12.

Klassifiseringen ligger som data i `__tests__/helpers/klubb-tabeller.ts` og vaktes av `__tests__/migrasjon-klubb-id.test.ts`.

**Løpende vakt (1.3, #866):** `__tests__/skjemavakt-klubb.test.ts` leser alle migrasjonene og krever at hver tabell har `klubb_id` eller står i unntakslista; `migrasjon-klubb-id.test.ts` vokter kun migrasjon 161 slik den ble skrevet. Tabellopprettelse den ikke gjenkjenner (`create table` inni `do $$`/`execute`, `as select`, `partition of`) gjør den rød i stedet for å slippe tabellen gjennom. To pinnede lister kan bare krympe: `KLUBB_UTEN_KLUBB_POLICY` (tømmes av 2.3, #870; en tabell som noen gang har hatt en klubb-policy kan ikke føres tilbake) og `KLUBB_FK_UTEN_STOETTEINDEKS` (tømmes av 2.1b #895, 2.3 og 6.2 #886).

**Kolonnen:**

```sql
klubb_id uuid not null default public.standard_klubb_id()
  references public.klubb(id) on update cascade on delete restrict
```

`standard_klubb_id()` er eneste sted den første klubbens uuid står i skjemaet. Funksjonen er `stable`, ikke `security definer`; `authenticated` og `service_role` har `execute` (en default evalueres med rollen som setter inn), `anon` har ikke. Innmaten byttes til JWT-claim uten fallback (med `raise`) i 2.4b, og `feil_logg` får `drop not null` samtidig.

**Indekser:** 10 rot-indekser med `klubb_id` først (`arrangementer`, `meldinger`, `klubb_chat`, `album`, `poll`, `feil_logg`, `vitals_logg`, `kaaring_vinnere`, `arrangoransvar`, `kart_markering`). Barne-indekser kommer i 2.1b (#895), 2.3 og 6.2.

**Nøkler:** flyttet i 1.4 (#867), se § 2.11.

**Array-insert:** postgrest-js sender `null` for manglende nøkler i en array-insert der minst én rad har `klubb_id`, som gir 23502. Alle rader må ha nøkkelen, eller kallet bruker `{ defaultToNull: false }` (pinnet i `e2e/rls/klubb-id.spec.ts`).

### 2.11 Unike nøkler per klubb

Multi-tenant steg 1.4 (#861, #867). Migrasjon 162.

**Regelen:** hver primærnøkkel og unike nøkkel på en klubbeid tabell har `klubb_id` som første kolonne. Tre godkjente former, vaktet av psql-steget «Verifiser unike nøkler per klubb» i `pr-check.yml`:

- (a) `klubb_id` er første nøkkelkolonne (`INCLUDE`-kolonner telles ikke).
- (b) Surrogatnøkkel: én kolonne som heter `id`.
- (c) En kolonne i nøkkelen er FK til en klubbeid forelder (`paameldinger (arrangement_id, profil_id)`): enten en enkeltkolonne-FK, eller — siden 2.1b (#895, § 2.13) — en sammensatt FK `(klubb_id, kol)` mot `forelder (klubb_id, id)` der kolonnen inngår sammen med `klubb_id`. «Enkeltkolonne» betyr altså at nøkkelen ikke trenger `klubb_id` fordi klubben følger forelderen. Å legge til `klubb_id` ville gjort nøkkelen romsligere, ikke strengere. Krysskobling stoppes av de sammensatte FK-ene.

Ingen unntaksliste: en nøkkel som ikke passer a–c er rød. `chat_reaksjoner` har en polymorf `melding_id` uten FK, så klubben kan ikke følge en forelder — derfor fikk begge nøklene `klubb_id` først som alle andre.

**De 21 nøklene som ble endret** (samme navn beholdt): PK på `aktivitet_dag`, `aktivitet_uke`, `app_innstillinger`, `bursdagsbilde`, `fond_navn_alias`, `innspill_kobling`, `kart_symbol_tilpasning`; unik på `arrangoransvar`, `samtale`, `varsel_innstillinger`, `vedtekter` (`vedtekter_versjoner` refererer `vedtekter(id)`, ikke slug); PK og «én emoji per bruker» på `chat_reaksjoner`; unike indekser på `feil_logg` (to), `klubb_chat`, `melding_chat`, `meldinger` og `varsel_logg` (dedup); og PK `(klubb_id)` på én-rad-tabellene `klubb_info` og `fond_kontant`, som mistet `id`-kolonnen. `on conflict`-målet må ha nøyaktig samme kolonnesett som nøkkelen, så `tell_aktivitet()`, `krev_bursdagsbilde()` og alle `onConflict` i koden ble byttet samtidig.

**Seeds** skrives per klubb fra nå (`insert … select k.id, … from public.klubb k on conflict (klubb_id, …) do nothing`). Klubb nr. 2 trenger egne standarddata (5.3).

**Dedup-doktrinen** i CLAUDE.md § Policy: Varsler gjelder uendret innenfor én klubb: indeksen er `(klubb_id, dedup_noekkel, profil_id)`, så navnerom-prefikset skal ikke bære klubben.

### 2.12 medlemskap

Multi-tenant steg 2.1a (#861, #868). Migrasjon 163.

**Skjema:** `medlemskap (klubb_id, profil_id)` er primærnøkkel; `rolle` (`medlem`/`admin`/`generalsekretaer`), `aktiv` og de tre admin-styrte flaggene `faar_issue_varsler`, `faar_feilvarsler`, `bursdagsgratulasjon_aktiv` bor her, per klubb. FK til `profiles` heter `medlemskap_profil_id_fkey` (embeds må oppgi hintet, jf. `getProfil()`). Partial unik indeks `medlemskap_unik_generalsekretaer (klubb_id) where rolle = 'generalsekretaer'`: maks én generalsekretær per klubb.

**RLS og grants:** `authenticated` har `select` og en KOLONNE-grant på `update` (de fem kolonnene + `oppdatert`), aldri tabellnivå, så `klubb_id`/`profil_id` kan ikke flyttes fra klienten. Select: egen klubb og `aktiv`, men admin ser også inaktive (en UPDATE må la den nye raden passere select-policyen, ellers feiler deaktivering). Update: `er_admin(klubb_id)`. Ingen insert/delete-policy: rader opprettes av `handle_ny_bruker()` (klubb fra `app_metadata.klubb_id`, fallback standardklubben) og `service_role`.

**Speil, vern, paritet** (til PR C): `medlemskap_speil_til_profiles` (trigger) skriver de fem kolonnene til `profiles` for standardklubben. `beskytt_profil_kolonner` avviser enhver direkte endring av dem på `profiles` som ikke er lik medlemskapet (`medlemskap.speil.vern`, gjelder også service_role). Constraint triggers `medlemskap_speil_paritet*` sjekker ved commit at begge sider stemmer (`medlemskap.speil.paritet`). Standardklubbens uuid står bokstavelig i disse, ikke `standard_klubb_id()`.

**Rollefunksjoner:** `er_admin()` / `er_admin(klubb_id)` og `er_generalsekretaer()` / `er_generalsekretaer(klubb_id)` leser `medlemskap` og krever `aktiv`. `sett_generalsekretaer`/`fjern_generalsekretaer` har samme signatur, men går mot `medlemskap`.

**Admin-redigering:** RPC `oppdater_medlem_admin(...)` (security invoker) skriver profilfeltene og medlemskapet i én transaksjon, med `for update`-låsen som håndhever at en sittende generalsekretær aldri får rollen skrevet der.

### Medlemskapets data (164)

Multi-tenant steg 2.1 PR B (#868). Migrasjon 164.

`varsel_preferanser`, `posisjon_deling` og `posisjon_punkt` tilhører medlemskapet og har `klubb_id` med sammensatt FK `(klubb_id, profil_id)` mot `medlemskap (klubb_id, profil_id)`, `on update cascade on delete cascade` (`*_medlemskap_fkey`). Slettes et medlemskap, går varselvalg og posisjonsdata med. FK-ene mot `profiles` beholdes.

PK på `varsel_preferanser` og `posisjon_deling` er `(klubb_id, profil_id)`; `posisjon_punkt` beholder `id`. `on conflict`/`onConflict` MÅ ha samme kolonnesett som nøkkelen (ellers 42P10), så koden bruker `'klubb_id,profil_id'`; `klubb_id` fylles av defaulten til 2.4.

Triggeren som oppretter varselvalg ligger på `medlemskap` (`ved_nytt_medlemskap_varsel_preferanser`), ikke på `profiles`: `handle_ny_bruker()` setter inn profilen FØR medlemskapet, så en profil-trigger ville brutt den sammensatte FK-en.

**PostgREST:** `medlemskap` er nå koblingstabell mellom `profiles` og `klubb`, og `profiles` har flere stier til `varsel_preferanser`/`posisjon_*`. Nye embeds oppgir FK-hint (`profiles!posisjon_deling_profil_id_fkey`, `medlemskap_profil_id_fkey`) for å unngå PGRST201.

Policyene på de tre tabellene er uendret og skrives om i 2.3 (#870); sammensatte FK-er mot `arrangementer` kom i 2.1b (#895, § 2.13).

### Medlemskap-FK-er på innholdstabellene (165)

Multi-tenant steg 2.1b (#895). Migrasjon 165. Ved siden av FK-ene mot `profiles` har 31 profilkolonner på klubbeide tabeller en sammensatt FK `(klubb_id, kol)` → `medlemskap (klubb_id, profil_id)`, `on update cascade`, NO ACTION ved sletting (`<tabell>_<kol>_medlemskap_fkey`): personen må være medlem av klubben raden tilhører. NO ACTION og ikke RESTRICT fordi sletting av en auth-bruker cascader til både `profiles` og barneradene, og NO ACTION sjekkes først ved slutten av setningen, så begge stiene rekker å fullføre. Omvendt kan et medlemskap ikke slettes alene mens personen har innhold i klubben (23503) — innholdet flyttes eller slettes først.

Ti profilkolonner har bevisst ingen slik FK («bare personen» — historikkmarkører som `besluttet_av`, `endret_av`, `slettet_av`, innboksen `varsel_logg.profil_id`, `feil_logg.profil_id` og de globale tabellene), listet med begrunnelse i `PROFIL_FK_BARE_PERSON` (`__tests__/helpers/klubb-tabeller.ts`) og speilet i psql-steget «Verifiser sammensatte fremmednøkler». `kaaring_vinnere.opprettet_av` er klassifisert «mot medlemskap» sammen med `kaaring_vinnere.profil_id`.

**PostgREST:** `paameldinger`, `poll_stemme`, `melding_reaksjon` og `album_bilde_reaksjon` er ikke lenger koblingstabeller (profiles↔forelder), mens `bursdagsbilde` og `chat_reaksjoner` er blitt nye koblingstabeller mellom `profiles` og `medlemskap`. Ingen embed i koden bruker disse som m2m-sti i dag; nye embeds mot dem oppgir FK-hint.

### 2.13 Sammensatte fremmednøkler

Multi-tenant steg 2.1b (#861, #895). Migrasjon 165.

**Regelen:** en FK mellom to klubbeide tabeller er sammensatt, `(klubb_id, forelder_id)` → `forelder (klubb_id, id)`, så databasen avviser en barnerad som peker på en forelder i en annen klubb (23503), uavhengig av appkode og RLS. Forelderne har `unique (klubb_id, id)` (`<forelder>_klubb_id_id_key`; `klubb_id` først jf. § 2.11, så `(id, klubb_id)` ville vært rødt). Det er 9 foreldre — `arrangementer`, `poll`, `album_bilde`, `meldinger`, `kaaringmaler`, `album`, `samtale`, `poll_valg`, `vedtekter` (`arrangementmaler` er ikke FK-mål) — og 30 FK-er. De er vaktet av psql-steget «Verifiser sammensatte fremmednøkler» (katalogsjekk) og `e2e/rls/klubb-fk.spec.ts`.

**Navn beholdes.** Hver sammensatt FK har NØYAKTIG det gamle constraint-navnet (den gamle droppes i samme migrasjon): koden bruker navnene som PostgREST-hint (`album_bilde!album_bilde_album_id_fkey`, `album_bilde!album_cover_fk`, `album!meldinger_album_id_fkey`), og ligger både en gammel og en ny FK mellom to tabeller, svarer PostgREST PGRST201.

**Sletteoppførsel er uendret:** 19 cascade, 10 set null, 1 restrict (`poll.kaaring_mal_id`). `set null` får kolonneliste (`on delete set null (<kol>)`, PostgreSQL ≥ 15): uten den ville sletting av forelderen også nullet `klubb_id`, som er not null. Alle har `on update cascade`, så omnummerering av en klubb går gjennom. Barnesiden får en støtteindeks `<barn>_<kol>_klubb_id_idx (kol, klubb_id)`; de gamle enkeltindeksene beholdes til 2.3.

**Medlemskap-FK-er** (31 profilkolonner) beskrives under § 2.12.

**Appfeil:** 23503 vises som feilmelding kun i skjemaer med lagreknapp (SkjemaBar/LagreKnapp); `VedtektVisning` fikk try/catch av den grunn.

**Kjent og uløst:** `album.opprettet_av` og `album_bilde.lastet_opp_av` er `not null` med `on delete set null` mot `profiles`, så sletting av en profil med album gir 23502. Selvmotsigelsen finnes før og etter 2.1b og er ikke løst her.

### 2.14 Klubb i innloggings-tokenet

Multi-tenant steg 2.2 (#861, #869). Migrasjon 166.

**Hooken:** `public.custom_access_token_hook(event jsonb)` kjøres av GoTrue (som `supabase_auth_admin`) hver gang et token utstedes eller fornyes, og legger tre claims på tokenet: `klubb_status`, `klubb_id` og `rolle`. Den er `security invoker` med `search_path = ''`, leser `medlemskap` via en kolonne-grant (`profil_id, klubb_id, rolle, aktiv, opprettet`) og en egen, VARIG policy («Auth-hooken leser medlemskap på tvers av klubber») — hooken må se alle klubbers medlemskap for å velge. 2.3 (#870) skal la policyen stå; psql-steget «Verifiser JWT-hook» går rødt for alle seed-profiler hvis den droppes.

**Valgregel:** eldste aktive medlemskap, `order by opprettet, klubb_id limit 1`. Før 2.4 finnes det bare ett.

**`klubb_status`:** `aktiv` (da følger `klubb_id` og `rolle`), `ingen_medlemskap` (ingen aktivt medlemskap; ingen `klubb_id`/`rolle` i tokenet) eller `feil` (hooken fanget en feil; samme utseende uten `klubb_id`/`rolle`). Hooken kaster aldri og skriver aldri: en kastende hook ville fått GoTrue til å avvise innloggingen for alle, og innloggingssiden ville da meldt «feil passord» (derfor mapper `lib/innlogging-feil.ts` bare `invalid_credentials` til den teksten). `feil`-grenen bygger kun jsonb fra eventet, aldri et nytt tabelloppslag. Innplantede `klubb_id`/`rolle`/`klubb_status` i eventet strippes først.

**`rolle`-claimen er ren informasjon.** Et token er opptil en time gammelt og kan ikke trekkes tilbake, så `rolle` brukes ALDRI til autorisasjon — rolle leses ferskt fra `medlemskap` (`er_admin()`, `ensure*()`). Det finnes derfor med vilje ingen `jwt_rolle()`. `jwt_klubb_id()` (regex før uuid-cast, ugyldig claim gir null) er til RLS-policyer i 2.3/2.4.

**Aktivering per instans:** migrasjonen legger bare funksjonen ut; hooken må slås på i Dashboard (Authentication → Hooks → Custom Access Token), lokalt via `[auth.hook.custom_access_token]` i `supabase/config.toml`. Se `docs/drift.md` § 4. Til den er slått på mangler claimene; ingen kode leser dem før `aktivKlubbId()` bytter til tokenet (2.2 PR 2, fallback til standardklubben) og 2.4b (#896) gjør fraværet fail-closed.

**`aktivKlubbId()` leser claimen (fase 1, fallback; 2.2 PR 2).** Funksjonen er `cache(async …)` og dekoder payloaden til access-tokenet fra `getSession()` (lest én gang per request via `hentSesjon()` i `lib/sesjon.ts`, delt med `getInnloggetBruker()`) — uten signaturverifisering, fordi middleware har verifisert signatur og `exp` på samme cookie (vaktet av `__tests__/klubb-kontekst-middleware.test.ts`: rutene som når fram uten verifisert sesjon utledes fra `middleware.ts` — matcher, tidlig-retur og `erOffentlig` — og ingen av dem, eller omslagene deres, når `lib/klubb-kontekst`). Ingen `getClaims()`, `getUser()` eller JWKS. I fase 1 returnerer den ALLTID standardklubben; claimen er bare en observasjon som logges med `logg.feil` ved avvik (`warn` persisteres ikke): `klubb.claim.mangler` (ingen markør), `.hookfeil` (`klubb_status = 'feil'`), `.avvik` (`aktiv` med annen klubb enn standard) og `.inkonsistent` (uleselig payload, ukjent status eller `aktiv` uten gyldig uuid). `klubb_status`/`klubb_id` følger med i `ctx` (stdout og Sentry); `feil_logg`-raden bærer bare event-navnet. `ingen_medlemskap` og manglende sesjon er stille. `ensure*()` henter klubb-id-en parallelt med `getUser()` og returnerer den som `klubbId`. Fallbacken fjernes i 2.4b (#896).

### 2.15 Klubb i RLS: aktiv_klubb()

Multi-tenant steg 2.3 (#861, #870). Migrasjon 167. Down-SQL: `supabase/sjekk/167_ned.sql`.

**Klubbleddet.** Hver policy på en klubbeid tabell (151 `alter policy`, navnene beholdt) har `klubb_id = (select public.aktiv_klubb())` i både `using` og `with check`: rader i en annen klubb er usynlige, og en rad kan verken settes inn i eller flyttes til en annen klubb (42501). `klubb` har `id = (select public.aktiv_klubb())`. `push_subscriptions` og `pass_info` er globale og røres ikke; hook-policyen på `medlemskap` (`to supabase_auth_admin using (true)`, #869) er varig.

**`aktiv_klubb()`** = tokenets klubb (`jwt_klubb_id()`) hvis `auth.uid()` har et AKTIVT medlemskap der, ellers null. `security definer` med `search_path = ''` (medlemskap-policyen bruker selv funksjonen, så invoker ville gitt rekursjon). En definer-funksjon inlines aldri, så `(select public.aktiv_klubb())` er OBLIGATORISK i policyer — uten select-pakken kalles den per rad. Samme form for `(select public.er_admin((select public.aktiv_klubb())))` og `(select auth.uid())`. Vaktet av EXPLAIN i CI-steget «Verifiser klubb-RLS (#870)» (krever `InitPlan`, ingen policyfunksjon i et `Filter:`) og av `__tests__/skjemavakt-klubb.test.ts`.

**Fallback (variant B, beslutning 17.10.2026).** `coalesce(jwt_klubb_id(), standard_klubb_id())`: uten klubb-claim (hooken av/feilet) gjelder standardklubben. Mildt: en claim vinner alltid, og kravet om aktivt medlemskap består, så ingenting lekker. Fjernes i 2.4b (#896) sammen med fallbacken i `aktivKlubbId()`, da blir aktiv_klubb() feile-lukket uten claim.

**Deaktivering virker uten nytt token.** Tokenet bærer klubben, ikke aktiv-status: `aktiv_klubb()` slår opp medlemskapet hver gang, så et deaktivert medlem mister alt umiddelbart. Rolle leses fortsatt aldri fra tokenet.

**Inaktive.** `medlemskap` SELECT: `klubb_id = aktiv_klubb() and (aktiv or er_admin(aktiv_klubb()))`. `profiles` SELECT: personer med medlemskap i klubben (inaktive kun for admin) — erstatter `aktiv = true`. Admin ser og kan reaktivere inaktive (`oppdater_medlem_admin`). `exists(… profiles.aktiv)` i 21 policyer er borte; samtale-INSERT krever aktivt medlemskap for begge parter i samtalens klubb.

**Ikke medlem.** Innlogget uten aktivt medlemskap: `getProfil()` gir null, og `(app)/layout.tsx` rendrer `IkkeMedGjengen` med teksten «Du er ikke medlem i en klubb.» og Logg ut i stedet for faner og innhold. Ingen redirect — `/login` sender innloggede til `/`.

**Utenfor.** Seks `security definer`-RPC-er omgår RLS (`get_statistikk`, `tell_poll_stemmer`, `lukk_kaaringspoll_naa` m.fl.): eget issue 2.3b (#907). Overflødige enkeltindekser droppes etter EXPLAIN mot prod (egen migrasjon). Storage-policyer: 2.6/4.2.

---

---

## 3. RLS-policyer

Alle tabeller har RLS aktivert. Policyer bruker `auth.uid()` og en hjelpefunksjon for rollesjekk:

```sql
-- Hjelpefunksjon: er innlogget bruker admin?
create function er_admin()
returns boolean as $$
  select rolle = 'admin'
  from profiles
  where id = auth.uid()
$$ language sql security definer stable;
```

### Per tabell

| Tabell | SELECT | INSERT | UPDATE | DELETE |
|--------|--------|--------|--------|--------|
| **profiles** | Alle aktive brukere | Ingen (trigger) | Egen profil ELLER admin | Ingen (bruk `aktiv = false`) |
| **medlemskap** | Egen klubb og `aktiv` (admin ser også inaktive) | Ingen (trigger) | Admin | Ingen |
| **arrangementer** | Alle | Alle | Eier ELLER admin | Eier ELLER admin |
| **paameldinger** | Alle | Egen rad | Egen rad | Egen rad |
| **arrangoransvar** | Alle | Admin | Admin | Admin |
| **kaaringer** | Alle | Admin | Admin | Admin |
| **kaaring_vinnere** | Alle | Admin | Admin | Admin |
| **vedtekter** | Alle | Admin | Admin | Ingen (versjoneres) |
| **vedtekter_versjoner** | Alle | Admin | Ingen (immutable) | Ingen |
| **push_subscriptions** | Egen | Egen | Egen | Egen |
| **varsel_innstillinger** | Alle | Admin | Admin | Ingen |

**Eksempel — arrangementer SELECT:**
```sql
create policy "Alle kan lese arrangementer"
  on arrangementer for select
  using (true);
```

**Eksempel — arrangementer UPDATE:**
```sql
create policy "Eier eller admin kan oppdatere"
  on arrangementer for update
  using (opprettet_av = auth.uid() or er_admin());
```

---

## 4. Sidestruktur og navigasjon

### 4.1 App Router-ruter

```
app/
├── (auth)/
│   └── login/
│       └── page.tsx              # UC-1.1, UC-1.2
├── (app)/
│   ├── layout.tsx                # Bottom-nav, auth-guard wrapper
│   ├── page.tsx                  # Forside: kommende arrangementer (UC-3.1)
│   ├── arrangementer/
│   │   ├── ny/
│   │   │   └── page.tsx          # Opprett arrangement (UC-3.2)
│   │   ├── [id]/
│   │   │   ├── page.tsx          # Detaljer + påmelding (UC-3.3, UC-3.4)
│   │   │   └── rediger/
│   │   │       └── page.tsx      # Rediger arrangement (UC-3.5)
│   │   └── tidligere/
│   │       └── page.tsx          # Tidligere arrangementer (UC-3.6)
│   ├── klubbinfo/
│   │   ├── page.tsx              # Oversikt: vedtekter, medlemmer, statistikk
│   │   ├── medlemmer/
│   │   │   └── page.tsx          # Medlemsliste (UC-2.1, UC-2.2)
│   │   ├── vedtekter/
│   │   │   └── [slug]/
│   │   │       └── page.tsx      # Les/rediger vedtekt (UC-7.1, UC-7.2)
│   │   └── statistikk/
│   │       └── page.tsx          # Statistikk (UC-7.3)
│   ├── kaaringer/
│   │   └── page.tsx              # Kåringsliste + admin CRUD (UC-6.1, UC-6.2)
│   ├── arrangoransvar/
│   │   └── page.tsx              # Årets ansvar (UC-4.1, UC-4.2)
│   ├── profil/
│   │   └── page.tsx              # Egen profil + logg ut (UC-2.3, UC-1.3)
│   └── innstillinger/
│       └── page.tsx              # Admin: varsler og purringer (UC-5.5)
├── api/
│   ├── admin/
│   │   └── opprett-medlem/
│   │       └── route.ts          # Service-role endpoint (UC-2.2)
│   ├── push/
│   │   ├── subscribe/
│   │   │   └── route.ts          # Registrer push-subscription
│   │   └── send/
│   │       └── route.ts          # Send push-varsel (intern, kalles fra Edge Functions)
│   └── varsler/
│       └── send-epost/
│           └── route.ts          # Send e-post via Resend (intern)
├── manifest.ts                   # PWA-manifest
├── sw.ts                         # Service worker (Web Push)
├── middleware.ts                  # Auth-guard
└── layout.tsx                    # Root layout
```

### 4.2 Bottom-nav

Fire tabs i bottom-nav (vises i `(app)/layout.tsx`):

| Tab | Ikon | Rute | Innhold |
|-----|------|------|---------|
| **Hjem** | Kalender | `/` | Kommende arrangementer |
| **Klubbinfo** | Info-sirkel | `/klubbinfo` | Medlemmer, vedtekter, statistikk |
| **Kåringer** | Trofé | `/kaaringer` | Kåringsliste |
| **Profil** | Person | `/profil` | Egen profil, logg ut |

**Navigasjon utover bottom-nav:**
- "Arrangøransvar" nås via Klubbinfo-siden eller via profil (egne ansvar)
- "Innstillinger" (tannhjul) vises øverst til høyre kun for admin
- "Tidligere arrangementer" nås via en lenke på forsiden

### 4.3 Middleware (auth-guard)

```typescript
// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Opprett Supabase-klient med cookies
  // Sjekk om brukeren er innlogget
  // Hvis ikke: redirect til /login
  // Hvis ja og på /login: redirect til /
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js).*)'],
}
```

---

## 5. API-lag

### 5.1 Server Actions vs Route Handlers

| Bruk | Mekanisme | Grunn |
|------|-----------|-------|
| CRUD-operasjoner (arrangement, påmelding, kåring, vedtekter, arrangøransvar) | **Server Actions** | Direkte fra form/button, ingen manuell fetch. Supabase-klient via cookies. |
| Admin: opprett medlem | **Route Handler** (`POST /api/admin/opprett-medlem`) | Krever `service_role`-nøkkel for `auth.admin.createUser()`. Kan ikke eksponere denne i Server Action. |
| Push-subscription | **Route Handler** (`POST /api/push/subscribe`) | Kalles fra service worker / client-side JS. |
| Send varsler (push + e-post) | **Edge Functions** (Supabase) | Trigges av pg_cron eller database webhooks. Kjører utenfor Next.js. |

### 5.2 Server Actions — oversikt

```
lib/actions/
├── arrangementer.ts    # opprett, oppdater, slett arrangement
├── paameldinger.ts     # oppdater påmeldingsstatus
├── kaaringer.ts        # opprett, oppdater, slett kåring (admin)
├── vedtekter.ts        # oppdater vedtekt (admin)
├── arrangoransvar.ts   # sett/oppdater ansvar (admin)
└── profil.ts           # oppdater egen profil
```

**Eksempel — oppdater påmelding:**

```typescript
// lib/actions/paameldinger.ts
'use server'

import { createServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function oppdaterPaamelding(
  arrangementId: string,
  status: 'ja' | 'nei' | 'kanskje'
) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('paameldinger')
    .upsert({
      arrangement_id: arrangementId,
      profil_id: user!.id,
      status,
      oppdatert: new Date().toISOString(),
    })

  if (error) throw error
  revalidatePath(`/arrangementer/${arrangementId}`)
}
```

### 5.3 Route Handler — opprett medlem

```typescript
// app/api/admin/opprett-medlem/route.ts
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  // 1. Verifiser at kaller er admin (via session-cookie)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  // Sjekk at user.rolle === 'admin'

  // 2. Bruk service-role klient for å opprette bruker
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { navn, epost } = await request.json()
  const midlertidigPassord = genererTilfeldigPassord()

  const { data, error } = await adminClient.auth.admin.createUser({
    email: epost,
    password: midlertidigPassord,
    email_confirm: true,
  })

  // 3. Oppdater profiles med navn
  // 4. Send velkomst-e-post via Resend med midlertidig passord + lenke

  return NextResponse.json({ ok: true })
}
```

### 5.4 Kobling mellom nytt arrangement og arrangøransvar

Når en bruker oppretter et arrangement velger han **eksplisitt** hvilken mal arrangementet hører til via nedtrekk-menyen `TypeVelger`. Menyen lister alle uoppfylte `(aar, arrangement_navn)`-kombinasjoner fra `arrangoransvar` + et permanent `Annet`-valg nederst. Valget styrer både hvilken arrangoransvar-rad som kobles opp, om skjemaet viser møte- eller tur-felter, purredato (brukes som start-forslag), og forhåndsutfylt tittel.

**Komponenter:**

- `components/arrangement/TypeVelger.tsx` — presentasjon av nedtrekken + typen `MalValg`
- `lib/mal-valg.ts → hentMalValg(supabase, includeArrangementId?)` — henter uoppfylte kombinasjoner (joiner `arrangoransvar` med `arrangementmaler` for type + purredato, konverterer mal-purredato fra år-2000-sentinel til reelt år), sorterer `(aar asc, purredato asc nulls last)`, appender `Annet` sist. `includeArrangementId` tar i tillegg med raden som allerede peker til et gitt arrangement — brukes fra rediger-skjemaet slik at nåværende valg fortsatt er synlig selv om det er oppfylt.

**`MalValg`-type:**

```typescript
type MalValg = {
  key: string           // `${mal_navn}::${aar}` eller 'Annet::'
  mal_navn: string
  aar: number | null    // null for Annet
  type: 'moete' | 'tur' | null  // null for Annet — brukeren må velge
  purredato: string | null
  ansvarlige: string[]
}
```

**Flyt i `opprettArrangement` / `oppdaterArrangement`:**

1. Skjemaet sender `mal_navn` + `aar` (utledet fra valgt `MalValg`).
2. `koble(supabase, arrangementId, mal_navn, aar)` oppdaterer `arrangement_id` på **alle** rader med samme `(aar, arrangement_navn)`. Hvis `mal_navn === 'Annet' || mal_navn == null || aar == null` gjøres ingen kobling.
3. Ved mal-bytte i rediger: `losne()` nullstiller først alle rader som peker til arrangementet, deretter kalles `koble()` med det nye valget.

**Utkast på agendaen:** Når en arrangoransvar-rad ikke er koblet til et arrangement vises et `UtkastKort`. Kortet lenker ansvarlige rett til `/arrangementer/ny?mal={mal_navn}&aar={aar}` (mal forhåndsvalgt i skjemaet), andre til `/arrangoransvar#ansvar-{aar}-{slug}` (stabil anker satt av `utkastAnkerId()`) slik at man enkelt kan purre.

**Backfill:** Migrasjon `042_autokoble_arrangementer_til_ansvar.sql` gjorde en éngangs-backfill av eksisterende arrangementer basert på månedsmatch. Etter fase 4 er denne logikken ikke lenger en del av kodebasen — nye arrangementer kobles kun via eksplisitt valg i UI-et.

**Hvorfor denne tilnærmingen:** Tidligere auto-match på månedsnavn var skjør — arrangementer utenfor forventet periode, maler uten måned-ord i navnet (`Reisekomiteen`), og nye ansvarlige som kom til etter kobling ga edge-cases. Eksplisitt valg i dropdown løser alt dette og gjør det synlig for brukeren hva som blir koblet opp.

---

## 6. Varsler

### 6.1 Sentral varslingsfunksjon

All utgående kommunikasjon går gjennom `sendVarsel()` i `lib/varsler.ts`. Push og epost importeres **aldri** direkte i andre filer.

```
[Trigger: server action, webhook, cron]
        │
        ▼
  sendVarsel({ mottakere?, tittel, melding, url?, type, tillatDuplikat? })
        │
        ├── 1. Dedup-sjekk (hvis tillatDuplikat=false)
        │      → Sjekk varsel_logg for type + arrangement_id
        │
        ├── 2. Testmodus → filtrer til testprofil
        │
        ├── 3. Løs opp mottakere (oppgitte eller alle aktive)
        │      Dedupliser med Set
        │
        ├── 4. Hent preferanser + push-subscriptions
        │
        └── 5. For hver mottaker:
               ├── Push (hvis push_aktiv=true)
               ├── Epost (hvis epost_aktiv=true)
               └── Logg til varsel_logg (type, kanal, url)
```

### 6.2 Varseltyper

| Type | Trigger | Mottakere | Dedup | Admin-bryter |
|------|---------|-----------|-------|-------------|
| `nytt_arrangement` | Opprett arrangement | Alle | Ja | `nytt_arrangement` |
| `oppdatert` | Manuell «Varsle nå»-knapp | Alle | Nei (`tillatDuplikat: true`) | Ingen |
| `paaminne_7` | Cron (7 dager før) | Alle | Ja | `paaminnelse_7d` |
| `paaminne_1` | Cron (1 dag før) | Alle | Ja | `paaminnelse_1d` |
| `purring` | Cron (3 dager før) | Kun ubesvarte | Ja | `purring_aktiv` |
| `mention` | @-mention i chat | Nevnte | Nei (`tillatDuplikat: true`) | Ingen |
| `ønske_ny` | GitHub issue opened | Admins + oppretter | Nei (`tillatDuplikat: true`) | Ingen |
| `ønske_lukket` | GitHub issue closed | Innsenderen | Nei (`tillatDuplikat: true`) | Ingen |

### 6.3 Cron

Vercel cron (`vercel.json`): `0 6 * * *` (06:00 UTC = 08:00 norsk sommertid).

Datobasert sjekk — arrangementets dato sammenlignes med norsk dato via `norskDatoNaa()`, ikke tidspunkt-vindu. Auth: Bearer `CRON_SECRET`.

### 6.4 Brukerpreferanser

Tabell `varsel_preferanser`: `push_aktiv` (default false), `epost_aktiv` (default true). Begge kan være på samtidig — brukeren kan få både push og epost. Administreres via `/profil`.

### 6.5 Varsel-logg

Tabell `varsel_logg` (tidligere `personlige_varsler` + `varsler_logg`): én rad per mottaker per varsling. Kolonner: profil_id, tittel, melding, type, kanal, url, arrangement_id, lest, opprettet. Admin ser alle via RLS-policy. Brukes også for dedup (type + arrangement_id).

### 6.6 Testmodus

Admin setter `test_modus` i `varsel_innstillinger` med test-epost i `beskrivelse`-feltet. Når aktiv: kun profilen med test-eposten mottar varsler. Gjelder alle varslingsstier via `sendVarsel()`.

## 6b. Tidshåndtering

All tidshåndtering går gjennom `lib/dato.ts` med tidssone `Europe/Oslo`.

| Funksjon | Bruk |
|----------|------|
| `formaterDato(iso, format)` | Visning: konverterer UTC → Oslo |
| `norskDatoNaa()` | «Hvilken dag er det?» i Oslo |
| `norskDag(iso)` | Dato uten tid, i Oslo |
| `norskAar()` | Inneværende år i Oslo |
| `isoTilDatetimeLocal(iso)` | ISO → HTML datetime-local input |
| `datetimeLocalTilIso(str)` | HTML input → ISO (UTC) |

**Regel:** `new Date()` brukes kun for UTC-tidsstempler til DB (`.toISOString()`) og elapsed time. For dato-logikk (dag, år, sammenligning) brukes alltid funksjonene over.

---

## 7. Blåtur-sensurering

### 7.1 Datamodell

`sensurerte_felt` er en JSONB-kolonne på `arrangementer` (se seksjon 2.2):

```json
{
  "destinasjon": true,
  "pris_per_person": true,
  "slutt_tidspunkt": true
}
```

Kun felter som er sensurert har en nøkkel i objektet. Tomt objekt `{}` = ingen sensurering.

### 7.2 Frontend-visning

```typescript
// Pseudokode for ArrangementDetaljer-komponent:

function erSensurert(felt: string, arrangement: Arrangement, userId: string) {
  if (arrangement.opprettet_av === userId) return false  // Arrangøren ser alltid alt
  return arrangement.sensurerte_felt?.[felt] === true
}

// I rendering:
{erSensurert('destinasjon', arr, user.id)
  ? <SladdetTekst />          // Visuelt sladdet blokk
  : <p>{arr.destinasjon}</p>
}
```

### 7.3 Admin/arrangør-toggle

I redigeringsmodus for tur-arrangementer vises en "Merk som sensurert"-checkbox ved hvert tur-felt. Arrangøren kan:
- Krysse av for å sensurere (feltet sladdes for alle andre)
- Fjerne krysset for å avsensurere (feltet blir synlig for alle)

---

## 8. Web Push (PWA)

### 8.1 Oppsett

1. **VAPID-nøkler** genereres én gang og lagres i miljøvariabler:
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`

2. **Service worker** (`public/sw.js`):
   - Lytter på `push`-events
   - Viser notification med tittel, body, og URL
   - Håndterer klikk → åpner relevant side i appen

3. **Subscription-flyt:**
   - Bruker åpner appen → klient spør om push-tillatelse
   - Hvis godkjent → registrer subscription via `POST /api/push/subscribe`
   - Subscription lagres i `push_subscriptions`-tabellen

### 8.2 Service worker

```javascript
// public/sw.js
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.tittel ?? 'Klubben', {
      body: data.melding,
      icon: '/icon-192.png',
      data: { url: data.url ?? '/' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  )
})
```

### 8.3 iOS-begrensning

Web Push fungerer på iOS kun når appen er installert på hjemskjermen (PWA). Derfor er e-post **alltid** fallback for alle varsler — det sikrer at ingen går glipp av noe uavhengig av enhet/installasjon.

---

## 9. PWA-manifest

```typescript
// app/manifest.ts
import type { MetadataRoute } from 'next'
import { KLUBB_NAVN, KLUBB_KORTNAVN, KLUBB_BESKRIVELSE } from '@/lib/klubb-config'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: KLUBB_NAVN,
    short_name: KLUBB_KORTNAVN,
    description: KLUBB_BESKRIVELSE,
    start_url: '/',
    display: 'standalone',
    background_color: '#060608',
    theme_color: '#060608',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
```

---

## 10. Supabase-klienter

### 10.1 Server-side (Server Components, Server Actions, Route Handlers)

```typescript
// lib/supabase/server.ts
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createServerClient() {
  const cookieStore = await cookies()
  return createSupabaseServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}
```

### 10.2 Client-side (Client Components)

```typescript
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

---

## 11. Miljøvariabler

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# Resend (e-post)
RESEND_API_KEY=<resend-api-key>
RESEND_FROM_EMAIL=noreply@<domene>

# Web Push (VAPID)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<vapid-public-key>
VAPID_PRIVATE_KEY=<vapid-private-key>
```

---

## 12. Migrasjonsrekkefølge

Migrasjoner i `supabase/migrations/`, kjøres med `npx supabase db push`:

1. `001_profiles.sql` — profiles-tabell + trigger fra auth.users
2. `002_arrangementer.sql` — arrangementer + paameldinger
3. `003_arrangoransvar.sql` — arrangøransvar-tabell
4. `004_kaaringer.sql` — kaaringer + kaaring_vinnere-tabell
5. `005_vedtekter.sql` — vedtekter + vedtekter_versjoner
6. `006_push_subscriptions.sql` — push-abonnementer
7. `007_varsel_innstillinger.sql` — varselinnstillinger + seed-data
8. `008_er_admin_funksjon.sql` — hjelpefunksjonen `er_admin()` (må kjøres før RLS)
9. `009_rls_policyer.sql` — alle RLS-policyer
10. `010_cron_jobber.sql` — pg_cron-jobber for påminnelser/purringer

---

## 13. Implementasjonsrekkefølge (anbefalt)

Anbefalt rekkefølge for å bygge appen, strukturert slik at hvert steg gir noe testbart:

| Fase | Innhold | Testbart resultat |
|------|---------|-------------------|
| **A** | Supabase-oppsett, migrasjoner, profiles-trigger, RLS | Database klar, kan logge inn |
| **B** | Layout, middleware, login-side, bottom-nav | Kan navigere i appen |
| **C** | Forside + opprett arrangement + påmelding | Kjernefunksjonalitet: se og melde seg på |
| **D** | Arrangementsdetaljer, rediger/slett, historikk | Komplett arrangement-flyt |
| **E** | Blåtur-sensurering | Tur-spesifikk funksjonalitet |
| **F** | Medlemsliste, profil, admin-medlemsadmin | Brukeradministrasjon |
| **G** | Arrangøransvar | Ansvarsoversikt |
| **H** | Kåringer (admin registrerer + alle ser) | Kåringsliste |
| **I** | Vedtekter + statistikk | Klubbinfo komplett |
| **J** | Web Push + e-post + påminnelser + purringer | Varsler |
| **K** | PWA-manifest, ikoner, service worker | Installerbar |

---

*Løsningsdesignet er basert på kravspesifikasjonen og de avklarte tekniske beslutningene. Klar for implementasjon etter godkjenning.*
