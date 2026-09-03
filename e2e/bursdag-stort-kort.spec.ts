import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { harTestCreds } from './helpers/auth'
import { adminKlient } from './helpers/admin-klient'
import { iDagOslo } from '../lib/dato'

// Bursdagskortet blåst opp på selve dagen (#640). Seeder om Ola Testesens
// fødselsdato (og, i test 2, bildeUrl) til å treffe "i dag", tar skjermbilder
// og verifiserer plasseringsregelen fra lib/agenda-sortering.ts.
//
// Kjøres kun mot test-instansen (harTestCreds/E2E_SUPABASE_*) — aldri prod.
// workers: 1 (playwright.config.ts) gir deterministisk rekkefølge innen
// filen, som testene her bygger videre på (samme profilrad muteres steg for
// steg). Restore i afterAll kjører uansett om en test underveis feiler —
// suiten deler state (workers: 1), og en glemt restore ville gitt en
// permanent falsk bursdag som forstyrrer visuell.spec.ts/sider-laster.spec.ts.

const OLA_ID = '00000000-0000-4000-8000-000000000003'
const OLA_MEDLEMSSIDE = `/klubbinfo/medlemmer/${OLA_ID}`
// Egen undermappe + eksplisitt mkdir, som i fond/poll/visuell-spec-ene.
// Playwright oppretter riktignok mellomliggende kataloger selv for
// page.screenshot({ path }), men konvensjonen i e2e/ holdes samlet på ett
// mønster heller enn to.
const UT_DIR = path.join('.screenshots', 'bursdag-stort-kort')

