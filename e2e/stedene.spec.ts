import { test, expect } from '@playwright/test'
import { harTestCreds } from './helpers/auth'

// /stedene — Europakartet over turer (#508/#514). Dekker de fem punktene fra
// #508: klikk-på-by, klikk-utenfor, lukk/Escape, «x{antall}»-etiketten og
// hull-år-radene i Reiseruta.
//
// Kjøres mot TEST-INSTANSEN, som seed.sql (#514) forsyner med fire turer:
// Lisboa (2015 og 2017 — samme by to ganger for å dekke x2-etiketten),
// Stockholm (2016) og Edinburgh (2019). 2018 er bevisst utelatt: fyllHullAar()
// fyller den inn som hull-år automatisk. Byene er valgt fordi de ligger langt
// fra hverandre i kartprojeksjonen (se kommentar i seed.sql) — markørenes
// 44 px treffområder overlapper derfor aldri, og klikkene i denne speccen er
// trygge uten å måtte sample piksel-for-piksel slik
// e2e/filter-chip-treffomraade.spec.ts må.

test.describe('/stedene — Europakartet (#514)', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md og docs/test-instans.md')

  test.beforeEach(async ({ page }) => {
    await page.goto('/stedene')
    await expect(page.getByRole('heading', { name: 'Vi har vært verden rundt, det vil si' })).toBeVisible()
  })

  test('trykk på en by viser detaljkortet med begge årene', async ({ page }) => {
    // Ingen rute i det hele tatt før noe er valgt — kortet rendres ikke.
    await expect(page.getByTestId('sted-detaljkort')).toHaveCount(0)

    await page.getByRole('button', { name: /^Lisboa, 2 turer$/ }).click()

    await expect(page.getByTestId('sted-detaljkort-navn')).toHaveText('Lisboa')
    const kort = page.getByTestId('sted-detaljkort')
    await expect(kort.getByText('2015')).toBeVisible()
    await expect(kort.getByText('2017')).toBeVisible()
  })

  test('trykk utenfor en markør lukker detaljkortet', async ({ page }) => {
    await page.getByRole('button', { name: /^Lisboa, 2 turer$/ }).click()
    await expect(page.getByTestId('sted-detaljkort-navn')).toBeVisible()

    // Klikk i kartets øvre venstre hjørne — geografisk sett langt nordvest for
    // alle tre seedede byene (se lat/lng-marginene i seed.sql), altså garantert
    // utenfor enhver markørs 44 px treffområde. data-testid på selve
    // kart-containeren (ikke svg[aria-hidden]) — «Lukk»-knappens eget ikon er
    // OGSÅ en aria-hidden svg, så den generiske selectoren var flertydig.
    await page.getByTestId('europa-kart').click({ position: { x: 5, y: 5 } })

    await expect(page.getByTestId('sted-detaljkort')).toHaveCount(0)
  })

  test('lukk-knappen og Escape lukker detaljkortet', async ({ page }) => {
    // Lukk-knapp
    await page.getByRole('button', { name: /^Stockholm, 1 tur$/ }).click()
    await expect(page.getByTestId('sted-detaljkort-navn')).toHaveText('Stockholm')
    await page.getByRole('button', { name: 'Lukk' }).click()
    await expect(page.getByTestId('sted-detaljkort')).toHaveCount(0)

    // Escape
    await page.getByRole('button', { name: /^Edinburgh, 1 tur$/ }).click()
    await expect(page.getByTestId('sted-detaljkort-navn')).toHaveText('Edinburgh')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('sted-detaljkort')).toHaveCount(0)
  })

  test('kart-etiketten viser x{antall} for byer med flere turer', async ({ page }) => {
    // Lisboa har 2 turer (2015 + 2017) — etiketten skal vise «x2».
    // Stockholm/Edinburgh har 1 hver og skal ikke ha noe x-suffiks.
    await expect(page.getByText('x2')).toBeVisible()
    await expect(page.getByText('x1')).toHaveCount(0)
  })

  test('Reiseruta viser en strek-rad for hull-året 2018', async ({ page }) => {
    const hullRad = page.locator('[data-testid="reiserute-hull"][data-aar="2018"]')
    await expect(hullRad).toHaveCount(1)
    // Aria-hidden dash er dekor — sr-only-teksten er det skjermlesere faktisk
    // leser (samme mønster som MiniKalender, se page.tsx-kommentar).
    await expect(hullRad.getByText('ingen tur')).toHaveCount(1)

    // De omkringliggende årene skal IKKE være hull-rader.
    await expect(page.locator('[data-testid="reiserute-rad"][data-aar="2016"]')).toHaveCount(1)
    await expect(page.locator('[data-testid="reiserute-rad"][data-aar="2019"]')).toHaveCount(1)
  })
})
