# Herreklubben-appen

> **This project is intentionally in Norwegian** — UI text, code identifiers, table/column names, commit messages, and documentation are all in Norwegian. It was built for a Norwegian-speaking private club and is published as-is. English speakers are welcome to use it, but localisation is out of scope for this repository.

Privat web-app for vennegjenger som vil ha et felles sted for arrangementspåmelding, klubbchat og kåringer — uten å være avhengig av Facebook. Referanse-instans: [mortensrudherreklubb.no](https://mortensrudherreklubb.no).

Appen er bygget med kraftig AI-assistanse (Claude Code, Anthropic). README-en dekker både hva som er gjennomtenkt og hva som er pragmatiske snarveier — se [Kritisk vurdering](#kritisk-vurdering) nederst.

---

## Innhold

- [Funksjonalitet](#funksjonalitet)
- [Skjermbilder](#skjermbilder)
- [Stack](#stack)
- [Kom i gang](#kom-i-gang)
- [Arkitektur](#arkitektur)
- [Datamodell](#datamodell)
- [Sentrale designvalg](#sentrale-designvalg)
- [Mappe-struktur](#mappe-struktur)
- [Drift og deploy](#drift-og-deploy)
- [Kritisk vurdering](#kritisk-vurdering)
- [Lisens](#lisens)

---

## Funksjonalitet

- **Agenda** — kronologisk feed av arrangementer, polls, meldinger (innlegg) og bursdager. Ser kommende, i dag, og tidligere ting i ett blikk.
- **Arrangementer** — møter og turer. Påmelding (Ja/Nei/Kanskje), kommentarer, bilde, kobling til arrangøransvar.
- **Polls** — flervalgs-avstemninger med svarfrist.
- **Meldinger** — Facebook-status-aktige innlegg med kommentarer og emoji-reaksjoner.
- **Klubbchat** — én felles tråd for hele klubben. Egen chat-fane i bunnen.
- **Privatmeldinger** — én-til-én-samtaler.
- **Album** — bildedelinger knyttet til arrangementer eller stå-alone. Cover-velger, lightbox med swipe og pil-navigering.
- **Roller og ansvar** — arrangøransvar per år, kåringer (årets vinnere innen ulike kategorier).
- **Klubbinfo** — vedtekter, medlemsliste, statistikk, historikk.
- **Bursdager og klubbjubileum** dukker opp automatisk på agendaen.
- **Push-varsler** og **e-post-påminnelser** for nye arrangementer, kommentarer, mentions og påminnelser om RSVP.
- **PWA** — installerbar på mobil (Safari/Chrome), service worker for offline-fallback.

---

## Skjermbilder

Skjermbilder kommer — anonymiserte versjoner under arbeid.

---

## Stack

| Lag | Teknologi |
|---|---|
| Frontend | Next.js 15 App Router, React 19, TypeScript, Tailwind v4 (mest inline-style) |
| Backend | Next.js Server Actions + Server Components |
| Database | Supabase Postgres med Row Level Security |
| Auth | Supabase Auth (email + passord) |
| Realtime | Supabase Realtime (postgres_changes) |
| Bildelagring | Cloudflare R2 (S3-kompatibel), `aws4fetch` for signing |
| E-post | Resend |
| Push | Web Push (VAPID) via `web-push` |
| Cron | GitHub Actions (`paaminne.yml`, daglig 06:00 UTC) |
| Hosting | Vercel (Hobby), region Dublin (referanse-instans) |
| Domene | Valgfritt — referanse-instans bruker Domeneshop |

286 kildefiler (`.ts`, `.tsx`, `.sql`, `.css`, `.mjs`), ~100 nummererte SQL-migrasjoner.

---

## Kom i gang

For å sette opp din egen instans:

1. **[docs/oppsett.md](docs/oppsett.md)** — steg-for-steg fra klon til kjørende instans (Supabase, R2, VAPID, Resend, Vercel, GitHub Actions).
2. **[docs/klubb-tilpasning.md](docs/klubb-tilpasning.md)** — bytt navn, ikoner, farger og konfigurer rollene for din klubb.
3. **[docs/drift.md](docs/drift.md)** — legge til medlemmer, feilsøke varsler, kjøre migrasjoner og backup.

```bash
git clone <ditt-repo-url>
cd <ditt-repo>
npm install
cp .env.example .env.local
# fyll inn verdiene
npm run sjekk-miljo
npm run dev
```

---

## Arkitektur

```
┌──────────────────────────────────────────────────────────┐
│                   Klient (PWA i nettleser)                │
│  React Server Components + Client Components              │
│  Service Worker (cache, offline, push)                    │
└────────┬─────────────────────────────────────┬───────────┘
         │ HTTPS                                │ WSS (realtime)
         ▼                                      │
┌─────────────────────┐                         │
│   Next.js på Vercel │                         │
│   • Server Components (SSR)                  │
│   • Server Actions (mutasjoner)              │
│   • Route handlers (cron, API)               │
│   • Middleware (auth-guard via cookie)       │
└────┬──────────────────┬─────────────────┬────┘
     │                  │                 │
     │ supabase-js      │ aws4fetch (PUT) │ resend / web-push
     ▼                  ▼                 ▼
┌──────────┐       ┌──────────┐     ┌──────────────┐
│ Postgres │       │ R2-bucket│     │ Resend / WP  │
│ + RLS    │       │  (bilder)│     │              │
│ + cron   │       └──────────┘     └──────────────┘
│ + realtime│
└──────────┘
```

**Sikkerhetsmodellen** sentrerer rundt Postgres RLS. Server Actions kjører som innlogget bruker (Supabase auth-cookie sendes med). Det betyr at selv om en server action skulle ha en logikkfeil, kan ikke en bruker lese eller skrive data RLS-policyene ikke tillater. `er_admin()`-SQL-funksjonen brukes konsekvent i policies; klient-siden har egen `kanAdministrere(rolle)`-helper for UI-rendering.

En fullstendig gjennomgang av sikkerhetsmodellen er dokumentert i [docs/sikkerhetsgjennomgang-2026-06.md](docs/sikkerhetsgjennomgang-2026-06.md).

**Privat-bilder via R2.** Cloudflare R2 valgt foran Supabase Storage av to grunner: kostnad ($0 egress) og at bucket lever i EU-jurisdiksjon. URL-er er public (krever ingen signering), men sti inneholder UUID-prefix som gjør dem upraktiske å gjette.

---

## Datamodell

Hovedtabeller (forenklet):

```
profiles ─┬─ rolle (medlem|admin|generalsekretaer)
          ├─ aktiv (false = utmeldt, beholder historikk)
          └─ visningsnavn, bilde_url, fodselsdato

arrangementer ─┬─ type (moete|tur)
               ├─ start_tidspunkt, oppmoetested, bilde_url
               └─ paameldinger (status: ja|nei|kanskje)

poll ──── poll_valg ──── poll_stemme

meldinger (innlegg/posts)
  ├─ melding_chat (kommentarer)
  └─ melding_reaksjon

album ──── album_bilde (cover_bilde_id peker tilbake)

samtale (privat 1:1) ──── samtale_chat

5 chat-tabeller: arrangement_chat, klubb_chat, poll_chat,
                  melding_chat, samtale_chat
                  + delt chat_reaksjoner-tabell

arrangoransvar (hvem er ansvarlig for hvilke faste arrangementer per år)
kaaringer / kaaring_vinnere (årets vinnere per kategori)
varsel_logg (alle utsendte push/epost loggføres)
```

Alle tabeller har RLS slått på. Policy-mønsteret er typisk:

- `select`: aktiv profil i `profiles`
- `insert`: `auth.uid() = profil_id` + aktiv
- `update`/`delete`: eier eller `er_admin()`

Migrasjonene ligger i `supabase/migrations/` nummerert sekvensielt. Kjøres med `npx supabase db push`.

---

## Sentrale designvalg

Alle disse er kodifisert som «policies» i [`CLAUDE.md`](./CLAUDE.md) — referansen for AI-assistert utvikling fremover.

### Sentralisering der det betaler seg

- **Tid:** all dato-håndtering går gjennom `lib/dato.ts` med Europe/Oslo-tidssone via `date-fns-tz`. Ingen rå `new Date()` for å bestemme «hvilken dag det er».
- **Varsler:** all utgående kommunikasjon (push + epost) går gjennom `sendVarsel()` i `lib/varsler.ts` — sentral dedup, brukerpreferanser og logging.
- **Auth:** server actions bruker `ensureAdmin()` / `ensureInnlogget()` fra `lib/auth.ts`. Ingen inline `getUser() + select rolle`-mønster.
- **Roller:** `lib/roller.ts` har sentral matrise. Aldri `rolle === 'admin'`-sammenligning i kode — bruk `kanAdministrere()`. Speilet i SQL via `er_admin()`-funksjonen.
- **Konstanter:** tegnegrenser og dag-vinduer i `lib/konstanter.ts`. Ingen hardkodede magiske tall.
- **Konfig:** miljø-avhengige verdier (BASE_URL, R2_PUBLIC_URL, GitHub-repo, VAPID-kontakt) i `lib/config.ts`.
- **Klubbidentitet:** navn, stiftelsesdato, rolletitler i `lib/klubb-config.ts` med env-override — se [docs/klubb-tilpasning.md](docs/klubb-tilpasning.md).
- **Bildelagring:** server actions i `lib/actions/bilde-opplasting.ts` + `lib/r2.ts`. Klient komprimerer (1600px / q0.85) før upload.
- **Avatar:** `<Avatar>`-komponenten er bevisst enkel (kun `name`, `size`, `src`, `rolle`). Spesialtilfeller løses med lokale wrappere, ikke ved å utvide kjerne-komponenten.

### Chat-arkitektur (refaktorert i V2.176)

Fem chat-scopes (arrangement, klubb, poll, melding, privat) deler tabell-mønster men er fysisk separate tabeller (RLS er enklere per-tabell enn polymorf med `scope_type`-kolonne). All scope-spesifikk logikk samles i `lib/chat-konfig.ts` (CHAT_KONFIG) og tre generiske server actions i `lib/actions/chat.ts` (`sendChatMelding`, `oppdaterChatMelding`, `slettChatMelding`).

### Hva som er bevisst utelatt

- **2FA / passkeys** — passordbasert er valgt nivå.
- **End-to-end-kryptering** av privatmeldinger.
- **Klient-side cache-lag** (TanStack Query) — SSR holder så langt.
- **Egen mobilapp** — PWA er valgt distribusjon.

---

## Mappe-struktur

```
app/
  (auth)/login/                    # Offentlig login-side
  (app)/                           # Auth-beskyttede sider med sticky TopHeader
    page.tsx                       # Forsiden = agenda
    arrangementer/[id]/            # Arrangement-detalj + edit
    poll/[id]/, /ny/
    meldinger/[id]/, /ny/
    chat/                          # Klubbchat (egen side, åpnes fra hamburger-meny)
    samtaler/, samtaler/[id]/      # Privat-meldinger
    album/, album/[id]/            # Bildealbum
    klubbinfo/                     # Vedtekter, medlemmer, statistikk
    arrangoransvar/                # Hvem ansvarer for hva (årsvis)
    kaaringer/                     # Vinnere per kategori og år
    profil/, profil/rediger/
    innstillinger/                 # Admin: medlemmer, varsler, pass-godkjenning
    varsler/[id]/                  # Stand-alone varsel-side (lenker fra epost)
    innspill/                      # GitHub Issues-bro: medlemmer kan ønske ting
  api/
    cron/paaminne/                 # GitHub Actions ringer hit kl 06:00 UTC

components/
  agenda/, arrangement/, album/, chat/, poll/   # Per-domene-komponenter
  ui/                                            # Avatar, Card, Pill, Icon, Lightbox
  TopHeader.tsx                                  # Sticky topp-header med hamburger + profil

lib/
  actions/         # Server actions — én fil per domene
  supabase/        # Browser- og server-clients, genererte typer
  chat-konfig.ts   # CHAT_KONFIG (se "Chat-arkitektur")
  auth.ts          # ensureInnlogget, ensureAdmin
  roller.ts        # Rolle-matrise + helpers
  varsler.ts       # sendVarsel + push/epost-helpere
  dato.ts          # Tidssone-trygge helpere
  konstanter.ts    # Domene-konstanter
  config.ts        # Miljø-avhengige verdier
  klubb-config.ts  # Klubbidentitet (navn, stiftelsesdato, rollekonfig)
  r2.ts            # Cloudflare R2 upload/slett
  bilde-utils.ts   # Klient-side komprimering, kategorisering

supabase/migrations/  # ~100 nummererte SQL-filer

scripts/         # Engangs-importer (FB-arrangementer, album), versjon-stamping
                 # NB: scripts/-mappen må auditeres individuelt før open source-kopiering

__tests__/       # Vitest — fokuserte enhets-tester på utvalgte helpers
                 # (dato, roller, mention-regex, varsler)
```

---

## Drift og deploy

**Deploy:** push til `main` → Vercel bygger og deployer automatisk. Branch-pushes får preview-deploys.

**Versjon:** `lib/versjon.json` stampes manuelt med `npm run stamp-versjon` før hver commit (oppdaterer også `public/sw.js` for å invalidere service-worker-cache).

**Cron:** GitHub Actions (`.github/workflows/paaminne.yml`) kaller `/api/cron/paaminne` daglig kl 06:00 UTC med `CRON_SECRET`-header. Valgt foran Vercel Cron for bedre logging og synlig feilrapportering.

**Migrasjoner:** kjøres lokalt med `npx supabase db push` mot prod-prosjektet. Det er **ingen CI-orkestrering** — migrasjoner er en manuell utviklerhandling.

**Secrets:** Vercel env-vars. R2-credentials er markert «Sensitive» (kan ikke pulles tilbake).

---

## Miljøvariabler

Kopier `.env.example` til `.env.local`, fyll inn verdiene, og kjør `npm run sjekk-miljo` for å verifisere:

```bash
cp .env.example .env.local
# fyll inn verdiene
npm run sjekk-miljo
```

Skriptet sjekker tre nivåer:

- **Kritisk** (Supabase, R2, VAPID) — appen/kjernefunksjoner starter ikke uten disse.
- **Anbefalt** (Resend, CRON_SECRET, GitHub-token) — appen starter, men e-post, påminnelsesvarsler eller innspill-funksjonen mangler.
- **Valgfri** (klubbidentitet m.m.) — har defaults, vises kun hvis eksplisitt satt.

**CRON_SECRET** settes to steder med samme verdi: i Vercel env-vars (runtime-sjekken i cron-endepunktet) og som GitHub Actions-secret (workflow-en som sender headeren). Mismatch eller manglende verdi gir 401 fra cron-endepunktet.

**APP_URL** settes kun som GitHub Actions-secret (peker workflow-en til prod-URL) — den brukes ikke av appen i runtime og hører ikke hjemme i `.env.local`.

---

## Kritisk vurdering

Denne seksjonen er for teknisk kyndige som vurderer kodebasen. Den er bevisst usminket.

### Hva er gjennomtenkt og solid

- **RLS som sannhet.** Sikkerheten henger ikke på at server actions er rett implementert — Postgres håndhever den. Dette er hovedinvestering og verdt det.
- **Sentralisering** av tid, varsler, roller, konstanter, auth, konfig. Dokumentert som policies. Hjelper både mennesker og AI å holde stilen.
- **Type-sikkerhet end-to-end** via genererte Supabase-typer. Build feiler hvis DB-skjema og kode driver fra hverandre.
- **Server-first**. Mest dataflyt går gjennom Server Components, ikke klient-side fetch. Lavere TTFB, mindre JS over nettverket, ingen state-management i klient utover lokal interaksjon.
- **Append-only-mønster i historikk.** Inaktive medlemmer beholdes (`aktiv = false`); kåringer og arrangoransvar har egne årstall-rader. Sletting er sjelden.
- **Idempotent cron.** Påminnelses-jobben skiller mellom datoer og logger varsel-utsendelse, så dobbel-kjøring ikke gir dobbel-varsel.

### Hva som røper at dette er AI-assistert utvikling

Disse er bevisste pragmatiske valg for et hobbyprosjekt med én utvikler — men en gjennomgang fra tradisjonell vinkel ville flagget dem.

- **`Chat.tsx` er 1300+ linjer.** Konsolidert mye via CHAT_KONFIG-refactoren, men selve komponenten er fortsatt en katedral. Sub-komponenter og custom hooks står uendret som «fase B» i issue #100.
- **Mest styling som inline-style** (objekt-literaler), ikke CSS-moduler eller klasser. Tailwind er installert men brukes lite. Det er pragmatisk for AI-assistert utvikling fordi diff-bredden blir mindre, men det er ikke skalerbart for større team.
- **Test-dekning er overflate-tynn.** Kun helpers (`dato`, `roller`, `mention-regex`, `varsler`) har enhetstester. Komponenter, server actions og integrasjoner er ikke dekket. End-to-end er ikke automatisert.
- **Migrasjoner kjøres manuelt** uten CI-validering. En glemt `db push` mellom merge og deploy = sjanse for runtime-feil.
- **`scripts/`-mappen inneholder engangsimport-scripts** fra Facebook-dataeksport. Noen av disse har hatt klartekst-passord og datafiler med personopplysninger. Mappen skal ikke kopieres til et nytt repo uten individuell audit av hvert script.
- **`lib/actions/`-filer har lett gjenværende dupliserte mønstre** (varsel-sending etter insert, error-håndtering). Konsolidering er gjort der det betalte seg, ikke pedantisk overalt.
- **Ingen automatisert kodegjennomgang** i CI utover Vercels build-sjekk. Code review skjer ad-hoc via Copilot/ultrareview ved PR.
- **Et lite antall `as unknown as`-casts** der Supabase-genererte typer ikke matcher faktiske join-resultater. Type-løgner, men avgrenset.
- **iOS Safari-quirks håndteres med flere lag samtidig** (visualViewport-poll + focus-tracking + pathname-reset). Hver er logget med begrunnelse, men aggregert kompleksitet er reell.
- **Versjons-stamping er manuell.** Lett å glemme.
- **«Vibe-stamping» av enkelte beslutninger.** Noen designvalg er tatt fordi de føltes rett i øyeblikket og holdt seg fordi de ikke skapte problemer — ikke fordi de er resultat av eksplisitt avveiing. Dette er en iboende risiko ved AI-flow: koden blir produsert raskere enn man rekker å tvile på den.

### Hva en profesjonell modning ville krevd

For et selskap eller team:

1. **CI:** automatisk lint + test + DB-migrasjon-validering på PR.
2. **Skikkelig test-dekning** — minst integrasjonstest av alle server actions med stub Supabase, og en håndfull e2e mot preview-deploy.
3. **Type-strict mode** + null-as-unknown-erstatning av `as unknown as`-castene.
4. **Komponent-splitting** av Chat.tsx + de største detaljsidene.
5. **Observability:** strukturert logging, error reporting (Sentry e.l.), latency-metrics utover `web-vitals`.
6. **Backup/restore-rutiner.** Supabase tar daglig backup, men det er ikke testet å restore.
7. **Skikkelig rollebasert tilgang i CI** + secrets via OIDC, ikke long-lived tokens.

For en privat klubb på 15–20 medlemmer er dette overkill. For en kommersiell SaaS er det baseline.

---

## Lisens

MIT. LICENSE-filen legges inn ved publisering i det nye repoet (OS-fase 6).
