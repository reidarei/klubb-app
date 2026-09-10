import { expect, test, type Page } from '@playwright/test'
import { harTestCreds } from './helpers/auth'
import { adminKlient } from './helpers/admin-klient'
import { AVREISE_VINDU_DAGER } from '../lib/konstanter'

/**
 * Avreise-blokka nederst på tur-kortet (#669): ansiktene til alle som har
 * svart ja, en nedtelling og kondensstripa — men kun på turer, og kun de
 * siste AVREISE_VINDU_DAGER dagene før avreise.
 *
 * Specen SEEDER sine egne arrangementer og rydder etter seg. Grunnen er at
 * blokka er tidsvindu-styrt: en tur lagt inn i seed.sql med
 * `now() + interval '4 days'` ville glidd ut av vinduet fire dager etter
 * forrige `db reset`, og testen ville begynt å feile på noe som ser ut som
 * en komponentfeil. Samme forfallsmodus som #616 — se docs/test-instans.md
 * § «Seed-datoene går ut på dato likevel».
 */

const MERKE = 'Playwright avreise-test'
const TUR_NAER = `${MERKE} — Praha`
const TUR_FJERN = `${MERKE} — langt fram`
const MOETE_NAER = `${MERKE} — møte`

// Midt i vinduet, ikke på kanten: flyttes AVREISE_VINDU_DAGER litt i noen
// retning, står denne fortsatt støtt.
const DAGER_TIL_NAER = 3

let seedet = false

function omDager(dager: number): string {
  const d = new Date()
  d.setDate(d.getDate() + dager)
  // Midt på dagen, så testen ikke vipper over en døgngrense mens den kjører.
  d.setHours(12, 0, 0, 0)
  return d.toISOString()
}

function kortFor(page: Page, tittel: string) {
  return page.locator('a[href^="/arrangementer/"]').filter({ hasText: tittel }).first()
}

test.describe('avreise-blokka på tur-kortet (#669)', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md')

  test.beforeAll(async () => {
    const admin = adminKlient('avreise-blokk')
    if (!admin) return

    const { data: profiler, error: profilFeil } = await admin
      .from('profiles')
      .select('id')
      .eq('aktiv', true)
      .limit(4)

    if (profilFeil) throw new Error(`Fant ingen aktive profiler: ${profilFeil.message}`)
    if (!profiler || profiler.length < 4) {
      throw new Error(
        `Trenger 4 aktive profiler for å teste ja/kanskje-skillet, fant ${profiler?.length ?? 0}`,
      )
    }

    const { data: arr, error: arrFeil } = await admin
      .from('arrangementer')
      .insert([
        { type: 'tur', tittel: TUR_NAER, start_tidspunkt: omDager(DAGER_TIL_NAER), oppmoetested: 'Gardermoen', opprettet_av: profiler[0].id },
        { type: 'tur', tittel: TUR_FJERN, start_tidspunkt: omDager(AVREISE_VINDU_DAGER + 3), oppmoetested: 'Gardermoen', opprettet_av: profiler[0].id },
        { type: 'moete', tittel: MOETE_NAER, start_tidspunkt: omDager(DAGER_TIL_NAER), oppmoetested: 'Klubbhuset', opprettet_av: profiler[0].id },
      ])
      .select('id, tittel')

    if (arrFeil) throw new Error(`Kunne ikke seede arrangementer: ${arrFeil.message}`)

    const idFor = (tittel: string) => arr.find(a => a.tittel === tittel)!.id

    // Tre ja og én kanskje på den nære turen. Kanskje-raden er med med vilje:
    // uten den ville en regresjon der ja-filteret faller bort gått upåaktet hen.
    // De to andre arrangementene får ja de også — da havner de i «Kommende»
    // og ikke i «Ikke svart», som holder agendaen forutsigbar.
    const { error: pmFeil } = await admin.from('paameldinger').insert([
      { arrangement_id: idFor(TUR_NAER), profil_id: profiler[0].id, status: 'ja' },
      { arrangement_id: idFor(TUR_NAER), profil_id: profiler[1].id, status: 'ja' },
      { arrangement_id: idFor(TUR_NAER), profil_id: profiler[2].id, status: 'ja' },
      { arrangement_id: idFor(TUR_NAER), profil_id: profiler[3].id, status: 'kanskje' },
      { arrangement_id: idFor(TUR_FJERN), profil_id: profiler[0].id, status: 'ja' },
      { arrangement_id: idFor(MOETE_NAER), profil_id: profiler[0].id, status: 'ja' },
    ])

    if (pmFeil) throw new Error(`Kunne ikke seede påmeldinger: ${pmFeil.message}`)
    seedet = true
  })

  // Rydder på tittel-merket, ikke på id: en rad fra en tidligere krasjet
  // kjøring skal også bli borte. Påmeldinger går med på cascade.
  test.afterAll(async () => {
    const admin = adminKlient('avreise-blokk')
    if (!admin) return
    const { error } = await admin.from('arrangementer').delete().like('tittel', `${MERKE}%`)
    if (error) console.warn(`[avreise-blokk] cleanup feilet: ${error.message}`)
    seedet = false
  })

  test('turen rett rundt hjørnet viser ansikter, nedtelling og stripe', async ({ page }) => {
    expect(seedet, 'seeding i beforeAll må ha lykkes').toBe(true)

    await page.goto('/')
    const kort = kortFor(page, TUR_NAER)
    await expect(kort).toBeVisible()

    const blokk = kort.getByTestId('avreise-blokk')
    await expect(blokk).toBeVisible()

    // Tallet matches også, ikke bare ordet — en av/på-feil i dagberegningen
    // skal være synlig her.
    await expect(blokk).toContainText(`${DAGER_TIL_NAER} dager igjen`)

    // Ett ansikt per ja-svar; kanskje-raden skal ikke telle med.
    await expect(kort.getByTestId('avreise-ansikt')).toHaveCount(3)

    // «+N»-telleren skal ikke stå her: tre ja er godt under grensa.
    await expect(blokk).not.toContainText(/\+\d/)
  })

  test('vises ikke på en tur som ligger utenfor vinduet', async ({ page }) => {
    await page.goto('/')
    const kort = kortFor(page, TUR_FJERN)
    await expect(kort).toBeVisible()
    await expect(kort.getByTestId('avreise-blokk')).toHaveCount(0)
  })

  test('vises ikke på møter, uansett hvor nært det er', async ({ page }) => {
    await page.goto('/')
    const kort = kortFor(page, MOETE_NAER)
    await expect(kort).toBeVisible()
    await expect(kort.getByTestId('avreise-blokk')).toHaveCount(0)
  })

  test('vises ikke på /tidligere — der er alt i fortida', async ({ page }) => {
    await page.goto('/tidligere')
    await expect(page.getByRole('heading', { name: 'Hele historikken' })).toBeVisible()
    await expect(page.getByTestId('avreise-blokk')).toHaveCount(0)
  })
})
