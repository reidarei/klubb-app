import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { setTestPollId, ryddTestPoll, pollIdFraUrl } from './helpers/rydd-test-poll'
import { loggInn, harTestCreds } from './helpers/auth'

const UT_DIR = path.join('.screenshots', 'poll-resultat')

test.describe('Resultat etter stemme (#88)', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md')

  test.beforeAll(() => {
    fs.mkdirSync(UT_DIR, { recursive: true })
  })

  // Cleanup kjører uansett om testen passer eller feiler — forhindrer at
  // orphan-poller blir liggende i DB når en assertion feiler midtveis.
  test.afterEach(ryddTestPoll)

  test('inline agenda: resultat vises etter stemme, Endre svar bringer tilbake knapper', async ({ page }) => {
    test.setTimeout(120_000)

    await loggInn(page)

    // Opprett 2-valgs poll for inline
    await page.goto('/poll/ny')
    await page.waitForLoadState('networkidle')
    const ts = Date.now()
    await page.fill('input[placeholder="Hva lurer du på?"]', `Res-test ${ts}`)
    const alts = page.locator('input[placeholder="Alternativ"]')
    await alts.nth(0).fill('Ja')
    await alts.nth(1).fill('Nei')
    await page.getByRole('button', { name: 'Publiser' }).click()
    await page.waitForURL(/\/poll\/[0-9a-f-]+$/, { timeout: 10_000 })
    const pollUrl = page.url()
    setTestPollId(pollIdFraUrl(pollUrl))

    // På detaljsiden: stem «Ja» for å få en stemme
    await page.getByRole('button', { name: 'Ja' }).first().click()
    await page.getByRole('button', { name: /^Stem$/ }).click()
    await page.waitForTimeout(1500)

    // Detaljsiden skal nå vise Resultat primært + Endre svar-knapp
    await page.screenshot({ path: path.join(UT_DIR, '01-detalj-etter-stemme.png'), fullPage: true })
    await expect(page.getByText('Resultat').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Endre svar' })).toBeVisible()

    // Agenda — inline kortet skal nå vise stolper etter stemme
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(600)
    await page.screenshot({ path: path.join(UT_DIR, '02-agenda-etter-stemme.png'), fullPage: true })
    // Stolper → 100% synlig på Ja
    await expect(page.getByText('100%').first()).toBeVisible()
    // «Endre svar» finnes på kortet
    await expect(page.getByRole('button', { name: 'Endre svar' }).first()).toBeVisible()

    // Klikk Endre svar på vårt test-pollkort — knappene skal dukke opp igjen.
    // Targeter kortet via link-href for å unngå å treffe andre polls.
    const pollPath = new URL(pollUrl).pathname
    const mittKort = page.locator(`a[href="${pollPath}"]`).first()
    await mittKort.getByRole('button', { name: 'Endre svar' }).click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(UT_DIR, '03-agenda-etter-endre-svar.png'), fullPage: true })
    await expect(mittKort.getByRole('button', { name: 'Ja' })).toBeVisible()
    // Cleanup håndteres av test.afterEach(ryddTestPoll)
  })
})
