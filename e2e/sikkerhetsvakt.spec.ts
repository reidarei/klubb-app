import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { harTestCreds } from './helpers/auth'

// Vakt over vakten: bekrefter at sikkerhetsnettet i playwright.config.ts er
// spent opp i TESTPROSESSEN, så e2e aldri treffer prod (#381/#386). Configen
// laster .env.local, som har prod-verdier etter `vercel env pull`.
// webServer.env beskytter bare server-barnet; runneren har egen process.env.
// Se e2e/README.md § Sikkerhetsmodellen.

// Lås mot «grønn på tom luft» i CI (#534). Bevisst UTENFOR describe-blokken:
// tomme E2E_SUPABASE_* får hver spec til å skippe via harTestCreds(), og
// suiten blir grønn med null dekning — denne kan ikke skippes av det.
// Kun armert i CI: lokalt er «alt skipper» et bevisst oppsett. `CI=1` armer
// den lokalt. Ingen fixtures, så den kjører også uten e2e/.auth/state.json.
test('e2e kjørte faktisk: E2E_SUPABASE_* er satt i CI', () => {
  test.skip(!process.env.CI, 'Kun armet i CI — se kommentaren over.')

  for (const navn of ['E2E_SUPABASE_URL', 'E2E_SUPABASE_ANON_KEY', 'E2E_SUPABASE_SERVICE_KEY']) {
    expect(
      process.env[navn] ?? '',
      `${navn} er tom i CI — da skipper hele suiten stille og porten er verdiløs. Se «Vent på Supabase»-steget i .github/workflows/pr-check.yml.`,
    ).not.toBe('')
  }
  // Hermetegn (godotenv-formatet CLI-en skriver) gjør verdien ubrukelig, ikke tom.
  expect(process.env.E2E_SUPABASE_URL ?? '').not.toMatch(/["']/)
})

// Må stå i chromium-prosjektet, ikke i e2e/rls/: drifter rls-prosjektets
// `testMatch`, kjører heller ikke en vakt der, og RLS-porten forsvinner stille.
// Mønsteret er bevisst duplisert (playwright.config.ts har env-side-effekter
// ved import) — testen skal bli rød når de to går fra hverandre.
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
    // I tillegg til likhet: en fremtidig test-instans i skyen ville passert
    // likhetssjekken og likevel vært feil.
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe(process.env.E2E_SUPABASE_URL)
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').not.toMatch(/supabase\.(co|com)/)
    expect(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe(process.env.E2E_SUPABASE_ANON_KEY)
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBe(process.env.E2E_SUPABASE_SERVICE_KEY)
  })

  test('BASE_URL i testprosessen er lokal, så varsler-vakten er armert', () => {
    // Gjelder kun testprosessen, ikke den serverte appen (den har NEXT_PUBLIC_*
    // bakt inn ved byggetid, #659 — det dekker ICS-testen under). Verdien her
    // vokter specs som importerer server-kode direkte: BLOKKER_UTSENDING i
    // lib/varsler.ts er AV hvis BASE_URL ikke er lokal.
    // Samme substring-predikat som ER_LOKAL_BASE — en strengere regex ville
    // testet vår egen regex, ikke vakten.
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? ''
    expect(base, 'NEXT_PUBLIC_BASE_URL må være lokal i testprosessen').toMatch(
      /localhost|127\.0\.0\.1/,
    )
  })

  // Live vakt mot den SERVERTE appen (#659). ICS-ruta er eneste HTTP-flate som
  // ekker BASE_URL i kroppen. Positiv påstand: ruta skriver også
  // `UID:${id}@${KLUBB_DOMENE}`, så en negativ sjekk mot klubbdomenet ville
  // vært permanent rød (jf. helpers/bygg-artefakt-vakt.ts).
  // Bruker `page` fordi ruta krever innlogging — page.request arver cookies
  // fra e2e/.auth/state.json.
  test('ICS-ruta ekker den lokale BASE_URL-en i den faktisk serverte responsen', async ({ page }) => {
    // Seedet arrangement «Testmøte i klubben».
    const arrangementId = '00000000-0000-4000-9000-000000000001'
    const respons = await page.request.get(`/api/arrangementer/${arrangementId}/ics`)
    expect(respons.ok(), `ICS-ruta svarte ${respons.status()}`).toBeTruthy()
    const kropp = await respons.text()
    expect(kropp).toContain('http://localhost:3100')
  })
})
