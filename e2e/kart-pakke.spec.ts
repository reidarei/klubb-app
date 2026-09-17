import { expect, test } from '@playwright/test'
import { harTestCreds } from './helpers/auth'
import { adminKlient } from './helpers/admin-klient'

/**
 * Kart-pakken (#719, #720, #721, #722, #725, #726, #728, #732) — logikk,
 * ruter og dataflyt per Policy: Visuell verifikasjon. Selve flaten
 * (panel-animasjon, langtrykk-gestikk, iOS-tastatur) er kun verifisert
 * manuelt på fysisk iPhone; automatisk verifikasjon er ikke mulig for de
 * delene.
 *
 * Fire spor i én fil fordi de deler samme «kartet må faktisk fungere
 * uendret»-bekymring: #721/#722 (klikk-for-å-lukke) og #726 (kartet skal
 * IKKE flytte seg på et vanlig trykk) er to sider av samme endring — en
 * regresjon i den ene retningen ville vist seg som at kartet enten aldri
 * lukker et panel, eller lukker/flytter seg for aggressivt på hver
 * panorering.
 */

const PETTER = '00000000-0000-4000-8000-000000000002'
const OLA = '00000000-0000-4000-8000-000000000003'
const GUNNAR = '00000000-0000-4000-8000-000000000004'
const MERKE = 'Playwright kart-pakke'

let arrangementId: string | null = null
let noenTestFeilet = false

