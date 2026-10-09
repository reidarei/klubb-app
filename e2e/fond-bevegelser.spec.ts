import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import { harTestCreds } from './helpers/auth'

// Accordion på innskyter-radene på /fond (#543).
//
// Seed (supabase/seed.sql): Petter (9800…050) har hele detaljpakken, Ola
// (9800…055) har andel UTEN detaljer og skal ikke være utvidbar. e2e-admin er
// bevisst utenfor — hans andel skal forbli 0 kr (profil-fond-andel.spec.ts).
// e2e-brukeren er admin, så /fond er tilgjengelig uavhengig av fond_fane.

const UT_DIR = '.screenshots/fond'

// Seeden bruker current_date, så etikettene følger inneværende år.
const AAR = new Date().getFullYear()

// toLocaleString('nb') bruker hardt mellomrom (U+00A0/U+202F) som tusenskille;
// \s treffer begge, en literal med vanlig mellomrom ville aldri matchet.
// Metategn escapes FØR mellomrom oversettes — rå «+» gir «Nothing to repeat».
const belop = (s: string) =>
  new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s*'))

// Ikke filtrert på expanded-tilstand: et `{ expanded: false }`-filter slutter å
// matche i det raden åpnes, og lukke-klikket feiler som «manglende knapp».
const innskyter = (page: import('@playwright/test').Page, navn: string) =>
  page.getByRole('button').filter({ hasText: navn })

test.describe('Fond — bevegelser per innskyter', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md og docs/test-instans.md')

  test.beforeAll(() => {
    fs.mkdirSync(UT_DIR, { recursive: true })
  })

  test('trykk på innskyter utvider raden og viser hver bevegelse', async ({ page }) => {
    await page.goto('/fond')
    await page.waitForLoadState('networkidle')

    // Ankret på <button> + aria-expanded, ikke CSS-klasse: det er kontrakten
    // mot skjermlesere.
    const rad = innskyter(page, 'Petter')
    await expect(rad).toBeVisible()
    await expect(rad).toHaveAttribute('aria-expanded', 'false')

    const panelId = await rad.getAttribute('aria-controls')
    expect(panelId).toBeTruthy()

    // toHaveCount(0), ikke «skjult»: panelet rendres betinget, så en
    // «usynlig men til stede»-bug fanges.
    await expect(page.getByText(`Oppspart t.o.m. ${AAR - 1}`)).toHaveCount(0)

    await rad.click()
    await expect(rad).toHaveAttribute('aria-expanded', 'true')

    // Attributt-selektor framfor «#id»: useId-id-er er ikke gyldige CSS-id-er
    // uten escaping, og CSS.escape finnes ikke i Playwrights Node-prosess.
    const panel = page.locator(`[id="${panelId}"]`)
    await expect(panel).toBeVisible()

    await expect(panel.getByText(`Oppspart t.o.m. ${AAR - 1}`)).toBeVisible()
    await expect(panel.getByText(`Renter ${AAR - 1} (din andel)`)).toBeVisible()

    // To bevegelser på samme dato skal stå som TO linjer, ikke nettes til én.
    await expect(panel.getByText(belop('+500,00 kr'))).toHaveCount(2)
    await expect(panel.getByText(belop('+4 500,00 kr'))).toBeVisible()
    // Uttaket: minus-tegn (U+2212), ikke bindestrek
    await expect(panel.getByText(belop('−2 000,00 kr'))).toBeVisible()
    // exact: skal ikke treffe «(din andel)».
    await expect(panel.getByText('Andel', { exact: true })).toBeVisible()
    await expect(panel.getByText(belop('12 950,00 kr'))).toBeVisible()

    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
    await page.screenshot({ path: `${UT_DIR}/fond-bevegelser-apen.png`, fullPage: true })

    await rad.click()
    await expect(rad).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByText(`Oppspart t.o.m. ${AAR - 1}`)).toHaveCount(0)
  })

  test('innskyter uten detaljdata er ikke utvidbar', async ({ page }) => {
    // Ola har andel uten fjorårstall og bevegelser, som et eldre API-svar (S4).
    // Raden vises, men er ikke knapp: en accordion som åpner ingenting er verre
    // enn ingen.
    await page.goto('/fond')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('Tilhører innskytere')).toBeVisible()

    await expect(page.getByText('Ola', { exact: true })).toBeVisible()
    await expect(innskyter(page, 'Ola')).toHaveCount(0)

    // Kontroll: uten denne ville testen vært grønn om accordionen var borte for alle.
    await expect(innskyter(page, 'Petter')).toHaveCount(1)
  })
})
