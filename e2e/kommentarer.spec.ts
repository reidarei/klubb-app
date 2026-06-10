import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { setTestPollId, ryddTestPoll, pollIdFraUrl } from './helpers/rydd-test-poll'
import { loggInn, harTestCreds } from './helpers/auth'

/**
 * Verifiserer kommentar-funksjonalitet på arrangement + poll og at siste
 * kommentarer dukker opp i agenda-widgeten. Rydder opp ved slutt.
 */

const UT_DIR = path.join('.screenshots', 'kommentarer')

test.describe('Kommentarer på arrangement og poll', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md')

  test.beforeAll(() => {
    fs.mkdirSync(UT_DIR, { recursive: true })
  })

  test.afterEach(ryddTestPoll)

  test('poll: opprett, kommenter, verifiser widget på agenda', async ({ page }) => {
    test.setTimeout(120_000)

    await loggInn(page)

    // Opprett en 2-valgs poll (for å også teste inline-variant)
    await page.goto('/poll/ny')
    await page.waitForLoadState('networkidle')

    const tidsstempel = Date.now()
    const spoersmaal = `Komm-test ${tidsstempel}`
    await page.fill('input[placeholder="Hva lurer du på?"]', spoersmaal)
    const altInputs = page.locator('input[placeholder="Alternativ"]')
    await altInputs.nth(0).fill('Ja')
    await altInputs.nth(1).fill('Nei')

    await page.getByRole('button', { name: 'Publiser' }).click()
    await page.waitForURL(/\/poll\/[0-9a-f-]+$/, { timeout: 10_000 })
    const pollUrl = page.url()
    setTestPollId(pollIdFraUrl(pollUrl))

    // Detaljsiden skal nå vise Kommentarer-seksjon
    await page.waitForTimeout(500)
    await page.screenshot({ path: path.join(UT_DIR, '01-poll-detalj.png'), fullPage: true })
    await expect(page.getByText('Kommentarer').first()).toBeVisible()

    // Post en kommentar
    const kommentar = `Dette er en test ${tidsstempel}`
    await page.fill('input[placeholder="Skriv en melding…"]', kommentar)
    await page.getByRole('button', { name: 'Send melding' }).click()
    await page.waitForTimeout(1500)
    await page.screenshot({ path: path.join(UT_DIR, '02-poll-med-kommentar.png'), fullPage: true })
    await expect(page.getByText(kommentar)).toBeVisible()

    // Sjekk agenda — kommentaren skal vises inline i selve pollkortet
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(600)
    await page.screenshot({ path: path.join(UT_DIR, '03-agenda-inline.png'), fullPage: true })
    await expect(page.getByText(kommentar).first()).toBeVisible()

    // Kommenter-knappen på inline poll-kortet skal finnes
    await expect(page.locator('[aria-label="Kommenter"]').first()).toBeVisible()

    // Cleanup håndteres av test.afterEach(ryddTestPoll). poll_chat-raden
    // cascade-slettes sammen med pollen via FK on delete cascade.
  })
})
