# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Prosjekt

Klubb-app — privat webapp for en vennegjeng (~15–20 personer) som erstatter Facebook for arrangementspåmelding, klubbinfo og kåringer. Ingen selvregistrering. Klubbidentitet er konfigurerbar via miljøvariabler (se `lib/klubb-config.ts` og [docs/klubb-tilpasning.md](docs/klubb-tilpasning.md)).

Detaljert brukerbehovsspesifikasjon (use cases, roller, scope, avklarte beslutninger) finnes i [HK-app_kravspesifikasjon.md](HK-app_kravspesifikasjon.md). Løsningsdesign (databaseskjema, sidestruktur, API-lag, varsler, tekniske beslutninger) finnes i [HK-app_losningsdesign.md](HK-app_losningsdesign.md). Kravspesifikasjonen er autoritativ — ved konflikt gjelder den foran dette dokumentet.

## Roller

- **Admin** : oppretter medlemmer, styrer kåringer, redigerer klubbinfo, kan redigere/slette alle arrangementer.
- **Generalsekretær**: har admin-rettigheter og markeres med gul glød på profilbildet.
- **Medlem**: oppretter egne arrangementer, melder seg på (Ja/Nei/Kanskje), leser alt innhold.

Admins og generalsekretær er også medlemmer. Tilgang håndheves i RLS — ikke bare i UI. Se **Policy: Roller** nedenfor for hvordan sjekker skal gjøres i kode.

## Kommandoer

```bash
npm run dev          # Start dev-server (localhost:3000)
npm run build        # Produksjonsbygg
npm run lint         # ESLint
npx supabase db push # Kjør migreringer mot Supabase
npx supabase gen types typescript --project-id <ditt-supabase-prosjekt-id> > lib/supabase/database.types.ts  # Regenerer typer etter migrering
```

## Arkitektur

**Next.js 15 App Router** med to route groups: `(auth)` for `/login`, `(app)` for alle beskyttede sider med bottom-nav.

Auth-guard via `middleware.ts` (`@supabase/ssr`). Bruk `createServerClient` (fra `lib/supabase/server.ts`) i Server Components og Route Handlers, og `createBrowserClient` (fra `lib/supabase/client.ts`) i Client Components.

**Supabase** for alt: Auth (email + passord), PostgreSQL med RLS, scheduled jobs for påminnelser. Migrasjonsfiler i `supabase/migrations/`. Databaseskjema er definert i løsningsdesignet.

**Varsler:** Sentral varslingsfunksjon `sendVarsel()` i `lib/varsler.ts` — all utgående kommunikasjon (push, epost) går gjennom denne. Se **Policy: Varsler** nedenfor.

**Tid:** All tidshåndtering går gjennom `lib/dato.ts` med `Europe/Oslo` tidssone. Se **Policy: Tidshåndtering** nedenfor.

**Roller:** Rettighetsmatrise i `lib/roller.ts` speiles av `er_admin()` i DB. Aldri sammenlign rolle-strenger direkte — bruk hjelperne. Se **Policy: Roller** nedenfor.

**Avatarer:** Alle profil-avatarer rendres via `components/ui/Avatar.tsx`. Komponenten holdes bevisst enkel — utvid ikke med nye props, lag heller lokale wrappere. Se **Policy: Avatar** nedenfor.

**Konfig:** Miljø-avhengige verdier (BASE_URL, VAPID-kontakt, GitHub-repo/label) sentraliseres i `lib/config.ts`. **Aldri** hardkode domenet eller lese `process.env.NEXT_PUBLIC_BASE_URL` direkte i actions/route handlers — importér fra `lib/config`. Se **Policy: Konfig** nedenfor.

**Auth:** Server actions og route handlers bruker `ensureAdmin()` / `ensureInnlogget()` fra `lib/auth.ts` for autorisasjons-sjekker. **Aldri** dupliser `getUser()` + rolle-oppslag inline. Se **Policy: Auth** nedenfor.

**Domene-konstanter:** Tegnegrenser, dag-vinduer, levetider o.l. ligger i `lib/konstanter.ts`. **Aldri** hardkode magiske tall som 500/2000/7/24 — referer konstanten. Se **Policy: Konstanter** nedenfor.

