import { test, expect } from '@playwright/test'
import { harTestCreds } from './helpers/auth'

/**
 * Golden-path e2e: påmelding på et kommende arrangement holder seg etter reload.
 * Kun UI-tilstand sjekkes — ingen varsel_logg-spørringer mot DB.
 */

test.describe('Golden path — påmelding', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md')

  test('login → finn kommende arrangement → skift Nei → Ja → verifiser', async ({ page }) => {
    test.setTimeout(60_000)

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Ekskluder /ny og /rediger: UtkastKort lenker til /arrangementer/ny?…,
    // som ikke er en detalj-URL.
    const arrangeLink = page
      .locator('a[href^="/arrangementer/"]:not([href*="/ny"]):not([href*="/rediger"])')
      .first()
    await expect(arrangeLink).toBeVisible({ timeout: 10_000 })
    // Klikk øvre venstre hjørne, ikke midten: midtpunktet kan lande i den
    // inline kommentar-seksjonen, som stopper klikk-propagering (#386).
    await arrangeLink.click({ position: { x: 24, y: 24 } })
    // waitForURL, ikke networkidle: den kan resolve før Next sin soft
    // navigation starter, og page.url() er fortsatt '/' (#381).
    await page.waitForURL(/\/arrangementer\/[0-9a-f-]+/, { timeout: 15_000 })

    const arrangementUrl = page.url()
    expect(arrangementUrl).toMatch(/\/arrangementer\/[0-9a-f-]+/)

    // Nei først, så Ja: uten begge retninger tester ingenting hvis brukeren
    // allerede har svart Ja fra før.
    //
    // RsvpBlokk viser i «valgt»-modus et sammendrag med Endre-knapp som må
    // klikkes før valg-knappene er tilgjengelige.

    async function aapneRedigering() {
      const endreKnapp = page.getByTestId('rsvp-endre')
      const valgKnapp = page.locator('button[data-status]').first()
      // Vent på hydrering først: isVisible() alene svarer umiddelbart og
      // racer mot den, så Endre-klikket ble feilaktig hoppet over (#381).
      await expect(endreKnapp.or(valgKnapp)).toBeVisible({ timeout: 10_000 })
      if (await endreKnapp.isVisible()) {
        await endreKnapp.click()
      }
    }

    async function velg(status: 'ja' | 'nei' | 'kanskje') {
      // toPass rundt HELE interaksjonen: den optimistiske oppdateringen kan
      // re-rendre knappene idet vi klikker, og klikket forsvinner (#386).
      await expect(async () => {
        await aapneRedigering()
        const knapp = page.locator(`button[data-status="${status}"]`)
        await expect(knapp).toBeVisible({ timeout: 8_000 })
        // Vent på server-rundturen, ikke bare optimistisk UI: en reload før
        // POST-en har gått ut kansellerer actionen, og svaret lagres aldri (#386).
        const actionRespons = page.waitForResponse(
          r => r.request().method() === 'POST' && /\/arrangementer\//.test(r.url()),
          { timeout: 15_000 },
        )
        await knapp.click()
        await actionRespons
        await expect(page.getByTestId('rsvp-endre')).toHaveAttribute('data-svar', status, {
          timeout: 5_000,
        })
      }).toPass({ timeout: 45_000 })
    }

    async function verifiserAktivt(status: 'ja' | 'nei' | 'kanskje') {
      // 15 s, ikke default 5: action + revalidatePath + re-render tar tidvis
      // lengre mot dev-server og test-instans over LAN (#386).
      await expect(page.getByTestId('rsvp-endre')).toHaveAttribute('data-svar', status, {
        timeout: 15_000,
      })
    }

    await velg('nei')
    await verifiserAktivt('nei')

    await page.reload()
    await page.waitForLoadState('networkidle')
    await verifiserAktivt('nei')

    await velg('ja')
    await verifiserAktivt('ja')

    await page.reload()
    await page.waitForLoadState('networkidle')
    await verifiserAktivt('ja')
  })
})