test.describe('kart-pakken (#719, #721, #722, #725, #726)', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md')

  test.beforeAll(async () => {
    const admin = adminKlient('kart-pakke')
    if (!admin) return

    // Pågående arrangement, samme mønster som kart-timeplan.spec.ts: «pågår
    // nå» er tidsrelativt og kan ikke ligge i seed.sql.
    const { data: arr, error: arrFeil } = await admin
      .from('arrangementer')
      .insert({
        type: 'tur',
        tittel: `${MERKE} — pågår`,
        start_tidspunkt: new Date(Date.now() - 60 * 1000).toISOString(),
        slutt_tidspunkt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        opprettet_av: OLA,
      })
      .select('id')
      .single()
    if (arrFeil) throw new Error(`Kunne ikke seede arrangement: ${arrFeil.message}`)
    arrangementId = arr.id

    // Petter er påmeldt og deler IKKE posisjon — han skal dukke opp i
    // «Ping en herre». Ola er påmeldt OG deler posisjon — han skal IKKE
    // dukke opp der (han er jo allerede synlig på kartet). Gunnar er
    // påmeldt 'kanskje' — status som ikke teller som påmeldt.
    const { error: paameldingFeil } = await admin.from('paameldinger').insert([
      { arrangement_id: arrangementId, profil_id: PETTER, status: 'ja' },
      { arrangement_id: arrangementId, profil_id: OLA, status: 'ja' },
      { arrangement_id: arrangementId, profil_id: GUNNAR, status: 'kanskje' },
    ])
    if (paameldingFeil) throw new Error(`Kunne ikke seede påmeldinger: ${paameldingFeil.message}`)

    const om4t = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()
    const { error: delingFeil } = await admin.from('posisjon_deling').upsert(
      { profil_id: OLA, deler_til: om4t, oppdatert: new Date().toISOString() },
      { onConflict: 'profil_id' },
    )
    if (delingFeil) throw new Error(`Kunne ikke seede deling for Ola: ${delingFeil.message}`)

    const { error: punktFeil } = await admin.from('posisjon_punkt').insert({
      profil_id: OLA,
      lat: 59.9139,
      lng: 10.7522,
      registrert: new Date().toISOString(),
      arrangement_id: arrangementId,
    })
    if (punktFeil) throw new Error(`Kunne ikke seede posisjon for Ola: ${punktFeil.message}`)
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) noenTestFeilet = true
  })

  test.afterAll(async () => {
    const admin = adminKlient('kart-pakke')
    if (!admin) return
    await admin.from('posisjon_punkt').delete().eq('profil_id', OLA)
    await admin.from('posisjon_deling').delete().eq('profil_id', OLA)
    if (arrangementId) {
      // Cascade rydder påmeldinger med.
      const { error } = await admin.from('arrangementer').delete().eq('id', arrangementId)
      if (error) {
        console.error(`[kart-pakke] opprydding feilet: ${error.message}`)
        if (!noenTestFeilet) throw new Error(`Kunne ikke rydde arrangement: ${error.message}`)
      }
    }
  })

  test('trykk på kartet lukker liste-, chat- og timeplanpanelet (#721, #722)', async ({ page }) => {
    await page.goto('/kart')
    await expect(page.getByTestId('kart-flate')).toBeVisible()
    await page.locator('.leaflet-tile-pane img').first().waitFor({ state: 'visible', timeout: 15_000 })

    const flate = (await page.getByTestId('kart-flate').boundingBox())!

    // Listepanelet er på HØYRE kant — trykk et punkt godt inn på VENSTRE
    // side, som alltid er kartflate uansett hvilket panel som er åpent.
    const venstrePunkt = { x: flate.x + 40, y: flate.y + flate.height / 2 }
    // Chat-panelet er på VENSTRE kant — trykk godt inn på HØYRE side.
    const hoeyrePunkt = { x: flate.x + flate.width - 40, y: flate.y + flate.height / 2 }

    // 1) Listepanelet.
    const listeHandtak = page.getByTestId('panel-handtak')
    await listeHandtak.click()
    await expect(listeHandtak).toHaveAttribute('aria-expanded', 'true')
    await page.mouse.click(venstrePunkt.x, venstrePunkt.y)
    await expect(page.getByTestId('panel-handtak')).toHaveAttribute('aria-expanded', 'false')

    // 2) Chat-panelet (admin ser chat-fanen uansett innstilling).
    const chatHandtak = page.getByTestId('chat-handtak')
    await chatHandtak.waitFor({ state: 'visible', timeout: 15_000 })
    await chatHandtak.click()
    await expect(chatHandtak).toHaveAttribute('aria-expanded', 'true')
    await page.mouse.click(hoeyrePunkt.x, hoeyrePunkt.y)
    await expect(page.getByTestId('chat-handtak')).toHaveAttribute('aria-expanded', 'false')

    // 3) Timeplan-panelet (pilla finnes fordi et arrangement pågår, seedet i beforeAll).
    const timeplanPille = page.getByTestId('timeplan-pille')
    await timeplanPille.waitFor({ state: 'visible', timeout: 15_000 })
    await timeplanPille.click()
    await expect(timeplanPille).toHaveAttribute('aria-expanded', 'true')
    await page.mouse.click(venstrePunkt.x, venstrePunkt.y)
    await expect(page.getByTestId('timeplan-pille')).toHaveAttribute('aria-expanded', 'false')
  })

  test('panorering virker fortsatt med listepanelet åpent (#721 regresjonsvakt)', async ({ page }) => {
    // Ingen scrim-div er selve poenget med #721/#722 — trykk-for-å-lukke er
    // implementert som Leaflets EGET 'click'-event, ikke et inset:0-overlegg
    // som ville svelget panorering. Denne testen DRAR faktisk i kartet med
    // panelet åpent, i stedet for å stole på at fraværet av et overlegg i
    // CSS-en beviser noe.
    await page.goto('/kart')
    await expect(page.getByTestId('kart-flate')).toBeVisible()
    await page.locator('.leaflet-tile-pane img').first().waitFor({ state: 'visible', timeout: 15_000 })
    // Olas markør, seedet i beforeAll — noe konkret å måle forflytning på.
    const markoer = page.locator('.kart-markoer').first()
    await expect(markoer).toBeVisible({ timeout: 15_000 })

    await page.getByTestId('panel-handtak').click()
    await expect(page.getByTestId('panel-handtak')).toHaveAttribute('aria-expanded', 'true')
    // Panelet glir inn over 220 ms. Uten denne pausen måles og gripes kartet
    // MENS det glir, og testen blir en funksjon av maskinens fart i stedet for
    // av koden (se valget av startpunkt under).
    await page.waitForTimeout(400)

    const flate = (await page.getByTestId('kart-flate').boundingBox())!

    // Startpunktet må være kartFLATE uansett hvor langt panelet har glidd inn.
    // Panelet er `width: min(300px, 85%)` mot HØYRE kant, så på 390 px viewport
    // dekker det x ∈ [90, 390] — altså midten av flaten. Et drag fra sentrum
    // (som denne testen gjorde først) landet derfor mousedown PÅ PANELET, og
    // Leaflet fikk aldri se draget: forflytning 0. At den likevel var grønn
    // lokalt er verre enn at den var rød i CI — den rakk å gripe kartet før
    // panelet var ferdig inn, altså besto den av en grunn den ikke testet.
    // Venstre 90 px-stripe er alltid kart; håndtaket ligger der midt på
    // høyden, så vi starter godt over det.
    const startX = flate.x + 40
    const startY = flate.y + flate.height * 0.3
    const foer = (await markoer.boundingBox())!

    // Ned-og-høyre, ikke opp-og-venstre: fra x = 40 er det ikke 160 px å gå
    // mot venstre uten å havne utenfor viewporten.
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    for (const steg of [1, 2, 3, 4]) {
      await page.mouse.move(startX + steg * 30, startY + steg * 40)
      await page.waitForTimeout(40)
    }
    await page.mouse.up()
    await page.waitForTimeout(500)

    const etter = (await markoer.boundingBox())!
    // Markøren skal ha flyttet seg synlig på skjermen — beviser at
    // panoreringen faktisk skjedde, ikke bare at ingenting krasjet.
    const forflytning = Math.hypot(etter.x - foer.x, etter.y - foer.y)
    expect(forflytning).toBeGreaterThan(30)

    // Og panelet står fortsatt åpent: en DRAG er ikke et 'click', så
    // trykk-lukk-logikken skal ikke ha reagert på den.
    await expect(page.getByTestId('panel-handtak')).toHaveAttribute('aria-expanded', 'true')
  })

  test('delt stedslenke sentrerer kartet og viser markøren, ugyldig lenke krasjer ikke (#719)', async ({ page }) => {
    await page.goto('/kart?lat=59.91387&lng=10.75225&tekst=Vi%20sitter%20her')
    await expect(page.getByTestId('kart-flate')).toBeVisible()
    await page.locator('.leaflet-tile-pane img').first().waitFor({ state: 'visible', timeout: 15_000 })

    await expect(page.getByTestId('delt-sted')).toBeVisible({ timeout: 15_000 })

    // Fail-closed (lib/kart-lenke.ts): et ugyldig koordinat skal falle
    // tilbake til vanlig kartoppførsel, ALDRI krasje siden.
    await page.goto('/kart?lat=abc&lng=10.7')
    await expect(page.getByTestId('kart-flate')).toBeVisible()
    await page.locator('.leaflet-tile-pane img').first().waitFor({ state: 'visible', timeout: 15_000 })
    await expect(page.getByTestId('delt-sted')).toHaveCount(0)
  })

  test('«Ping en herre» lister påmeldte som ikke deler, ikke de som allerede gjør det (#725)', async ({ page }) => {
    // Petter: påmeldt 'ja', deler IKKE — skal stå i lista. Ola: påmeldt 'ja',
    // deler ALLEREDE (seedet i beforeAll) — skal IKKE stå der, han er jo
    // synlig på kartet fra før. Gunnar: påmeldt 'kanskje' — teller ikke som
    // påmeldt og skal heller ikke stå der.
    await page.goto('/kart')
    await expect(page.getByTestId('posisjonskart')).toBeVisible()

    await page.getByTestId('panel-handtak').click()
    await expect(page.getByTestId('panel-handtak')).toHaveAttribute('aria-expanded', 'true')

    const pingKnapp = page.getByTestId('ping-en-herre-knapp')
    await pingKnapp.waitFor({ state: 'visible', timeout: 15_000 })
    await pingKnapp.click()

    const kandidater = page.getByTestId('ping-kandidat-rad')
    await expect(kandidater.filter({ hasText: 'Petter Prøve' })).toHaveCount(1, { timeout: 15_000 })
    await expect(kandidater.filter({ hasText: 'Ola Testesen' })).toHaveCount(0)
    await expect(kandidater.filter({ hasText: 'Gunnar General' })).toHaveCount(0)
  })
})