**Bildelagring:** Nye bilder lagres i Cloudflare R2 via `lib/r2.ts` + server actions i `lib/actions/bilde-opplasting.ts`. Klient-side komprimering først (1600 px / q0.85). Eldre profilbilder ligger fortsatt i Supabase Storage. Se **Policy: Bildelagring** nedenfor.

**Migrasjoner:** Nye tabeller i `public`-schema må ha eksplisitte `GRANT`-statements til `anon`/`authenticated`/`service_role` — Supabase fjerner default-grants 30. mai 2026 for nye prosjekter og 30. oktober 2026 for eksisterende. Se **Policy: Migrasjoner** nedenfor.

**PWA:** Installerbar via Safari/Chrome. Manifest i `app/manifest.ts`.

**Produksjon:** Appen deployes på Vercel — se [docs/oppsett.md](docs/oppsett.md) for oppsettsveiledning.

## Scope

Se [HK-app_kravspesifikasjon.md](HK-app_kravspesifikasjon.md) for fullstendig scope. Kortversjon:
- **v1:** Arrangementer + påmelding, varsler, medlemsliste, vedtekter/historikk, statistikk, kåringer, roller/ansvar per år, chat per arrangement.
- **v2:** Bildedeling, kåringsavstemning.

## Ytelseskrav

- Appen skal være så rask som mulig for brukeren. Endringer som innføres skal ikke øke responstiden — mål alltid å forbedre eller beholde eksisterende ytelse.

## Konvensjoner

- UI-tekst og databasekolonner på norsk (f.eks. `opprettet_av`, `start_tidspunkt`)
- Datoer via `date-fns` med norsk locale (`nb`)
- Oslo-østkant-tone / oslo-losen i UI-tekst (a-endelser, f.eks. «gutta»)

## Arbeidsmåter

### Når patch-strategien har gått tom

Tre regresjoner i samme bug-klasse = arkitektonisk reversering, ikke fjerde patch. Skriv heller en CLAUDE.md-policy som lukker problemklassen enn enda en lapp. Gjelder generelt — UI-bugs, DB-bugs, varsel-bugs.

### Kommentarer i kode

**Overstyrer global default.** I dette prosjektet er kommentarer velkomne — også når WHY-en ikke er strengt ikke-åpenbar. Jeg setter pris på at subtile betingelser, edge-cases og «hvorfor akkurat sånn»-valg står forklart i koden, ikke bare i PR-historikk eller git blame.

- Skriv en kort kommentar når en betingelse, regex, off-by-one-justering eller tilsynelatende redundans har en grunn som ikke leses rett ut av variabelnavnene.
- Det er greit å referere til issue-nummer (f.eks. `// se #165 for bakgrunn`) når det hjelper en fremtidig leser å finne kontekst.
- Hold dem korte (én linje, maks to). Ikke skriv flerlinjede docstrings eller essays.
- Fortsatt nei: kommentarer som kun gjengir hva koden gjør (`// loop over array`), eller TODO-er uten eier/dato.

Når reviewer foreslår en forklarende kommentar — default er nå å legge den inn, ikke avvise den.

## Policy: Varsler

All utgående kommunikasjon (push, epost) skal gå gjennom `sendVarsel()` i `lib/varsler.ts`. **Aldri** importer `sendPush` eller `sendEpost` direkte i andre filer — bruk `sendVarsel`.

**Funksjonen håndterer:**
- Testmodus (filtrerer til kun testprofil)
- Brukerpreferanser (`push_aktiv`, `epost_aktiv` fra `varsel_preferanser`)
- Dedup via `tillatDuplikat`-parameter (false = sjekker `varsel_logg` for eksisterende type+arrangement_id)
- Deduplisering av mottakerliste (Set)
- Logging til `varsel_logg`-tabellen med kanal-info (push/epost/begge)
- URL-generering: oppgitt URL brukes, ellers genereres `/varsler/{id}`

**Parametre:**
- `mottakere?: string[]` — profil_id-er, utelat = alle aktive
- `tittel`, `melding` — innhold i varselet
- `url?` — lenke i push/epost
- `knappTekst?` — epost CTA (default: "Åpne i appen")
- `type` — kategorisering for logging og dedup
- `arrangementId?` — referanse for dedup
- `tillatDuplikat?` — true = send alltid (default: false)

