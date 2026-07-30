# e2e-tester (Playwright)

Verifiserer at vanlige flyter (innlogging, opprette poll, kommentere, agenda-rendering) fungerer mot en lokal dev-server.

## Testene kjører kun mot en lokal test-instans — aldri prod

All e2e kjører mot en **dedikert lokal Supabase-instans** (startet med `supabase start`). `playwright.config.ts`
nekter å kjøre hvis `E2E_SUPABASE_URL` peker mot sky-Supabase, og dev-serveren for testene startes på egen port (3100) 
med env-overstyring — en vanlig `npm run dev` mot prod kan aldri gjenbrukes.

**Bakgrunn:** testene må kunne mutere data fritt (opprette poller, endre RSVP-svar) uten å påvirke ekte data. En test-instans 
isolerer disse endringene fullstendig.

## Førstegangs-oppsett

Start din lokale Supabase-instans:

```bash
supabase start
```

Supabase CLI vil skrive ut tilkoblings-detaljer. Legg disse inn i `.env.local`:

```
E2E_SUPABASE_URL=http://127.0.0.1:54321
E2E_SUPABASE_ANON_KEY=<publishable-nøkkel fra supabase start-output>
E2E_SUPABASE_SERVICE_KEY=<secret-nøkkel fra supabase start-output>
```

Innloggingsbrukeren (`e2e-admin@klubb.test`, passord `e2e-lokal-hemmelighet`) er automatisk seedet i test-instansen 
og settes av configen — du trenger ikke å oppgi TEST_EPOST/TEST_PASSORD. Mangler E2E-variablene, skipper alle spec-er med tydelig melding.

## Opprettelse og reset av test-instansen

Når du har startet `supabase start`, kjør migrasjoner og seed-data:

```bash
npx supabase db push
npx supabase db reset
```

`db reset` kjører alle migrasjoner og fyller inn test-data fra `supabase/seed.sql`. Seed-data inneholder:
- Test-bruker (`e2e-admin@klubb.test`)
- Noen vanlige medlemmer
- Arrangement-data som spec-ene verifiserer mot
- Historiske data (eldre arrangementer og meldinger) for testing av historikk-siden (`/tidligere`)

Etter en test-kjøring kan du kjøre på nytt uten reset, eller resette hvis du vil ha garantert ren tilstand:

```bash
npx supabase db reset
```

## Kjøre testene

```bash
# Alle spec-er
npx playwright test

# Én spec
npx playwright test e2e/poll.spec.ts

# Dev-server kjører på en annen port enn 3000
PLAYWRIGHT_BASE_URL=http://localhost:3002 npx playwright test
```

## Røyktesten — `sider-laster.spec.ts`

Laster hver rute i appen (én test per rute) og krever tre ting: HTTP 200, ingen omdirigering til `/login`, og at `<main>` faktisk fikk innhold uten å havne i error-boundaryen.

Dette er en **bredde**-test, ikke en dybde-test. Den beviser at siden svarer og rendrer — ikke at innholdet er riktig. Dybden hører hjemme i de øvrige spec-ene.

Verdien er at en brutt databasespørring på en side ingen andre tester besøker (feil kolonnenavn etter en migrasjon, en join som ryker, en manglende `GRANT`) fanges før merge i stedet for av en bruker. Særlig relevant for `GRANT`-feil: de gir `42501` selv når RLS tillater raden, og en side som aldri lastes får aldri sin `42501` oppdaget.

**Legger du til en ny rute i appen, legg den i `RUTER`-lista.** Detaljruter (`[id]`) trenger en matchende rad i `supabase/seed.sql` — uten den treffer testen `notFound()` og bekrefter 404-grenen i stedet for innholds-grenen. Seed-fixturene for dette har prefiks `9800` og er dekket av seed-vakten nederst i fila.

**Feil_logg-vakten:** Røyktesten kjøres med `retries: 0` og inkluderer en dedikert vakt som feiler hvis en side rendret (200 + innhold), men server-feil ble logget til `feil_logg` i løpet av kjøringen. Vakten finansieres av `e2e/global-setup.ts` (skriver høyeste `feil_logg.id` på kjøringsstart) og `e2e/helpers/feil-logg-grense.ts` (filtrerer vakten til kun nye rader). Det betyr at hvis du legger til en server action som kalles løst under render uten `.catch(logg.feil(...))` — eller hvis en server component feiler stille og svelger kastet — blir det fanget av vakten på neste e2e-kjøring. Rød test = sjekk `feil_logg`-tabellen i test-instansen; en rød som viser seg å være legitim manglende infrastruktur (mock, seed-data) må løses før commit.

