import { test, expect } from '@playwright/test'
import { harTestCreds } from './helpers/auth'

/**
 * Golden-path e2e: verifiser at en bruker kan klikke "Ja" på et
 * kommende arrangement og at valget holder seg etter reload.
 *
 * Kun UI-tilstand sjekkes — ingen varsel_logg-spørringer mot DB.
 * Skipper hvis TEST_EPOST/TEST_PASSORD mangler (se e2e/README.md).
 */

test.describe('Golden path — påmelding', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md')

  test('login → finn kommende arrangement → skift Nei → Ja → verifiser', async ({ page }) => {
    test.setTimeout(60_000)

    // Gå til agenda — første side etter login
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Finn første kommende arrangement-lenke på agendaen.
    // Appen grupperer i "Kommende" seksjonen — vi leter etter et arrangement-kort.
    // Ekskluder /ny og /rediger fordi UtkastKort lenker til /arrangementer/ny?...
    // og disse ikke er detalj-URL-er (arrangementer bruker UUID-slug).
    const arrangeLink = page
      .locator('a[href^="/arrangementer/"]:not([href*="/ny"]):not([href*="/rediger"])')
      .first()
    await expect(arrangeLink).toBeVisible({ timeout: 10_000 })
    // Klikk øvre venstre hjørne, ikke midten: kortets midtpunkt kan lande i
    // den inline kommentar-seksjonen, som bevisst stopper klikk-propagering
    // (så man kan skrive uten å navigere) — da uteblir navigasjonen. Se #386.
    await arrangeLink.click({ position: { x: 24, y: 24 } })
    // waitForURL, ikke waitForLoadState: networkidle kan resolve FØR
    // klient-navigasjonen starter (Next.js soft navigation), og da leser
    // vi fortsatt '/' fra page.url(). Se #381.
    await page.waitForURL(/\/arrangementer\/[0-9a-f-]+/, { timeout: 15_000 })

    const arrangementUrl = page.url()
    expect(arrangementUrl).toMatch(/\/arrangementer\/[0-9a-f-]+/)

    // Test begge retninger av oppdaterPaamelding uansett starttilstand:
    // Nei først, verifiser etter reload, deretter Ja og verifiser. Uten dette
    // degenererer testen til null-regresjonsdetektor når brukeren allerede har
    // svart Ja (jf. reviewer-funn — idempotens-fella).
    //
    // Vi bruker stabile data-hooks (data-status, data-aktiv, data-testid) i
    // stedet for label-tekst — sistnevnte kan endres uten at logikken brekker.
    // RsvpBlokk viser i "valgt"-modus et sammendragspanel med Endre-knapp; da
    // må vi klikke Endre først for å få tilgang til valg-knappene.

    async function aapneRedigering() {
      const endreKnapp = page.getByTestId('rsvp-endre')
      const valgKnapp = page.locator('button[data-status]').first()
      // Vent til RSVP-blokka faktisk er hydrert — enten sammendrag (Endre)
      // eller åpne valg-knapper. isVisible() alene svarer umiddelbart og
      // racer mot hydrering (så vi hoppet feilaktig over Endre-klikket). #381
      await expect(endreKnapp.or(valgKnapp)).toBeVisible({ timeout: 10_000 })
      if (await endreKnapp.isVisible()) {
        await endreKnapp.click()
      }
    }

    async function velg(status: 'ja' | 'nei' | 'kanskje') {
      // toPass-retry rundt HELE interaksjonen: den optimistiske RSVP-
      // oppdateringen kan re-rendre knappene akkurat idet vi klikker, og da
      // forsvinner klikket uten effekt. Gjenta valg + verifisering til
      // data-svar faktisk stemmer. Se #386 (suite-flake).
      await expect(async () => {
        await aapneRedigering()
        const knapp = page.locator(`button[data-status="${status}"]`)
        await expect(knapp).toBeVisible({ timeout: 8_000 })
        // VENT PÅ SERVER-RUNDTUREN, ikke bare optimistisk UI: data-svar
        // oppdateres umiddelbart klient-side, men server-actionen ligger i
        // transition-kø — en reload før POST-en har gått ut KANSELLERER den,
        // og svaret blir aldri lagret (trace-verifisert rotårsak, #386).
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
      // Etter valg vises Endre-knappen med data-svar=<status>. Auto-retry-
      // assertion venter uten sleep. 15s (ikke default 5s): server action +
      // revalidatePath + re-render tar tidvis lengre enn 5s mot dev-server
      // og test-instans over LAN — dette var suite-flake-kilden. Se #386.
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
