import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import { harTestCreds } from './helpers/auth'
import { adminKlient } from './helpers/admin-klient'

// Fond-fane skjermbilde-spec (#443).
// Kjøres mot test-instansen (playwright.config.ts peker aldri mot prod).
// Tar dark + light screenshot av /fond. Merk: siden er ikke lenger helt tom —
// seeden har én innskyter med bevegelser siden #543 (se fond-bevegelser.spec.ts).

const UT_DIR = '.screenshots/fond'

test.describe('Fond-fane', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md og docs/test-instans.md')

  test.beforeAll(() => {
    fs.mkdirSync(UT_DIR, { recursive: true })
  })

  test('fond-skjermbilder dark og light (tom tilstand)', async ({ page }) => {
    // Chromium-prosjektet bruker storageState fra setup-prosjektet — sesjonen er
    // allerede innlogget, så /login redirecter og e-postfeltet dukker aldri opp.
    // Gå derfor rett på /fond (som de andre spec-ene), ingen loggInn-kall. Se #443.
    await page.goto('/fond')

    // Vent på fonter og hydration så serif-tallene fanges i riktig font
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => document.fonts.ready)
    // Skjul Next.js dev-indikatoren — den havner midt i fullPage-screenshots
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })

    // Dark (standard — TemaSync bruker system eller lagret preferanse)
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
    await page.waitForTimeout(100)
    await page.screenshot({ path: `${UT_DIR}/fond-dark.png`, fullPage: true })

    // Light
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
    await page.waitForTimeout(150)
    await page.screenshot({ path: `${UT_DIR}/fond-light.png`, fullPage: true })
  })

  test('andel-ringen står ved siden av totalen (#779)', async ({ page }) => {
    // Seeden har innskytere men 0 kr på konto, og ved totalverdi 0 skjules ringen
    // med vilje (ingen andel å regne ut). Sett en midlertidig saldo så ringen
    // rendres, og tilbakestill i finally — workers: 1, så ingen annen spec ser den.
    const admin = adminKlient('fond.andel-ring')
    test.skip(!admin, 'E2E_SUPABASE_* mangler')
    const { data: foer, error: lesFeil } = await admin!.from('fond_kontant').select('saldo').eq('id', 1).single()
    if (lesFeil) throw new Error(`Kunne ikke lese kontantsaldo: ${lesFeil.message}`)
    try {
      const { error: settFeil } = await admin!.from('fond_kontant').update({ saldo: 15950 }).eq('id', 1)
      if (settFeil) throw new Error(`Kunne ikke sette kontantsaldo: ${settFeil.message}`)

      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto('/fond')
      // Tallet avhenger av hvem testbrukeren er — vi sjekker formen, ikke verdien.
      await expect(page.getByRole('img', { name: /^Din andel: \d+,\d %$/ })).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
      await page.screenshot({ path: `${UT_DIR}/fond-andel-390.png`, clip: { x: 0, y: 0, width: 390, height: 300 } })
    } finally {
      const { error: tilbakeFeil } = await admin!.from('fond_kontant').update({ saldo: foer.saldo }).eq('id', 1)
      if (tilbakeFeil) throw new Error(`Kunne ikke tilbakestille kontantsaldo: ${tilbakeFeil.message}`)
    }
  })

  test('ny-prikk på Fond-taben forsvinner etter første besøk', async ({ page }) => {
    // Fersk context per test (storageState-fila er uendret), så fond_fane_sett
    // finnes ikke i localStorage — prikken skal vises på agendaen.
    await page.goto('/')
    const fondTab = page.locator('nav a[href="/fond"]')
    await expect(fondTab).toBeVisible()
    await expect(fondTab.locator('span[aria-hidden="true"]')).toBeVisible()
    await page.screenshot({ path: `${UT_DIR}/fond-ny-prikk.png` })

    // Første besøk på /fond markerer fanen som sett
    await fondTab.click()
    await page.waitForURL('**/fond')

    // Tilbake på agendaen skal prikken være borte — og bli borte
    await page.goto('/')
    await expect(fondTab).toBeVisible()
    await expect(fondTab.locator('span[aria-hidden="true"]')).toHaveCount(0)
    await page.screenshot({ path: `${UT_DIR}/fond-prikk-borte.png` })
  })
})
