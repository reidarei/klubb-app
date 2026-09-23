# Sikkerhet

## Rapportere en sårbarhet

Hvis du finner en sikkerhetssårbarhet i klubb-app, ikke opprett et offentlig
issue. Bruk i stedet GitHubs private sårbarhetsrapportering: gå til
**Security-fanen → Report a vulnerability** i dette repoet. Inkluder:

- Beskrivelse av sårbarheten og hvor i koden den ligger
- Steg for å reprodusere (gjerne med eksempel)
- Eventuell vurdering av alvorlighet

Du får svar så raskt som mulig — normalt innen en uke. Vi ber om at du holder
funnet konfidensielt til en fiks er publisert (ansvarlig avsløring).

## Scope

Appen er designet som **single-tenant**: hver klubb kjører sin egen instans
med egen Supabase-database og egne hemmeligheter. Det finnes ingen sentral
tjeneste eller delt infrastruktur.

Relevante områder:

- **Row Level Security (RLS)** — all tilgangskontroll håndheves i Postgres,
  ikke bare i UI. Policies som kan omgås er alvorlige funn.
- **Server actions og route handlers** — autorisasjonssjekker via
  `ensureAdmin()` / `ensureInnlogget()` (`lib/auth.ts`).
- **Webhook-validering** — GitHub-webhook valideres med delt hemmelighet
  (fail-closed).
- **Secrets-håndtering** — ingen hemmeligheter skal ligge i repoet eller
  eksponeres med `NEXT_PUBLIC_`-prefiks.

Siste sikkerhetsgjennomgang er dokumentert i
[docs/sikkerhetsgjennomgang-2026-06.md](docs/sikkerhetsgjennomgang-2026-06.md).

## Utenfor scope

- Sårbarheter i tredjepartstjenester (Supabase, Vercel, Cloudflare, Resend)
- Funn som krever at angriperen allerede har admin-tilgang til instansen
- Social engineering mot klubbens medlemmer
