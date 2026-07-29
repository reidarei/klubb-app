import { expect, test, type Page } from '@playwright/test'
import { harTestCreds } from './helpers/auth'

/**
 * Røyktest: hver rute i appen skal LASTE.
 *
 * Bakgrunn: 31 sider gjør databasespørringer, men e2e-suiten navigerte bare
 * til 10 av dem. De øvrige 17 (chat, samtaler, album, arrangøransvar,
 * vedtekter, medlemsprofiler, kåringspoll-oppretting, fond-redigering,
 * varsel-detalj m.fl.) ble ALDRI lastet i en test. En brutt spørring der —
 * feil kolonnenavn etter en migrasjon, en join som ryker, en manglende
 * GRANT — ble først oppdaget av et medlem i prod.
 *
 * Dette er bevisst en BREDDE-test, ikke en dybde-test: den beviser at siden
 * svarer og rendrer, ikke at innholdet er riktig. Dybden hører hjemme i
 * spec-ene som allerede finnes (golden-path, tidligere, stedene, fond, …).
 * Verdien er at en regresjon på en av de 17 sidene nå fanges FØR merge i
 * stedet for etterpå.
 *
 * Særlig relevant mot GRANT-klippen 30. oktober 2026 (CLAUDE.md § Policy:
 * Migrasjoner): en manglende GRANT gir `42501` selv når RLS tillater raden.
 * En side som aldri lastes, får aldri sin 42501 oppdaget.
 */

// Seedede ID-er fra supabase/seed.sql. Endres en av dem der, må den endres
// her i samme commit — de er deterministiske nettopp for å kunne lenkes til.
const ARRANGEMENT = '00000000-0000-4000-9000-000000000001'
const MELDING = '00000000-0000-4000-9300-000000000000'
const POLL = '00000000-0000-4000-9400-000000000000'
const MEDLEM = '00000000-0000-4000-8000-000000000002' // Petter Prøve
const ALBUM = '00000000-0000-4000-9800-000000000020'
const SAMTALE = '00000000-0000-4000-9800-000000000010'
const VARSEL = '00000000-0000-4000-9800-000000000030'

type Rute = {
  sti: string
  // Forventet overskrift, der teksten er statisk og verifisert. Utelates for
  // sider med dynamisk overskrift (medlemsnavn, arrangementstittel) — der
  // holder den generiske «en ikke-tom overskrift finnes»-sjekken.
  overskrift?: string | RegExp
}

// Listesider og skjemaer — alle uten ruteparameter.
const RUTER: Rute[] = [
  { sti: '/', overskrift: undefined }, // agenda; overskriften er klubbnavnet (env-styrt)
  { sti: '/chat', overskrift: 'Samtalen' },
  { sti: '/samtaler', overskrift: 'Samtaler' },
  { sti: '/album', overskrift: 'Bildene' },
  { sti: '/arrangoransvar', overskrift: 'Arrangøransvar' },
  { sti: '/tidligere', overskrift: 'Hele historikken' },
  { sti: '/kaaringer', overskrift: 'Hall of Fame' },
  { sti: '/stedene', overskrift: /Vi har vært verden rundt/ },
  { sti: '/fond' },
  { sti: '/fond/rediger' },
  { sti: '/klubbinfo' },
  { sti: '/klubbinfo/medlemmer' },
  { sti: '/klubbinfo/medlemmer/ny' },
  { sti: '/klubbinfo/statistikk', overskrift: 'Statistikk' },
  { sti: '/innspill', overskrift: 'Innspill' },
  { sti: '/innstillinger' },
  { sti: '/innstillinger/bruk', overskrift: 'Aktivitet' },
  { sti: '/innstillinger/vitals', overskrift: 'Ytelsesmålinger' },
  { sti: '/innstillinger/pass-godkjenninger', overskrift: 'Pass-godkjenninger' },
  { sti: '/profil', overskrift: 'Din profil' },
  { sti: '/profil/rediger' },
  { sti: '/om-appen', overskrift: 'Om appen' },
  { sti: '/arrangementer/ny' },
  { sti: '/meldinger/ny' },
  { sti: '/poll/ny' },
  { sti: '/kaaringspoll/ny' },

  // Detaljsider. Hver av dem treffer innholds-grenen fordi seed.sql har en
  // matchende rad — uten den ville notFound() gitt 404 og testen ville
  // bekreftet feil gren (se seed-vakten, prefiks 9800).
  { sti: `/arrangementer/${ARRANGEMENT}` },
  { sti: `/arrangementer/${ARRANGEMENT}/rediger` },
  { sti: `/meldinger/${MELDING}` },
  { sti: `/poll/${POLL}` },
  { sti: `/klubbinfo/medlemmer/${MEDLEM}` },
  { sti: `/klubbinfo/medlemmer/${MEDLEM}/rediger` },
  { sti: '/klubbinfo/vedtekter/regler' },
  { sti: `/album/${ALBUM}` },
  { sti: `/samtaler/${SAMTALE}` },
  { sti: `/varsler/${VARSEL}` },
]

