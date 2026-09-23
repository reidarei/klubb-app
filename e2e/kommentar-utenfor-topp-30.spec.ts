import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { harTestCreds } from './helpers/auth'
import { adminKlient } from './helpers/admin-klient'

/**
 * Reproduserer #648 deterministisk: agenda-queryen (lib/queries/agenda.ts)
 * henter de 30 globalt nyeste kommentarene på tvers av ALLE arrangementer og
 * caper til 3 per kort — count-aggregatet (arrangement_chat(count)) har
 * derimot ikke noe slikt vindu. Et kort hvis eneste kommentar er eldre enn de
 * 30 globalt nyeste får dermed en teller uten innhold å vise.
 *
 * Seeder to EGNE arrangementer (deler ikke seed-arrangementer med andre
 * spec-filer, se CLAUDE.md): et mål-arrangement med 1 gammel kommentar, og et
 * støy-arrangement med 35 ferske kommentarer som garantert fyller opp hele
 * topp-30-vinduet og skyver målets kommentar ut. workers: 1
 * (playwright.config.ts) hindrer andre specs fra å skrive konkurrerende
 * kommentarer mens dette kjører.
 *
 * Ingen eksisterende rad muteres — vi oppretter kun nye arrangementer/
 * kommentarer og sletter dem i afterAll. Cascade (arrangement_chat.
 * arrangement_id → arrangementer.id on delete cascade) rydder kommentarene
 * automatisk når arrangementet slettes, så afterAll trenger bare slette
 * arrangementene selv — og kan gjøre det trygt selv om beforeAll feilet
 * halvveis (matcher på unik tittel-prefiks, ikke lagrede id-er alene).
 */

const UT_DIR = path.join('.screenshots', 'kommentar-utenfor-topp-30')
const MARKOR = `Playwright-648-${Date.now()}`
const MAAL_TITTEL = `${MARKOR} mål`
const STOEY_TITTEL = `${MARKOR} støy`

let maalId: string | null = null
let stoeyId: string | null = null

