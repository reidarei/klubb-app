import { expect, test } from '@playwright/test'
import { harTestCreds } from './helpers/auth'
import { adminKlient } from './helpers/admin-klient'

/**
 * Posisjonskartet (#693) — at prikkene faktisk TEGNES, ikke bare at siden laster.
 *
 * Bakgrunn: første versjon hadde et tomt kart med en full liste under, ved
 * fersh sidelast. Leaflet lastes asynkront, og markør-effekten kjørte før
 * `lagRef` var satt; siden punktene ikke endret seg etterpå, kjørte den aldri
 * igjen. Bugen passerte lint, typecheck, build OG e2e — fordi vakten i
 * `sider-laster.spec.ts` kun sjekker at ruta svarer og at overskriften står der.
 *
 * Lærdommen generaliserer utover kartet: en «siden laster»-vakt kan per
 * definisjon ikke se at et asynkront tegnet lag er tomt. Derfor asserter denne
 * på SELVE MARKØREN, og — viktigere — på at kart og liste er ENIGE. Det er den
 * uenigheten som er feilklassen; et kart som er tomt fordi ingen deler er helt
 * riktig oppførsel og skal ikke feile her.
 *
 * Specen seeder sin egen posisjonsrad og rydder etter seg. Den kan ikke ligge i
 * seed.sql: `deler_til` er et tidsvindu, og en fast rad ville falt ut av det
 * timer etter forrige `db reset` — samme forfallsmodus som #616 og #669.
 */

// Oslo sentrum. Vilkårlig, men innenfor et utsnitt som gir mening om noen
// åpner skjermbildet fra en feilet kjøring.
const LAT = 59.9139
const LNG = 10.7522

let seedetProfilId: string | null = null

test.describe('posisjonskartet tegner markørene (#693)', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md')

  test.beforeAll(async () => {
    const admin = adminKlient('kart-markorer')
    if (!admin) return

    // Den innloggede testbrukeren selv: da dekker testen også «DEG»-merket og
    // aksentringen på egen markør, som er den ene grenen i markoerHtml() som
    // skiller seg ut.
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

    // Ett punkt, ikke flere: sporet krever et PÅGÅENDE arrangement for å tegnes,
    // og denne specen skal teste markøren uten å være avhengig av at det finnes
    // et slikt arrangement i seed. Sportegning har sin egen spec.
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
    // Fersh last er hele poenget: i økta der du nettopp trykket «Del» endrer
    // punktene seg, og effekten kjører på nytt uansett. Bugen viste seg kun her.
    await page.goto('/kart')

    // Sidetittelen ble fjernet da kartet ble fullskjerm (#704) — kartflaten er
    // nå det som beviser at siden rendret.
    await expect(page.getByTestId('kart-flate')).toBeVisible()
    await expect(page.getByTestId('posisjonskart')).toBeVisible()

    // Leaflet laster asynkront — vent på markøren i stedet for å anta at den er
    // der med en gang.
    const markoer = page.locator('.kart-markoer')
    await expect(markoer).toHaveCount(1, { timeout: 15_000 })
    await expect(markoer.first()).toBeVisible()

    // Egen markør skal ha aksentringen. Uten dette kunne markoerHtml() slutte å
    // skille meg fra de andre uten at noen test merket det.
    await expect(page.locator('.kart-markoer-meg')).toHaveCount(1)

    // Flisene skal faktisk ha lastet. En markør på et grått felt er ikke et
    // kart, og tile-laget feiler stille (Leaflet logger ikke).
    await expect(page.locator('.leaflet-tile-pane img').first()).toBeVisible({ timeout: 15_000 })
  })

  test('kart og liste er enige om hvor mange som deler', async ({ page }) => {
    await page.goto('/kart')
    await expect(page.getByTestId('posisjonskart')).toBeVisible()

    // Lista bor i sidepanelet etter #704, og det er minimert som default.
    await page.getByTestId('panel-handtak').click()
    const iListen = page.getByTestId('kart-rad').filter({ hasText: 'DEG' })
    await expect(iListen).toHaveCount(1)

    // DEN sentrale assertionen: like mange prikker som rader. Bugen ga 0 mot 1,
    // og nettopp den uenigheten er feilklassen — ikke at kartet er tomt (som er
    // riktig når ingen deler).
    await expect(page.locator('.kart-markoer')).toHaveCount(1, { timeout: 15_000 })
  })
})
