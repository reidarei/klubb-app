import { expect, test, type Locator, type Page } from '@playwright/test'
import fs from 'node:fs'
import { harTestCreds, loggInn, SEED_PASSORD } from './helpers/auth'

// «Om deg»-seksjonen på /profil (#683).
//
// Den egentlige regresjonsvakten er etikettene (alle seks feltene vises alltid)
// og at verdien ikke kappes; høydetaket er sekundært.
// Begge grenene dekkes med hver sin innlogging: UTFYLT profil (E2E Admin) og
// TOM (Petter Prøve) — «Ikke satt» var et eksplisitt krav i #683.

const UT_DIR = '.screenshots/profil'

// Retningslinje, ikke krav: romslig nok for fontmetrikk-forskjeller
// Windows/CI og en matallergi som wrapper, stramt nok til å fange f.eks.
// label-over-verdi-formen (~100 px mer). Rader à 48 px gir ≈ 380 px. Estimert,
// ikke målt — justér etter loggen «[#683] seksjon: N px».
const MAKS_SEKSJON_PX = 460

// Verdi-cellen på /profil (`data-opplysning` på raden i OpplysningRad).
function verdiFor(seksjon: Locator, label: string): Locator {
  return seksjon.locator(`[data-opplysning="${label}"] .opplysning-verdi`)
}

// Skjemaradene (Skjema.tsx) har ingen data-opplysning, så feltet finnes via
// tilgjengelig navn.
function feltFor(seksjon: Locator, label: string): Locator {
  return seksjon.getByLabel(label, { exact: true })
}

// Scoping er ikke valgfri: «E-post» finnes også i VarslerInnstillinger lenger ned.
function omDegSeksjon(page: Page): Locator {
  return page.locator('section', { has: page.getByText('Om deg', { exact: true }) })
}

// Fritekstfeltene med 200 tegns tak — skal wrappe, aldri kappes.
const FRITEKSTFELT = ['Matallergier', 'Stikkord om deg']

