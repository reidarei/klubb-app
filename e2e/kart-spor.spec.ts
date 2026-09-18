import { expect, test } from '@playwright/test'
import { harTestCreds } from './helpers/auth'
import { adminKlient } from './helpers/admin-klient'
import { POSISJON_PLING_KVITTERING_SEK, POSISJON_SPOR_TIMER } from '../lib/konstanter'

/**
 * Posisjonssporet (#695, utvidet i #698).
 *
 * Sporet tegnes ALLTID når en mann har flere punkter — det som varierer er hva
 * som RAMMER DET INN:
 *
 *   pågår et arrangement  → punktene fra det arrangementet, uansett alder
 *   ellers                → punktene fra siste POSISJON_SPOR_TIMER
 *
 * Fram til #698 ble sporet klippet til ett punkt utenom arrangementer. Reidar
 * flyttet seg hjemmefra til jobb og så at bildet hans flyttet seg uten å legge
 * igjen noe. Punktene lå i basen hele tiden; det var visningen som skjulte dem.
 *
 * Begge innrammingene testes her, og dessuten at alders-grensen FAKTISK
 * avgrenser: uten den siste ville et spor vokst ubegrenset så lenge delingen
 * ble fornyet, og ingen test hadde merket det.
 *
 * Specen seeder sitt eget arrangement og sine egne punkter, og rydder etter
 * seg. Ingenting av dette kan ligge i seed.sql: både «pågår nå» og
 * delingsvinduet er tidsrelative, og faste rader ville falt ut av vinduet
 * timer etter forrige `db reset` — samme forfallsmodus som #616 og #669.
 *
 * Sporet seedes på PETTER, ikke på den innloggede testbrukeren. Grunnen er
 * parallellkjøring: `kart-markorer.spec.ts` seeder og sletter testbrukerens
 * egen deling, og `sider-laster.spec.ts` besøker /kart — deler alle tre samme
 * profil, river de dataene under hverandre, og utfallet avhenger av hvilken
 * worker som kom først. Det reproduserer ikke lokalt, der spec-er gjerne
 * kjøres enkeltvis, og viser seg som et rødt kryss på en helt annen test i CI.
 */

const MERKE = 'Playwright kart-spor'

// Tre punkter i Oslo sentrum, godt over POSISJON_MIN_FLYTT_M fra hverandre, så
// de teller som faktiske flyttinger og ikke slås sammen.
const RUTE = [
  { lat: 59.9111, lng: 10.7461 },
  { lat: 59.9139, lng: 10.7522 },
  { lat: 59.9165, lng: 10.7580 },
]

// Petter Prøve fra seed.sql — en annen mann enn den innloggede testbrukeren,
// se kommentaren over.
const PETTER = '00000000-0000-4000-8000-000000000002'

// 1x1 transparent PNG som data-URL. Bevisst ikke en http-URL: en fiktiv adresse
// ville gitt 404/500 og en `klient.bilde.feilet`-rad i feil_logg, som
// sider-laster-vakten plukker opp som støy fra en helt annen spec. En data-URL
// laster alltid, treffer aldri nettverket, og `bildeSrc()` slipper den gjennom
// uendret akkurat som en lagret URL.
const TEST_BILDE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

let arrangementId: string | null = null
let petterBildeFoer: string | null = null