// Minste mengde synlig tekst i <main> før vi tror siden faktisk rendret noe.
// 40 tegn ligger godt over et tomt skall (som er 0) og godt under den minste
// ekte siden (/varsler/[id], ~120 tegn) — terskelen skal fange «ingenting
// kom», ikke finkalibrere innholdsmengde.
const MIN_TEGN_I_MAIN = 40

// Generisk positiv kontroll for sider uten kjent, statisk overskrift.
//
// Vi anker på <main> og ikke på h1/h2: skjemasidene (/meldinger/ny,
// /poll/ny, /profil/rediger, alle rediger-rutene …) rendrer tittelen sin som
// <div> i en egen header-rad og har INGEN overskriftselementer. Det er verdt
// en opprydding for skjermlesere, men det er en annen sak — her ville en
// h1-sjekk bare gjort speccen rød på noe den ikke handler om.
async function harInnhold(page: Page, sti: string) {
  const main = page.locator('main')
  const feilSide = page.getByTestId('feil-side')
  await expect(main, `${sti} rendret ingen <main>`).toBeVisible({ timeout: 15_000 })

  // expect.poll og ikke en engangs-måling: vi navigerer med
  // `domcontentloaded` (billigst og minst flaky av wait-strategiene), så
  // <main> er i DOM-en før React har fylt den. En rett `innerText()` her
  // leste et halvferdig skall og ga falskt rødt på 20 av 37 ruter.
  //
  // Error-boundaryen sjekkes INNE i pollen, ikke som en egen `toHaveCount(0)`
  // før eller etter: den hydreres asynkront, så en engangs-sjekk løper enten
  // foran den (og ser ingenting) eller kommer etter at en annen assertion
  // allerede har feilet med feil begrunnelse. Verifisert ved å bryte
  // klubb_chat-spørringen: uten dette rapporterte speccen «fant ikke
  // overskriften Samtalen» i stedet for «endte i error-boundaryen».
  await expect
    .poll(
      async () => {
        if ((await feilSide.count()) > 0) return 'error-boundary'
        const tegn = (await main.innerText()).trim().length
        return tegn > MIN_TEGN_I_MAIN ? 'ok' : `tomt skall (${tegn} tegn i <main>)`
      },
      { message: `${sti} rendret ikke innhold`, timeout: 15_000 },
    )
    .toBe('ok')
}

test.describe('Røyktest — alle sider laster', () => {
  test.skip(
    !harTestCreds(),
    'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md og docs/test-instans.md',
  )

  for (const rute of RUTER) {
    // Én test per rute, ikke én løkke i én test: da navngir rapporten hvilken
    // side som er brutt, og en feil på side 3 stopper ikke de 33 andre.
    test(`${rute.sti} laster`, async ({ page }) => {
      const respons = await page.goto(rute.sti, { waitUntil: 'domcontentloaded' })

      // 1. HTTP-status. En server component som kaster gir 500 her — det er
      //    den billigste og skarpeste sjekken vi har, og den fanger 42501
      //    (manglende GRANT) uten at vi må kjenne feilteksten.
      expect(respons, `ingen respons for ${rute.sti}`).not.toBeNull()
      expect(respons!.status(), `${rute.sti} svarte ${respons!.status()}`).toBe(200)

      // 2. Ikke havnet på login. Et utløpt storageState ville ellers gjort
      //    hele suiten grønn mot login-siden, som rendrer helt fint.
      expect(page.url(), `${rute.sti} redirigerte til innlogging`).not.toContain('/login')

      // 3. Positiv kontroll: siden rendret faktisk sitt eget innhold, og
      //    havnet ikke i error-boundaryen. Begge deler avgjøres inne i
      //    harInnhold() — se kommentaren der for hvorfor error-boundaryen
      //    ikke kan sjekkes med en frittstående toHaveCount(0).
      //    Denne kjøres FØR overskrift-sjekken: en brutt side skal
      //    rapporteres som «endte i error-boundaryen», ikke som «fant ikke
      //    overskriften X».
      await harInnhold(page, rute.sti)

      // 4. Der overskriften er statisk og verifisert, krev den eksplisitt —
      //    en side kan ha innhold og likevel ha mistet toppen sin.
      if (rute.overskrift) {
        await expect(
          page.getByRole('heading', { name: rute.overskrift }).first(),
        ).toBeVisible({ timeout: 15_000 })
      }
    })
  }
})

// Ikke med i listen, med begrunnelse:
// - /kaaringspoll/[id]/tiebreak — krever en poll med tiebreak_status =
//   'venter_paa_tiebreak'. De fire seedede kåringspollene (#520) står som
//   'avgjort' med vilje, og å endre en av dem ville brutt
//   kaaring-varsel-retry.spec.ts. Trenger en egen fixture; egen sak.
// - /bli-utvikler og /arrangementer/tidligere — rene omdirigeringer/statiske
//   sider uten databasespørringer, og dermed utenfor det denne speccen skal
//   beskytte.
// - /login — dekket av auth.setup.ts, som feiler høylytt hvis den ryker.