test.describe('Profil — egne opplysninger', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md og docs/test-instans.md')

  test.beforeAll(() => {
    fs.mkdirSync(UT_DIR, { recursive: true })
  })

  test('viser «Om deg» med etiketter for alle feltene', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/profil')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('Om deg', { exact: true })).toBeVisible()

    const seksjon = page.locator('section', { has: page.getByText('Om deg', { exact: true }) })
    await expect(seksjon.getByText('Visningsnavn', { exact: true })).toBeVisible()
    await expect(seksjon.getByText('Fødselsdato', { exact: true })).toBeVisible()
    await expect(seksjon.getByText('Telefon', { exact: true })).toBeVisible()
    await expect(seksjon.getByText('E-post', { exact: true })).toBeVisible()
    await expect(seksjon.getByText('Matallergier', { exact: true })).toBeVisible()
    await expect(seksjon.getByText('Stikkord om deg', { exact: true })).toBeVisible()

    // Kun seksjonen (boks + overskrift), ikke hero og boksene over.
    const seksjonBox = await seksjon.boundingBox()
    expect(seksjonBox).not.toBeNull()
    console.log(`[#683] seksjon: ${Math.round(seksjonBox!.height)} px`)
    expect(seksjonBox!.height).toBeLessThanOrEqual(MAKS_SEKSJON_PX)

    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
    await page.screenshot({ path: `${UT_DIR}/profil-om-deg-v2.png` })
  })

  // Kappe-vakten (#683, #685): ellipsis/énlinjet input kuttet en 200-tegns
  // tekst stille, uten hover på mobil. scrollWidth > clientWidth er nøyaktig
  // det tilfellet. Kjøres på begge feltene på begge rutene.
  for (const url of ['/profil', '/profil/rediger']) {
    test(`fritekstverdiene wrapper i stedet for å kappes på ${url}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(url)
      await page.waitForLoadState('networkidle')
      const seksjon = omDegSeksjon(page)

      for (const felt of FRITEKSTFELT) {
        const verdi = url === '/profil' ? verdiFor(seksjon, felt) : feltFor(seksjon, felt)
        await expect(verdi, `${felt} skal finnes på ${url}`).toBeVisible()
        const kappet = await verdi.evaluate(el => el.scrollWidth > el.clientWidth + 1)
        expect(kappet, `${felt} skal wrappe, ikke kappes, på ${url}`).toBe(false)
      }
    })
  }

  // Rekkefølge-vakten (#685): «Rediger» skal oppleves som at de samme radene
  // blir redigerbare. Etikettene leses ut av begge flater og sammenlignes
  // direkte, ikke mot en hardkodet liste — så en ekstra rad på én flate fanges.
  //
  // «Visningsnavn» filtreres bort: alltid i skjemaet, men på /profil kun når
  // den er ulik navnet (#683).
  test('«Om deg» har samme rader i samme rekkefølge på /profil og /profil/rediger', async ({ page }) => {
    async function etiketter(url: string): Promise<string[]> {
      await page.goto(url)
      await page.waitForLoadState('networkidle')
      const seksjon = omDegSeksjon(page)
      // /profil: felles .opplysning-etikett. /profil/rediger: etiketten er første
      // <span> i hver `label.skjema-rad` (SkjemaRad/TekstRad i Skjema.tsx).
      const etikettLocator = url === '/profil'
        ? seksjon.locator('.opplysning-etikett')
        : seksjon.locator('label.skjema-rad > span:first-child')
      await expect(etikettLocator.first()).toBeVisible()
      // DOM-rekkefølge = visuell rekkefølge: én kolonne, ingen `order`/grid.
      const alle = await etikettLocator.allTextContents()
      return alle.map(t => t.trim()).filter(t => t !== 'Visningsnavn')
    }

    const paaProfil = await etiketter('/profil')
    // Sanity: vakten er verdiløs hvis locatoren slutter å finne noe.
    expect(paaProfil.length, 'skal finne etikettene i «Om deg»').toBeGreaterThan(3)
    expect(await etiketter('/profil/rediger')).toEqual(paaProfil)
  })

  // Tilgjengelig navn-vakten (#685): uten det leser en skjermleser «edit,
  // blank». getByLabel() slår opp det tilgjengelige navnet, ikke synlig tekst,
  // så den går rød selv om etiketten fortsatt står på skjermen. SkjemaRad er en
  // <label>, men aria-label trengs fortsatt: uten den blir DatoFelt sin synlige
  // verdi (datoen) en del av navnet, og exact-matchen feiler.
  test('feltene i redigeringsskjemaet har tilgjengelig navn', async ({ page }) => {
    await page.goto('/profil/rediger')
    await page.waitForLoadState('networkidle')

    // Fødselsdato er et DatoFelt: selve <input> er usynlig (opacity 0) oppå
    // verdien, så vi sjekker at den finnes, ikke at den er synlig.
    for (const felt of ['Navn', 'Visningsnavn', 'Telefon', 'Matallergier', 'Stikkord om deg']) {
      await expect(
        page.getByLabel(felt, { exact: true }),
        `${felt} skal ha et tilgjengelig navn`,
      ).toBeVisible()
    }
    await expect(
      page.getByLabel('Fødselsdato', { exact: true }),
      'Fødselsdato skal ha et tilgjengelig navn',
    ).toBeAttached()

    // Rollen beviser at navnet henger på kontrollen, ikke på en container.
    await expect(page.getByRole('textbox', { name: 'Telefon', exact: true })).toBeVisible()
  })

  // Den tomme grenen: Petter Prøve er seedet uten telefon/matallergier/stikkord.
  // Ikke nullstill admin-profilen — den deles med andre specs, og en test som
  // dør midtveis etterlater den halvtom. Cookie-fri context så admin-sesjonen
  // ikke gjenbrukes.
  test.describe('profil med tomme felter', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test('viser dempet «Ikke satt» i stedet for en blank celle', async ({ page }) => {
      await loggInn(page, { epost: 'petter.prove@klubb.test', passord: SEED_PASSORD })
      await page.goto('/profil')
      await page.waitForLoadState('networkidle')

      const seksjon = omDegSeksjon(page)

      // Feltene er NULL i seeden. Tom-streng-varianten kan skrivestien ikke
      // produsere, så den pinnes i __tests__/egne-opplysninger-tom-verdi.test.tsx.
      for (const felt of ['Telefon', 'Matallergier', 'Stikkord om deg']) {
        const verdi = verdiFor(seksjon, felt)
        await expect(verdi, `${felt} skal vises i seksjonen`).toBeVisible()
        await expect(verdi, `${felt} skal stå som «Ikke satt»`).toHaveText('Ikke satt')
      }

      // Dempet: sammenlignet mot en utfylt rad, ikke en hardkodet rgb —
      // kontrasten er kravet, tokenverdien kan endres.
      const tomFarge = await verdiFor(seksjon, 'Telefon').evaluate(el => getComputedStyle(el).color)
      const fyltFarge = await verdiFor(seksjon, 'E-post').evaluate(el => getComputedStyle(el).color)
      expect(tomFarge, '«Ikke satt» skal være dempet, ikke primærfarge').not.toBe(fyltFarge)
    })
  })
})
