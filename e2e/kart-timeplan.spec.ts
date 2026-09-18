import { expect, test } from '@playwright/test'
import { harTestCreds } from './helpers/auth'
import { adminKlient } from './helpers/admin-klient'
import { iDagOslo, datetimeLocalTilIso } from '../lib/dato'

/**
 * Timeplan på kartet (#716).
 *
 * Dekker logikk, ruter og dataflyt per Policy: Visuell verifikasjon: at en
 * post kan opprettes, vises i riktig rekkefølge, og fjernes. Selve flaten —
 * panelets inn-/utglidning, tastaturoppførsel, safe-area og punktvelgings-
 * flyten der panelet viker for kartet — er KUN verifisert manuelt på fysisk
 * iPhone i installert PWA; automatisk verifikasjon er ikke mulig for de
 * delene (visualViewport/gestikk reproduseres ikke i desktop-Chromium).
 *
 * Specen seeder sitt eget pågående arrangement (samme mønster som
 * kart-spor.spec.ts) fordi finnAktuellArrangement() krever et ekte
 * arrangement å peke til — ingenting av dette kan ligge i seed.sql, siden
 * «pågår nå» er tidsrelativt. Arrangementet eies av PETTER, ikke den
 * innloggede testbrukeren, av samme grunn som kart-spor.spec.ts: ingenting
 * her skal kunne kollidere med testbrukerens egne rader i andre specs.
 */

const PETTER = '00000000-0000-4000-8000-000000000002'
const MERKE = 'Playwright kart-timeplan'

let arrangementId: string | null = null
// Egen, AVSLUTTET blåtur (start i fortid, slutt passert) — den kan aldri bli
// «aktuell» i finnAktuellArrangement() og forstyrrer derfor ikke UI-testene
// over. Brukes kun til å bevise at triggeren i migrasjon 148 stripper nålen.
let blaaturId: string | null = null
// Settes av afterEach når en test i fila feilet. Styrer om en oppryddingsfeil
// får kaste (#716 review): opprydningen skal ikke maskere den ekte
// assertion-feilen i rapporten.
let noenTestFeilet = false

