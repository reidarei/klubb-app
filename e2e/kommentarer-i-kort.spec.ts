import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { loggInn, harTestCreds } from './helpers/auth'

/**
 * Verifiserer at kommentarer vises inline nederst i hvert arrangement/poll-
 * kort på agenda (ikke som egen seksjon). Tar screenshot før og etter at
 * bruker kollapser en kommentar-seksjon.
 */

const UT_DIR = path.join('.screenshots', 'kommentarer-i-kort')

test.describe('Kommentarer inne i kort', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md')

  test.beforeAll(() => {
    fs.mkdirSync(UT_DIR, { recursive: true })
  })

  test('inline kommentar-seksjon vises på arrangement-kort og kan kollapses', async ({ page }) => {
    test.setTimeout(60_000)

    await loggInn(page)

    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(600)
    await page.screenshot({ path: path.join(UT_DIR, '01-agenda-ekspandert.png'), fullPage: true })

    // Verifiser at minst én kommentar-seksjon finnes, og at tittelen gjenkjennes
    const toggle = page.getByRole('button', { name: /kommentarer$/i }).first()
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
