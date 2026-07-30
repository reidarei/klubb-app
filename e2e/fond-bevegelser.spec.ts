import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import { harTestCreds } from './helpers/auth'

// Accordion på innskyter-radene på /fond (#543).
//
// Adferdsvakt, ikke skjermbilde-spec: den verifiserer at raden faktisk kan
// trykkes, at panelet åpner seg, og at oppdelingen som vises stemmer.
//
// Seed-data i supabase/seed.sql: Petter (9800…050) har hele detaljpakken,
// Ola (9800…055) har en andel UTEN detaljer og skal ikke være utvidbar.
// e2e-admin er bevisst utenfor — hans andel skal forbli 0 kr, jf.
// profil-fond-andel.spec.ts. e2e-brukeren er admin, så /fond er tilgjengelig
// uavhengig av fond_fane-bryteren.

const UT_DIR = '.screenshots/fond'

// Året bevegelsene ligger i. Seeden bruker current_date, så etikettene følger
// samme år — regnes ut her på samme måte i stedet for å hardkodes.
const AAR = new Date().getFullYear()

// Beløpene formateres med toLocaleString('nb'), som bruker hardt mellomrom
// (U+00A0/U+202F) som tusenskille — ikke vanlig space. Regex med \s treffer
// begge; en literal streng med vanlig mellomrom ville ikke matchet i det hele
// tatt, og feilen ville sett ut som «beløpet vises ikke».
// Metategn escapes FØR mellomrom oversettes: «+500 kr» rått i en RegExp gir
// «Nothing to repeat», fordi + er en kvantifikator.
const belop = (s: string) =>
  new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s*'))

// Stabil locator: IKKE filtrert på expanded-tilstand. Et `{ expanded: false }`
// -filter slutter å matche i det raden åpnes, og da feiler både getAttribute og
// et påfølgende lukke-klikk på noe som ser ut som en manglende knapp.
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

    // Raden er en ekte <button> med aria-expanded — det er kontrakten mot
    // skjermlesere, og derfor det vi anker på i stedet for en CSS-klasse.
    const rad = innskyter(page, 'Petter')
    await expect(rad).toBeVisible()
    await expect(rad).toHaveAttribute('aria-expanded', 'false')

    // Hentes FØR klikket: useId er stabil, og vi trenger ikke en åpen rad for
    // å lese attributtet.
    const panelId = await rad.getAttribute('aria-controls')
    expect(panelId).toBeTruthy()

    // Lukket: detaljlinjene skal ikke finnes i DOM-en ennå (panelet rendres
    // betinget, ikke bare skjules — så en «usynlig men til stede»-bug fanges).
    await expect(page.getByText(`Oppspart t.o.m. ${AAR - 1}`)).toHaveCount(0)

    await rad.click()
    await expect(rad).toHaveAttribute('aria-expanded', 'true')

    // Attributt-selektor framfor «#id»: useId genererer id-er med tegn som «r0»
    // som ikke er gyldige i en CSS-id-selektor uten escaping, og CSS.escape
    // finnes ikke i Playwrights Node-prosess.
    const panel = page.locator(`[id="${panelId}"]`)
    await expect(panel).toBeVisible()

    await expect(panel.getByText(`Oppspart t.o.m. ${AAR - 1}`)).toBeVisible()
    await expect(panel.getByText(`Renter ${AAR - 1} (din andel)`)).toBeVisible()

    // To bevegelser på samme dato skal stå som TO linjer, ikke nettes til én.
    await expect(panel.getByText(belop('+500 kr'))).toHaveCount(2)
    await expect(panel.getByText(belop('+4 500 kr'))).toBeVisible()
    // Uttaket: minus-tegn (U+2212), ikke bindestrek
    await expect(panel.getByText(belop('−2 000 kr'))).toBeVisible()
    // exact for å ikke treffe «(din andel)» — som riktignok har liten a, men
    // exact gjør intensjonen tydelig framfor å hvile på store/små bokstaver.
    await expect(panel.getByText('Andel', { exact: true })).toBeVisible()
    await expect(panel.getByText(belop('12 950 kr'))).toBeVisible()

    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
    await page.screenshot({ path: `${UT_DIR}/fond-bevegelser-apen.png`, fullPage: true })

    // Kan lukkes igjen
    await rad.click()
    await expect(rad).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByText(`Oppspart t.o.m. ${AAR - 1}`)).toHaveCount(0)
  })

  test('innskyter uten detaljdata er ikke utvidbar', async ({ page }) => {
    // Ola er seedet med andel men uten fjorårstall og uten bevegelser — slik en
    // rad ser ut når den kommer fra et eldre API-svar (S4). Raden skal vises,
    // men ikke være en knapp: en accordion som åpner ingenting er verre enn
    // ingen accordion.
    await page.goto('/fond')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('Tilhører innskytere')).toBeVisible()

    // Navnet er der …
    await expect(page.getByText('Ola', { exact: true })).toBeVisible()
    // … men ikke som knapp, altså ingen accordion.
    await expect(innskyter(page, 'Ola')).toHaveCount(0)

    // Kontrollen: Petter i samme liste ER en knapp. Uten denne ville testen
    // også vært grønn hvis accordionen var borte for alle.
    await expect(innskyter(page, 'Petter')).toHaveCount(1)
  })
})