**Tabell:** `varsel_logg` (tidligere `personlige_varsler` + `varsler_logg` slått sammen). Kolonner: profil_id, tittel, melding, type, kanal, url, arrangement_id, lest, opprettet.

**Cron:** GitHub Actions (`.github/workflows/paaminne.yml`) kaller `/api/cron/paaminne` via POST kl 06:00 UTC (08:00 norsk sommertid) med `CRON_SECRET`-auth. Valgt foran Vercel cron for bedre logging og synlig feilrapportering. Datobasert sjekk — arrangementets dato sammenlignes med norsk dato, ikke tidspunkt.

**Viktig:** Bruk aldri `after()` fra `next/server` for varsler — det kjører ikke pålitelig på Vercel Hobby. Bruk `await` direkte.

## Policy: Roller

Sentral rettighetsmatrise i `lib/roller.ts` definerer de tre rollene og hva hver rolle kan/mottar. **Aldri** sammenlign `rolle === 'admin'` direkte i kode — bruk hjelperne.

**Roller:** `medlem`, `admin`, `generalsekretaer`. Alle har medlem-rettigheter. Admin og generalsekretær har i tillegg admin-rettigheter (CRUD på tvers, kåringer, klubbinfo, alle arrangementer).

**Matrisen (`ROLLER`) har disse feltene per rolle:**
- `tittel` — visningsnavn i UI
- `kanAdministrere` — har admin-rettigheter
- `harGulGloed` — særegen gul ring rundt avatar
- `loeserTiebreak` — løser uavgjort i kåringspoll

**Issue-/systemvarsler er IKKE rollestyrt:** hvem som mottar varsler om nye innspill og klientfeil-alarmer styres av kolonnen `profiles.faar_issue_varsler` (admin-styrt per medlem via RedigerMedlemSkjema, se migrasjon 104). Mottaker-spørringer filtrerer på `.eq('faar_issue_varsler', true)` — aldri på rolle.

**Bruk disse hjelperne:**
- `kanAdministrere(rolle)` — admin-sjekk i UI, server actions, API-ruter
- `harGulGloed(rolle)` — avatar-styling
- `tittelFor(rolle)` — visning av rolle i UI
- `rettigheterFor(rolle)` — hele rettighetsobjektet
- `rollerMed(rettighet)` — liste over roller som har en gitt rettighet (for `.in('rolle', …)`-filtre)
- `VALGBARE_ROLLER` — roller som kan velges fra admin-UI (generalsekretær settes manuelt via SQL)

**Database-siden:** Funksjonen `er_admin()` returnerer true for både admin og generalsekretær og brukes i alle RLS-policies. Hvis matrisen endres slik at en ny rolle skal ha admin-rettigheter, må `er_admin()` oppdateres i en ny migrasjon — dette er duplisering vi lever med fordi RLS må kjøre i DB.

**Når nye RLS-policies skrives:** Bruk `er_admin()`, ikke inline `rolle = 'admin'`. Sistnevnte glipper unna når nye roller med admin-rettigheter kommer.

**Setting av generalsekretær-rollen:** Via SQL (`update profiles set rolle = 'generalsekretaer' where …`). UI-et til medlemsredigering kan ikke sette denne rollen — bare bevare den hvis den allerede er satt.

**Testing:** `__tests__/roller.test.ts` verifiserer at matrisen og hjelperne holder seg i synk. Oppdater testen hvis du legger til ny rolle eller rettighet.

## Policy: Tidshåndtering

All tidshåndtering skal gå gjennom `lib/dato.ts`. **Aldri** bruk `new Date()` for å bestemme "hvilken dag er det" — bruk `norskDatoNaa()`.

**Regler:**
- **Visning av dato/tid:** Bruk `formaterDato(iso, format)` — konverterer automatisk fra UTC til `Europe/Oslo`
- **"Er dette i dag/fortid?":** Bruk `norskDatoNaa()` og `norskDag(iso)` for sammenligning
- **Hvilket år er det?:** Bruk `norskAar()`
- **Lagring i database:** Alltid UTC. Bruk `naa()` fra `lib/dato.ts` for "nå"-tidsstempler i timestamp-kolonner (`oppdatert`, `besluttet_paa` osv.) i stedet for `new Date().toISOString()` direkte
- **Cron/datoberegning:** Bruk `norskDatoNaa()` som utgangspunkt, `addDays()` for å beregne fremtidige datoer
- **`new Date()` er OK for:** elapsed time-beregninger, unike ID-er, og når du trenger en `Date`-instans (ikke ISO-streng)

