import { expect, test, type Locator } from '@playwright/test'
import fs from 'node:fs'
import { harTestCreds, loggInn, SEED_PASSORD } from './helpers/auth'

// «Om deg»-seksjonen på /profil (#683). Egne opplysninger var tidligere kun
// lesbare inne i redigeringsskjemaet — nå står de direkte på siden.
//
// Den EKTE regresjonsvakten her er etikettene (alle seks feltene skal alltid
// vises, tomme eller ei) og at verdien ikke kappes. Høydetaket er sekundært:
// se kommentaren ved MAKS_* under.
//
// Begge grenene er dekket, med hver sin innlogging (#683-review): den UTFYLTE
// profilen (E2E Admin) og den TOMME (Petter Prøve). «Tomme felter vises med
// dempet Ikke satt» var et eksplisitt krav i #683, og da seed-profilen ble
// fylt ut for å gi høydevakten en ekte profil å måle, mistet vi den andre
// grenen helt.

const UT_DIR = '.screenshots/profil'

// Høydetak — en RETNINGSLINJE, ikke et krav fra #683. Målet «hold
// Privatmeldinger over folden på iPhone 390×844» ble satt under planleggingen
// av #683; issuet selv nevner ingen piksler. Taket er derfor satt romslig nok
// til å tåle fontmetrikk-forskjeller mellom Windows og CI-containeren og en
// matallergi-tekst som wrapper, men stramt nok til å fange en ekte regresjon
// (f.eks. et bytte til label-over-verdi-formen, som ville lagt på ~100 px).
// Målt på den UTFYLTE seed-profilen (E2E Admin har alle feltene, se seed.sql).
// Målt 2026-09-12 på utfylt seed-profil: seksjon 308 px, hero+seksjon 448 px
// (matallergi-teksten wrapper over to linjer). Takene ligger ~10 % over det.
const MAKS_SEKSJON_PX = 340
const MAKS_HERO_PLUSS_SEKSJON_PX = 480

// Verdi-cellen i en rad: xpath=.. fra etiketten gir rad-diven, og verdien er
// etikettens siste søsken der. Delt av begge grenene under (utfylt/tom).
function verdiFor(seksjon: Locator, label: string): Locator {
  return seksjon.getByText(label, { exact: true }).locator('xpath=..').locator('> div').last()
}

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

    // Scopet til seksjonen: «E-post» finnes også som varsel-kanal-etikett
    // lenger ned på siden (VarslerInnstillinger), «Om deg»-raden er ikke tvetydig.
    const seksjon = page.locator('section', { has: page.getByText('Om deg', { exact: true }) })
    await expect(seksjon.getByText('Visningsnavn', { exact: true })).toBeVisible()
    await expect(seksjon.getByText('Fødselsdato', { exact: true })).toBeVisible()
    await expect(seksjon.getByText('Telefon', { exact: true })).toBeVisible()
    await expect(seksjon.getByText('E-post', { exact: true })).toBeVisible()
    await expect(seksjon.getByText('Matallergier', { exact: true })).toBeVisible()
    await expect(seksjon.getByText('Stikkord', { exact: true })).toBeVisible()

    // Verdien skal ikke kappes (#683-review, BLOCKER): raden hadde
    // white-space: nowrap + text-overflow: ellipsis, så en matallergi-tekst
    // (opptil MATALLERGIER_MAKS_LENGDE = 200 tegn) ble kuttet stille — uten
    // title og uten hover på mobil. scrollWidth > clientWidth er nøyaktig det
    // ellipsis-tilfellet, og passerer trivielt for korte verdier.
    const allergiVerdi = verdiFor(seksjon, 'Matallergier')
    const kappet = await allergiVerdi.evaluate(el => el.scrollWidth > el.clientWidth + 1)
    expect(kappet, 'matallergi-verdien skal wrappe, ikke kappes med ellipsis').toBe(false)

    // boundingBox() dekker IKKE margin (getBoundingClientRect), så bunnen måles
    // mot toppen av neste element (Privatmeldinger-lenken) i stedet for
    // seksjonens egen box.
    const seksjonBox = await seksjon.boundingBox()
    const privatBox = await page.getByRole('link', { name: 'Privatmeldinger' }).boundingBox()
    expect(seksjonBox).not.toBeNull()
    expect(privatBox).not.toBeNull()
    const seksjonMedMargin = privatBox!.y - seksjonBox!.y

    // Hero + seksjon til sammen: fra toppen av hero-KORTET (ikke sideheaderen
    // over det) til toppen av Privatmeldinger — det som faktisk avgjør om
    // lenken er over folden.
    const heroBox = await page.getByTestId('profil-hero').boundingBox()
    expect(heroBox).not.toBeNull()
    const heroPlussSeksjon = privatBox!.y - heroBox!.y

    console.log(`[#683] seksjon: ${Math.round(seksjonMedMargin)} px, hero+seksjon: ${Math.round(heroPlussSeksjon)} px`)
    expect(seksjonMedMargin).toBeLessThanOrEqual(MAKS_SEKSJON_PX)
    expect(heroPlussSeksjon).toBeLessThanOrEqual(MAKS_HERO_PLUSS_SEKSJON_PX)

    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
    await page.screenshot({ path: `${UT_DIR}/profil-om-deg-v2.png` })
  })

  // Den tomme grenen. Vi logger inn som Petter Prøve (seedet uten telefon,
  // matallergier og stikkord) i stedet for å nullstille felter på admin-
  // profilen: seeden deles med golden-path og sider-laster, og en test som
  // muterer og rydder ville kunne etterlate dem en halvtom profil hvis den
  // døde midtveis. Egen, cookie-fri context så admin-sesjonen fra
  // e2e/.auth/state.json ikke gjenbrukes (se e2e/helpers/auth.ts).
  test.describe('profil med tomme felter', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test('viser dempet «Ikke satt» i stedet for en blank celle', async ({ page }) => {
      await loggInn(page, { epost: 'petter.prove@klubb.test', passord: SEED_PASSORD })
      await page.goto('/profil')
      await page.waitForLoadState('networkidle')

      const seksjon = page.locator('section', { has: page.getByText('Om deg', { exact: true }) })

      // Selve raden må være SYNLIG med teksten i — at etiketten finnes i DOM-en
      // beviser ikke at verdi-cellen rendret noe. Feltene her er NULL i seeden;
      // tom-streng-varianten (som `??` slapp gjennom, se __tests__/
      // egne-opplysninger-tom-verdi.test.tsx) kan appens skrivesti ikke
      // produsere, og pinnes derfor på komponentnivå i stedet.
      for (const felt of ['Telefon', 'Matallergier', 'Stikkord']) {
        const verdi = verdiFor(seksjon, felt)
        await expect(verdi, `${felt} skal vises i seksjonen`).toBeVisible()
        await expect(verdi, `${felt} skal stå som «Ikke satt»`).toHaveText('Ikke satt')
      }

      // Dempet, ikke primærfarge: «Ikke satt» skal se ut som et fravær, ikke som
      // noe mannen har skrevet selv. Sammenlignet mot en UTFYLT rad i samme
      // seksjon fremfor en hardkodet rgb — tokenverdien kan endres, kontrasten
      // mellom de to er kravet.
      const tomFarge = await verdiFor(seksjon, 'Telefon').evaluate(el => getComputedStyle(el).color)
      const fyltFarge = await verdiFor(seksjon, 'E-post').evaluate(el => getComputedStyle(el).color)
      expect(tomFarge, '«Ikke satt» skal være dempet, ikke primærfarge').not.toBe(fyltFarge)
    })
  })
})
