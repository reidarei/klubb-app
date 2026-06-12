# e2e-tester (Playwright)

Verifiserer at vanlige flyter (innlogging, opprette poll, kommentere, agenda-rendering) fungerer mot en lokal dev-server.

## Førstegangs-oppsett

Test-suiten logger inn som en ekte bruker. Du må legge inn test-brukerens innlogging i `.env.local`:

```
TEST_EPOST=<test-brukerens e-post>
TEST_PASSORD=<test-brukerens passord>
```

Mangler en av dem, skipper alle spec-er med en tydelig melding. Det betyr ingen «stille feil i første assertion» når en agent uten creds prøver å kjøre suiten.

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
