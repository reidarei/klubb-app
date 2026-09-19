import { expect, test } from '@playwright/test'
import { harTestCreds, loggInn, SEED_PASSORD } from './helpers/auth'
import { adminKlient } from './helpers/admin-klient'
import { KART_MARKERING_MAKS_LENGDE } from '../lib/konstanter'
import { MARKERING_SYMBOLER, symbolEmoji } from '../lib/markering-symboler'

/**
 * Markeringer på kartet (#697) — «møt meg her», satt der du står.
 *
 * Specen seeder markeringene direkte i basen i stedet for å gå gjennom
 * UI-flyten. Grunnen er at flyten kaller getCurrentPosition, og geolocation i
 * headless Chromium enten nektes eller går i timeout — da ville testen målt
 * nettleserens tillatelsesoppsett, ikke om markeringer vises, ryddes og
 * respekterer eierskap.
 *
 * Det UI-flyten faktisk eier — at knappen åpner et tekstfelt, og at et tomt
 * felt avvises — testes uten posisjon, siden valideringen skjer før
 * posisjonsoppslaget.
 */

const PETTER = '00000000-0000-4000-8000-000000000002'
const TEKST_MIN = 'Playwright — min markering'
const TEKST_ANNEN = 'Playwright — Petters markering'

let megId: string | null = null

