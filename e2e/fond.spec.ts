import { test } from '@playwright/test'
import fs from 'node:fs'
import { harTestCreds } from './helpers/auth'

// Fond-fane skjermbilde-spec (#443).
// Kjøres mot test-instansen (playwright.config.ts peker aldri mot prod).
// Tar dark + light screenshot av /fond i tom tilstand (ingen DB-data fra seed).

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
})