test.describe('posisjonsspor under pågående arrangement (#695)', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md')

  test.beforeAll(async () => {
    const admin = adminKlient('kart-spor')
    if (!admin) return

    // Startet for en time siden, slutter om tre: godt innenfor «pågår nå» i
    // begge ender, så testen ikke vipper over en grense mens den kjører.
    const { data: arr, error: arrFeil } = await admin
      .from('arrangementer')
      .insert({
        type: 'tur',
        tittel: `${MERKE} — pågår`,
        start_tidspunkt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        slutt_tidspunkt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        opprettet_av: PETTER,
      })
      .select('id')
      .single()

    if (arrFeil) throw new Error(`Kunne ikke seede arrangement: ${arrFeil.message}`)
    arrangementId = arr.id

    const { error: delingFeil } = await admin.from('posisjon_deling').upsert(
      {
        profil_id: PETTER,
        deler_til: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        oppdatert: new Date().toISOString(),
      },
      { onConflict: 'profil_id' },
    )
    if (delingFeil) throw new Error(`Kunne ikke seede deling: ${delingFeil.message}`)

    // Stigende tidsstempler: sporet skal tegnes i rekkefølge, og siste punkt er
    // det som får den store markøren.
    const { error: punktFeil } = await admin.from('posisjon_punkt').insert(
      RUTE.map((p, i) => ({
        profil_id: PETTER,
        lat: p.lat,
        lng: p.lng,
        noeyaktighet_m: 10,
        registrert: new Date(Date.now() - (RUTE.length - i) * 10 * 60 * 1000).toISOString(),
        arrangement_id: arr.id,
      })),
    )
    if (punktFeil) throw new Error(`Kunne ikke seede punkter: ${punktFeil.message}`)

    // Gi Petter et profilbilde, og husk hva som sto der. Seed-profilene har
    // ingen bilder, så uten dette ville markøren alltid falt til initialer og
    // bilde-grenen vært udekket.
    const { data: foer, error: foerFeil } = await admin
      .from('profiles')
      .select('bilde_url')
      .eq('id', PETTER)
      .maybeSingle()
    if (foerFeil) throw new Error(`Kunne ikke lese Petters bilde: ${foerFeil.message}`)
    petterBildeFoer = foer?.bilde_url ?? null

    const { error: bildeFeil } = await admin
      .from('profiles')
      .update({ bilde_url: TEST_BILDE })
      .eq('id', PETTER)
    if (bildeFeil) throw new Error(`Kunne ikke seede profilbilde: ${bildeFeil.message}`)
  })

  test.afterAll(async () => {
    const admin = adminKlient('kart-spor')
    if (!admin) return
    // Punktene henger på arrangementet med on delete cascade, men vi sletter
    // eksplisitt: testen skal ikke være avhengig av at cascaden virker for å
    // rydde etter seg — det er en annen ting enn det den tester.
    await admin.from('posisjon_punkt').delete().eq('profil_id', PETTER)
    await admin.from('posisjon_deling').delete().eq('profil_id', PETTER)
    await admin.from('profiles').update({ bilde_url: petterBildeFoer }).eq('id', PETTER)
    if (arrangementId) await admin.from('arrangementer').delete().eq('id', arrangementId)
  })

  test('hele ruta tegnes mens arrangementet pågår', async ({ page }) => {
    await page.goto('/kart')
    await expect(page.getByTestId('posisjonskart')).toBeVisible()

    // «Sporer {tittel}»-pilla er fjernet (#749, Reidars ønske om mindre støy
    // i knapperaden). Det specen egentlig vokter er at sporet tegnes mens
    // arrangementet pågår — det asserteres rett under.

    // Petters siste punkt får den store markøren, de to andre blir små
    // spor-prikker. Tallene gjelder KUN sporet denne specen seedet: den
    // innloggede brukeren kan samtidig dele fra en parallell spec, så en
    // absolutt telling av alle markører på kartet ville vært flaky.
    await expect(page.locator('.kart-spor-prikk')).toHaveCount(RUTE.length - 1, {
      timeout: 15_000,
    })
    await expect(page.locator('.kart-rute')).toHaveCount(1)
    await expect(page.locator('.kart-markoer')).not.toHaveCount(0)

    // Lista skal si hvor mange stopp ruta har, ellers er tallet kun synlig som
    // prikker man må telle selv. Petters rad spesifikt — rekkefølgen i lista
    // avhenger av hvem andre som deler samtidig.
    await expect(page.getByTestId('kart-rad').filter({ hasText: 'Petter' })).toContainText(
      `${RUTE.length} stopp`,
    )
  })

  test('ruta tegnes også uten pågående arrangement', async ({ page }) => {
    const admin = adminKlient('kart-spor')
    test.skip(!admin, 'Ingen admin-klient')

    // Flytt arrangementet til fortiden i stedet for å slette det: da tester vi
    // nøyaktig betingelsen («pågår det noe nå?»), ikke fraværet av en rad.
    // Punktene løsnes samtidig fra det, slik at de faller inn under
    // døgn-innrammingen i stedet for arrangement-innrammingen.
    const { error } = await admin!
      .from('arrangementer')
      .update({
        start_tidspunkt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        slutt_tidspunkt: new Date(Date.now() - 47 * 60 * 60 * 1000).toISOString(),
      })
      .eq('id', arrangementId!)
    if (error) throw new Error(`Kunne ikke flytte arrangementet: ${error.message}`)
    await admin!.from('posisjon_punkt').update({ arrangement_id: null }).eq('profil_id', PETTER)

    try {
      await page.goto('/kart')
      await expect(page.getByTestId('posisjonskart')).toBeVisible()

      // Ruta står selv uten pågående arrangement. Dette er #698: at sporet
      // forsvant her var bugen.
      await expect(page.locator('.kart-spor-prikk')).toHaveCount(RUTE.length - 1, {
        timeout: 15_000,
      })
      await expect(page.locator('.kart-rute')).toHaveCount(1)
      await page.getByTestId('panel-handtak').click()
      await expect(
        page.getByTestId('kart-rad').filter({ hasText: 'Petter' }),
      ).toContainText(`${RUTE.length} stopp`)
    } finally {
      await admin!
        .from('arrangementer')
        .update({
          start_tidspunkt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          slutt_tidspunkt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        })
        .eq('id', arrangementId!)
      await admin!
        .from('posisjon_punkt')
        .update({ arrangement_id: arrangementId })
        .eq('profil_id', PETTER)
    }
  })

  test('punkter eldre enn spor-vinduet faller ut', async ({ page }) => {
    const admin = adminKlient('kart-spor')
    test.skip(!admin, 'Ingen admin-klient')

    // Samme oppsett som testen over — arrangementet ute av veien, punktene
    // løse — men det ELDSTE punktet skyves utenfor vinduet. Uten denne testen
    // ville et spor kunnet vokse ubegrenset så lenge delingen ble fornyet,
    // og ingenting hadde fanget det.
    await admin!
      .from('arrangementer')
      .update({
        start_tidspunkt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        slutt_tidspunkt: new Date(Date.now() - 47 * 60 * 60 * 1000).toISOString(),
      })
      .eq('id', arrangementId!)
    await admin!.from('posisjon_punkt').update({ arrangement_id: null }).eq('profil_id', PETTER)

    const { data: eldst, error: eldstFeil } = await admin!
      .from('posisjon_punkt')
      .select('id')
      .eq('profil_id', PETTER)
      .order('registrert', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (eldstFeil) throw new Error(`Fant ikke eldste punkt: ${eldstFeil.message}`)
    if (!eldst) throw new Error('Forventet minst ett punkt for Petter')

    const utenfor = new Date(
      Date.now() - (POSISJON_SPOR_TIMER + 2) * 60 * 60 * 1000,
    ).toISOString()
    await admin!.from('posisjon_punkt').update({ registrert: utenfor }).eq('id', eldst.id)

    try {
      await page.goto('/kart')
      await expect(page.getByTestId('posisjonskart')).toBeVisible()

      // Ett punkt færre i ruta: 3 seedede minus det som falt ut = 2, altså
      // én spor-prikk pluss markøren.
      await expect(page.locator('.kart-spor-prikk')).toHaveCount(RUTE.length - 2, {
        timeout: 15_000,
      })
      await page.getByTestId('panel-handtak').click()
      await expect(
        page.getByTestId('kart-rad').filter({ hasText: 'Petter' }),
      ).toContainText(`${RUTE.length - 1} stopp`)
    } finally {
      await admin!
        .from('arrangementer')
        .update({
          start_tidspunkt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          slutt_tidspunkt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        })
        .eq('id', arrangementId!)
      await admin!
        .from('posisjon_punkt')
        .update({ arrangement_id: arrangementId })
        .eq('profil_id', PETTER)
      await admin!
        .from('posisjon_punkt')
        .update({ registrert: new Date(Date.now() - 30 * 60 * 1000).toISOString() })
        .eq('id', eldst.id)
    }
  })

  // Markøren viste opprinnelig initialer. Reidar testet med Michael og så at
  // «1R» ikke fortalte ham hvem som sto der — et ansikt gjenkjennes raskere enn
  // to bokstaver når man vet hvem som er med.
  test('markøren viser profilbildet når mannen har ett', async ({ page }) => {
    await page.goto('/kart')
    await expect(page.getByTestId('posisjonskart')).toBeVisible()

    const bilde = page.locator('.kart-markoer img')
    await expect(bilde).toHaveCount(1, { timeout: 15_000 })
    await expect(bilde).toHaveAttribute('src', TEST_BILDE)

    // Initial-fallbacken skal IKKE stå samtidig. Uten denne kunne begge grener
    // rendret oppå hverandre uten at noen så det.
    await expect(page.locator('.kart-markoer.avatar-initialer')).toHaveCount(0)
  })

  test('pling-knappen kvitterer synlig etter trykk', async ({ page }) => {
    await page.goto('/kart')
    await expect(page.getByTestId('posisjonskart')).toBeVisible()

    await page.getByTestId('panel-handtak').click()
    const knapp = page.getByTestId('pling-knapp').first()
    await expect(knapp).toHaveText('Pling')
    await expect(knapp).toBeEnabled()

    // Tiden måles fordi kvitteringen skal være OPTIMISTISK (#705): den henger
    // på trykket, ikke på serveren. sendVarsel() gjør et rundeslag mot
    // Supabase, web-push og Resend, og ventet knappen på det, så den død ut —
    // og man trykket igjen. En ren `toHaveText`-assert ville passert uansett
    // hvor lenge det tok, fordi Playwright bare venter.
    const foer = Date.now()
    await knapp.click()
    await expect(knapp).toHaveText('Plinget')
    const brukt = Date.now() - foer

    // Kjernen i det Reidar meldte først: knappen sto helt uendret etter
    // trykket. Tre signaler asserters fordi teksten alene er lett å overse på
    // en telefon.
    await expect(knapp).toBeDisabled()
    await expect(knapp).toHaveAttribute('data-plinget', 'ja')

    // Sjenerøs terskel — poenget er å skille «umiddelbart» fra «etter et
    // nettverkskall», ikke å måle millisekunder. Et serverkall mot en ekte
    // Supabase ligger godt over dette.
    expect(brukt).toBeLessThan(600)

    // …og den skal komme tilbake av seg selv, ellers ser knappen ødelagt ut
    // resten av kvelden. Marginen er sjenerøs: vi tester at den GÅR tilbake,
    // ikke at den treffer sekundet.
    await expect(knapp).toHaveText('Pling', {
      timeout: (POSISJON_PLING_KVITTERING_SEK + 8) * 1000,
    })
    await expect(knapp).toBeEnabled()
  })
})