/**
 * Lista ligger i sidepanelet etter fullskjerm-redesignet (#704), og panelet er
 * minimert som default. Radene står i DOM-en også når det er lukket, så en
 * test som hopper over dette kan «klikke» på noe brukeren ikke kan nå — samme
 * blindsone som #700 og #702. Alle spec-er som rører lista går derfor gjennom
 * denne.
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
      { opprettet_av: profil.id, lat: 59.9139, lng: 10.7522, tekst: TEKST_MIN, symbol: 'ol', utloper: om4t },
      { opprettet_av: PETTER, lat: 59.9165, lng: 10.758, tekst: TEKST_ANNEN, symbol: 'mat', utloper: om4t },
      // Utløpt for et døgn siden, satt av MEG: RLS slipper den gjennom (egen
      // rad), så dette er den ene raden som beviser at siden filtrerer selv i
      // stedet for å stole på at policyen gjør hele jobben.
      {
        opprettet_av: profil.id,
        lat: 59.92, lng: 10.76,
        tekst: 'Playwright — utløpt markering',
        // `symbol` må stå her selv om kolonnen har en default: PostgREST
        // normaliserer en batch-insert til felles kolonner, så en rad som
        // mangler feltet sendes med eksplisitt null når søsknene har det —
        // og da gjelder ikke defaulten.
        symbol: 'ol',
        utloper: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      },
    ])
    if (error) throw new Error(`Kunne ikke seede markeringer: ${error.message}`)
  })

  test.afterAll(async () => {
    const admin = adminKlient('kart-markering')
    if (!admin) return
    await admin.from('kart_markering').delete().like('tekst', 'Playwright —%')
  })

  test('markeringer tegnes på kartet og listes under', async ({ page }) => {
    await page.goto('/kart')
    await expect(page.getByTestId('posisjonskart')).toBeVisible()

    await expect(page.locator('.kart-markering-etikett')).toHaveCount(2, { timeout: 15_000 })
    // Etiketten er en Leaflet-tooltip. Locatoren er bevisst knyttet til
    // tooltip-klassen: står teksten kun i lista under kartet, er markeringen
    // usynlig der den faktisk gjelder.
    await expect(page.locator('.kart-markering-etikett', { hasText: TEKST_MIN })).toHaveCount(1)
    await expect(page.locator('.kart-markering-etikett', { hasText: TEKST_ANNEN })).toHaveCount(1)

    // Den utløpte skal verken stå på kartet eller i lista. Den ligger fortsatt
    // i basen (cron rydder den), så dette tester filtreringen, ikke slettingen.
    await expect(page.getByText('Playwright — utløpt markering')).toHaveCount(0)
  })

  test('admin ser fjern-knappen på alle markeringer', async ({ page }) => {
    // Den innloggede testbrukeren ER admin. Fram til #699 skjulte UI-et
    // fjern-knappen på andres markeringer selv om RLS tillot slettingen —
    // policy og skjerm sa to forskjellige ting, og det som måtte bort måtte
    // bort via databasen.
    await page.goto('/kart')
    await expect(page.getByTestId('posisjonskart')).toBeVisible()
    await aapnePanel(page)

    const min = page.getByTestId('markering-rad').filter({ hasText: TEKST_MIN })
    const annen = page.getByTestId('markering-rad').filter({ hasText: TEKST_ANNEN })

    await expect(min.getByTestId('markering-fjern')).toHaveCount(1)
    await expect(annen.getByTestId('markering-fjern')).toHaveCount(1)
  })

  test.describe('som vanlig medlem', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test('ser fjern-knappen kun på sine egne', async ({ page }) => {
      // Petter er medlem, ikke admin. Uten denne testen ville admin-grenen
      // over vært eneste dekning, og en regresjon der ALLE fikk fjerne alt
      // hadde passert usett.
      await loggInn(page, { epost: 'petter.prove@klubb.test', passord: SEED_PASSORD })
      await page.goto('/kart')
      await expect(page.getByTestId('posisjonskart')).toBeVisible()
      await aapnePanel(page)

      const hans = page.getByTestId('markering-rad').filter({ hasText: TEKST_ANNEN })
      const andres = page.getByTestId('markering-rad').filter({ hasText: TEKST_MIN })

      await expect(hans.getByTestId('markering-fjern')).toHaveCount(1)
      await expect(andres.getByTestId('markering-fjern')).toHaveCount(0)

      // Og panelet på kartet skal følge samme regel — ellers ville en vei
      // rundt knappen i lista stått åpen. Sidepanelet må lukkes først: det
      // dekker 300 px av høyre kant, og bobla kan ligge under det.
      await page.getByTestId('panel-handtak').click()
      await expect(page.getByTestId('panel-handtak')).toHaveAttribute('aria-expanded', 'false')
      await page.locator('.kart-markering-etikett').first().click()
      await expect(page.getByTestId('markering-panel')).toBeVisible()
    })
  })

  test('nåla på kartet åpner et panel med fjern-knapp', async ({ page }) => {
    // Dette er mangelen Reidar meldte: markeringen «måtte kunne slettes».
    // Knappen FANTES, men lå i en liste man må scrolle forbi hele kartet og
    // mannelista for å nå — og nåla, som er der man naturlig trykker, var
    // ikke klikkbar i det hele tatt.
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
    await page.goto('/kart')
    await expect(page.locator('.kart-markering-etikett')).toHaveCount(2, { timeout: 15_000 })

    await page.locator('.kart-markering-etikett').first().click()
    await page.getByTestId('markering-panel').getByTestId('markering-panel-fjern').click()

    // Panelet lukker seg selv — ellers ville det blitt stående og pekt på noe
    // som ikke finnes.
    await expect(page.getByTestId('markering-panel')).toHaveCount(0)
    await expect(page.locator('.kart-markering-etikett')).toHaveCount(1)

    // Legg begge tilbake, så testrekkefølgen ikke påvirker naboene.
    const admin = adminKlient('kart-markering')
    if (admin && megId) {
      await admin.from('kart_markering').delete().like('tekst', 'Playwright —%')
      const om4t = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()
      await admin.from('kart_markering').insert([
        { opprettet_av: megId, lat: 59.9139, lng: 10.7522, tekst: TEKST_MIN, utloper: om4t },
        { opprettet_av: PETTER, lat: 59.9165, lng: 10.758, tekst: TEKST_ANNEN, utloper: om4t },
      ])
    }
  })

  test('fjerning tar bort markeringen', async ({ page }) => {
    await page.goto('/kart')
    await aapnePanel(page)
    const min = page.getByTestId('markering-rad').filter({ hasText: TEKST_MIN })
    await expect(min).toHaveCount(1)

    await min.getByTestId('markering-fjern').click()

    await expect(page.getByTestId('markering-rad').filter({ hasText: TEKST_MIN })).toHaveCount(0)
    // Og nåla skal være borte fra kartet, ikke bare raden i lista — de to
    // tegnes fra samme data, og at de kan komme i utakt var nettopp bugen i #694.
    await expect(page.locator('.kart-markering-etikett')).toHaveCount(1)

    // Legg den tilbake, så de andre testene i fila ikke avhenger av rekkefølge.
    const admin = adminKlient('kart-markering')
    if (admin && megId) {
      await admin.from('kart_markering').insert({
        opprettet_av: megId, lat: 59.9139, lng: 10.7522, tekst: TEKST_MIN,
        utloper: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      })
    }
  })

  test('flyten er peke først, skrive etterpå', async ({ page }) => {
    // Rekkefølgen ER funksjonen (#702). Ett steg åpnet tekstfeltet med én
    // gang; tastaturet sprang opp og dekket kartet, og man skrev inn teksten
    // uten å ha sett hvor krysset havnet.
    await page.goto('/kart')
    await expect(page.getByTestId('posisjonskart')).toBeVisible()

    // Steg 0: verken kryss eller tekstfelt.
    await expect(page.getByTestId('markering-sikte')).toHaveCount(0)
    await expect(page.getByTestId('markering-tekst')).toHaveCount(0)

    // Steg 1: kryss, men FORTSATT ikke tekstfelt — det er hele poenget.
    await page.getByTestId('markering-start').click()
    await expect(page.getByTestId('markering-sikte')).toBeVisible()
    await expect(page.getByTestId('markering-tekst')).toHaveCount(0)

    // Steg 2: stedet bekreftet, nå kommer teksten — og krysset trekkes,
    // siden stedet er låst og kartet ikke lenger styrer noe.
    await page.getByTestId('markering-bekreft-sted').click()
    const felt = page.getByTestId('markering-tekst')
    await expect(felt).toBeVisible()
    await expect(felt).toHaveAttribute('maxlength', String(KART_MARKERING_MAKS_LENGDE))
    await expect(page.getByTestId('markering-sikte')).toHaveCount(0)

    // Tom tekst avvises, og man blir stående i tekststeget.
    await page.getByTestId('markering-lagre').click()
    await expect(page.getByTestId('kart-feil')).toContainText('Skriv hva markeringen gjelder')
    await expect(felt).toBeVisible()

    // «Tilbake» går til stedsvalget, ikke helt ut: har man valgt feil sted er
    // det stedet man vil endre, ikke starte på nytt.
    await page.getByTestId('markering-tilbake').click()
    await expect(page.getByTestId('markering-sikte')).toBeVisible()
    await expect(page.getByTestId('markering-tekst')).toHaveCount(0)

    await page.getByTestId('markering-avbryt').click()
    await expect(page.getByTestId('markering-sikte')).toHaveCount(0)
  })

  test('markeringen settes der siktet står, ikke der GPS-en sier du er', async ({ page }) => {
    // Geolocation nektes eksplisitt. Går markeringen likevel gjennom, er det
    // beviset på at den leser kartsenteret — den gamle implementasjonen
    // kalte getCurrentPosition og ville stoppet her.
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
    await page.getByTestId('markering-lagre').click()

    await aapnePanel(page)
    await expect(
      page.getByTestId('markering-rad').filter({ hasText: 'Playwright — fra siktet' }),
    ).toHaveCount(1, { timeout: 15_000 })
    // Skjemaet lukker seg, og siktet med det.
    await expect(page.getByTestId('markering-sikte')).toHaveCount(0)

    const admin = adminKlient('kart-markering')
    if (admin) await admin.from('kart_markering').delete().eq('tekst', 'Playwright — fra siktet')
  })

  test('lista ligger i et panel som må åpnes', async ({ page }) => {
    // Etter #704 er kartet fullskjerm og lista flyttet inn i et sidepanel.
    // Testen står her fordi radene finnes i DOM-en også når panelet er lukket:
    // uten en eksplisitt sjekk på at panelet faktisk er utenfor skjermen, kan
    // en spec «bruke» en liste ingen kan se.
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

    // Åpent: panelet er innenfor kartflaten. `poll` og ikke et øyeblikksbilde —
    // panelet glir inn over 220 ms, og en måling rett etter klikket leser
    // sluttposisjonen fra FØR animasjonen.
    await expect
      .poll(async () => (await panel.boundingBox())!.x, { timeout: 5000 })
      .toBeLessThan(flate!.x + flate!.width - 50)

    await handtak.click()
    await expect(handtak).toHaveAttribute('aria-expanded', 'false')
  })

  test('symbolet velges i flyten og vises på kartet', async ({ page }) => {
    // Symbolet er det man leser på AVSTAND; teksten er detaljen man får ved å
    // trykke (#707). Testen følger hele veien: valg i skjemaet → nål på kartet
    // → rad i lista.
    await page.goto('/kart')
    await expect(page.getByTestId('kart-flate')).toBeVisible()

    await page.getByTestId('markering-start').click()
    // Vent til kartet er initialisert: «Her er det» leser kartsenteret, og er
    // låst til Leaflet er klar. I CI rekker ikke kartet å laste før klikket.
    const bekreft = page.getByTestId('markering-bekreft-sted')
    await expect(bekreft).toBeEnabled({ timeout: 15_000 })
    await bekreft.click()

    // Øl er standard — uten det ville et glemt valg gitt en markering uten ikon.
    await expect(page.getByTestId('symbol-ol')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('symbol-mat')).toHaveAttribute('aria-pressed', 'false')

    await page.getByTestId('symbol-milf').click()
    await expect(page.getByTestId('symbol-milf')).toHaveAttribute('aria-pressed', 'true')
    // Valget er eksklusivt: uten dette kunne to symboler stått markert samtidig.
    await expect(page.getByTestId('symbol-ol')).toHaveAttribute('aria-pressed', 'false')

    await page.getByTestId('markering-tekst').fill('Playwright — med symbol')
    await page.getByTestId('markering-lagre').click()

    const milf = symbolEmoji('milf')
    await expect(page.locator('.kart-markering-etikett', { hasText: 'Playwright — med symbol' }))
      .toContainText(milf, { timeout: 15_000 })

    await aapnePanel(page)
    await expect(
      page.getByTestId('markering-rad').filter({ hasText: 'Playwright — med symbol' }),
    ).toContainText(milf)

    const admin = adminKlient('kart-markering')
    if (admin) await admin.from('kart_markering').delete().eq('tekst', 'Playwright — med symbol')
  })

  test('alle symbolene finnes og har hvert sitt ikon', async ({ page }) => {
    // Listen i lib/markering-symboler.ts speiles av en check-constraint i
    // migrasjon 146 (utvidet i 151). Denne testen fanger at UI-et og listen
    // kommer i utakt — legges et symbol til i koden uten at knappen finnes,
    // eller omvendt.
    await page.goto('/kart')
    await page.getByTestId('markering-start').click()
    // Vent til kartet er initialisert: «Her er det» leser kartsenteret, og er
    // låst til Leaflet er klar. I CI rekker ikke kartet å laste før klikket.
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
    // Distinkte ikoner for hvert symbol: to like ville gjort symbolet
    // verdiløst på kartet — forveksling er nøyaktig det 😍/💋 må unngå.
    expect(emojier.size).toBe(MARKERING_SYMBOLER.length)
  })

  test('databasen godtar hvert symbol i registeret', async () => {
    // Dette er testen som faktisk fanger en glemt migrasjon (#759): UI-testen
    // over beviser bare at UI-et og MARKERING_SYMBOLER stemmer overens med
    // hverandre — den sier ingenting om check-constrainten i databasen, som er
    // en TREDJE, uavhengig kilde til sannhet. Legges et symbol til i
    // registeret uten at migrasjonen følger, ville UI-testen fortsatt vært
    // grønn mens en ekte insert feiler i produksjon.
    //
    // Ingen `page` — testen inserter direkte mot databasen via adminKlient,
    // så den koster ingen nettleser-/browser-tid, kun en spørring.
    const admin = adminKlient('kart-markering')
    test.skip(!admin, 'Ingen admin-klient')

    const tidsstempel = Date.now()
    const rader = MARKERING_SYMBOLER.map((sym, i) => ({
      opprettet_av: megId!,
      lat: 59.9139,
      lng: 10.7522,
      tekst: `Playwright — symbolgodkjenning ${tidsstempel}-${i}`,
      symbol: sym.id,
      utloper: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    }))

    const { error } = await admin!.from('kart_markering').insert(rader)
    // Den ekte assertion-en: en glemt migrasjon gir 23514 (check-constraint
    // violation) her, ikke et UI-symptom lenger nede i kjeden.
    expect(error).toBeNull()

    // Oppryddingen står ETTER assertion-en over med vilje: en feilet insert
    // er atomisk (ingen rader å rydde), så rekkefølgen gjør at en feil her
    // aldri kan maskere den ekte testfeilen. Men den skal være SYNLIG — en
    // svelget feil etterlater rader neste kjøring arver uten å vite om, og
    // da er testen grønn på falskt grunnlag (CLAUDE.md § Policy:
    // Databasespørringer — `error` skal alltid hentes ut OG leses).
    const { error: oppryddingFeil } = await admin!
      .from('kart_markering')
      .delete()
      .like('tekst', `Playwright — symbolgodkjenning ${tidsstempel}-%`)
    expect(oppryddingFeil, 'oppryddingen etterlot testrader i basen').toBeNull()
  })

  test('symbolet står ÉN gang, i bobla', async ({ page }) => {
    // Reidar: «Jeg trenger ikke både ølflaske som nål og ølflasker på
    // etiketten — må nesten bare velge.» Symbolet sto både på en egen nål og
    // først i etiketten, og det leste som to markeringer (#708).
    await page.goto('/kart')
    await expect(page.locator('.kart-markering-etikett').first()).toBeVisible({ timeout: 15_000 })

    const ol = symbolEmoji('ol')
    const boble = page.locator('.kart-markering-etikett', { hasText: TEKST_MIN })
    await expect(boble).toContainText(ol)

    // Nøyaktig én forekomst av symbolet i markeringen — ikke to.
    const antall = await boble.evaluate(
      (el, emoji) => (el.textContent ?? '').split(emoji).length - 1,
      ol,
    )
    expect(antall).toBe(1)

    // Og ingen frittstående nål ved siden av bobla. Klassen er borte fra
    // koden; testen fanger at den ikke sniker seg tilbake.
    await expect(page.locator('.kart-markering-naal')).toHaveCount(0)
  })

  test('pilspissen peker på selve stedet', async ({ page }) => {
    // Reidar: «Boblene skal være snakkeboks med pilen endene i akkurat det
    // stedet som er markert.» Bobla er hele markeringen, så hvis halen peker
    // litt ved siden av, peker markeringen på feil sted (#708).
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
        // Halen er en rotert firkant; spissen er nederste hjørne, altså
        // underkanten av dens bounding box etter rotasjonen.
        spissY: b.bottom,
        spissX: b.x + b.width / 2,
        punktY: a.y,
        punktX: a.x,
        // En trekant laget av border har 0 innhold. Denne har ekte størrelse,
        // og det er nettopp forskjellen som gjorde at den ble synlig.
        haleBredde: b.width,
      }
    })

    expect(maal).not.toBeNull()
    // Halen må faktisk tegnes. Den var først Leaflets ::before (kom aldri
    // fram), så en border-trekant (usynlig mot mørkt kart — en CSS-trekant ER
    // en border og kan ikke ha kant selv). Nå en rotert firkant med bakgrunn
    // OG kant, som er hvorfor den vises.
    expect(maal!.haleSynlig).not.toBe('none')
    expect(maal!.haleBredde).toBeGreaterThan(8)
    // 4 px slingringsmonn: halen er rotert, så bounding box er litt større enn
    // spissen. Feilen ville vært titalls piksler, eller ingen hale i det hele tatt.
    expect(Math.abs(maal!.spissY - maal!.punktY)).toBeLessThan(6)
    expect(Math.abs(maal!.spissX - maal!.punktX)).toBeLessThan(4)
  })

  test('panelet tilbyr veibeskrivelse', async ({ page }) => {
    // Michael spurte om dette da kartet var nytt: «er det en gå til funksjon
    // der eller naviger til? Ellers må man jo inn i Google Maps å finne det
    // uansett.» (#708)
    //
    // Testen står på at knappen FINNES og er trykkbar. Selve navigeringen
    // setter window.location til comgooglemaps:// (#711), og et custom
    // URL-skjema gir verken en request å avskjære eller en sidebytte i
    // Chromium — det ville bare målt Playwright. URL-byggingen, som er det
    // som faktisk kan bli feil, er enhetstestet i
    // __tests__/kart-navigasjon.test.ts.
    await page.goto('/kart')
    await expect(page.locator('.kart-markering-etikett').first()).toBeVisible({ timeout: 15_000 })
    await page.locator('.kart-markering-etikett').first().click()

    const knapp = page.getByTestId('markering-naviger')
    await expect(knapp).toBeVisible()
    await expect(knapp).toBeEnabled()
  })

  test('chatten ligger i et venstrepanel som kan hentes ut og lukkes', async ({ page }) => {
    // Speiler listepanelet til høyre (#709). Gutta er ofte på kartet fordi de
    // skal finne hverandre — da er det å bytte fane for å skrive «vi er her»
    // én omvei for mye.
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
    // poll: panelet glir inn over 220 ms, og en måling rett etter klikket
    // leser posisjonen fra før animasjonen.
    await expect
      .poll(async () => (await panel.boundingBox())!.x, { timeout: 5000 })
      .toBeGreaterThan(flate.x - 10)

    // Chat-komponenten lastes lazy — den skal faktisk komme, ikke bare et
    // tomt panel. Uten denne ville testen bestått om chunken aldri lastet.
    await expect(panel.getByPlaceholder(/Skriv en melding/i)).toBeVisible({ timeout: 15_000 })

    await handtak.click()
    await expect(handtak).toHaveAttribute('aria-expanded', 'false')
  })

  test('chatten starter nederst i traden', async ({ page }) => {
    // Reidar: «Chatten må bare scrolle ned til bunnen, per nå så starter den
    // litt lenger opp.» Chat-komponenten scroller `window`, men kartsiden
    // låser vindusscroll — så den gjorde ingenting, og tråden ble stående et
    // tilfeldig sted (#711). Panelet sendes nå inn som scroll-container.
    await page.goto('/kart')
    await page.getByTestId('chat-handtak').click()
    const panel = page.getByTestId('chat-panel')
    await expect(panel.getByPlaceholder(/Skriv en melding/i)).toBeVisible({ timeout: 15_000 })

    // poll: chatten scroller i flere runder (panelet glir inn, bilder får
    // høyde etterpå), så en måling rett etter åpning er for tidlig.
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

    // Og skrivefeltet skal stå INNE i panelet, ikke bak det (#712).
    //
    // Chat-komponenten gjør input-pillen `position: fixed` når den er sidens
    // hovedinnhold. I sidepanelet festet den seg da til viewporten, spente
    // over hele skjermen og havnet bak panelet (z-index 20 mot panelets 760) —
    // feltet var borte. En ren `toBeVisible` ville ikke fanget det: elementet
    // VAR synlig, bare ikke der brukeren så etter det.
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
    // Den viktigste: `fixed` ga et felt som spente over HELE skjermen og altså
    // stakk langt ut til høyre for panelet.
    expect(plassering!.innenforHoyre).toBe(true)
    expect(plassering!.bredde).toBeGreaterThan(80)
  })

  test('chatten scroller bare opp og ned, ikke sidelengs', async ({ page }) => {
    // Reidar: «Chatten må bare kunne scrolle opp og ned, ikke høyre og
    // venstre.» Panelet arvet `overflow-x: auto` fra `overflow-y: auto`
    // (CSS-spec), så bredt innhold gjorde det dragbart sidelengs (#710).
    const admin = adminKlient('kart-markering')
    test.skip(!admin, 'Ingen admin-klient')

    // Et langt ord UTEN mellomrom er det klassiske tilfellet som sprenger en
    // smal container. Testdataen i seed er kort og ville ikke avslørt noe.
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
        // Forsøk faktisk å dra sidelengs, i stedet for bare å lese en
        // CSS-verdi: det er BEVEGELSEN som var problemet.
        p.scrollLeft = 500
        return {
          overflowX: getComputedStyle(p).overflowX,
          overflowY: getComputedStyle(p).overflowY,
          flyttetSeg: p.scrollLeft,
          // Og at innholdet faktisk får plass — `hidden` alene ville bare
          // klippet den lange teksten usynlig.
          overflyt: p.scrollWidth - p.clientWidth,
        }
      })

      expect(maal.overflowX).toBe('hidden')
      // Vertikal scroll skal fortsatt virke — chatten er en lang tråd.
      expect(['auto', 'scroll']).toContain(maal.overflowY)
      expect(maal.flyttetSeg).toBe(0)
      expect(maal.overflyt).toBeLessThanOrEqual(0)

      // Den lange teksten skal være der, brutt over flere linjer — ikke borte.
      await expect(panel.getByText(/Playwright-x+/)).toBeVisible()
    } finally {
      await admin!.from('klubb_chat').delete().like('innhold', 'Playwright-%')
    }
  })

  test('skrivefeltet ligger i flyt under siste melding, ikke forankret', async ({ page }) => {
    // Fjerde runde i samme bug-klasse (#222, #236, #712, #713): skrivepillen
    // skal IKKE forankres til viewporten (fixed/sticky) — den skal ligge i
    // normal flyt som siste element under meldingene, akkurat som meldingene
    // selv. Se CLAUDE.md § Policy: Skrivefelt og iOS-tastatur (#714).
    const admin = adminKlient('kart-markering')
    test.skip(!admin, 'Ingen admin-klient')

    // ~25 meldinger så panelet garantert overflyter og faktisk kan scrolles.
    // Strengt stigende tidspunkter, ikke ett felles now(): produksjons-
    // spørringen (app/(app)/kart/page.tsx) sorterer KUN på `opprettet`, så
    // 25 identiske tidsstempler gir udefinert rekkefølge og ingen garanti
    // for at -24 faktisk er siste melding. Da ville (b)/(c) under testet noe
    // annet enn de påstår. Sekundene legges BAKOVER fra nå, så meldingene
    // fortsatt er de nyeste i topp-30-vinduet.
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

      // (a) Verken fixed eller sticky snek seg inn igjen — HELE kjeden fra
      // feltet opp til chat-panelet skal være fri for viewport-forankring.
      // Traverseringen må gå hele veien: stopper den på første `static`
      // (normalt inputens umiddelbare forelder), blir en sticky wrapper
      // lenger oppe aldri undersøkt, og testen ville passert også på den
      // gamle sticky-varianten — altså ikke bevist det den påstår.
      // Panelet SELV er unntatt: det er en forankret flate, og det er greit.
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
        // Nådde vi rota uten å se panelet, står feltet ikke der vi tror —
        // en tom kjede skal ikke telle som bestått.
        return 'fant aldri chat-panel over skrivefeltet'
      })
      expect(forankret).toBeNull()

      // (b) Feltet ligger under siste melding, ikke over/bak den.
      const sisteMelding = panel.getByText('Playwright-flyt-24')
      await expect(sisteMelding).toBeVisible()
      const meldingBox = (await sisteMelding.boundingBox())!
      const feltBoxFoer = (await felt.boundingBox())!
      expect(feltBoxFoer.y).toBeGreaterThanOrEqual(meldingBox.y + meldingBox.height)

      // (c) Det positive beviset på flyt: scroller vi panelet til toppen, går
      // feltet helt ut av det synlige området. En forankret (sticky/fixed)
      // pill ville blitt stående synlig — nøyaktig det denne assertion-en
      // ville feilet på med dagens sticky-oppførsel.
      await panel.evaluate(el => {
        ;(el as HTMLElement).scrollTop = 0
      })
      const panelBox = (await panel.boundingBox())!
      const feltBoxTopp = (await felt.boundingBox())!
      expect(feltBoxTopp.y).toBeGreaterThan(panelBox.y + panelBox.height)

      // (d) Scroller vi tilbake til bunnen, er feltet der og fokuserbart.
      await panel.evaluate(el => {
        ;(el as HTMLElement).scrollTop = (el as HTMLElement).scrollHeight
      })
      await expect(felt).toBeVisible()
      await felt.click()
      await expect(felt).toBeFocused()
      bestod = true
    } finally {
      // Opprydding skal ikke feile stille (jf. Policy: Databasespørringer):
      // 25 gjenglemte meldinger dytter ekte testdata ut av topp-30-vinduet
      // og forurenser senere kjøringer. Kaster likevel bare når selve testen
      // gikk bra — ellers ville opprydningsfeilen maskert den ekte
      // assertion-feilen i rapporten, som er verre enn den er verdt.
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
    // To åpne paneler på en 390 px skjerm ville latt igjen en stripe kart i
    // midten — da er man like langt som før kartet ble fullskjerm.
    await page.goto('/kart')
    await expect(page.getByTestId('kart-flate')).toBeVisible()

    await page.getByTestId('panel-handtak').click()
    await expect(page.getByTestId('panel-handtak')).toHaveAttribute('aria-expanded', 'true')
    // Chat-håndtaket skjules mens lista er ute, så de ikke står side om side.
    await expect(page.getByTestId('chat-handtak')).toHaveCount(0)

    await page.getByTestId('panel-handtak').click()
    await page.getByTestId('chat-handtak').click()
    await expect(page.getByTestId('chat-handtak')).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId('panel-handtak')).toHaveCount(0)
  })

  test('knappene står stille når man panorerer kartet', async ({ page }) => {
    // Reidar: «knappene øverst på kartet forsvinner etterhvert som man
    // navigerer rundt på kartet». Overlayene lå absolutt-posisjonert i en
    // kartflate som IKKE var fixed, så de fulgte med når siden kunne scrolle
    // bak kartet (#706).
    //
    // Testen drar faktisk i kartet i stedet for å stole på at CSS-en ser
    // riktig ut — det var nettopp en riktig-utseende CSS som feilet.
    await page.goto('/kart')
    await expect(page.getByTestId('kart-flate')).toBeVisible()
    await page.locator('.leaflet-tile-pane img').first().waitFor({ state: 'visible', timeout: 15_000 })

    const knapp = page.getByTestId('del-knapp')
    const foer = await knapp.boundingBox()

    // Dra kartet et godt stykke, i flere steg så Leaflet oppfatter det som en
    // ekte panorering og ikke et klikk.
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
    // 2 px toleranse, ikke eksakt: sub-piksel-avrunding gir småbevegelser som
    // ikke er forskyvning. Det som var feil var 44 px — en terskel her måler
    // fortsatt riktig ting uten å vippe på desimaler.
    expect(Math.abs(etter!.x - foer!.x)).toBeLessThan(2)
    expect(Math.abs(etter!.y - foer!.y)).toBeLessThan(2)

    // Og panelhåndtaket, som står på kanten midt på — det er det andre stedet
    // en forskyvning ville vært synlig med en gang.
    const handtak = await page.getByTestId('panel-handtak').boundingBox()
    expect(handtak!.y).toBeGreaterThan(flate.y)
    expect(handtak!.y + handtak!.height).toBeLessThan(flate.y + flate.height)

    // MEKANISMEN, ikke bare symptomet. Draget over ville passert uansett i
    // desktop-Chromium: der fanger Leaflet musen, og siden ville ikke bevegd
    // seg selv om den KUNNE. Det Reidar så var iOS' rubber-band, som
    // Playwright ikke reproduserer (jf. Policy: Visuell verifikasjon).
    //
    // Derfor asserteres låsen som faktisk fjerner muligheten. Ryker den, er
    // vi tilbake der overlayene kan skli ut av skjermen på telefon — uten at
    // noe annet i suiten merker det.
    const laas = await page.evaluate(() => {
      // Forsøk faktisk å scrolle, i stedet for å sammenligne scrollHeight mot
      // innerHeight: innholdet KAN være høyere uten at siden lar seg flytte,
      // og det er «lar seg flytte» som er hele saken.
      window.scrollTo(0, 400)
      return {
        overflow: getComputedStyle(document.body).overflow,
        htmlOverflow: getComputedStyle(document.documentElement).overflow,
        overscroll: getComputedStyle(document.body).overscrollBehavior,
        flyttetSeg: window.scrollY,
        // Overflyt er det rubber-band har å dra i. Null overflyt = ingenting
        // å skli på, uansett hva nettleseren tillater av programmatisk scroll.
        overflyt: document.documentElement.scrollHeight - window.innerHeight,
      }
    })
    expect(laas.overflow).toBe('hidden')
    expect(laas.htmlOverflow).toBe('hidden')
    expect(laas.overscroll).toBe('none')
    // Terskel på 2 px, ikke 0: layoutens `min-h-screen` er 100vh mens
    // kartflaten er 100dvh, og avrundingen mellom dem gir én piksel. Feilen
    // var 44 px (DeployInfo under kartet) — terskelen skiller de to.
    expect(laas.flyttetSeg).toBeLessThan(2)
    expect(laas.overflyt).toBeLessThan(2)
  })

  test('scroll-låsen slippes når man forlater kartet', async ({ page }) => {
    // Låsen settes på <body>, som er delt med hele appen. Ryddes den ikke,
    // blir resten av appen uscrollbar etter et besøk på kartet — en langt
    // verre feil enn den vi fikset.
    await page.goto('/kart')
    await expect(page.getByTestId('kart-flate')).toBeVisible()
    // POLL, ikke et enkeltoppslag: kart-flate står i SSR-HTML-en, mens låsen
    // settes i en useEffect i PosisjonsKart — altså først etter hydrering.
    // Mellom de to øyeblikkene er body fortsatt på globals.css sin egen
    // «overflow-x: clip» (computed: «clip visible»), og et oppslag rett etter
    // toBeVisible() kappløper med hydreringen. Det er nettopp det kappløpet
    // som slo til i CI (tyngre bundle enn lokalt), ikke en ødelagt lås.
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).overflow), {
      timeout: 15_000,
    }).toBe('hidden')

    await page.goto('/tidligere')
    await expect(page.getByRole('heading', { name: 'Hele historikken' })).toBeVisible()
    // Samme kappløp motsatt vei: opprydningen skjer i effektens cleanup.
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).overflow), {
      timeout: 15_000,
    }).not.toBe('hidden')
  })

  test('nåla har et treffområde en finger faktisk kan treffe', async ({ page }) => {
    // Playwright klikker programmatisk i midten av et element og treffer
    // alltid — en klikk-test kan derfor ikke skille en 12 px nål fra en 44 px.
    // Nøyaktig den blindsonen gjorde at #699 ble meldt grønn mens Reidar
    // fortsatt ikke fikk truffet nåla på telefonen. Derfor måles STØRRELSEN.
    //
    // Og den må måles på SELVE MARKØRELEMENTET (.leaflet-marker-icon), ikke på
    // et barn inni det. Forrige runde målte et 44 px treffområde som lå inne i
    // et 12 px markørelement og overflowet det: testen var grønn, elementet
    // Leaflet binder klikk til var fortsatt 12 px, og fingeren traff ikke
    // (#702). Klassen ligger derfor nå på ikonet selv.
    // Seeder sin EGEN markering i stedet for å stole på at en tidligere test i
    // fila la sin tilbake. Testene her fjerner og gjenoppretter markeringer, og
    // en spec som avhenger av rekkefølgen feiler på noe som ser ut som en
    // komponentfeil (jf. e2e/README.md § «Spec-er bør ikke stole på dette»).
    const admin = adminKlient('kart-markering')
    test.skip(!admin, 'Ingen admin-klient')
    const EGEN = 'Playwright — treffområde'
    await admin!.from('kart_markering').insert({
      opprettet_av: megId!,
      lat: 59.9139,
      lng: 10.7522,
      tekst: EGEN,
      utloper: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    })

    await page.goto('/kart')

    const boble = page.locator('.leaflet-tooltip.kart-markering-etikett').first()
    // «attached», ikke «visible»: testen handler om STØRRELSEN på treffmålet,
    // og kartutsnittet avgjør om bobla tilfeldigvis ligger innenfor den
    // klippede kartcontaineren akkurat nå. Med `visible` vippet testen når
    // andre spec-er hadde lagt igjen posisjoner som dro fitBounds utover.
    await boble.waitFor({ state: 'attached', timeout: 15_000 })
    const boks = await boble.boundingBox()
    expect(boks).not.toBeNull()
    // Bobla er bred (symbol + tekst) og ~30 px høy pluss halen. 44 px i bredde
    // er Apples minste anbefalte tap-mål; høyden er lavere med vilje, fordi en
    // snakkeboble som er 44 px høy dekker for mye kart. Bredden bærer målet.
    expect(boks!.width).toBeGreaterThanOrEqual(44)
    expect(boks!.height).toBeGreaterThanOrEqual(28)

    await admin!.from('kart_markering').delete().eq('tekst', EGEN)
  })
})
