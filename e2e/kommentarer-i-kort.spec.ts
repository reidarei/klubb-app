import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { harTestCreds } from './helpers/auth'
import { adminKlient } from './helpers/admin-klient'

/**
 * Verifiserer at kommentarer vises inline nederst i hvert arrangement/poll-
 * kort på agenda (ikke som egen seksjon). Tar screenshot før og etter at
 * bruker kollapser en kommentar-seksjon.
 *
 * Specen SEEDER sin egen kommentar (#616). Toggle-headeren i
 * KommentarerPaaKort rendres kun når `visTall > 0`, så testen forutsatte
 * tidligere at seed-dataene tilfeldigvis hadde en kommentar på et fremtidig
 * arrangement. Den forutsetningen forvitret stille på den langtlevende
 * test-instansen — arrangementene gled til fortid og chat-tabellene ble tømt
 * av andre specs — og testen feilet som om komponenten var borte. Den er ikke
 * det; den hadde bare ingenting å vise. En spec som avhenger av data den ikke
 * eier selv, forfaller av seg selv.
 */

const UT_DIR = path.join('.screenshots', 'kommentarer-i-kort')

// Kjennetegn i innholdet så cleanup finner raden igjen selv om testen feilet
// halvveis og aldri rakk å registrere id-en.
const KOMMENTAR_TEKST = 'Playwright inline-kort-test'

let seededKommentarId: string | null = null

test.describe('Kommentarer inne i kort', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md')

  test.beforeAll(async () => {
    fs.mkdirSync(UT_DIR, { recursive: true })

    const admin = adminKlient('kommentarer-i-kort')
    if (!admin) return

    // Agendaen viser fremtidige arrangementer. Uten et slikt finnes det ikke
    // noe kort å henge kommentaren på, og testen har ingenting å teste.
    const { data: arr, error: arrFeil } = await admin
      .from('arrangementer')
      .select('id')
      .gt('start_tidspunkt', new Date().toISOString())
      .order('start_tidspunkt', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (arrFeil) throw new Error(`Fant ikke arrangement å seede på: ${arrFeil.message}`)
    if (!arr) throw new Error('Ingen fremtidige arrangementer på test-instansen — seed-dataene trenger en oppfriskning (docs/test-instans.md)')

    const { data: profil, error: profilFeil } = await admin
      .from('profiles')
      .select('id')
      .eq('aktiv', true)
      .limit(1)
      .maybeSingle()

    if (profilFeil) throw new Error(`Fant ingen aktiv profil: ${profilFeil.message}`)
    if (!profil) throw new Error('Ingen aktive profiler på test-instansen')

    const { data: rad, error: insertFeil } = await admin
      .from('arrangement_chat')
      .insert({ arrangement_id: arr.id, profil_id: profil.id, innhold: KOMMENTAR_TEKST })
      .select('id')
      .single()

    if (insertFeil) throw new Error(`Kunne ikke seede kommentar: ${insertFeil.message}`)
    seededKommentarId = rad.id
  })

  // afterAll, ikke afterEach: seedingen skjer én gang i beforeAll. Rydder på
  // innhold i tillegg til id, slik at en rad fra en tidligere krasjet kjøring
  // ikke blir liggende og hope seg opp.
  test.afterAll(async () => {
    const admin = adminKlient('kommentarer-i-kort')
    if (!admin) return

    const { error } = await admin
      .from('arrangement_chat')
      .delete()
      .eq('innhold', KOMMENTAR_TEKST)

    if (error) console.warn(`[kommentarer-i-kort] cleanup feilet: ${error.message}`)
    seededKommentarId = null
  })

  test('inline kommentar-seksjon vises på arrangement-kort og kan kollapses', async ({ page }) => {
    test.setTimeout(60_000)

    expect(seededKommentarId, 'seeding i beforeAll må ha lykkes').not.toBeNull()

    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(600)
    await page.screenshot({ path: path.join(UT_DIR, '01-agenda-ekspandert.png'), fullPage: true })

    // Toggle-headeren er <span role="button"> og ikke <button>, fordi den
    // rendres inne i kortets ytre <a> (se kommentaren i KommentarerPaaKort).
    // getByRole plukker den opp uansett.
    const toggle = page.getByRole('button', { name: /kommentarer?$/i }).first()
    await expect(toggle).toBeVisible()

    // Kollaps første kommentar-seksjon
    await toggle.click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(UT_DIR, '02-agenda-kollapset.png'), fullPage: true })

    // Ekspander igjen
    await toggle.click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(UT_DIR, '03-agenda-gjenekspandert.png'), fullPage: true })
  })
})
