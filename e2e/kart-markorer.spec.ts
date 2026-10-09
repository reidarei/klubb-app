import { expect, test } from '@playwright/test'
import { harTestCreds } from './helpers/auth'
import { adminKlient } from './helpers/admin-klient'

/**
 * Posisjonskartet (#693) — at prikkene faktisk TEGNES, ikke bare at siden laster.
 *
 * En «siden laster»-vakt kan ikke se at et asynkront tegnet Leaflet-lag er tomt.
 * Derfor asserter denne på selve markøren og på at kart og liste er ENIGE — det
 * er uenigheten som er feilklassen; et tomt kart fordi ingen deler er riktig.
 *
 * Seeder sin egen posisjonsrad: `deler_til` er et tidsvindu, og en fast rad i
 * seed.sql ville falt ut av det timer etter `db reset` (jf. #616, #669).
 */

// Oslo sentrum — vilkårlig, men gir mening i et skjermbilde fra en feilet kjøring.
const LAT = 59.9139
const LNG = 10.7522

let seedetProfilId: string | null = null

test.describe('posisjonskartet tegner markørene (#693)', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md')

  test.beforeAll(async () => {
    const admin = adminKlient('kart-markorer')
    if (!admin) return

    // Den innloggede testbrukeren selv, så «DEG»-merket og aksentringen
    // (egen gren i markoerHtml()) også dekkes.
    const { data: profil, error: profilFeil } = await admin
      .from('profiles')
      .select('id')
      .eq('epost', process.env.TEST_EPOST ?? '')
      .maybeSingle()

    if (profilFeil) throw new Error(`Kunne ikke hente testprofil: ${profilFeil.message}`)
    if (!profil) throw new Error('Fant ingen profil for TEST_EPOST — er seed.sql kjørt?')

    const { error: delingFeil } = await admin.from('posisjon_deling').upsert(
      {
        profil_id: profil.id,
        // Godt innenfor vinduet, ikke på kanten: en rad som utløper mens
        // suiten kjører ville gitt et rødt som ser ut som en komponentfeil.
        deler_til: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        oppdatert: new Date().toISOString(),
      },
      { onConflict: 'profil_id' },
    )

    if (delingFeil) throw new Error(`Kunne ikke seede deling: ${delingFeil.message}`)

    // Ett punkt: sporet krever et pågående arrangement, og denne specen skal ikke
    // avhenge av det. Sportegning har egen spec.
    const { error: punktFeil } = await admin.from('posisjon_punkt').insert({
      profil_id: profil.id,
      lat: LAT,
      lng: LNG,
      noeyaktighet_m: 12,
      registrert: new Date().toISOString(),
    })

    if (punktFeil) throw new Error(`Kunne ikke seede posisjon: ${punktFeil.message}`)
    seedetProfilId = profil.id
  })

  test.afterAll(async () => {
    const admin = adminKlient('kart-markorer')
    if (!admin || !seedetProfilId) return
    await admin.from('posisjon_punkt').delete().eq('profil_id', seedetProfilId).throwOnError()
    await admin.from('posisjon_deling').delete().eq('profil_id', seedetProfilId).throwOnError()
  })

  test('markøren tegnes på kartet ved fersh sidelast', async ({ page }) => {
    // Fersk last er poenget: markør-effekten kjørte før Leaflet-laget fantes og
    // ble aldri kjørt igjen når punktene var uendret. Bugen viste seg kun her.
    await page.goto('/kart')

    // Kartet er fullskjerm uten sidetittel (#704) — kartflaten beviser rendring.
    await expect(page.getByTestId('kart-flate')).toBeVisible()
    await expect(page.getByTestId('posisjonskart')).toBeVisible()

    const markoer = page.locator('.kart-markoer')
    await expect(markoer).toHaveCount(1, { timeout: 15_000 })
    await expect(markoer.first()).toBeVisible()

    await expect(page.locator('.kart-markoer-meg')).toHaveCount(1)

    // Tile-laget feiler stille (Leaflet logger ikke) — en markør på grått er ikke et kart.
    await expect(page.locator('.leaflet-tile-pane img').first()).toBeVisible({ timeout: 15_000 })
  })

  test('kart og liste er enige om hvor mange som deler', async ({ page }) => {
    await page.goto('/kart')
    await expect(page.getByTestId('posisjonskart')).toBeVisible()

    // Lista bor i sidepanelet, som er minimert som default (#704).
    await page.getByTestId('panel-handtak').click()
    const iListen = page.getByTestId('kart-rad').filter({ hasText: 'DEG' })
    await expect(iListen).toHaveCount(1)

    // Den sentrale assertionen: like mange prikker som rader.
    await expect(page.locator('.kart-markoer')).toHaveCount(1, { timeout: 15_000 })
  })
})