function iMorgenOslo(): string {
  const [y, m, d] = iDagOslo().split('-').map(Number)
  // UTC-aritmetikk ruller måned/år korrekt over ved månedsskifte/nyttår.
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

test.describe('Bursdagskort — stort format på selve dagen (#640)', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md og docs/test-instans.md')

  // harOriginal er egen vakt, ikke en null-sjekk på verdiene: begge kan
  // legitimt VÆRE null (bilde_url er det i seeden), så «null» kan ikke skille
  // «ikke lest ennå» fra «lest, og var null». Playwright kjører afterAll også
  // når beforeAll feilet — uten flagget ville en feilet select ført til at
  // restoren skrev fodselsdato: null over seedens 1990-11-05, permanent og
  // stille, i en delt test-instans (workers: 1).
  let harOriginal = false
  let originalFodselsdato: string | null = null
  let originalBildeUrl: string | null = null

  test.beforeAll(async () => {
    fs.mkdirSync(UT_DIR, { recursive: true })
    const supabase = adminKlient('bursdag-stort-kort')
    if (!supabase) throw new Error('E2E_SUPABASE_* mangler')

    const { data, error } = await supabase
      .from('profiles')
      .select('fodselsdato, bilde_url')
      .eq('id', OLA_ID)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new Error('Fant ikke seed-profilen Ola Testesen')
    originalFodselsdato = data.fodselsdato
    originalBildeUrl = data.bilde_url
    harOriginal = true

    // Behold fødselsåret (1990) fra seeden — kun MM-dd styrer om bursdagen
    // treffer "i dag" (beregnBursdager bryr seg kun om måned/dag).
    const { error: settFeil } = await supabase
      .from('profiles')
      .update({ fodselsdato: `1990-${iDagOslo().slice(5)}` })
      .eq('id', OLA_ID)
    if (settFeil) throw settFeil
  })

  test.afterAll(async () => {
    // Ingen avlest original ⇒ ingenting ble mutert heller (beforeAll rakk aldri
    // update-en), så det er ingenting å restaurere — og alt å tape på å prøve.
    if (!harOriginal) return

    // Fra og med her ER profilen mutert, og enhver vei ut uten fullført restore
    // skal være RØD — ikke bare loggført. En restore som feiler stille etterlater
    // en permanent falsk bursdag i den delte test-instansen (workers: 1), og
    // senere spec-er (visuell.spec.ts, sider-laster.spec.ts) feiler da avledet,
    // uten at noen ser årsaken. Merk skillet mot harOriginal-vakten over: å
    // HOPPE OVER restore fordi originalen aldri ble lest er legitimt og forblir
    // stille — det er restore som forsøkes og mislykkes som skal ta ned suiten.
    const supabase = adminKlient('bursdag-stort-kort')
    if (!supabase) throw new Error('E2E_SUPABASE_* mangler ved restore — test-instansen er nå skitten')
    const { error } = await supabase
      .from('profiles')
      .update({ fodselsdato: originalFodselsdato, bilde_url: originalBildeUrl })
      .eq('id', OLA_ID)
    if (error) {
      throw new Error(`Restore av seed-profilen feilet — test-instansen er nå skitten: ${error.message}`)
    }
  })

  test('bursdag i dag uten profilbilde: stort kort først på agendaen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const bursdagLenke = page.locator(`main a[href="${OLA_MEDLEMSSIDE}"]`).first()
    await expect(bursdagLenke).toBeVisible()
    await expect(bursdagLenke.getByText('BURSDAG')).toBeVisible()
    await expect(bursdagLenke.getByText('I dag')).toBeVisible()

    const bursdagBox = await bursdagLenke.boundingBox()
    expect(bursdagBox).not.toBeNull()

    // Skal ligge FØR «Ikke svart ennå» og «Nytt fra gutta» hvis de finnes for
    // testbrukeren — det er nettopp poenget i #640 (bursdagen skal ikke
    // druknes av ubesvarte arrangementer). Betinget fordi hvorvidt disse
    // seksjonene finnes avhenger av testbrukerens egne data.
    for (const label of ['Ikke svart ennå', 'Nytt fra gutta']) {
      const seksjon = page.getByText(label, { exact: true })
      if ((await seksjon.count()) > 0) {
        const seksjonBox = await seksjon.first().boundingBox()
        expect(seksjonBox, `fant ikke posisjon for «${label}»`).not.toBeNull()
        expect(bursdagBox!.y, `bursdagskortet skal ligge over «${label}»`).toBeLessThan(seksjonBox!.y)
      }
    }

    await page.screenshot({ path: path.join(UT_DIR, 'uten-bilde.png') })
  })

  test('bursdag i dag med profilbilde: stort kort med Avatar-bilde', async ({ page }) => {
    const supabase = adminKlient('bursdag-stort-kort')
    if (!supabase) throw new Error('E2E_SUPABASE_* mangler')
    // Same-origin sti — serveres uten remotePatterns-oppføring og slipper
    // uendret gjennom bildeSrc() (se Policy: Bildevisning).
    const { error } = await supabase.from('profiles').update({ bilde_url: '/icon-512.png' }).eq('id', OLA_ID)
    if (error) throw error

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const bursdagLenke = page.locator(`main a[href="${OLA_MEDLEMSSIDE}"]`).first()
    await expect(bursdagLenke).toBeVisible()
    // Avatar rendrer et <img> når src er satt (ikke initial-fallback).
    await expect(bursdagLenke.locator('img')).toBeVisible()

    await page.screenshot({ path: path.join(UT_DIR, 'med-bilde.png') })
  })

  test('smal skjerm (320px): ingen horisontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await expect(page.locator(`main a[href="${OLA_MEDLEMSSIDE}"]`).first()).toBeVisible()

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflow, 'siden har horisontal overflow på 320px bredde').toBe(false)
  })

  test('dagen etter: kortet er tilbake til kompakt form i «Kommende»', async ({ page }) => {
    const supabase = adminKlient('bursdag-stort-kort')
    if (!supabase) throw new Error('E2E_SUPABASE_* mangler')
    const { error } = await supabase
      .from('profiles')
      .update({ fodselsdato: `1990-${iMorgenOslo().slice(5)}` })
      .eq('id', OLA_ID)
    if (error) throw error

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const bursdagLenke = page.locator(`main a[href="${OLA_MEDLEMSSIDE}"]`).first()
    await expect(bursdagLenke).toBeVisible()

    // Ikke lenger en stor hero — «BURSDAG»-eyebrowen og «I dag»-chippen hører
    // kun til StortBursdagKort. Skopet til selve kortet og exact-matchet med
    // vilje: uskopet getByText('BURSDAG') er case-insensitivt substring-søk
    // over hele siden, og ville blitt rød av enhver fremtidig tekst som nevner
    // bursdag et helt annet sted på agendaen.
    await expect(bursdagLenke.getByText('BURSDAG', { exact: true })).toHaveCount(0)
    await expect(bursdagLenke.getByText('I dag', { exact: true })).toHaveCount(0)

    // Skal ligge i «Kommende» — dvs. på eller etter Kommende-labelen i DOM-orden.
    const kommendeBox = await page.getByText('Kommende', { exact: true }).first().boundingBox()
    const bursdagBox = await bursdagLenke.boundingBox()
    expect(kommendeBox).not.toBeNull()
    expect(bursdagBox).not.toBeNull()
    expect(bursdagBox!.y, 'bursdagskortet skal ligge i Kommende-seksjonen, ikke over den').toBeGreaterThan(
      kommendeBox!.y,
    )
  })
})