## CI: to omfang

Suiten kjører i `.github/workflows/pr-check.yml` på **pull requests** (full port, inkludert e2e). Pushes rett til `main` kjører kun kjerneporten — lint, typecheck, vitest og bygg, uten e2e.

Konsekvensen er at **kodeendringer bør gå gjennom pull request**: en direkte push til `main` får aldri e2e-dekning. Se [docs/ci-minuttbudsjett.md](../docs/ci-minuttbudsjett.md) § Two run scopes for detaljer, og for hvorfor `skipped` på e2e-steget betyr to ulike ting.

## Sikkerhetsmodellen

Fire lag hindrer at testene rører prod. Testprosessen og dev-server-barnet er
to ulike prosesser med hver sin `process.env`.

1. **Config-vakt (testprosessen):** `playwright.config.ts` kaster hvis
   `E2E_SUPABASE_URL` matcher sky-Supabase — testene kan fysisk ikke pekes mot
   prod.
2. **Env-overstyring i testprosessen:** når test-instansen er konfigurert,
   overskriver configen `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` og
   `NEXT_PUBLIC_BASE_URL` i sin egen `process.env`. Uten dette ville test-kode
   som importerer server-moduler direkte (i stedet for via HTTP mot :3100)
   fått prod-credentials fra `.env.local`.
3. **Egen port (dev-server-barnet):** test-dev-serveren kjører på 3100 med
   `webServer.env` tvunget mot test-instansen; en kjørende prod-dev-server på
   3000 gjenbrukes aldri.
4. **Varsler-vakt (begge prosesser):** `NEXT_PUBLIC_BASE_URL` settes til
   localhost under testing, så varsler-vakten i `lib/varsler.ts` blokkerer all
   push/epost-utsending. I tillegg pinnes `ALLOW_LOCAL_NOTIFICATIONS: 'false'`
   i `webServer.env`, slik at vakten ikke kan omgås av en verdi i `.env.local`.

Test-speccene oppretter og sletter data fritt — det er hele poenget med
test-isolasjonen. Cleanup går alltid mot test-instansen.

## Når Playwright IKKE er riktig verktøy

Playwright kjører mot Chromium (og WebKit hvis vi aktiverer det). **Det er ikke ekte iOS Safari.** En del bug-klasser i denne appen reproduserer ikke i runneren:

- `visualViewport`-håndtering (tastatur som dekker bottom-elementer)
- iOS safe-area (notch, home-indikator, dock)
- iOS PWA-quirks (focus/blur, scroll-restoration, momentum-scroll)
- ITP-cookie-håndtering i standalone-modus

Slike bugs må verifiseres manuelt på iPhone. Dokumenter i PR-en at automatisk verifikasjon ikke er mulig.

WebKit-runneren er ikke aktivert i dag — kan vurderes senere, men selv da fanger den ikke alt av det over.

## Security tests: Row Level Security (RLS) verification

`e2e/rls/` contains security tests that verify your RLS policies actually block or allow access as intended. Until this test suite was added, all e2e tests ran as `service_role` (which bypasses RLS entirely), leaving your primary security boundary (RLS) unverified with a real authenticated client.

**What's covered:**
- Sensitive data visibility (pass info, private conversations) is restricted to authorized users only
- Column-level protections prevent members from changing their own role or settings
- Unauthenticated (`anon`) users have no read access to any table in the public schema
- Admin operations (deleting others' posts, editing policies) are gated correctly

**Why Playwright and not unit tests:** RLS can only be verified by actually querying Postgres as an authenticated user via PostgREST. Unit test mocks don't have RLS at all, so they'd give false confidence. Playwright has the full test infrastructure (`supabase start`) — adding a parallel unit-test rig would duplicate complexity without benefit.

**Important:** When you read data after a blocked `update` or `delete`, Postgres returns success (`error: null`) even though 0 rows changed. Tests verify the row actually remained unchanged using an admin client. Each spec file also includes at least one positive control case that *should* succeed — to prove the authenticated client is working, not just that RLS blocks everything.

**Run RLS tests only:**

```bash
npx playwright test --project=rls
```

(Full e2e: `npx playwright test` runs both RLS and the main test suite.)
