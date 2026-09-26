import { expect, test } from '@playwright/test'
import { harTestCreds } from './helpers/auth'
import { adminKlient } from './helpers/admin-klient'

/**
 * Møtemodus (#780) — samme mekanikk som reisemodus (#723, #724), egen
 * utløser (arrangement av type «møte», vindu møtestart → kl. 06 dagen
 * etter, møtets eget slutt_tidspunkt ignoreres). Se e2e/reisemodus.spec.ts
 * for den fulle begrunnelsen for mønsteret denne specen speiler — den er
 * IKKE gjentatt her.
 *
 * Dekker logikk, ruter og redirect fra «/» per Policy: Visuell verifikasjon
 * — IKKE safe-area-regnestykket eller togglens eksakte geometri, som kun kan
 * sjekkes på fysisk iPhone.
 *
 * Møtet seedes UTEN sluttid (start 1 min siden) — møtemodus-vinduet styres av
 * MOETEMODUS_SLUTT_KLOKKE (kl. 06 dagen etter startdatoen), ikke av
 * arrangementets egen sluttid, så et møte helt uten sluttid er det normale
 * tilfellet, ikke et spesialtilfelle.
 */

const PETTER = '00000000-0000-4000-8000-000000000002'
const MERKE = 'Playwright moetemodus'

let arrangementId: string | null = null
let noenTestFeilet = false

test.describe('møtemodus (#780)', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md')

  test.beforeAll(async () => {
    const admin = adminKlient('moetemodus')
    if (!admin) return

    const { data: arr, error: arrFeil } = await admin
      .from('arrangementer')
      .insert({
        type: 'moete',
        tittel: `${MERKE} — pågår`,
        start_tidspunkt: new Date(Date.now() - 60 * 1000).toISOString(),
        opprettet_av: PETTER,
      })
      .select('id')
      .single()
    if (arrFeil) throw new Error(`Kunne ikke seede arrangement: ${arrFeil.message}`)
    arrangementId = arr.id

    // Kill-switch — landes AV i migrasjon 153. Skrus PÅ kun for denne specen.
    const { error: flaggFeil } = await admin
      .from('app_innstillinger')
      .upsert(
        { noekkel: 'moetemodus', aktiv: true, beskrivelse: 'Vis møtemodus (fullskjerm kart) fra møtestart til kl. 06 dagen etter' },
        { onConflict: 'noekkel' },
      )
    if (flaggFeil) throw new Error(`Kunne ikke skru på møtemodus-flagget: ${flaggFeil.message}`)
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) noenTestFeilet = true
  })

  // Ubetinget rydding — samme begrunnelse som reisemodus.spec.ts: et lekket
  // påslått flagg sender alt annet som besøker «/» til kartet.
  test.afterAll(async () => {
    const admin = adminKlient('moetemodus')
    if (!admin) return

    const { error: flaggFeil } = await admin
      .from('app_innstillinger')
      .update({ aktiv: false })
      .eq('noekkel', 'moetemodus')
    if (flaggFeil) {
      throw new Error(`Kunne ikke skru av møtemodus-flagget: ${flaggFeil.message}`)
    }

    if (!arrangementId) return
    const { error: ryddefeil } = await admin.from('arrangementer').delete().eq('id', arrangementId)
    if (ryddefeil) {
      console.error(`[moetemodus] opprydding feilet: ${ryddefeil.message}`)
      if (!noenTestFeilet) throw new Error(`Kunne ikke rydde arrangement: ${ryddefeil.message}`)
    }
  })

  test('«/» omdirigerer til «/kart», headeren er borte og baren sier «Møtemodus»', async ({ page }) => {
    await page.goto('/')
    await page.waitForURL('**/kart', { timeout: 15_000 })
    await expect(page.getByTestId('posisjonskart')).toBeVisible()

    await expect(page.getByLabel('Hovednavigasjon')).toHaveCount(0)
    await expect(page.getByTestId('reisemodus-bar')).toBeVisible()
    await expect(page.getByTestId('reisemodus-tittel')).toHaveText('Møtemodus')
    await expect(page.getByTestId('reisemodus-toggle')).toBeVisible()
  })

  test('toggle av på /kart tar deg til «/», headeren er tilbake', async ({ page }) => {
    await page.goto('/kart')
    await expect(page.getByTestId('reisemodus-toggle')).toBeVisible({ timeout: 15_000 })

    await page.getByTestId('reisemodus-toggle').click()
    await page.waitForURL('**/', { timeout: 15_000 })

    await expect(page.getByLabel('Hovednavigasjon')).toBeVisible()
    // Toggelen står fortsatt i headeren (tilgjengelig, men slått av).
    await expect(page.getByTestId('reisemodus-toggle')).toBeVisible()

    // Slår PÅ igjen — går til /kart, samme som reisemodus.
    await page.getByTestId('reisemodus-toggle').click()
    await page.waitForURL('**/kart', { timeout: 15_000 })
    await expect(page.getByTestId('reisemodus-bar')).toBeVisible()
  })
})