test.describe('timeplan på kartet (#716)', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md')

  test.beforeAll(async () => {
    const admin = adminKlient('kart-timeplan')
    if (!admin) return

    // Startet for ett minutt siden, slutter om tre timer — godt innenfor
    // «pågår nå» i begge ender (samme margin som kart-spor.spec.ts), og
    // start_tidspunkt er nyere enn kart-spor sin egen (-1 time), slik at
    // finnAktuellArrangement() sin «senest start vinner»-regel utvetydig
    // peker hit selv om workers:1 ikke skulle rekke full opprydding mellom
    // filene.
    const { data: arr, error: arrFeil } = await admin
      .from('arrangementer')
      .insert({
        type: 'tur',
        tittel: `${MERKE} — pågår`,
        start_tidspunkt: new Date(Date.now() - 60 * 1000).toISOString(),
        slutt_tidspunkt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        opprettet_av: PETTER,
      })
      .select('id')
      .single()
    if (arrFeil) throw new Error(`Kunne ikke seede arrangement: ${arrFeil.message}`)
    arrangementId = arr.id

    // To baseline-poster for å teste sortering: en tredje legges inn via UI
    // MELLOM disse to, og skal dukke opp i midten.
    const { error: postFeil } = await admin.from('timeplan_post').insert([
      {
        arrangement_id: arrangementId,
        opprettet_av: PETTER,
        // NORSK dato, ikke UTC (#740). Skjemaet daterer nye poster med
        // norskDatoNaa(), så en seed på UTC-dato havner et døgn feil i
        // vinduet 22:00-24:00 UTC — da sorterer lunsjen seg etter middagen
        // og rekkefølge-assertionen under brekker. Samme rot som #735 sin
        // flake i avreise-blokk.spec.ts.
        tidspunkt: datetimeLocalTilIso(`${iDagOslo()}T09:00`),
        tekst: 'Playwright frokost',
      },
      {
        arrangement_id: arrangementId,
        opprettet_av: PETTER,
        tidspunkt: datetimeLocalTilIso(`${iDagOslo()}T20:00`),
        tekst: 'Playwright middag',
        // Punkt, slik at raden får «Vis stedet på kartet»-knappen.
        lat: 59.9139,
        lng: 10.7522,
      },
    ])
    if (postFeil) throw new Error(`Kunne ikke seede timeplan-poster: ${postFeil.message}`)

    const { data: blaatur, error: blaaturFeil } = await admin
      .from('arrangementer')
      .insert({
        type: 'tur',
        tittel: `${MERKE} — blåtur`,
        start_tidspunkt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
        slutt_tidspunkt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        opprettet_av: PETTER,
        sensurerte_felt: { destinasjon: true },
      })
      .select('id')
      .single()
    if (blaaturFeil) throw new Error(`Kunne ikke seede blåtur: ${blaaturFeil.message}`)
    blaaturId = blaatur.id
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) noenTestFeilet = true
  })

  test.afterAll(async () => {
    const admin = adminKlient('kart-timeplan')
    if (!admin || !arrangementId) return
    // Cascade (migrasjon 147) rydder timeplan_post-radene med — sletter vi
    // arrangementet, er begge borte i ett kall.
    //
    // Feilen hentes ut og logges alltid (jf. Policy: Databasespørringer,
    // samme mønster som kart-markering.spec.ts): et gjenglemt arrangement er
    // «pågår nå» i tre timer og kaprer finnAktuellArrangement() for hver
    // senere kjøring på instansen. Kaster likevel bare når testene selv gikk
    // bra — ellers ville opprydningsfeilen skygget for den ekte feilen.
    const { error: ryddefeil } = await admin
      .from('arrangementer')
      .delete()
      .in('id', [arrangementId, blaaturId].filter((id): id is string => id !== null))
    if (ryddefeil) {
      console.error(`[kart-timeplan] opprydding feilet: ${ryddefeil.message}`)
      if (!noenTestFeilet) throw new Error(`Kunne ikke rydde arrangement: ${ryddefeil.message}`)
    }
  })

  test('legger inn en post og ser den i riktig rekkefølge', async ({ page }) => {
    await page.goto('/kart')
    await expect(page.getByTestId('posisjonskart')).toBeVisible()

    const pille = page.getByTestId('timeplan-pille')
    await pille.waitFor({ state: 'visible', timeout: 15_000 })
    await expect(pille).toHaveAttribute('aria-expanded', 'false')
    await pille.click()
    await expect(pille).toHaveAttribute('aria-expanded', 'true')

    const panel = page.getByTestId('timeplan-panel')
    await expect(panel).toContainText(`${MERKE} — pågår`)

    // Baseline-postene fra beforeAll skal stå i rekkefølge.
    await expect(panel.getByTestId('timeplan-rad')).toHaveCount(2, { timeout: 15_000 })

    await panel.getByTestId('timeplan-tekst').fill('12:00 Playwright lunsj')
    await panel.getByTestId('timeplan-legg-inn').click()

    // Tredje rad dukker opp — og skal ligge MELLOM frokost og middag, ikke
    // sist i lista (den er sortert på tidspunkt, ikke på innsettingstidspunkt).
    await expect(panel.getByTestId('timeplan-rad')).toHaveCount(3, { timeout: 15_000 })
    const rader = panel.getByTestId('timeplan-rad')
    await expect(rader.nth(0)).toContainText('Playwright frokost')
    await expect(rader.nth(1)).toContainText('Playwright lunsj')
    await expect(rader.nth(2)).toContainText('Playwright middag')

    // Vent til posten faktisk ER lagret før testen slipper taket: raden er
    // optimistisk, så assertionene over holder også mens actionen fortsatt
    // er underveis. Fjern-knappen rendres først når sender-flagget faller
    // (TimeplanRad), og er derfor kvitteringen på at svaret kom. Uten den
    // kunne afterAll slette arrangementet UNDER en insert som ennå ikke var
    // sendt — som er nøyaktig 23503-en CI fanget.
    await expect(rader.nth(1).getByTestId('timeplan-fjern')).toBeVisible({ timeout: 20_000 })
  })

  test('«Vis stedet på kartet» lukker panelet', async ({ page }) => {
    // Panelet dekker 88 % av flaten, så et punkt sentrert bak det er usynlig —
    // knappen ville flyttet kartet uten at man så noe (#716 review). Selve
    // kamerabevegelsen verifiseres ikke her (Leaflet-animasjon i
    // desktop-Chromium beviser ikke noe om iPhone); det som testes er at
    // panelet faktisk viker.
    await page.goto('/kart')
    await expect(page.getByTestId('posisjonskart')).toBeVisible()

    const pille = page.getByTestId('timeplan-pille')
    await pille.waitFor({ state: 'visible', timeout: 15_000 })
    await pille.click()
    await expect(pille).toHaveAttribute('aria-expanded', 'true')

    const panel = page.getByTestId('timeplan-panel')
    const medPunkt = panel.getByTestId('timeplan-rad').filter({ hasText: 'Playwright middag' })
    await expect(medPunkt).toHaveCount(1, { timeout: 15_000 })
    await medPunkt.getByTestId('timeplan-vis-punkt').click()

    await expect(pille).toHaveAttribute('aria-expanded', 'false')
    await expect(panel).toHaveAttribute('aria-hidden', 'true')
  })

  test('blåtur: databasen stripper punktet og adressen, ikke bare actionen', async () => {
    // Migrasjon 148 (punktet) og 149 (adressen). Skrives med service_role —
    // altså helt utenom UI-et og server-actionen, som er nøyaktig veien
    // review-funnet gjaldt. ALLE stedskolonnene settes her med vilje: en
    // regresjon som slipper gjennom adressen er like avslørende som en som
    // slipper gjennom nåla, og neste stedskolonne skal legges til i denne
    // lista når den kommer.
    const admin = adminKlient('kart-timeplan')
    test.skip(!admin || !blaaturId, 'Ingen admin-klient eller blåtur seedet')

    const { data, error } = await admin!
      .from('timeplan_post')
      .insert({
        arrangement_id: blaaturId!,
        opprettet_av: PETTER,
        tidspunkt: new Date().toISOString(),
        tekst: 'Playwright blåtur-punkt',
        lat: 59.9139,
        lng: 10.7522,
        adresse: 'Karl Johans gate 1, Oslo',
      })
      .select('lat, lng, adresse, tekst')
      .single()

    expect(error).toBeNull()
    // Teksten går fint — det er stedet som skal bort, ellers ville arrangøren
    // vært avskåret fra å lage timeplanen i det hele tatt.
    expect(data!.tekst).toBe('Playwright blåtur-punkt')
    expect(data!.lat).toBeNull()
    expect(data!.lng).toBeNull()
    expect(data!.adresse).toBeNull()
  })

  test('fjerner egen post', async ({ page }) => {
    await page.goto('/kart')
    await expect(page.getByTestId('posisjonskart')).toBeVisible()

    const pille = page.getByTestId('timeplan-pille')
    await pille.waitFor({ state: 'visible', timeout: 15_000 })
    await pille.click()

    const panel = page.getByTestId('timeplan-panel')
    await panel.getByTestId('timeplan-tekst').fill('15:00 Playwright slett meg')
    await panel.getByTestId('timeplan-legg-inn').click()

    const rad = panel.getByTestId('timeplan-rad').filter({ hasText: 'Playwright slett meg' })
    await expect(rad).toHaveCount(1, { timeout: 15_000 })

    // window.confirm() dismisses som default i Playwright — må aksepteres
    // eksplisitt, ellers ser det ut som fjerningen «ikke virker» selv om
    // koden er riktig.
    page.once('dialog', dialog => dialog.accept())
    await rad.getByTestId('timeplan-fjern').click()

    await expect(panel.getByTestId('timeplan-rad').filter({ hasText: 'Playwright slett meg' })).toHaveCount(0, {
      timeout: 15_000,
    })
  })

  test('rad er trykkbar med sted, ikke uten (#732)', async ({ page }) => {
    // «Playwright frokost» (beforeAll) har verken punkt eller adresse — ren
    // tekst, ingen knapp. «Playwright middag» har et punkt fra beforeAll.
    // En tredje post legges inn her MED adresse, uten punkt, for å bevise at
    // adresse alene også gjør raden trykkbar — geokodingen (ekte nettverkskall
    // mot Nominatim) er bevisst IKKE en del av denne assertionen, den er
    // best-effort og skal ikke gjøre testen flaky.
    await page.goto('/kart')
    await expect(page.getByTestId('posisjonskart')).toBeVisible()

    const pille = page.getByTestId('timeplan-pille')
    await pille.waitFor({ state: 'visible', timeout: 15_000 })
    await pille.click()

    const panel = page.getByTestId('timeplan-panel')
    await panel.getByTestId('timeplan-tekst').fill('16:00 Playwright adresse-post')
    await panel.getByTestId('timeplan-adresse').fill('Karl Johans gate 1')
    await panel.getByTestId('timeplan-legg-inn').click()

    const utenSted = panel.getByTestId('timeplan-rad').filter({ hasText: 'Playwright frokost' })
    await expect(utenSted).toHaveCount(1, { timeout: 15_000 })
    await expect(utenSted.getByTestId('timeplan-naviger')).toHaveCount(0)

    const medPunkt = panel.getByTestId('timeplan-rad').filter({ hasText: 'Playwright middag' })
    await expect(medPunkt.getByTestId('timeplan-naviger')).toHaveCount(1)
    await expect(medPunkt.getByTestId('timeplan-vis-punkt')).toHaveCount(1)

    const medAdresse = panel.getByTestId('timeplan-rad').filter({ hasText: 'Playwright adresse-post' })
    await expect(medAdresse).toHaveCount(1, { timeout: 15_000 })
    await expect(medAdresse.getByTestId('timeplan-naviger')).toHaveCount(1)

    // Samme kvittering som i første test, og her er den viktigst: denne posten
    // har en ADRESSE, så actionen geokoder best-effort mot Nominatim med
    // opptil 5 s tak før den i det hele tatt insert-er. Dette er dessuten
    // siste test i fila — uten ventingen river afterAll bort arrangementet
    // midt i det vinduet.
    await expect(medAdresse.getByTestId('timeplan-fjern')).toBeVisible({ timeout: 20_000 })
  })
})
