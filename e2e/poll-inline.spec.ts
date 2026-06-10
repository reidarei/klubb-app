import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { setTestPollId, ryddTestPoll, pollIdFraUrl } from './helpers/rydd-test-poll'
import { loggInn, harTestCreds } from './helpers/auth'

/**
 * Verifiserer inline-stemming på agenda-kortet for poll med ≤ MAKS_INLINE_VALG
 * alternativer. Oppretter 2-valgs poll, tar screenshot av agenda før og etter
 * stemming, rydder opp til slutt.
 */

const UT_DIR = path.join('.screenshots', 'poll-inline')

test.describe('Inline-stemming på agenda', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md')

  test.beforeAll(() => {
    fs.mkdirSync(UT_DIR, { recursive: true })
  })

  test.afterEach(ryddTestPoll)

  test('2-valgs poll vises med inline stemmeknapper', async ({ page }) => {
    test.setTimeout(120_000)

    await loggInn(page)

    // Opprett en 2-valgs enkelpoll (faller innenfor MAKS_INLINE_VALG=2)
    await page.goto('/poll/ny')
    await page.waitForLoadState('networkidle')

    const tidsstempel = Date.now()
    const spoersmaal = `Inline-test ${tidsstempel}`
    await page.fill('input[placeholder="Hva lurer du på?"]', spoersmaal)

    const altInputs = page.locator('input[placeholder="Alternativ"]')
    await altInputs.nth(0).fill('Ja')
    await altInputs.nth(1).fill('Nei')

    await page.getByRole('button', { name: 'Publiser' }).click()
    await page.waitForURL(/\/poll\/[0-9a-f-]+$/, { timeout: 10_000 })
    const pollUrl = page.url()
    setTestPollId(pollIdFraUrl(pollUrl))

    // Gå til agenda og verifiser inline-kortet
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(600)
    await page.screenshot({ path: path.join(UT_DIR, '01-agenda-inline-ustemt.png'), fullPage: true })

    // Begge knappene skal være synlige inline (rolle: button i kortet)
    const kort = page.locator(`a[href="${new URL(pollUrl).pathname}"]`)
    await expect(kort).toBeVisible()
    const jaBtn = kort.getByRole('button', { name: 'Ja' })
    const neiBtn = kort.getByRole('button', { name: 'Nei' })
    await expect(jaBtn).toBeVisible()
    await expect(neiBtn).toBeVisible()

    // Stem inline — klikk Ja. Etter stemme flipper kortet til resultat-
    // visning (stolper + Endre svar-knapp).
    await jaBtn.click()
    await page.waitForTimeout(1500)
    await page.screenshot({ path: path.join(UT_DIR, '02-agenda-inline-stemt-ja.png'), fullPage: true })

    // Skift stemme — trykk Endre svar først for å få tilbake knappene,
    // deretter klikk Nei.
    await kort.getByRole('button', { name: 'Endre svar' }).click()
    await page.waitForTimeout(300)
    const neiBtnIgjen = kort.getByRole('button', { name: 'Nei' })
    await expect(neiBtnIgjen).toBeVisible()
    await neiBtnIgjen.click()
    await page.waitForTimeout(1500)
    await page.screenshot({ path: path.join(UT_DIR, '03-agenda-inline-byttet-nei.png'), fullPage: true })

    // Cleanup håndteres av test.afterEach(ryddTestPoll)
  })
})
