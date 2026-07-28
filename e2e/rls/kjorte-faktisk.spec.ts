import { test, expect } from '@playwright/test'
import { harRlsMiljo } from '../helpers/rls-klienter'

// Lås mot «grønn på tom luft» ETT HAKK INNOVER enn e2e/sikkerhetsvakt.spec.ts
// (#534/#535): den vokter hele suiten, denne vokter RLS-prosjektet.
//
// Alle spec-ene i denne mappa starter med `test.skip(!harRlsMiljo(), …)`. Er
// E2E_SUPABASE_* tomme i CI, skipper hver eneste RLS-test, `rls`-prosjektet
// avslutter med 0 feil, og sikkerhetsgrensen appen hviler på har NULL dekning
// på en grønn PR. Denne testen står BEVISST utenfor den skip-guarden — den er
// det eneste i mappa som ikke kan skippes av mekanismen den overvåker.
//
// Kun armert i CI, av samme grunn som sikkerhetsvakt.spec.ts: lokalt er «ingen
// test-instans ⇒ alt skipper» et bevisst, dokumentert oppsett (e2e/README.md),
// og en alltid-rød test der lærer folk å ignorere rødt. Arm den lokalt med
// `CI=1 npx playwright test --project=rls`.
//
// Hva den IKKE dekker: at `rls`-prosjektets testMatch fortsatt plukker opp
// filene i mappa. Drifter det mønsteret, kjører ikke denne testen heller — den
// sjekken må ligge utenfor prosjektet, og gjør det (se
// e2e/sikkerhetsvakt.spec.ts § «rls-prosjektet plukker opp …»).
test('RLS-suiten kjørte faktisk: E2E_SUPABASE_* er satt i CI', () => {
  test.skip(!process.env.CI, 'Kun armet i CI — se kommentaren over.')

  expect(
    harRlsMiljo(),
    'E2E_SUPABASE_* mangler i CI — da skipper HELE e2e/rls/ stille, og RLS-porten er verdiløs. ' +
      'Se «Vent på Supabase»-steget i .github/workflows/pr-check.yml.',
  ).toBe(true)
})
