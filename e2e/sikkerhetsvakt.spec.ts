import { test, expect } from '@playwright/test'
import { harTestCreds } from './helpers/auth'

// Vakt over vakten. Hendelsen 2026-07-04 (#381/#386) var at e2e traff prod og
// sendte ekte push til alle medlemmer. Beskyttelsen mot gjentakelse ligger i
// playwright.config.ts, som er lett å svekke ved et uhell — særlig fordi
// configen laster .env.local, og .env.local inneholder PROD-verdier etter
// `vercel env pull`. Denne speccen tester ingen produktfunksjonalitet; den
// bekrefter bare at selve sikkerhetsnettet er spent opp i TESTPROSESSEN.
//
// Merk skillet: webServer.env beskytter dev-server-BARNET. Denne speccen
// kjører i runneren, som er en annen prosess med sin egen process.env — og
// den ble stående med prod-credentials frem til fiksen i #520-reviewen.
// Se e2e/README.md § Sikkerhetsmodellen.
// Lås 2 mot «grønn på tom luft» i CI (#534). BEVISST UTENFOR describe-blokken
// under, fordi den har `test.skip(!harTestCreds())` — og nettopp den guarden er
// det vi må kunne oppdage at slo inn. Er E2E_SUPABASE_* tomme, blir
// HAR_TEST_INSTANS i playwright.config.ts false, TEST_EPOST/TEST_PASSORD
// slettes, hver eneste spec skipper, Playwright avslutter med 0 og `sjekk` blir
// grønn med NULL dekning. Denne testen kan ikke skippes av den mekanismen.
//
// Kun armert i CI: lokalt er «ingen test-instans ⇒ alt skipper» et bevisst,
// dokumentert oppsett (e2e/README.md), og en alltid-rød test der ville lært
// folk å ignorere rødt. Kjør `CI=1 npx playwright test` for å arme den lokalt.
// Testen tar ingen fixtures — da opprettes ingen browser-kontekst, og den
// kjører også når e2e/.auth/state.json mangler (som den gjør nettopp når
// setup-prosjektet skippet fordi creds manglet).
test('e2e kjørte faktisk: E2E_SUPABASE_* er satt i CI', () => {
  test.skip(!process.env.CI, 'Kun armet i CI — se kommentaren over.')

  for (const navn of ['E2E_SUPABASE_URL', 'E2E_SUPABASE_ANON_KEY', 'E2E_SUPABASE_SERVICE_KEY']) {
    expect(
      process.env[navn] ?? '',
      `${navn} er tom i CI — da skipper hele suiten stille og porten er verdiløs. Se «Vent på Supabase»-steget i .github/workflows/pr-check.yml.`,
    ).not.toBe('')
  }
  // Hermetegn ville ikke gjort variabelen tom, bare ubrukelig (jf. godotenv-
  // formatet CLI-en skriver) — sjekkes derfor eksplisitt.
  expect(process.env.E2E_SUPABASE_URL ?? '').not.toMatch(/["']/)
})

test.describe('sikkerhetsvakt: testprosessen peker mot test-instansen', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md og docs/test-instans.md')

  test('Supabase-env i testprosessen er test-instansen, ikke sky-Supabase', () => {
    // Ikke bare «lik E2E_SUPABASE_URL», men også en positiv sjekk mot sky-
    // mønsteret: en fremtidig test-instans i skyen ville passert den første
    // sjekken og likevel vært feil.
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe(process.env.E2E_SUPABASE_URL)
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').not.toMatch(/supabase\.(co|com)/)
    expect(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe(process.env.E2E_SUPABASE_ANON_KEY)
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBe(process.env.E2E_SUPABASE_SERVICE_KEY)
  })

  test('BASE_URL i testprosessen er lokal, så varsler-vakten er armert', () => {
    // BLOKKER_UTSENDING i lib/varsler.ts utledes av at BASE_URL er
    // localhost/127.0.0.1. Peker den mot prod, er vakten AV for enhver spec
    // som importerer server-kode direkte i stedet for å gå over HTTP.
    // Samme predikat som ER_LOKAL_BASE bruker (substring, ikke full-match) —
    // en strengere regex her ville kunne bli rød på en URL som vakten
    // faktisk godtar, og da tester vi vår egen regex, ikke vakten.
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? ''
    expect(base, 'NEXT_PUBLIC_BASE_URL må være lokal i testprosessen').toMatch(
      /localhost|127\.0\.0\.1/,
    )
  })
})
