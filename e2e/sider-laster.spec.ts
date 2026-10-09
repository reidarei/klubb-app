import { expect, test, type Page } from '@playwright/test'
import { harTestCreds } from './helpers/auth'
import { adminKlient } from './helpers/admin-klient'
import { lesFeilLoggGrense } from './helpers/feil-logg-grense'
import { RUTER } from './helpers/ruter'
import { forventTreffbar } from './helpers/treffmaal'

/**
 * Røyktest: hver rute i appen skal LASTE.
 *
 * Bevisst en BREDDE-test: beviser at siden svarer og rendrer, ikke at
 * innholdet er riktig — det dekker de dedikerte specene. Fanger brutte
 * spørringer (feil kolonne, join som ryker, manglende GRANT → 42501, jf.
 * CLAUDE.md § Policy: Migrasjoner) på sider ingen annen test laster.
 *
 * Hver rute får også en bredde-sjekk av trykkflater (forventTreffbar(), #700).
 * RUTER bor i e2e/helpers/ruter.ts, sammen med hvilke ruter som bevisst mangler.
 */

// Godt over et tomt skall (0) og godt under minste ekte side (/varsler/[id],
// ~120 tegn) — skal fange «ingenting kom», ikke kalibrere innholdsmengde.
const MIN_TEGN_I_MAIN = 40

