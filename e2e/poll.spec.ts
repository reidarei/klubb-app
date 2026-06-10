import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { setTestPollId, ryddTestPoll, pollIdFraUrl } from './helpers/rydd-test-poll'
import { loggInn, harTestCreds } from './helpers/auth'

/**
 * Visuell + funksjonell verifisering av poll-funksjonaliteten (#86).
 *
 * Tar screenshot av: agenda (med poll-CTA og evt. PollKort), /poll/ny (skjema),
 * /poll/[id] (stemming + resultat). Oppretter en test-poll og stemmer på den.
 * Rydder opp til slutt ved å slette test-pollen.
 *
 * Screenshots lagres til .screenshots/poll/.
 */

const UT_DIR = path.join('.screenshots', 'poll')

test.describe('Poll-flyt', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md')

  test.beforeAll(() => {
    fs.mkdirSync(UT_DIR, { recursive: true })
  })

  test.afterEach(ryddTestPoll)

  test('oppretter, stemmer på og sletter en test-poll', async ({ page }) => {
    test.setTimeout(120_000)

    await loggInn(page)

    // 1. Agenda før poll — verifiser at "Lag avstemming"-CTA finnes
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(600)
    await page.screenshot({ path: path.join(UT_DIR, '01-agenda-for.png'), fullPage: true })

    const cta = page.getByRole('link', { name: 'Lag avstemming' })
    await expect(cta).toBeVisible()

    // 2. Gå til poll-skjema via CTA
    await cta.click()
    await page.waitForURL('**/poll/ny')
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(UT_DIR, '02-ny-poll-tom.png'), fullPage: true })

    // 3. Fyll ut skjema
    const tidsstempel = Date.now()
    const spoersmaal = `Playwright-test ${tidsstempel}`
    await page.fill('input[placeholder="Hva lurer du på?"]', spoersmaal)

    const altInputs = page.locator('input[placeholder="Alternativ"]')
    await altInputs.nth(0).fill('Ja')
    await altInputs.nth(1).fill('Nei')

    // Legg til et tredje alternativ
    await page.getByRole('button', { name: 'Legg til alternativ' }).click()
    await altInputs.nth(2).fill('Kanskje')

    // Sett flervalg (Segment-komponenten bruker role="tab")
    await page.getByRole('tab', { name: 'Flervalg' }).click()

    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(UT_DIR, '03-ny-poll-utfylt.png'), fullPage: true })

    // 4. Publiser
    await page.getByRole('button', { name: 'Publiser' }).click()
    await page.waitForURL(/\/poll\/[0-9a-f-]+$/, { timeout: 10_000 })
    const pollUrl = page.url()
    setTestPollId(pollIdFraUrl(pollUrl))
    await page.waitForTimeout(600)
    await page.screenshot({ path: path.join(UT_DIR, '04-detalj-ustemt.png'), fullPage: true })

    // 5. Verifiser at spørsmålet vises
    await expect(page.getByRole('heading', { name: spoersmaal })).toBeVisible()

    // 6. Stem (kryss av Ja og Kanskje — flervalg)
    await page.getByRole('button', { name: /Ja/ }).first().click()
    await page.getByRole('button', { name: /Kanskje/ }).first().click()
    await page.waitForTimeout(200)
    await page.screenshot({ path: path.join(UT_DIR, '05-detalj-valgt.png'), fullPage: true })

    await page.getByRole('button', { name: /^Stem$/ }).click()
    await page.waitForTimeout(1200)
    await page.screenshot({ path: path.join(UT_DIR, '06-detalj-etter-stemme.png'), fullPage: true })

    // 7. Tilbake til agenda — PollKort skal vises
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(600)
    await page.screenshot({ path: path.join(UT_DIR, '07-agenda-med-poll.png'), fullPage: true })
    await expect(page.getByRole('link', { name: new RegExp(spoersmaal) })).toBeVisible()

    // Cleanup håndteres av test.afterEach(ryddTestPoll)
  })
})