**Tidssone:** `Europe/Oslo` (eksportert som `TIDSSONE` fra `lib/dato.ts`). Håndterer automatisk sommertid/vintertid via `date-fns-tz`.

## Policy: Konfig

Miljø-avhengige verdier samles i `lib/config.ts`. **Aldri** hardkode domenet eller lese `process.env.NEXT_PUBLIC_BASE_URL` direkte i actions/route handlers/komponenter — importér fra `lib/config`.

**Eksporterer:**
- `BASE_URL` — applikasjonens base-URL. Kjenner Vercel-preview (`VERCEL_URL`), prod-default og dev-default. Brukes i absolutte URL-er for varsler, ICS-filer, GitHub-webhook-lenker.
- `getBaseUrl()` — funksjons-form av samme; bruk denne hvis du trenger å resolve på kall-tidspunkt heller enn modul-load
- `VAPID_CONTACT_EMAIL` — kontakt for push-tjenester (env-overridable)
- `GITHUB_REPO`, `GITHUB_ONSKE_LABEL`, `githubIssuesUrl({state, perPage, page})` — for innspill-funksjonen mot GitHub Issues

**Når du legger til ny miljø-avhengig verdi:** legg den i `lib/config.ts` med fornuftig default + env-override. Ikke spred `process.env.X ?? 'fallback'`-mønsteret rundt i kodebasen.

## Policy: Auth

Server actions og route handlers skal bruke `ensureAdmin()` eller `ensureInnlogget()` fra `lib/auth.ts` for autorisasjons-sjekker. **Aldri** dupliser `supabase.auth.getUser()` + `from('profiles').select('rolle')` + `kanAdministrere(...)` inline i nye actions.

**Hjelpere:**
- `ensureAdmin()` → `{ supabase, user, profil }` — kaster ved manglende auth eller manglende admin-rolle. Returnerer samme supabase-klient for videre spørringer (RLS-kontekst bevart).
- `ensureInnlogget()` → `{ supabase, user }` — kaster kun ved manglende auth.

**Route handlers med status-koder:** Hvis du trenger å returnere 401/403 i stedet for å kaste, kan du fortsatt bruke inline-mønsteret (ensureAdmin kaster generisk Error). Vurder om try/catch rundt ensureAdmin er nok for ditt formål.

**RLS er fortsatt sannheten:** `ensureAdmin()` er en raskere/penere feilmelding — sikkerhetsmessig stoles det fortsatt på `er_admin()`-policyer i Postgres.

## Policy: Konstanter

Domene-konstanter (tegnegrenser, dag-vinduer, levetider) ligger i `lib/konstanter.ts`. **Aldri** hardkode magiske tall som 500/2000/7/24 i actions eller komponenter — importér konstanten.

**Eksporterer:**
- `CHAT_MIN_LENGDE` / `CHAT_MAKS_LENGDE` (1, 500) — for arrangement-, klubb-, poll- og melding-chat
- `INNLEGG_MIN_LENGDE` / `INNLEGG_MAKS_LENGDE` (1, 2000) — for samtaler og meldinger på vegglignende feed
- `PAAMINNELSE_DAGER` `{ LANG: 7, KORT: 1, PURRING: 3 }` — dager før et arrangement vi sender hver type påminnelse
- `PASS_TILGANG_TIMER` (24) — tilgangsvinduet etter pass-godkjenning

**Når du legger til ny konstant:** Hvis verdien speiler en DB check-constraint (f.eks. tegnegrenser), nevn det i kommentaren og oppdater migrasjonsfilen ved endring.

## Policy: Bildelagring

Bilder lagres i Cloudflare R2 (S3-kompatibel objektlagring). Profilbilder ligger fortsatt i Supabase Storage av historiske grunner — nye bildelagrings-stier skal bruke R2.

**Hvorfor R2:** ~95 % billigere enn Supabase Pro for vår skala, $0 egress uansett volum, Cloudflare CDN innebygd. Beslutning dokumentert i issue #66.

**Sentral modul:** `lib/r2.ts` — `lastOppR2(sti, data, contentType)` og `slettR2(sti)`. Bruker `aws4fetch` for signing (~5 KB bundle, ingen S3-SDK). Helpers er server-side only — kaller fra klient er forbudt fordi det krever access-key.

