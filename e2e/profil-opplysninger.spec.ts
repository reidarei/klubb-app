import { expect, test, type Locator, type Page } from '@playwright/test'
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

// Verdi-cellen i en rad. `data-opplysning` står på rad-diven i
// OpplysningRad, og `.opplysning-verdi` på selve verdien — en <div> på
// /profil, et <textarea>/<input> i skjemaet. Samme locator treffer begge, så
// vaktene under kan kjøre på begge rutene uten å kjenne DOM-formen.
function verdiFor(seksjon: Locator, label: string): Locator {
  return seksjon.locator(`[data-opplysning="${label}"] .opplysning-verdi`)
}

// «Om deg»-seksjonen på en gitt rute. Egen helper fordi tre tester trenger
// den, og fordi «E-post» også finnes som varsel-kanal-etikett lenger ned på
// /profil (VarslerInnstillinger) — scopingen er ikke valgfri.
function omDegSeksjon(page: Page): Locator {
  return page.locator('section', { has: page.getByText('Om deg', { exact: true }) })
}

// Fritekstfeltene med 200 tegns tak. Verdien skal wrappe, aldri kappes —
// verken i visning eller redigering.
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

    // Scopet til seksjonen: «E-post» finnes også som varsel-kanal-etikett
    // lenger ned på siden (VarslerInnstillinger), «Om deg»-raden er ikke tvetydig.
    const seksjon = page.locator('section', { has: page.getByText('Om deg', { exact: true }) })
    await expect(seksjon.getByText('Visningsnavn', { exact: true })).toBeVisible()
    await expect(seksjon.getByText('Fødselsdato', { exact: true })).toBeVisible()
    await expect(seksjon.getByText('Telefon', { exact: true })).toBeVisible()
    await expect(seksjon.getByText('E-post', { exact: true })).toBeVisible()
    await expect(seksjon.getByText('Matallergier', { exact: true })).toBeVisible()
    await expect(seksjon.getByText('Stikkord om deg', { exact: true })).toBeVisible()

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

  // Kappe-vakten (#683-review BLOCKER, utvidet i #685-review). Verdien hadde
  // white-space: nowrap + text-overflow: ellipsis, så en matallergi-tekst
  // (opptil MATALLERGIER_MAKS_LENGDE = 200 tegn) ble kuttet stille — uten
  // title og uten hover på mobil. scrollWidth > clientWidth er nøyaktig det
  // ellipsis-tilfellet, og passerer trivielt for korte verdier.
  //
  // Vakten sto opprinnelig kun på /profil og kun på Matallergier, og fanget
  // derfor IKKE at redigeringsskjemaet gjorde nøyaktig samme feil med et
  // <input type="text"> (énlinjet, scroller horisontalt). Nå kjøres den på
  // begge feltene på begge rutene: bug-klassen er lukket av en test, ikke av
  // disiplin.
  for (const url of ['/profil', '/profil/rediger']) {
    test(`fritekstverdiene wrapper i stedet for å kappes på ${url}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(url)
      await page.waitForLoadState('networkidle')
      const seksjon = omDegSeksjon(page)

      for (const felt of FRITEKSTFELT) {
        const verdi = verdiFor(seksjon, felt)
        await expect(verdi, `${felt} skal finnes på ${url}`).toBeVisible()
        const kappet = await verdi.evaluate(el => el.scrollWidth > el.clientWidth + 1)
        expect(kappet, `${felt} skal wrappe, ikke kappes, på ${url}`).toBe(false)
      }
    })
  }

  // Rekkefølge-vakten (#685): «Rediger» skal oppleves som at de samme
  // radene blir redigerbare, ikke som et annet skjema.
  //
  // Etikettene leses UT av seksjonen (felles `.opplysning-etikett` fra
  // OpplysningLabel) i stedet for å sjekkes mot en hardkodet liste
  // (#685-review): med en fast liste kunne én av flatene fått en sjette rad
  // uten at vakten merket det — som er akkurat drift-scenariet #685 handler
  // om. Nå sammenlignes de to listene direkte, så både rekkefølge OG
  // rad-settet må stemme.
  //
  // «Visningsnavn» er det ene godtatte unntaket: raden vises ALLTID i
  // skjemaet (ellers kan man ikke sette verdien), men kun når den er ulik
  // navnet på /profil (#683-valget — «visningsnavn = navn» er ingen egen
  // opplysning å vise). Ulikheten er altså tilsiktet, og filtreres bort på
  // begge flater slik at resten fortsatt sammenlignes strengt.
  test('«Om deg» har samme rader i samme rekkefølge på /profil og /profil/rediger', async ({ page }) => {
    async function etiketter(url: string): Promise<string[]> {
      await page.goto(url)
      await page.waitForLoadState('networkidle')
      const seksjon = omDegSeksjon(page)
      await expect(seksjon.locator('.opplysning-etikett').first()).toBeVisible()
      // DOM-rekkefølge er trygt her: radene er én flex-kolonne uten
      // omstokking (ingen `order`/grid), og `.all()` returnerer i DOM-orden.
      const alle = await seksjon.locator('.opplysning-etikett').allTextContents()
      return alle.map(t => t.trim()).filter(t => t !== 'Visningsnavn')
    }

    const paaProfil = await etiketter('/profil')
    // Sanity: vakten er verdiløs hvis locatoren slutter å finne noe.
    expect(paaProfil.length, 'skal finne etikettene i «Om deg»').toBeGreaterThan(3)
    expect(await etiketter('/profil/rediger')).toEqual(paaProfil)
  })

  // Tilgjengelig navn-vakten (#685-review). Etiketten i en OpplysningRad er
  // en <div>, ikke en <label htmlFor> — primitiven deles med /profil, der det
  // ikke finnes noen kontroll å knytte den til. Uten aria-label på hvert felt
  // leser en skjermleser derfor «edit, blank» på Visningsnavn, Fødselsdato og
  // Telefon. getByLabel() slår opp det TILGJENGELIGE navnet, ikke den synlige
  // teksten, så denne vakten går rødt hvis noen fjerner aria-label selv om
  // etiketten fortsatt står på skjermen.
  test('feltene i redigeringsskjemaet har tilgjengelig navn', async ({ page }) => {
    await page.goto('/profil/rediger')
    await page.waitForLoadState('networkidle')

    for (const felt of ['Navn', 'Visningsnavn', 'Fødselsdato', 'Telefon', 'Matallergier', 'Stikkord om deg']) {
      await expect(
        page.getByLabel(felt, { exact: true }),
        `${felt} skal ha et tilgjengelig navn`,
      ).toBeVisible()
    }

    // Rollen i tillegg til navnet for ett felt: beviser at navnet henger på
    // selve kontrollen, ikke på en tilfeldig container med samme tekst.
    await expect(page.getByRole('textbox', { name: 'Telefon', exact: true })).toBeVisible()
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

      const seksjon = omDegSeksjon(page)

      // Selve raden må være SYNLIG med teksten i — at etiketten finnes i DOM-en
      // beviser ikke at verdi-cellen rendret noe. Feltene her er NULL i seeden;
      // tom-streng-varianten (som `??` slapp gjennom, se __tests__/
      // egne-opplysninger-tom-verdi.test.tsx) kan appens skrivesti ikke
      // produsere, og pinnes derfor på komponentnivå i stedet.
      for (const felt of ['Telefon', 'Matallergier', 'Stikkord om deg']) {
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