// Ankret på <main>, ikke h1/h2: skjemasidene rendrer tittelen som <div> og har
// ingen overskriftselementer.
async function harInnhold(page: Page, sti: string) {
  const main = page.locator('main')
  const feilSide = page.getByTestId('feil-side')
  await expect(main, `${sti} rendret ingen <main>`).toBeVisible({ timeout: 15_000 })

  // expect.poll: med `domcontentloaded` finnes <main> før React har fylt den,
  // og en engangs-innerText() leser et halvferdig skall.
  //
  // Error-boundaryen sjekkes INNE i pollen: den hydreres asynkront, så en
  // frittstående toHaveCount(0) løper foran den, og feilen rapporteres som
  // «fant ikke overskriften» i stedet for «endte i error-boundaryen».
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
    // Én test per rute: rapporten navngir den brutte siden, og én feil stopper
    // ikke resten.
    test(`${rute.sti} laster`, async ({ page }) => {
      const respons = await page.goto(rute.sti, { waitUntil: 'domcontentloaded' })

      // En server component som kaster (f.eks. 42501) gir 500 her.
      expect(respons, `ingen respons for ${rute.sti}`).not.toBeNull()
      expect(respons!.status(), `${rute.sti} svarte ${respons!.status()}`).toBe(200)

      // Et utløpt storageState ville ellers gjort suiten grønn mot login-siden.
      expect(page.url(), `${rute.sti} redirigerte til innlogging`).not.toContain('/login')

      // FØR overskrift-sjekken, så en brutt side rapporteres som error-boundary.
      await harInnhold(page, rute.sti)

      // En side kan ha innhold og likevel ha mistet toppen sin.
      if (rute.overskrift) {
        await expect(
          page.getByRole('heading', { name: rute.overskrift }).first(),
        ).toBeVisible({ timeout: 15_000 })
      }

      // Ellers kan treffmaal-sjekken måle en loading-fallback (se ruter.ts).
      if (rute.ventPaaSelektor) {
        await page.waitForSelector(rute.ventPaaSelektor, { timeout: 15_000 })
      }

      // Trykkflater (#700), avgrenset til <main>. Brudd og gulv er blokkerende;
      // unntak kun via e2e/helpers/treffmaal-unntak.ts. Se CLAUDE.md § Policy: Trykkflater.
      await forventTreffbar(page, {
        kontekst: rute.sti,
        gulv: rute.minTreffmaal ?? 1,
        gulvOmraade: 'main',
      })
    })
  }

  // SKAL stå sist (workers: 1, deklarasjonsrekkefølge), så den ser feil_logg-
  // rader fra hele suitens navigering.
  //
  // Fanger server-feil som logges og svelges mens siden rendrer normalt (#539).
  // Leser feil_logg, ikke browser-konsollen, som spammes av getSession()-
  // advarselen på hver rute.
  //
  // Egen describe for `retries: 0`: en retry ville kjørt vakten alene og
  // gjort et treff til «flaky» med exit 0. Et treff skal stå.
  test.describe('feil_logg-vakt', () => {
    test.describe.configure({ retries: 0 })

    test('ingen av sidene over logget en server-feil (feil_logg)', async () => {
      const supabase = adminKlient('sider-laster-feillogg-vakt')
      // Fail-closed: en vakt som returnerer uten assertion er grønn på falske premisser.
      if (!supabase) {
        throw new Error(
          'E2E_SUPABASE_* mangler — feil_logg-vakten kan ikke verifisere noe. Se docs/test-instans.md.',
        )
      }

      // Høyeste feil_logg.id ved kjøringens start (global-setup). Id, ikke
      // tidsstempel: runner- og DB-klokke kan avvike og gi falskt grønt.
      // Kjørings-global grense er bevisst: feil fra alle specs fanges.
      const grense = lesFeilLoggGrense()

      // Fast pause, IKKE expect.poll: persisterFeilLogg() skriver etter at
      // responsen er sendt, og poll ville gitt seg ved første tomme lesning.
      await new Promise(resolve => setTimeout(resolve, 2_000))

      // Kun 'error': klient-beaconen kan også logge 'warn'.
      const { data, error } = await supabase
        .from('feil_logg')
        .select('id, event, kontekst')
        .gt('id', grense)
        .eq('nivaa', 'error')
        .order('id', { ascending: true })
      if (error) throw new Error(`Kunne ikke lese feil_logg: ${error.message}`)

      // Kong → PostgREST i teststacken gir sporadisk 502/503/504 som ikke sier
      // noe om appens kode (#711, #800). Skilles ut som ikke-fatale her; gjelder
      // kun denne vakten, ikke prod-alarmen i lib/logg.ts.
      const GATEWAY_TRANSIENT_STATUSER = [502, 503, 504]

      type Rad = { id: number; event: string; kontekst: unknown }
      const erGatewayTransient = (rad: Rad) => {
        const status = (rad.kontekst as { status?: unknown } | null)?.status
        return typeof status === 'number' && GATEWAY_TRANSIENT_STATUSER.includes(status)
      }

      const alle = (data ?? []) as Rad[]
      const transiente = alle.filter(erGatewayTransient)
      const ekte = alle.filter(rad => !erGatewayTransient(rad))

      if (transiente.length > 0) {
        const liste = transiente.map(r => `${r.event} (id ${r.id})`).join(', ')
        console.warn(`[sider-laster] gateway-transient (502/503/504), behandlet som ikke-fatal: ${liste}`)
        test.info().annotations.push({
          type: 'gateway-transient',
          description: liste,
        })
      }

      // feil_logg deduperer på (profil_id, event, minutt) (migrasjon 122), så
      // kontrakten er «minst én rad per event per minutt» — nok for denne vakten.
      const hendelser = ekte.map(r => r.event)
      // Selve feilen i assert-meldingen: CI-loggen er ofte eneste sted vi ser den (#800).
      const detaljer = ekte.map(r => {
        const k = (r.kontekst ?? {}) as Record<string, unknown>
        const felt = ['message', 'name', 'status', 'code', 'url', 'ressurs']
          .filter(n => k[n] !== undefined && k[n] !== null && k[n] !== '')
          .map(n => `${n}=${String(k[n]).slice(0, 300)}`)
        const stack = typeof k.stack === 'string' ? `\n    stack: ${k.stack.slice(0, 600)}` : ''
        return `  - ${r.event} (id ${r.id}) ${felt.join(' | ')}${stack}`
      })
      expect(
        hendelser,
        `Sidene svarte 200 og rendret innhold, men disse server-feilene ble logget til feil_logg i løpet av kjøringen (grense id > ${grense}):\n${detaljer.join('\n')}`,
      ).toEqual([])
    })
  })
})