test.describe('Kommentarknapp uten innhold navigerer til detaljen (#648)', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md')

  test.beforeAll(async () => {
    fs.mkdirSync(UT_DIR, { recursive: true })

    const admin = adminKlient('kommentar-utenfor-topp-30')
    if (!admin) throw new Error('E2E_SUPABASE_* mangler')

    // MARKOR inneholder Date.now(), så afterAll-slettingen treffer kun DENNE
    // kjøringens rader. Dør workeren før afterAll, blir forrige kjørings
    // arrangementer liggende 10-11 dager fram i tid på test-instansens agenda
    // for alltid. Rydd derfor bort alt fra tidligere kjøringer først.
    const { error: oppryddingFeil } = await admin
      .from('arrangementer')
      .delete()
      .like('tittel', 'Playwright-648-%')
    if (oppryddingFeil) throw new Error(`Kunne ikke rydde gamle testrader: ${oppryddingFeil.message}`)

    // Må være DEN INNLOGGEDE testbrukeren, ikke en vilkårlig aktiv profil:
    // vi melder ham på arrangementene under, og «ubesvart» avgjøres per
    // innlogget medlem.
    const testEpost = process.env.TEST_EPOST
    if (!testEpost) throw new Error('TEST_EPOST mangler')

    const { data: profil, error: profilFeil } = await admin
      .from('profiles')
      .select('id')
      .eq('epost', testEpost)
      .maybeSingle()
    if (profilFeil) throw new Error(`Kunne ikke slå opp testprofilen: ${profilFeil.message}`)
    if (!profil) throw new Error(`Fant ingen profil for ${testEpost} på test-instansen`)

    const naa = new Date()
    // Fremtidige arrangementer, godt innenfor AGENDA_VINDU_MND (12 mnd) —
    // ulike datoer så de blir to atskilte kort på agendaen.
    const maalStart = new Date(naa.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString()
    const stoeyStart = new Date(naa.getTime() + 11 * 24 * 60 * 60 * 1000).toISOString()

    const { data: arr, error: arrFeil } = await admin
      .from('arrangementer')
      .insert([
        { type: 'moete', tittel: MAAL_TITTEL, start_tidspunkt: maalStart, opprettet_av: profil.id },
        { type: 'moete', tittel: STOEY_TITTEL, start_tidspunkt: stoeyStart, opprettet_av: profil.id },
      ])
      .select('id, tittel')
    if (arrFeil) throw new Error(`Kunne ikke opprette test-arrangementer: ${arrFeil.message}`)
    if (!arr || arr.length !== 2) throw new Error('Forventet to opprettede arrangementer')

    maalId = arr.find(a => a.tittel === MAAL_TITTEL)!.id
    stoeyId = arr.find(a => a.tittel === STOEY_TITTEL)!.id

    // Uten påmelding havner arrangementene i «Ikke svart ennå», og DEN
    // seksjonen rendrer ArrangementKort med visKommentarer={false} — altså
    // ingen kommentarblokk i det hele tatt (app/(app)/page.tsx). Kortene må
    // ligge i «Kommende» for at det er noen header å teste.
    const { error: paameldingFeil } = await admin.from('paameldinger').insert([
      { arrangement_id: maalId, profil_id: profil.id, status: 'ja' },
      { arrangement_id: stoeyId, profil_id: profil.id, status: 'ja' },
    ])
    if (paameldingFeil) throw new Error(`Kunne ikke melde på testbrukeren: ${paameldingFeil.message}`)

    // Målets eneste kommentar — eksplisitt satt langt tilbake i tid (men
    // fortsatt innenfor 12-mnd-vinduet) så den garantert er eldre enn alle
    // 35 støy-kommentarene under.
    const gammelOpprettet = new Date(naa.getTime() - 6 * 60 * 60 * 1000).toISOString()
    const { error: maalKommentarFeil } = await admin.from('arrangement_chat').insert({
      arrangement_id: maalId,
      profil_id: profil.id,
      innhold: `${MARKOR} eneste kommentar på mål`,
      opprettet: gammelOpprettet,
    })
    if (maalKommentarFeil) throw new Error(`Kunne ikke seede mål-kommentar: ${maalKommentarFeil.message}`)

    // 35 ferske støy-kommentarer — godt over 30-grensen i agenda-queryen, så
    // det globale topp-30-uttaket er garantert fylt med disse alene.
    const stoeyKommentarer = Array.from({ length: 35 }, (_, i) => ({
      arrangement_id: stoeyId,
      profil_id: profil.id,
      innhold: `${MARKOR} støy ${i}`,
      opprettet: new Date(naa.getTime() - i * 1000).toISOString(),
    }))
    const { error: stoeyFeil } = await admin.from('arrangement_chat').insert(stoeyKommentarer)
    if (stoeyFeil) throw new Error(`Kunne ikke seede støy-kommentarer: ${stoeyFeil.message}`)
  })

  test.afterAll(async () => {
    const admin = adminKlient('kommentar-utenfor-topp-30')
    if (!admin) return

    // Matcher på tittel-prefiks — trygt uansett om beforeAll feilet før
    // maalId/stoeyId ble satt, og cascade rydder kommentarene med.
    const { error } = await admin.from('arrangementer').delete().like('tittel', `${MARKOR}%`)
    if (error) console.warn(`[kommentar-utenfor-topp-30] cleanup feilet: ${error.message}`)
  })

  test('mål-kortet viser en navigerende teller uten chevron eller inline-felt; klikk går til detaljsiden', async ({ page }) => {
    test.setTimeout(60_000)
    expect(maalId, 'seeding i beforeAll må ha lykkes').not.toBeNull()

    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(600)

    const maalKort = page.locator(`main a[href="/arrangementer/${maalId}"]`).first()
    await expect(maalKort).toBeVisible()
    await page.screenshot({ path: path.join(UT_DIR, '01-agenda.png'), fullPage: true })

    // Navigerende label — «1 kommentar», ingen aria-expanded.
    const label = maalKort.getByText('1 kommentar', { exact: true })
    await expect(label).toBeVisible()
    // Antallet står først: aria-label overstyrer tekstinnholdet, så en ren
    // handlingstekst ville skjult tallet for skjermleser.
    await expect(label).toHaveAttribute('aria-label', '1 kommentar — åpne for å lese')
    await expect(label).not.toHaveAttribute('aria-expanded')

    // Ingen inline kommentar-input på et kort man ikke kan lese kommentarene til.
    await expect(maalKort.locator('input[placeholder="Skriv en kommentar…"]')).toHaveCount(0)

    await label.click()
    await page.waitForURL(`**/arrangementer/${maalId}`)
    await expect(page.getByText(`${MARKOR} eneste kommentar på mål`)).toBeVisible()
    await page.screenshot({ path: path.join(UT_DIR, '02-detalj.png'), fullPage: true })
  })

  test('støy-kortet med 35 kommentarer viser vanlig chevron-header', async ({ page }) => {
    expect(stoeyId, 'seeding i beforeAll må ha lykkes').not.toBeNull()

    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(600)

    const stoeyKort = page.locator(`main a[href="/arrangementer/${stoeyId}"]`).first()
    await expect(stoeyKort).toBeVisible()

    const toggle = stoeyKort.getByRole('button', { name: /kommentarer?$/i }).first()
    await expect(toggle).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })
})