**Klient-flyt:**
1. Velg fil i UI
2. `komprimer(fil)` fra `lib/bilde-utils.ts` — Canvas API skalerer til maks 1600 px lang side, JPEG kvalitet 0.85
3. `genererFilnavn(fil)` lager unik path-prefiks
4. Send komprimert fil + filnavn til server action via FormData
5. Server action validerer + kaller `lastOppR2()` + returnerer public URL

**Server actions:** `lib/actions/bilde-opplasting.ts` har `lastOppArrangementBilde(formData)` og `slettArrangementBilde(url)`. Begge krever `ensureInnlogget()`. Fil-størrelse er capet til 5 MB og MIME-typer begrenset til JPEG/PNG/WebP.

**Konvensjon for paths i R2:**
- `arrangementer/{filnavn}` — bilder knyttet til arrangementer
- (Senere: `profilbilder/{filnavn}`, `albums/{aar}/{filnavn}`, etc. — legg til hjelpere i `bilde-utils.ts` per kategori)

**Cache-headers:** Alle objekter får `Cache-Control: public, max-age=31536000, immutable` ved upload. Det er trygt fordi vi alltid genererer unike filnavn — vi gjenbruker aldri en sti.

**Public URL:** `R2_PUBLIC_URL` (i `lib/config.ts`) er base-URL-en. Bilder hentes via `${R2_PUBLIC_URL}/${sti}`. URL-en er trygg å eksponere til klienten — bare access-keyen er hemmelig.

**`next/image`:** R2-domenet (`*.r2.dev` og eventuell custom domain) er tillatt i `next.config.ts → images.remotePatterns`. Bruk `<Image>` med `fill` + `sizes` for responsiv leverering.

**Sletting:** Når en URL i DB skal slettes, kall `slettArrangementBilde(url)`. Helperen sjekker først at URL-en faktisk peker til vår R2 (via `r2StiFraUrl()`) før den prøver å slette — Supabase-URL-er passerer uberørt.

**Migrering av eksisterende bilder:** Profilbilder og eldre arrangement-bilder ligger fortsatt i Supabase Storage. Migrering er bevisst ikke gjort — koden støtter begge så lenge man ikke endrer bilde-URL-en i DB.

**Secrets (Vercel env vars):** `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` (eller `NEXT_PUBLIC_R2_PUBLIC_URL` om public-URL skal være tilgjengelig på klient). Secret-keyen skal ALDRI ha `NEXT_PUBLIC_`-prefiks.

## Policy: Arrangøransvar-kobling

Når en bruker oppretter et arrangement velger han **eksplisitt** hvilken mal det hører til i en nedtrekk-meny (`TypeVelger`). Menyen lister alle uoppfylte `(aar, arrangement_navn)`-kombinasjoner fra `arrangoransvar` + et `Annet`-valg som alltid ligger nederst. Valget styrer både kobling, type (møte/tur), purredato og forhåndsutfylt tittel.

**Komponenter:**
- `components/arrangement/TypeVelger.tsx` — dropdown + typen `MalValg`
- `lib/mal-valg.ts → hentMalValg(supabase, includeArrangementId?)` — henter og sorterer valg (aar asc, purredato asc nulls last, Annet sist). `includeArrangementId` tar med gjeldende kobling slik at rediger-siden fortsatt viser valget selv når det er oppfylt.

**Flyt:** `opprettArrangement` og `oppdaterArrangement` tar `mal_navn` + `aar`. Hjelperne `koble()` og `losne()` i `lib/actions/arrangementer.ts` oppdaterer ALLE arrangoransvar-rader med samme `(aar, arrangement_navn)` atomisk — flere ansvarlige deler samme arrangement.

**Utkast på agendaen:** `UtkastKort` lenker ansvarlige rett til `/arrangementer/ny?mal=X&aar=Y` (mal forhåndsvalgt), andre til `/arrangoransvar#ansvar-Y-slug` (stabil anker for purring).

