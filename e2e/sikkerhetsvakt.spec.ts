import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
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

// «rls-prosjektet plukker opp spec-ene sine.» Må stå HER, i chromium-
// prosjektet, ikke i e2e/rls/: drifter `testMatch` slik at rls-mappa faller
// utenfor, kjører ingenting derfra — heller ikke en vakt plassert der. Da ville
// hele RLS-porten forsvunnet uten et eneste rødt kryss (chromium ignorerer
// e2e/rls/ med vilje, se testIgnore i playwright.config.ts).
// Mønsteret speiles bevisst her i stedet for å importere playwright.config.ts:
// den fila har side-effekter på process.env (env-lasting, overstyring av
// Supabase-variablene) som vi ikke vil kjøre om igjen midt i en testkjøring.
// Duplikatet er poenget — testen skal bli rød når de to går fra hverandre.
const RLS_TEST_MATCH = /rls[\\/].*\.spec\.ts$/
test('rls-prosjektet plukker opp alle spec-ene i e2e/rls/', () => {
  const rlsDir = path.join(__dirname, 'rls')
  const filer = fs.readdirSync(rlsDir).filter(f => f.endsWith('.spec.ts'))

  expect(filer.length, 'e2e/rls/ har ingen spec-er — er de flyttet?').toBeGreaterThan(0)
  for (const fil of filer) {
    expect(
      RLS_TEST_MATCH.test(path.join(rlsDir, fil)),
      `${fil} matcher ikke rls-prosjektets testMatch — da kjøres den ingen steder ` +
        `(chromium ignorerer e2e/rls/). Sjekk projects[name=rls].testMatch i playwright.config.ts.`,
    ).toBe(true)
  }
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
    // MERK (#659): denne sier ingenting lenger om den SERVERTE appen. Etter
    // at e2e gikk over til produksjonsbygg (`next start`), bakes
    // NEXT_PUBLIC_*-verdiene inn i artefaktet ved BYGGETID (se «Bygg»-steget
    // i .github/workflows/pr-check.yml) — testPROSESSEN her har sin egen
    // process.env, satt av playwright.config.ts, og de to kan i prinsippet gå
    // fra hverandre uten at denne testen ser det. Den er fortsatt verdt å ha
    // (den fanger fortsatt en spec som importerer server-kode direkte i
    // testprosessen, se opprinnelig begrunnelse), men den ERSTATTER ikke en
    // sjekk mot selve serveren — det er jobben til testen under, som faktisk
    // henter en respons fra :3100.
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

  // Live vakt (#659) — ETTER produksjonsbygg-overgangen er testen over
  // («testprosessen») ikke lenger nok: den sier noe om Playwrights egen
  // process.env, ikke om det den SERVERTE appen faktisk bakte inn ved
  // byggetid. Denne henter en ekte respons fra :3100 og påstår innholdet.
  // ICS-ruta (app/api/arrangementer/[id]/ics/route.ts) er i dag eneste
  // HTTP-flate i appen som ekker BASE_URL i responskroppen — derfor valgt.
  //
  // POSITIV påstand, ikke negativ: samme fil skriver også
  // `UID:${id}@${KLUBB_DOMENE}`, så en negativ sjekk mot klubbdomenet ville
  // vært permanent rød (se artefaktvakten i e2e/global-setup.ts for samme
  // resonnement).
  //
  // Bruker `page`-fixture (trenger storageState, se e2e/README.md) — derfor
  // i chromium-prosjektet og IKKE blant de fixture-løse testene over. ICS-
  // ruta krever innlogging (middleware.ts har ingen unntak for /api/arrangementer/),
  // og page.request arver browser-kontekstens cookies fra e2e/.auth/state.json.
  test('ICS-ruta ekker den lokale BASE_URL-en i den faktisk serverte responsen', async ({ page }) => {
    // Seedet, stabilt arrangement (supabase/seed.sql) — «Testmøte i klubben».
    const arrangementId = '00000000-0000-4000-9000-000000000001'
    const respons = await page.request.get(`/api/arrangementer/${arrangementId}/ics`)
    expect(respons.ok(), `ICS-ruta svarte ${respons.status()}`).toBeTruthy()
    const kropp = await respons.text()
    expect(kropp).toContain('http://localhost:3100')
  })
})
