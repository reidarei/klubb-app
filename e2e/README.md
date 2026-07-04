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

## Når Playwright IKKE er riktig verktøy

Playwright kjører mot Chromium (og WebKit hvis vi aktiverer det). **Det er ikke ekte iOS Safari.** En del bug-klasser i denne appen reproduserer ikke i runneren:

- `visualViewport`-håndtering (tastatur som dekker bottom-elementer)
- iOS safe-area (notch, home-indikator, dock)
- iOS PWA-quirks (focus/blur, scroll-restoration, momentum-scroll)
- ITP-cookie-håndtering i standalone-modus

Slike bugs må verifiseres manuelt på iPhone. Dokumenter i PR-en at automatisk verifikasjon ikke er mulig.

WebKit-runneren er ikke aktivert i dag — kan vurderes senere, men selv da fanger den ikke alt av det over.