**Detaljer:** Se [løsningsdesign §5.4](HK-app_losningsdesign.md#54-kobling-mellom-nytt-arrangement-og-arrangøransvar).

## Policy: Avatar

Alle profil-avatarer (medlemsansikter) skal rendres via `components/ui/Avatar.tsx`. **Aldri** skriv inline `<img src={bilde_url}>` eller en rund div med initialer andre steder — bruk komponenten.

**Props (fulle settet, utvides ikke):**
- `name: string` — fullt navn, brukes til initialer og hue-beregning
- `size?: number` — piksler (default 32)
- `src?: string | null` — bildeUrl, fallback til initialer ved null
- `rolle?: string | null` — brukes kun til gul glød for generalsekretær via `harGulGloed()`

**Enkel kjerne — lag lokale wrappere for særtilfeller:** Hvis et sted trenger status-dot, krone-badge, aktiv-ring eller annen dekor rundt avataren, lag en liten wrapper-komponent lokalt (f.eks. `<AvatarMedKrone>`) som bruker Avatar inni. Legg **aldri** til props som `aktiv`, `badge`, `border`, `style` eller `children` på kjerne-komponenten — det gjør den til en konfigmatrise som er vanskelig å resonnere om.

**Når du legger til nye steder som viser profilbilder:** Bruk `<Avatar name={...} src={bilde_url} rolle={rolle} />`. Gul glød for generalsekretær faller da inn av seg selv — sjekker for dette skal ikke duplikeres utenfor komponenten.

## Policy: Navigasjon

App-navigasjon består av sticky TopHeader med tre alltid-synlige tekst-tabs (Agenda/Chat/Klubb) og en animert pill-bakgrunn som glir til aktiv tab; profil-avatar høyre som snarvei til /profil. I tillegg kontekstuelle FAB-er (NyFAB på agenda for å opprette innhold). **Ingen bottom-nav.** Dette eliminerer hele bug-klassen vi traff i #99, #104, #147, #151, #153 hvor iOS-tastatur kolliderte med fixed bottom-elementer. Hvis du finner deg selv i å legge til en `position: fixed; bottom: 0` UI-flate som ikke er en modal eller toast — løft det til diskusjon først.

## Policy: Migrasjoner

Nye tabeller i `public`-schema må eksplisitt gi tilgang til Data API-rollene. Supabase fjerner de implisitte default-grants på `public`-schema: **30. mai 2026** for nye prosjekter, **30. oktober 2026** håndhevet på alle eksisterende prosjekter (inkludert vårt). Uten `GRANT` returnerer PostgREST `42501` selv om RLS-policyen tillater raden — `supabase-js` ser ikke at tabellen finnes.

**Mal for nye tabeller i migrasjon:**

```sql
create table public.<tabell> (
  ...
);

alter table public.<tabell> enable row level security;

-- Data API-tilgang (kreves fra 2026-10-30 på vårt prosjekt)
grant select                          on public.<tabell> to anon;
grant select, insert, update, delete  on public.<tabell> to authenticated;
grant select, insert, update, delete  on public.<tabell> to service_role;

-- Policies (tilpass per tabell)
create policy "..." on public.<tabell> ...;
```

**Justér scope per tabell:** Mange tabeller skal ikke gi `anon` SELECT (vi har ingen offentlige flater). Tilpass grants til hva som faktisk brukes — minste privilegium. `service_role` bypasses RLS uansett, men trenger fortsatt grants for å se tabellen via PostgREST.

**Sekvenser:** Hvis tabellen har en `serial`/`identity`-kolonne brukt fra klient, husk `grant usage, select on sequence public.<tabell>_<kol>_seq to authenticated;`.

**Eksisterende tabeller:** Beholder grants automatisk frem til 30. oktober 2026. Audit + opprydding tracket i eget issue.

## Policy: Visuell verifikasjon

For UI-endringer på vanlig flyt: kjør Playwright lokalt før push (`npx playwright test`). Se `e2e/README.md` for setup.

For iOS-PWA-quirks (visualViewport, safe-area, focus/blur på iOS): Playwright reproduserer ikke. Test manuelt på iPhone og dokumenter i PR-en at automatisk verifikasjon ikke er mulig.

Supabase: ditt eget prosjekt (se [docs/oppsett.md](docs/oppsett.md)). Database-passordet ligger i `.env.local` som `SUPABASE_DB_PASSWORD`. Hent fra Supabase Dashboard → Project Settings → Database. Skript som trenger direkte Postgres-tilgang kjøres med `node --env-file=.env.local scripts/<navn>.mjs`.
