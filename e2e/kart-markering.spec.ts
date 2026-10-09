import { expect, test } from '@playwright/test'
import { harTestCreds, loggInn, SEED_PASSORD } from './helpers/auth'
import { adminKlient } from './helpers/admin-klient'
import { ventPaaServerAction } from './helpers/server-action'
import { forventTreffbar } from './helpers/treffmaal'
import { KART_MARKERING_MAKS_LENGDE } from '../lib/konstanter'
import { MARKERING_SYMBOLER, STANDARD_SYMBOL, symbolEmoji } from '../lib/markering-symboler'

// Symbolene avledes av klubbens eget register, aldri klubbens id-er: fila
// er MÅ MATCHE og speiles til klubb-app (#767). Kun STANDARD_SYMBOL er garantert;
// har registeret bare ett symbol, hopper prøvene som trenger to over seg selv.
const ANNET_SYMBOL = MARKERING_SYMBOLER.find(s => s.id !== STANDARD_SYMBOL)

/**
 * Markeringer på kartet (#697) — «møt meg her», satt der du står.
 *
 * Markeringene seedes direkte i basen: geolocation i headless Chromium nektes
 * eller går i timeout, og testen ville målt tillatelsesoppsettet. UI-flytens
 * egen logikk (steg, validering) testes uten posisjon.
 */

const PETTER = '00000000-0000-4000-8000-000000000002'
const TEKST_MIN = 'Playwright — min markering'
const TEKST_ANNEN = 'Playwright — Petters markering'

let megId: string | null = null

/**
 * Lista ligger i sidepanelet, minimert som default (#704). Radene står i DOM-en
 * også når det er lukket, så en test uten dette kan «klikke» på noe brukeren
 * ikke når (jf. #700, #702). All bruk av lista går gjennom denne.
 */
async function aapnePanel(page: import('@playwright/test').Page) {
  const handtak = page.getByTestId('panel-handtak')
  await handtak.waitFor({ state: 'visible', timeout: 15_000 })
  if ((await handtak.getAttribute('aria-expanded')) !== 'true') {
    await handtak.click()
    await expect(handtak).toHaveAttribute('aria-expanded', 'true')
  }
}

