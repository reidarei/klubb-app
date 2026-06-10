import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { loggInn, harTestCreds } from './helpers/auth'

const UT_DIR = path.join('.screenshots', 'inline-kommentar-input')

test.describe('Inline kommentar-input på agenda (#89)', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md')

  test.beforeAll(() => {
    fs.mkdirSync(UT_DIR, { recursive: true })
  })

  test('kommenter direkte på agenda-kort, ikke-knapp-variant', async ({ page }) => {
    test.setTimeout(60_000)

    await loggInn(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(600)
    await page.screenshot({ path: path.join(UT_DIR, '01-agenda.png'), fullPage: true })

    // Den gamle 'Kommenter'-knappen skal ikke finnes lenger
    const kommenterKnapp = page.locator('[aria-label="Kommenter"]')
    await expect(kommenterKnapp).toHaveCount(0)

    // Minst ett inline kommentar-input-felt skal finnes
    const input = page.locator('input[placeholder="Skriv en kommentar…"]').first()
    await expect(input).toBeVisible()
  })
})
