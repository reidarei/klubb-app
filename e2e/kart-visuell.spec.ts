import { test } from '@playwright/test'
import fs from 'node:fs'
import { harTestCreds } from './helpers/auth'
import { adminKlient } from './helpers/admin-klient'

/**
 * Visuell baseline for kartsiden (#704 — fullskjerm-redesign).
 *
 * Følger Nivå 1 i visuell-utvikling-workflow.md: skjermbilder per fase til
 * .screenshots/<FASE>/, mobil-viewport (390×844 — klubben er mobil-only),
 * stabilisert med seedet data så relativ tid og vilkårlig innhold ikke gir
 * falske avvik.
 *
 * Kjør:  FASE=foer npx playwright test e2e/kart-visuell.spec.ts
 *        FASE=etter npx playwright test e2e/kart-visuell.spec.ts
 */

const FASE = process.env.FASE ?? 'ad-hoc'
const UT_DIR = `.screenshots/kart-${FASE}`
const PETTER = '00000000-0000-4000-8000-000000000002'
const MERKE = 'Visuell kart-baseline'

let megId: string | null = null

test.describe('Kartsiden — visuell baseline', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md')

  test.beforeAll(async () => {
    fs.mkdirSync(UT_DIR, { recursive: true })
    const admin = adminKlient('kart-visuell')
    if (!admin) return

    const { data: profil, error } = await admin
      .from('profiles').select('id').eq('epost', process.env.TEST_EPOST ?? '').maybeSingle()
    if (error) throw new Error(error.message)
    if (!profil) throw new Error('Fant ingen profil for TEST_EPOST')
    megId = profil.id

    const om4t = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()
    // To menn som deler + et spor på den ene, så kartet har noe å vise.
    await admin.from('posisjon_deling').upsert([
      { profil_id: profil.id, deler_til: om4t, oppdatert: new Date().toISOString() },
      { profil_id: PETTER, deler_til: om4t, oppdatert: new Date().toISOString() },
    ], { onConflict: 'profil_id' })

    await admin.from('posisjon_punkt').insert([
      { profil_id: profil.id, lat: 59.9139, lng: 10.7522, noeyaktighet_m: 12, registrert: new Date(Date.now() - 5 * 60_000).toISOString() },
      { profil_id: PETTER, lat: 59.9111, lng: 10.7461, noeyaktighet_m: 20, registrert: new Date(Date.now() - 40 * 60_000).toISOString() },
      { profil_id: PETTER, lat: 59.9165, lng: 10.758, noeyaktighet_m: 15, registrert: new Date(Date.now() - 10 * 60_000).toISOString() },
    ])

    await admin.from('kart_markering').insert([
      { opprettet_av: profil.id, lat: 59.9150, lng: 10.7500, tekst: `${MERKE} — vi sitter her`, symbol: 'ol', utloper: om4t },
      { opprettet_av: PETTER, lat: 59.9120, lng: 10.7560, tekst: `${MERKE} — møt oss her`, symbol: 'mat', utloper: om4t },
    ])
  })

  test.afterAll(async () => {
    const admin = adminKlient('kart-visuell')
    if (!admin) return
    await admin.from('kart_markering').delete().like('tekst', `${MERKE}%`)
    for (const id of [megId, PETTER]) {
      if (!id) continue
      await admin.from('posisjon_punkt').delete().eq('profil_id', id)
      await admin.from('posisjon_deling').delete().eq('profil_id', id)
    }
  })

  test('kart — dark og light', async ({ page }) => {
    await page.goto('/kart')
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => document.fonts.ready)
    // Vent på at Leaflet har tegnet flisene, ellers blir bildet halvtomt.
    await page.locator('.leaflet-tile-pane img').first().waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1200)
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })

    for (const tema of ['dark', 'light'] as const) {
      await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), tema)
      await page.waitForTimeout(400)
      // Ikke fullPage: poenget med redesignet er hva som får plass PÅ skjermen.
      await page.screenshot({ path: `${UT_DIR}/kart-${tema}.png` })
    }
  })

  test('kart med panelet åpent — dark', async ({ page }) => {
    await page.goto('/kart')
    await page.waitForLoadState('networkidle')
    await page.locator('.leaflet-tile-pane img').first().waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1200)
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))

    // Panelet er halve poenget med redesignet (#704) og må være med i
    // baselinen — ellers sammenligner vi bare kartet med seg selv.
    const handtak = page.getByTestId('panel-handtak')
    await handtak.click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${UT_DIR}/kart-panel-aapent.png` })
  })

  test('kart med chatten åpen — dark', async ({ page }) => {
    await page.goto('/kart')
    await page.waitForLoadState('networkidle')
    await page.locator('.leaflet-tile-pane img').first().waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1200)
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))

    await page.getByTestId('chat-handtak').click()
    // Chat-komponenten lastes lazy — vent på at den faktisk er der.
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${UT_DIR}/kart-chat-aapen.png` })
  })

  test('symbolvelgeren — dark', async ({ page }) => {
    await page.goto('/kart')
    await page.waitForLoadState('networkidle')
    await page.locator('.leaflet-tile-pane img').first().waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1200)
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))

    // Steg 2 i markeringsflyten (#707): symbolvalg over tekstfeltet.
    await page.getByTestId('markering-start').click()
    const bekreft = page.getByTestId('markering-bekreft-sted')
    await bekreft.waitFor({ state: 'visible' })
    await bekreft.click()
    await page.getByTestId('symbol-mat').click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${UT_DIR}/kart-symbolvelger.png` })
  })

  test('kart i markeringsmodus — dark', async ({ page }) => {
    await page.goto('/kart')
    await page.waitForLoadState('networkidle')
    await page.locator('.leaflet-tile-pane img').first().waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1200)
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))

    await page.getByTestId('markering-start').click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${UT_DIR}/kart-markeringsmodus.png` })
  })
})
