import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { setTestPollId, ryddTestPoll, pollIdFraUrl } from './helpers/rydd-test-poll'
import { harTestCreds } from './helpers/auth'

const UT_DIR = path.join('.screenshots', 'edit-kommentar')

test.describe('Redigere egne meldinger inline', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md')

  test.beforeAll(() => {
    fs.mkdirSync(UT_DIR, { recursive: true })
  })

  test.afterEach(ryddTestPoll)

  test('redigerer egen kommentar via picker', async ({ page }) => {
    test.setTimeout(120_000)

    // Opprett en poll og poste en kommentar som vi kan redigere
    await page.goto('/poll/ny')
    await page.waitForLoadState('networkidle')

    const ts = Date.now()
    await page.fill('input[placeholder="Hva lurer du på?"]', `Edit-test ${ts}`)
    const alts = page.locator('input[placeholder="Alternativ"]')
    await alts.nth(0).fill('A')
    await alts.nth(1).fill('B')
    await page.getByRole('button', { name: 'Publiser' }).click()
    // 30s: opprettPoll await-er push+epost-varsler til alle medlemmer før redirect — se #381
    await page.waitForURL(/\/poll\/[0-9a-f-]+$/, { timeout: 30_000 })
    const pollUrl = page.url()
    setTestPollId(pollIdFraUrl(pollUrl))

    const original = `Opprinnelig tekst ${ts}`
    await page.fill('input[placeholder="Skriv en melding…"]', original)
    await page.getByRole('button', { name: 'Send melding' }).click()
    await page.waitForTimeout(1200)
    await page.screenshot({ path: path.join(UT_DIR, '01-posted.png'), fullPage: true })
    await expect(page.getByText(original)).toBeVisible()

    // Reload før picker-gesten: pickeren åpner kun for BEKREFTEDE meldinger
    // (temp-id-er ignoreres i ChatMeldingRad), og temp→bekreftet-byttet
    // avhenger av realtime — som kan være treg rett etter container-restart.
    // Etter reload rendres meldingen bekreftet fra serveren, deterministisk.
    // Denne specen tester redigering, ikke realtime. Se #386.
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(original)).toBeVisible()

    // Trigger picker via høyreklikk (desktop-ekvivalent til long-press).
    // toPass-retry: realtime-oppdateringen kan re-rendre boblen akkurat idet
    // vi høyreklikker, og da åpner pickeren aldri — gjenta hele gesten til
    // Rediger-knappen faktisk er synlig i stedet for å vente på en knapp
    // som aldri kommer. Se #386 (suite-flake).
    const boble = page.getByText(original).first()
    const redigerKnapp = page.getByRole('button', { name: 'Rediger melding' })
    await expect(async () => {
      await boble.click({ button: 'right' })
      await expect(redigerKnapp).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 20_000 })
    await page.screenshot({ path: path.join(UT_DIR, '02-picker.png'), fullPage: true })

    // Klikk Rediger
    await redigerKnapp.click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(UT_DIR, '03-edit-mode.png'), fullPage: true })

    // Endre tekst og lagre
    const endret = `Endret tekst ${ts}`
    const textarea = page.locator('textarea').first()
    await textarea.fill(endret)
    await page.getByRole('button', { name: /^Lagre/ }).click()
    await page.waitForTimeout(1200)
    await page.screenshot({ path: path.join(UT_DIR, '04-etter-lagre.png'), fullPage: true })

    await expect(page.getByText(endret)).toBeVisible()
    await expect(page.getByText(original)).not.toBeVisible()

    // Cleanup håndteres av test.afterEach(ryddTestPoll)
  })
})