test.describe('kartmarkeringer (#697)', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md')

  test.beforeAll(async () => {
    const admin = adminKlient('kart-markering')
    if (!admin) return

    const { data: profil, error: profilFeil } = await admin
      .from('profiles').select('id').eq('epost', process.env.TEST_EPOST ?? '').maybeSingle()
    if (profilFeil) throw new Error(`Kunne ikke hente testprofil: ${profilFeil.message}`)
    if (!profil) throw new Error('Fant ingen profil for TEST_EPOST — er seed.sql kjørt?')
    megId = profil.id

    const om4t = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()
    const { error } = await admin.from('kart_markering').insert([
      { opprettet_av: profil.id, lat: 59.9139, lng: 10.7522, tekst: TEKST_MIN, symbol: STANDARD_SYMBOL, utloper: om4t },
      { opprettet_av: PETTER, lat: 59.9165, lng: 10.758, tekst: TEKST_ANNEN, symbol: ANNET_SYMBOL?.id ?? STANDARD_SYMBOL, utloper: om4t },
      // Utløpt, satt av MEG: RLS slipper egen rad gjennom, så den beviser at
      // siden filtrerer selv.
      {
        opprettet_av: profil.id,
        lat: 59.92, lng: 10.76,
        tekst: 'Playwright — utløpt markering',
        // `symbol` må med tross default: PostgREST normaliserer en batch-insert
        // til felles kolonner, og en manglende verdi sendes som eksplisitt null.
        symbol: STANDARD_SYMBOL,
        utloper: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      },
    ])
    if (error) throw new Error(`Kunne ikke seede markeringer: ${error.message}`)
  })

  test.afterAll(async () => {
    const admin = adminKlient('kart-markering')
    if (!admin) return
    await admin.from('kart_markering').delete().like('tekst', 'Playwright —%').throwOnError()
  })

  test('markeringer tegnes på kartet og listes under', async ({ page }) => {
    await page.goto('/kart')
    await expect(page.getByTestId('posisjonskart')).toBeVisible()

    await expect(page.locator('.kart-markering-etikett')).toHaveCount(2, { timeout: 15_000 })
    // Bevisst knyttet til tooltip-klassen: står teksten kun i lista, er
    // markeringen usynlig på kartet.
    await expect(page.locator('.kart-markering-etikett', { hasText: TEKST_MIN })).toHaveCount(1)
    await expect(page.locator('.kart-markering-etikett', { hasText: TEKST_ANNEN })).toHaveCount(1)

    // Den utløpte ligger fortsatt i basen — tester filtreringen, ikke slettingen.
    await expect(page.getByText('Playwright — utløpt markering')).toHaveCount(0)
  })

  test('admin ser fjern-knappen på alle markeringer', async ({ page }) => {
    // Testbrukeren er admin: UI-et skal følge RLS, som lar admin slette alt (#699).
    await page.goto('/kart')
    await expect(page.getByTestId('posisjonskart')).toBeVisible()
    await aapnePanel(page)

    const min = page.getByTestId('markering-rad').filter({ hasText: TEKST_MIN })
    const annen = page.getByTestId('markering-rad').filter({ hasText: TEKST_ANNEN })

    await expect(min.getByTestId('markering-fjern')).toHaveCount(1)
    await expect(annen.getByTestId('markering-fjern')).toHaveCount(1)

    // Dybde-kall (#700): panelet er lukket som default og usynlig for bredde-sveipen.
    await forventTreffbar(page, {
      kontekst: '/kart — listepanel åpent',
      omraade: '[data-testid="kart-panel"]',
    })
  })

  test.describe('som vanlig medlem', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test('ser fjern-knappen kun på sine egne', async ({ page }) => {
      // Petter er medlem: fanger en regresjon der alle får fjerne alt.
      await loggInn(page, { epost: 'petter.prove@klubb.test', passord: SEED_PASSORD })
      await page.goto('/kart')
      await expect(page.getByTestId('posisjonskart')).toBeVisible()
      await aapnePanel(page)

      const hans = page.getByTestId('markering-rad').filter({ hasText: TEKST_ANNEN })
      const andres = page.getByTestId('markering-rad').filter({ hasText: TEKST_MIN })

      await expect(hans.getByTestId('markering-fjern')).toHaveCount(1)
      await expect(andres.getByTestId('markering-fjern')).toHaveCount(0)

      // Panelet på kartet skal følge samme regel. Sidepanelet lukkes først: det
      // dekker 300 px av høyre kant, og bobla kan ligge under.
      await page.getByTestId('panel-handtak').click()
      await expect(page.getByTestId('panel-handtak')).toHaveAttribute('aria-expanded', 'false')
      await page.locator('.kart-markering-etikett').first().click()
      await expect(page.getByTestId('markering-panel')).toBeVisible()
    })
  })

  test('nåla på kartet åpner et panel med fjern-knapp', async ({ page }) => {
    // Nåla er der man naturlig trykker for å slette (#699).
    await page.goto('/kart')
    await expect(page.getByTestId('posisjonskart')).toBeVisible()
    await expect(page.locator('.kart-markering-etikett')).toHaveCount(2, { timeout: 15_000 })

    await expect(page.getByTestId('markering-panel')).toHaveCount(0)
    await page.locator('.kart-markering-etikett').first().click()

    const panel = page.getByTestId('markering-panel')
    await expect(panel).toBeVisible()
    await expect(panel.getByTestId('markering-panel-fjern')).toBeVisible()

    await panel.getByTestId('markering-panel-lukk').click()
    await expect(page.getByTestId('markering-panel')).toHaveCount(0)
  })

  test('fjerning fra panelet tar bort både nåla og raden', async ({ page }) => {
    // Egen rad, ikke `.first()` på de delte seed-radene: ellers avhenger testen
    // av tegnerekkefølgen og må legge seed tilbake (#800). afterAll rydder den.
    const EGEN = 'Playwright — fjern-panel'
    const admin = adminKlient('kart-markering')
    test.skip(!admin, 'Ingen admin-klient')
    await admin!.from('kart_markering').insert({
      opprettet_av: megId!,
      lat: 59.93, lng: 10.74,
      tekst: EGEN,
      symbol: STANDARD_SYMBOL,
      utloper: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    }).throwOnError()

    await page.goto('/kart')
    const boble = page.locator('.kart-markering-etikett', { hasText: EGEN })
    await expect(boble).toBeVisible({ timeout: 15_000 })
    await boble.click()

    await ventPaaServerAction(page, () =>
      page.getByTestId('markering-panel').getByTestId('markering-panel-fjern').click(),
    )

    // Panelet skal lukke seg, ikke peke på noe som ikke finnes. 15 s: statusen
    // beviser server ferdig, ikke DOM-commit (#800).
    await expect(page.getByTestId('markering-panel')).toHaveCount(0, { timeout: 15_000 })
    await expect(page.locator('.kart-markering-etikett', { hasText: EGEN })).toHaveCount(0, { timeout: 15_000 })
    await expect(page.locator('.kart-markering-etikett', { hasText: TEKST_MIN })).toHaveCount(1)
    await expect(page.locator('.kart-markering-etikett', { hasText: TEKST_ANNEN })).toHaveCount(1)
  })

  test('fjerning tar bort markeringen', async ({ page }) => {
    // Egen rad, samme grunn som over (#800).
    const EGEN = 'Playwright — fjern-liste'
    const admin = adminKlient('kart-markering')
    test.skip(!admin, 'Ingen admin-klient')
    await admin!.from('kart_markering').insert({
      opprettet_av: megId!,
      lat: 59.94, lng: 10.75,
      tekst: EGEN,
      symbol: STANDARD_SYMBOL,
      utloper: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    }).throwOnError()

    await page.goto('/kart')
    await aapnePanel(page)
    const rad = page.getByTestId('markering-rad').filter({ hasText: EGEN })
    await expect(rad).toHaveCount(1)

    await ventPaaServerAction(page, () => rad.getByTestId('markering-fjern').click())

    // 15 s: statusen beviser server ferdig, ikke DOM-commit (#800).
    await expect(page.getByTestId('markering-rad').filter({ hasText: EGEN })).toHaveCount(0, { timeout: 15_000 })
    // Nåla også, ikke bare raden — at de kan komme i utakt var bugen i #694.
    await expect(page.locator('.kart-markering-etikett', { hasText: EGEN })).toHaveCount(0, { timeout: 15_000 })
  })

  test('stedsøket med «Nærmeste pub» er treffbart', async ({ page }) => {
    // Dybde-kall (#727): søkeflaten er usynlig for bredde-sveipen. Knappene
    // MÅLES bare — «Nærmeste pub» trykkes ikke, så e2e kaller aldri Overpass.
    await page.goto('/kart')
    await expect(page.getByTestId('posisjonskart')).toBeVisible()
    await page.getByTestId('sted-sok-start').click()
    await expect(page.getByTestId('sted-sok-felt')).toBeVisible()
    await expect(page.getByTestId('sted-sok-pub')).toBeVisible()

    await forventTreffbar(page, {
      kontekst: '/kart — stedsøk åpent',
      omraade: '[data-testid="kart-steg-flate"]',
    })
  })

  test('flyten er peke først, skrive etterpå', async ({ page }) => {
    // Rekkefølgen ER funksjonen (#702): tekstfeltet åpner tastaturet, som
    // dekker kartet før man har sett hvor krysset havnet.
    await page.goto('/kart')
    await expect(page.getByTestId('posisjonskart')).toBeVisible()

    // Steg 0: verken kryss eller tekstfelt.
    await expect(page.getByTestId('markering-sikte')).toHaveCount(0)
    await expect(page.getByTestId('markering-tekst')).toHaveCount(0)

    // Steg 1: kryss, men FORTSATT ikke tekstfelt — det er hele poenget.
    await page.getByTestId('markering-start').click()
    await expect(page.getByTestId('markering-sikte')).toBeVisible()
    await expect(page.getByTestId('markering-tekst')).toHaveCount(0)

    // Steg 2: teksten kommer, og krysset trekkes siden stedet er låst.
    await page.getByTestId('markering-bekreft-sted').click()
    const felt = page.getByTestId('markering-tekst')
    await expect(felt).toBeVisible()
    await expect(felt).toHaveAttribute('maxlength', String(KART_MARKERING_MAKS_LENGDE))
    await expect(page.getByTestId('markering-sikte')).toHaveCount(0)

    // Tom tekst avvises, og man blir stående i tekststeget.
    await page.getByTestId('markering-lagre').click()
    await expect(page.getByTestId('kart-feil')).toContainText('Skriv hva markeringen gjelder')
    await expect(felt).toBeVisible()

    // «Tilbake» går til stedsvalget, ikke helt ut.
    await page.getByTestId('markering-tilbake').click()
    await expect(page.getByTestId('markering-sikte')).toBeVisible()
    await expect(page.getByTestId('markering-tekst')).toHaveCount(0)

    await page.getByTestId('markering-avbryt').click()
    await expect(page.getByTestId('markering-sikte')).toHaveCount(0)
  })

  test('markeringen settes der siktet står, ikke der GPS-en sier du er', async ({ page }) => {
    // Geolocation nektes: går markeringen gjennom, leser den kartsenteret.
    await page.context().clearPermissions()
    await page.goto('/kart')
    await expect(page.getByTestId('posisjonskart')).toBeVisible()

    await page.getByTestId('markering-start').click()
    // Vent til kartet er initialisert: «Her er det» leser kartsenteret, og er
    // låst til Leaflet er klar. I CI rekker ikke kartet å laste før klikket.
    const bekreft = page.getByTestId('markering-bekreft-sted')
    await expect(bekreft).toBeEnabled({ timeout: 15_000 })
    await bekreft.click()
    await page.getByTestId('markering-tekst').fill('Playwright — fra siktet')
    await ventPaaServerAction(page, () => page.getByTestId('markering-lagre').click())

    await aapnePanel(page)
    // 15 s: statusen beviser server ferdig, ikke DOM-commit (#800).
    await expect(
      page.getByTestId('markering-rad').filter({ hasText: 'Playwright — fra siktet' }),
    ).toHaveCount(1, { timeout: 15_000 })
    await expect(page.getByTestId('markering-sikte')).toHaveCount(0)

    const admin = adminKlient('kart-markering')
    if (admin) await admin.from('kart_markering').delete().eq('tekst', 'Playwright — fra siktet').throwOnError()
  })

  test('lista ligger i et panel som må åpnes', async ({ page }) => {
    // Radene finnes i DOM-en også når panelet er lukket (#704): uten en sjekk på
    // at panelet er utenfor skjermen kan en spec «bruke» en liste ingen ser.
    await page.goto('/kart')
    await expect(page.getByTestId('kart-flate')).toBeVisible()

    const handtak = page.getByTestId('panel-handtak')
    const panel = page.getByTestId('kart-panel')
    await expect(handtak).toHaveAttribute('aria-expanded', 'false')

    // Lukket: panelet er skjøvet ut til høyre for kartflaten.
    const flate = await page.getByTestId('kart-flate').boundingBox()
    const lukket = await panel.boundingBox()
    expect(lukket!.x).toBeGreaterThanOrEqual(flate!.x + flate!.width - 1)

    await handtak.click()
    await expect(handtak).toHaveAttribute('aria-expanded', 'true')

    // `poll`: panelet glir inn over 220 ms, og en måling rett etter klikket
    // leser posisjonen fra før animasjonen.
    await expect
      .poll(async () => (await panel.boundingBox())!.x, { timeout: 5000 })
      .toBeLessThan(flate!.x + flate!.width - 50)

    await handtak.click()
    await expect(handtak).toHaveAttribute('aria-expanded', 'false')
  })

  test('symbolet velges i flyten og vises på kartet', async ({ page }) => {
    // Hele veien: valg i skjemaet → nål på kartet → rad i lista (#707).
    test.skip(!ANNET_SYMBOL, 'Registeret har bare ett symbol — ingenting å bytte til')
    await page.goto('/kart')
    await expect(page.getByTestId('kart-flate')).toBeVisible()

    await page.getByTestId('markering-start').click()
    // «Her er det» er låst til Leaflet er klar; i CI rekker ikke kartet å laste før klikket.
    const bekreft = page.getByTestId('markering-bekreft-sted')
    await expect(bekreft).toBeEnabled({ timeout: 15_000 })
    await bekreft.click()

    // Forhåndsvalgt, så et glemt valg ikke gir en markering uten ikon.
    await expect(page.getByTestId(`symbol-${STANDARD_SYMBOL}`)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId(`symbol-${ANNET_SYMBOL!.id}`)).toHaveAttribute('aria-pressed', 'false')

    await page.getByTestId(`symbol-${ANNET_SYMBOL!.id}`).click()
    await expect(page.getByTestId(`symbol-${ANNET_SYMBOL!.id}`)).toHaveAttribute('aria-pressed', 'true')
    // Valget er eksklusivt.
    await expect(page.getByTestId(`symbol-${STANDARD_SYMBOL}`)).toHaveAttribute('aria-pressed', 'false')

    await page.getByTestId('markering-tekst').fill('Playwright — med symbol')
    await ventPaaServerAction(page, () => page.getByTestId('markering-lagre').click())

    const valgtEmoji = ANNET_SYMBOL!.emoji
    // 15 s: statusen beviser server ferdig, ikke DOM-commit (#800).
    await expect(page.locator('.kart-markering-etikett', { hasText: 'Playwright — med symbol' }))
      .toContainText(valgtEmoji, { timeout: 15_000 })

    await aapnePanel(page)
    await expect(
      page.getByTestId('markering-rad').filter({ hasText: 'Playwright — med symbol' }),
    ).toContainText(valgtEmoji)

    const admin = adminKlient('kart-markering')
    if (admin) await admin.from('kart_markering').delete().eq('tekst', 'Playwright — med symbol').throwOnError()
  })

  test('alle symbolene finnes og har hvert sitt ikon', async ({ page }) => {
    // Fanger at UI-et og MARKERING_SYMBOLER kommer i utakt.
    await page.goto('/kart')
    await page.getByTestId('markering-start').click()
    // «Her er det» er låst til Leaflet er klar; i CI rekker ikke kartet å laste før klikket.
    const bekreft = page.getByTestId('markering-bekreft-sted')
    await expect(bekreft).toBeEnabled({ timeout: 15_000 })
    await bekreft.click()

    const emojier = new Set<string>()
    for (const sym of MARKERING_SYMBOLER) {
      const knapp = page.getByTestId(`symbol-${sym.id}`)
      await expect(knapp).toBeVisible()
      await expect(knapp).toContainText(sym.emoji)
      emojier.add(sym.emoji)
    }
    // Distinkte ikoner — to like gjør symbolet verdiløst på kartet.
    expect(emojier.size).toBe(MARKERING_SYMBOLER.length)
  })

  test('databasen håndhever symbolFORMATET, ikke en verdiliste', async () => {
    // Check-constrainten er en uavhengig kilde til sannhet ved siden av
    // registeret og UI-et (#759); hver klubb redigerer registeret selv, og en
    // id med feil format sier bare denne testen fra om før produksjon.
    //
    // Constrainten håndhever FORM, ikke en verdiliste (migrasjon 152, #767).
    // «Registerets id-er godtas» alene ville også passert den gamle verdilista,
    // så formatet pinnes i begge retninger: gyldig men UKJENT id inn, ugyldige
    // former avvist av databasen.
    //
    // Ingen `page` — kun spørringer via adminKlient.
    const admin = adminKlient('kart-markering')
    test.skip(!admin, 'Ingen admin-klient')

    const PREFIKS = `Playwright — symbolgodkjenning ${Date.now()}`
    const rad = (tekst: string, symbol: string) => ({
      opprettet_av: megId!,
      lat: 59.9139,
      lng: 10.7522,
      tekst: `${PREFIKS}-${tekst}`,
      symbol,
      utloper: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    })

    let bestod = false
    try {
      // (a) Hele registeret går inn — ellers 23514 her.
      const { error } = await admin!
        .from('kart_markering')
        .insert(MARKERING_SYMBOLER.map((sym, i) => rad(`registeret-${i}`, sym.id)))
      expect(error, 'et symbol i registeret ble avvist av databasen').toBeNull()

      // (b) Den avgjørende: gyldig FORM, ukjent id — beviser at verdilista er
      // borte. 'obs1' fordi sifferet er grunnen til at formatet tillater tall
      // (migrasjon 152).
      const { error: ukjentFeil } = await admin!
        .from('kart_markering')
        .insert(rad('ukjent', 'obs1'))
      expect(
        ukjentFeil,
        'gyldig, ukjent symbol-id ble avvist — står verdilista fra 146/151 fortsatt?',
      ).toBeNull()

      // (c) 24 tegn er taket — fanger off-by-one i regexen.
      const { error: maksFeil } = await admin!
        .from('kart_markering')
        .insert(rad('maks', 'a'.repeat(24)))
      expect(maksFeil, 'en id på nøyaktig 24 tegn skal godtas').toBeNull()

      // (d) Formen håndheves: et medlem kan POSTe rett mot PostgREST, så dette
      // er eneste vakt mot at symbol blir fritekst.
      const ugyldige: [string, string][] = [
        ['Obs1', 'stor forbokstav'],
        ['1obs', 'innledende siffer'],
        ['obs-1', 'bindestrek'],
        ['a'.repeat(25), '25 tegn — over taket på 24'],
      ]
      for (const [symbol, hvorfor] of ugyldige) {
        const { error: formFeil } = await admin!
          .from('kart_markering')
          .insert(rad(`ugyldig-${hvorfor}`, symbol))
        expect(formFeil?.code, `${hvorfor} skulle vært avvist`).toBe('23514')
        // Navngitt constraint: tekst-lengden har sin egen 23514.
        expect(formFeil?.message).toContain('kart_markering_symbol_gyldig')
      }
      bestod = true
    } finally {
      // Oppryddingen feiler ikke stille (gjenglemte rader arves av neste
      // kjøring), men kaster kun når testen ellers bestod, så den ikke maskerer
      // den ekte assertion-feilen.
      const { error: oppryddingFeil } = await admin!
        .from('kart_markering')
        .delete()
        .like('tekst', `${PREFIKS}-%`)
      if (oppryddingFeil) {
        console.error(`[kart-markering] opprydding feilet: ${oppryddingFeil.message}`)
        if (bestod) throw new Error(`oppryddingen etterlot testrader i basen: ${oppryddingFeil.message}`)
      }
    }
  })

  test('symbolet står ÉN gang, i bobla', async ({ page }) => {
    // Symbol både på nål og i etikett leste som to markeringer (#708).
    await page.goto('/kart')
    await expect(page.locator('.kart-markering-etikett').first()).toBeVisible({ timeout: 15_000 })

    const emoji = symbolEmoji(STANDARD_SYMBOL)
    const boble = page.locator('.kart-markering-etikett', { hasText: TEKST_MIN })
    await expect(boble).toContainText(emoji)

    const antall = await boble.evaluate(
      (el, e) => (el.textContent ?? '').split(e).length - 1,
      emoji,
    )
    expect(antall).toBe(1)

    // Fanger at den frittstående nåla sniker seg tilbake.
    await expect(page.locator('.kart-markering-naal')).toHaveCount(0)
  })

  test('pilspissen peker på selve stedet', async ({ page }) => {
    // Bobla er hele markeringen: peker halen ved siden av, peker markeringen
    // på feil sted (#708).
    await page.goto('/kart')
    await expect(page.locator('.kart-markering-etikett').first()).toBeVisible({ timeout: 15_000 })

    const maal = await page.evaluate(() => {
      const boble = document.querySelector('.kart-markering-etikett') as HTMLElement
      const anker = document.querySelector('.kart-markering-anker') as HTMLElement
      const hale = document.querySelector('.kart-boble-hale') as HTMLElement
      if (!boble || !anker || !hale) return null
      const hs = getComputedStyle(hale)
      const b = hale.getBoundingClientRect()
      const a = anker.getBoundingClientRect()
      return {
        haleSynlig: hs.display,
        // Halen er en rotert firkant; spissen er underkanten av bounding boxen.
        spissY: b.bottom,
        spissX: b.x + b.width / 2,
        punktY: a.y,
        punktX: a.x,
        // Ekte størrelse, i motsetning til en border-trekant (0 innhold).
        haleBredde: b.width,
      }
    })

    expect(maal).not.toBeNull()
    // Halen må faktisk tegnes: en CSS-border-trekant kan ikke ha egen kant og
    // er usynlig mot mørkt kart, derfor rotert firkant med bakgrunn og kant.
    expect(maal!.haleSynlig).not.toBe('none')
    expect(maal!.haleBredde).toBeGreaterThan(8)
    // Slingringsmonn fordi bounding boxen til en rotert hale er litt større enn
    // spissen. En reell feil er titalls piksler.
    expect(Math.abs(maal!.spissY - maal!.punktY)).toBeLessThan(6)
    expect(Math.abs(maal!.spissX - maal!.punktX)).toBeLessThan(4)
  })

  test('panelet tilbyr veibeskrivelse', async ({ page }) => {
    // Kun at knappen finnes og er trykkbar (#708): comgooglemaps:// (#711) gir
    // verken request eller sidebytte i Chromium. URL-byggingen er enhetstestet
    // i __tests__/kart-navigasjon.test.ts.
    await page.goto('/kart')
    await expect(page.locator('.kart-markering-etikett').first()).toBeVisible({ timeout: 15_000 })
    await page.locator('.kart-markering-etikett').first().click()

    const knapp = page.getByTestId('markering-naviger')
    await expect(knapp).toBeVisible()
    await expect(knapp).toBeEnabled()
  })

  test('chatten ligger i et venstrepanel som kan hentes ut og lukkes', async ({ page }) => {
    // Speiler listepanelet til høyre (#709).
    await page.goto('/kart')
    await expect(page.getByTestId('kart-flate')).toBeVisible()

    const handtak = page.getByTestId('chat-handtak')
    const panel = page.getByTestId('chat-panel')
    await expect(handtak).toHaveAttribute('aria-expanded', 'false')

    const flate = (await page.getByTestId('kart-flate').boundingBox())!
    // Lukket: skjøvet ut til VENSTRE for kartflaten (motsatt vei av lista).
    const lukket = (await panel.boundingBox())!
    expect(lukket.x + lukket.width).toBeLessThanOrEqual(flate.x + 1)

    await handtak.click()
    await expect(handtak).toHaveAttribute('aria-expanded', 'true')
    // poll: panelet glir inn over 220 ms.
    await expect
      .poll(async () => (await panel.boundingBox())!.x, { timeout: 5000 })
      .toBeGreaterThan(flate.x - 10)

    // Chatten lastes lazy — fanger at chunken aldri kommer.
    await expect(panel.getByPlaceholder(/Skriv en melding/i)).toBeVisible({ timeout: 15_000 })

    await handtak.click()
    await expect(handtak).toHaveAttribute('aria-expanded', 'false')
  })

  test('chatten starter nederst i traden', async ({ page }) => {
    // Kartsiden låser vindusscroll, så chatten må scrolle panelet, ikke
    // `window` (#711).
    await page.goto('/kart')
    await page.getByTestId('chat-handtak').click()
    const panel = page.getByTestId('chat-panel')
    await expect(panel.getByPlaceholder(/Skriv en melding/i)).toBeVisible({ timeout: 15_000 })

    // poll: chatten scroller i flere runder (panelet glir inn, bilder får høyde).
    await expect
      .poll(
        async () =>
          panel.evaluate(el => {
            const p = el as HTMLElement
            return p.scrollHeight - p.scrollTop - p.clientHeight
          }),
        { timeout: 10_000 },
      )
      // Noen få piksler slingring for avrunding og sticky input-felt.
      .toBeLessThan(40)

    // Skrivefeltet skal stå INNE i panelet (#712). En `fixed` pille spenner
    // over skjermen bak panelet — `toBeVisible` ville ikke fanget det.
    // Se CLAUDE.md § Policy: Skrivefelt og iOS-tastatur.
    const plassering = await panel.evaluate(el => {
      const p = el as HTMLElement
      const felt = p.querySelector('textarea, input[type=text]') as HTMLElement | null
      if (!felt) return null
      const pb = p.getBoundingClientRect()
      const fb = felt.getBoundingClientRect()
      return {
        innenforBunn: fb.bottom <= pb.bottom + 2,
        innenforVenstre: fb.left >= pb.left - 2,
        innenforHoyre: fb.right <= pb.right + 2,
        bredde: fb.width,
      }
    })
    expect(plassering).not.toBeNull()
    expect(plassering!.innenforBunn).toBe(true)
    expect(plassering!.innenforVenstre).toBe(true)
    // Den viktigste: et `fixed` felt stikker langt ut til høyre for panelet.
    expect(plassering!.innenforHoyre).toBe(true)
    expect(plassering!.bredde).toBeGreaterThan(80)
  })

  test('chatten scroller bare opp og ned, ikke sidelengs', async ({ page }) => {
    // `overflow-y: auto` gir også `overflow-x: auto` (CSS-spec), så bredt
    // innhold gjør panelet dragbart sidelengs (#710).
    const admin = adminKlient('kart-markering')
    test.skip(!admin, 'Ingen admin-klient')

    // Et langt ord uten mellomrom sprenger en smal container; seed-dataen er for kort.
    const LANG = `Playwright-${'x'.repeat(90)}-slutt`
    const { error } = await admin!.from('klubb_chat').insert({
      profil_id: megId!,
      innhold: LANG,
      opprettet: new Date().toISOString(),
    })
    if (error) throw new Error(`Kunne ikke seede chatmelding: ${error.message}`)

    try {
      await page.goto('/kart')
      await page.getByTestId('chat-handtak').click()
      const panel = page.getByTestId('chat-panel')
      await expect(panel.getByPlaceholder(/Skriv en melding/i)).toBeVisible({ timeout: 15_000 })

      const maal = await panel.evaluate(el => {
        const p = el as HTMLElement
        // Forsøk faktisk å dra: det er BEVEGELSEN som er problemet, ikke CSS-verdien.
        p.scrollLeft = 500
        return {
          overflowX: getComputedStyle(p).overflowX,
          overflowY: getComputedStyle(p).overflowY,
          flyttetSeg: p.scrollLeft,
          // `hidden` alene ville bare klippet teksten usynlig.
          overflyt: p.scrollWidth - p.clientWidth,
        }
      })

      expect(maal.overflowX).toBe('hidden')
      expect(['auto', 'scroll']).toContain(maal.overflowY)
      expect(maal.flyttetSeg).toBe(0)
      expect(maal.overflyt).toBeLessThanOrEqual(0)

      // Brutt over flere linjer, ikke borte.
      await expect(panel.getByText(/Playwright-x+/)).toBeVisible()
    } finally {
      await admin!.from('klubb_chat').delete().like('innhold', 'Playwright-%').throwOnError()
    }
  })

  test('skrivefeltet ligger i flyt under siste melding, ikke forankret', async ({ page }) => {
    // Se CLAUDE.md § Policy: Skrivefelt og iOS-tastatur (#714).
    const admin = adminKlient('kart-markering')
    test.skip(!admin, 'Ingen admin-klient')

    // ~25 meldinger så panelet overflyter. Strengt stigende tidspunkter: kart-
    // siden sorterer KUN på `opprettet`, så like stempler gir udefinert
    // rekkefølge og -24 er ikke garantert sist. Bakover fra nå, så de er de
    // nyeste i topp-30-vinduet.
    const NAA = Date.now()
    const MELDINGER = Array.from({ length: 25 }, (_, i) => ({
      profil_id: megId!,
      innhold: `Playwright-flyt-${i}`,
      opprettet: new Date(NAA - (25 - i) * 1000).toISOString(),
    }))
    const { error } = await admin!.from('klubb_chat').insert(MELDINGER)
    if (error) throw new Error(`Kunne ikke seede chatmeldinger: ${error.message}`)

    let bestod = false
    try {
      await page.goto('/kart')
      await page.getByTestId('chat-handtak').click()
      const panel = page.getByTestId('chat-panel')
      const felt = panel.getByPlaceholder(/Skriv en melding/i)
      await expect(felt).toBeVisible({ timeout: 15_000 })

      // (a) Ingen fixed/sticky i HELE kjeden opp til panelet — stopper
      // traverseringen på første `static`, slipper en sticky wrapper lenger
      // oppe gjennom. Panelet selv er en forankret flate og er unntatt.
      const forankret = await felt.evaluate(el => {
        let node: HTMLElement | null = el.parentElement
        while (node) {
          if (node.dataset.testid === 'chat-panel') return null
          const pos = getComputedStyle(node).position
          if (pos === 'fixed' || pos === 'sticky') {
            const merke = node.dataset.testid ?? node.className ?? node.tagName
            return `${merke}: ${pos}`
          }
          node = node.parentElement
        }
        // Rota uten panel: feltet står ikke der vi tror — skal ikke telle som bestått.
        return 'fant aldri chat-panel over skrivefeltet'
      })
      expect(forankret).toBeNull()

      // (b) Under siste melding, ikke over/bak den.
      const sisteMelding = panel.getByText('Playwright-flyt-24')
      await expect(sisteMelding).toBeVisible()
      const meldingBox = (await sisteMelding.boundingBox())!
      const feltBoxFoer = (await felt.boundingBox())!
      expect(feltBoxFoer.y).toBeGreaterThanOrEqual(meldingBox.y + meldingBox.height)

      // (c) Positivt bevis på flyt: scrollet til toppen er feltet ute av syne.
      // En forankret pille ville blitt stående synlig.
      await panel.evaluate(el => {
        ;(el as HTMLElement).scrollTop = 0
      })
      const panelBox = (await panel.boundingBox())!
      const feltBoxTopp = (await felt.boundingBox())!
      expect(feltBoxTopp.y).toBeGreaterThan(panelBox.y + panelBox.height)

      // (d) Tilbake ved bunnen: synlig og fokuserbart.
      await panel.evaluate(el => {
        ;(el as HTMLElement).scrollTop = (el as HTMLElement).scrollHeight
      })
      await expect(felt).toBeVisible()
      await felt.click()
      await expect(felt).toBeFocused()
      bestod = true
    } finally {
      // Gjenglemte meldinger dytter testdata ut av topp-30-vinduet. Kaster kun
      // når testen ellers bestod, så den ikke maskerer den ekte feilen.
      const { error: ryddefeil } = await admin!
        .from('klubb_chat')
        .delete()
        .like('innhold', 'Playwright-flyt-%')
      if (ryddefeil) {
        console.error(`[kart-markering] opprydding feilet: ${ryddefeil.message}`)
        if (bestod) throw new Error(`Kunne ikke rydde chatmeldinger: ${ryddefeil.message}`)
      }
    }
  })

  test('bare ett panel er åpent om gangen', async ({ page }) => {
    // To åpne paneler på 390 px ville latt igjen bare en stripe kart.
    await page.goto('/kart')
    await expect(page.getByTestId('kart-flate')).toBeVisible()

    await page.getByTestId('panel-handtak').click()
    await expect(page.getByTestId('panel-handtak')).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId('chat-handtak')).toHaveCount(0)

    await page.getByTestId('panel-handtak').click()
    await page.getByTestId('chat-handtak').click()
    await expect(page.getByTestId('chat-handtak')).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId('panel-handtak')).toHaveCount(0)
  })

  test('knappene står stille når man panorerer kartet', async ({ page }) => {
    // Overlayene fulgte med når siden scrollet bak kartet (#706). Drar faktisk
    // i kartet — det var en riktig-utseende CSS som feilet.
    await page.goto('/kart')
    await expect(page.getByTestId('kart-flate')).toBeVisible()
    await page.locator('.leaflet-tile-pane img').first().waitFor({ state: 'visible', timeout: 15_000 })

    const knapp = page.getByTestId('del-knapp')
    const foer = await knapp.boundingBox()

    // Flere steg, så Leaflet oppfatter det som panorering, ikke klikk.
    const flate = (await page.getByTestId('kart-flate').boundingBox())!
    const midtX = flate.x + flate.width / 2
    const midtY = flate.y + flate.height / 2
    await page.mouse.move(midtX, midtY)
    await page.mouse.down()
    for (const steg of [1, 2, 3, 4]) {
      await page.mouse.move(midtX - steg * 40, midtY - steg * 50)
      await page.waitForTimeout(40)
    }
    await page.mouse.up()
    await page.waitForTimeout(500)

    const etter = await knapp.boundingBox()
    // 2 px toleranse for sub-piksel-avrunding; feilen var 44 px.
    expect(Math.abs(etter!.x - foer!.x)).toBeLessThan(2)
    expect(Math.abs(etter!.y - foer!.y)).toBeLessThan(2)

    // Panelhåndtaket midt på kanten er det andre stedet en forskyvning synes.
    const handtak = await page.getByTestId('panel-handtak').boundingBox()
    expect(handtak!.y).toBeGreaterThan(flate.y)
    expect(handtak!.y + handtak!.height).toBeLessThan(flate.y + flate.height)

    // MEKANISMEN, ikke bare symptomet: draget over passerer uansett i desktop-
    // Chromium (Leaflet fanger musen), og iOS' rubber-band reproduseres ikke.
    // Derfor asserteres scroll-låsen som fjerner muligheten.
    const laas = await page.evaluate(() => {
      // Forsøk faktisk å scrolle: innholdet kan være høyere uten at siden lar
      // seg flytte, og det er flyttingen som er saken.
      window.scrollTo(0, 400)
      return {
        overflow: getComputedStyle(document.body).overflow,
        htmlOverflow: getComputedStyle(document.documentElement).overflow,
        overscroll: getComputedStyle(document.body).overscrollBehavior,
        flyttetSeg: window.scrollY,
        // Overflyt er det rubber-band har å dra i.
        overflyt: document.documentElement.scrollHeight - window.innerHeight,
      }
    })
    expect(laas.overflow).toBe('hidden')
    expect(laas.htmlOverflow).toBe('hidden')
    expect(laas.overscroll).toBe('none')
    // 2 px, ikke 0: `min-h-screen` (100vh) mot kartflatens 100dvh gir én
    // piksel avrunding. Feilen var 44 px (DeployInfo under kartet).
    expect(laas.flyttetSeg).toBeLessThan(2)
    expect(laas.overflyt).toBeLessThan(2)
  })

  test('scroll-låsen slippes når man forlater kartet', async ({ page }) => {
    // Låsen settes på <body>, delt med hele appen — ryddes den ikke, blir
    // resten av appen uscrollbar.
    await page.goto('/kart')
    await expect(page.getByTestId('kart-flate')).toBeVisible()
    // POLL: kart-flate står i SSR-HTML-en, men låsen settes i en useEffect
    // etter hydrering. Et enkeltoppslag kappløper med den (slo til i CI).
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).overflow), {
      timeout: 15_000,
    }).toBe('hidden')

    await page.goto('/tidligere')
    await expect(page.getByRole('heading', { name: 'Hele historikken' })).toBeVisible()
    // Samme kappløp motsatt vei: opprydding skjer i effektens cleanup.
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).overflow), {
      timeout: 15_000,
    }).not.toBe('hidden')
  })

  test('nåla har et treffområde en finger faktisk kan treffe', async ({ page }) => {
    // Et programmatisk klikk i midten treffer alltid, så STØRRELSEN måles
    // (#699). Målet må være elementet Leaflet binder klikket til, ikke et barn
    // inni det som overflower (#702).
    // Egen markering: specen avhenger ellers av rekkefølgen på testene
    // (e2e/README.md § «Spec-er bør ikke stole på dette»).
    const admin = adminKlient('kart-markering')
    test.skip(!admin, 'Ingen admin-klient')
    const EGEN = 'Playwright — treffområde'
    await admin!.from('kart_markering').insert({
      opprettet_av: megId!,
      lat: 59.9139,
      lng: 10.7522,
      tekst: EGEN,
      utloper: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    }).throwOnError()

    await page.goto('/kart')

    const boble = page.locator('.leaflet-tooltip.kart-markering-etikett').first()
    // «attached», ikke «visible»: kartutsnittet (fitBounds, påvirket av andre
    // specs' posisjoner) avgjør om bobla er innenfor den klippede containeren.
    await boble.waitFor({ state: 'attached', timeout: 15_000 })
    const boks = await boble.boundingBox()
    expect(boks).not.toBeNull()
    // Høyden er lavere enn 44 med vilje — en 44 px høy boble dekker for mye
    // kart; bredden bærer målet (unntak i treffmaal-unntak.ts).
    expect(boks!.width).toBeGreaterThanOrEqual(44)
    expect(boks!.height).toBeGreaterThanOrEqual(28)

    // Dybde-kall (#700): den generelle vakten fanger andre brudd i markørlaget.
    await forventTreffbar(page, {
      kontekst: '/kart — markørlaget',
      omraade: '.leaflet-marker-pane, .leaflet-tooltip-pane',
    })

    await admin!.from('kart_markering').delete().eq('tekst', EGEN).throwOnError()
  })
})
