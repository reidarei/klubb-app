import { expect, test, type Page } from '@playwright/test'
import { harTestCreds } from './helpers/auth'
import { TIDLIGERE_SIDESTOERRELSE } from '../lib/konstanter'
import { enkodeCursor } from '../lib/tidligere-cursor'

// Full-historikk-siden (/tidligere) — chip-filter (#487) + paginering (#488).
// Kjøres mot test-instansen (playwright.config.ts peker aldri mot prod).
// Sesjonen er allerede innlogget via storageState fra setup-prosjektet, så
// ingen loggInn-kall trengs — samme mønster som e2e/fond.spec.ts (#443).
//
// Tellingene under er speilbilde av bulken i supabase/seed.sql («Fortidsdata
// for /tidligere-specen (#489)») — endres et tall i seed.sql må disse
// oppdateres i samme commit, og omvendt.
const ANT_MOETE = 34
const ANT_TUR = 6
const ANT_MELDING = 5
const ANT_POLL = 4
const ANT_ALLE = ANT_MOETE + ANT_TUR + ANT_MELDING + ANT_POLL

// Vises som feilmelding når en telling ikke stemmer. Vanligste årsak er at
// test-instansen ikke er re-seedet etter at seed.sql endret seg — det er en
// kryptisk «expected 30, got 0» uten dette hintet.
const RESEED_HINT =
  'feil antall seed-rader — er test-instansen re-seedet? (`supabase db reset`, docs/test-instans.md)'

// Chip-teksten rendres med textTransform: uppercase (TidligereTypeFilter),
// som gjør tekst-baserte locators skjøre mot CSS-endringer. Klikk via href
// i stedet.
function chipLenke(page: Page, href: string) {
  return page.locator(`nav[aria-label="Filtrer historikken"] a[href="${href}"]`)
}

function aktivChipHref(page: Page) {
  return page.locator('nav[aria-label="Filtrer historikken"] a[aria-current="page"]')
}

function kortHrefs(page: Page) {
  return page.getByTestId('tidligere-liste').locator(':scope > a')
}

async function alleHrefs(page: Page): Promise<string[]> {
  const lokator = kortHrefs(page)
  const antall = await lokator.count()
  const hrefs: string[] = []
  for (let i = 0; i < antall; i++) {
    hrefs.push((await lokator.nth(i).getAttribute('href')) ?? '')
  }
  return hrefs
}

// Seed-radene har deterministiske UUID-er ('00000000-0000-4000-9X00-…', se
// supabase/seed.sql). Type-tellingene filtreres på dette mønsteret slik at et
// manuelt opprettet innlegg/poll i den delte test-instansen ikke gjør speccen
// rød uten at noe faktisk er ødelagt — /tidligere har ingen tidsgrense på
// meldinger. Sidestørrelse-assertene (30) står ufiltrert og fanger fortsatt
// paginerings-regresjoner.
const SEED_HREF_RE = /-4000-9[1-4]00-/
function seedHrefs(hrefs: string[]): string[] {
  return hrefs.filter(h => SEED_HREF_RE.test(h))
}

// Klikker «Last mer» og venter på at URL-en faktisk er den lenka pekte på.
// Å vente på /cursor=/ holder bare for første klikk — fra side 2 og utover
// står det allerede en cursor i URL-en, og waitForURL ville returnert før
// navigasjonen committet (og vi ville lest forrige sides kort på nytt).
async function klikkLastMer(page: Page) {
  const lenke = page.getByTestId('tidligere-last-mer')
  const neste = await lenke.getAttribute('href')
  await lenke.click()
  await page.waitForURL(url => url.pathname + url.search === neste)
  await expect(
    page.getByTestId('tidligere-liste').or(page.getByTestId('tidligere-tom')),
  ).toBeVisible()
}

test.describe('/tidligere — full historikk', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md og docs/test-instans.md')
  test.setTimeout(60_000)

  test('chip-filteret begrenser historikken og markerer aktivt valg', async ({ page }) => {
    await page.goto('/tidligere')

    await expect(page.getByRole('heading', { name: 'Hele historikken' })).toBeVisible()
    await expect(aktivChipHref(page)).toHaveAttribute('href', '/tidligere')
    await expect(kortHrefs(page), RESEED_HINT).toHaveCount(TIDLIGERE_SIDESTOERRELSE)

    // Turer
    await chipLenke(page, '/tidligere?type=tur').click()
    await page.waitForURL(/type=tur/)
    await expect(aktivChipHref(page)).toHaveAttribute('href', '/tidligere?type=tur')
    const turHrefs = await alleHrefs(page)
    expect(seedHrefs(turHrefs), RESEED_HINT).toHaveLength(ANT_TUR)
    for (const href of turHrefs) expect(href).toMatch(/^\/arrangementer\//)
    expect(turHrefs.filter(h => h.startsWith('/poll/'))).toHaveLength(0)
    expect(turHrefs.filter(h => h.startsWith('/meldinger/'))).toHaveLength(0)
    await expect(page.getByText('Historisk møte')).toHaveCount(0)

    // Meldinger
    await chipLenke(page, '/tidligere?type=melding').click()
    await page.waitForURL(/type=melding/)
    const meldingHrefs = await alleHrefs(page)
    expect(seedHrefs(meldingHrefs), RESEED_HINT).toHaveLength(ANT_MELDING)
    for (const href of meldingHrefs) expect(href).toMatch(/^\/meldinger\//)

    // Poller
    await chipLenke(page, '/tidligere?type=poll').click()
    await page.waitForURL(/type=poll/)
    const pollHrefs = await alleHrefs(page)
    expect(seedHrefs(pollHrefs), RESEED_HINT).toHaveLength(ANT_POLL)
    for (const href of pollHrefs) expect(href).toMatch(/^\/poll\//)

    // Møter
    await chipLenke(page, '/tidligere?type=moete').click()
    await page.waitForURL(/type=moete/)
    const moeteHrefs = await alleHrefs(page)
    expect(moeteHrefs).toHaveLength(TIDLIGERE_SIDESTOERRELSE)
    for (const href of moeteHrefs) expect(href).toMatch(/^\/arrangementer\//)
  })

  test('ugyldig ?type= faller tilbake til Alle', async ({ page }) => {
    await page.goto('/tidligere?type=slettmeg')

    await expect(aktivChipHref(page)).toHaveAttribute('href', '/tidligere')
    const hrefs = await alleHrefs(page)
    expect(hrefs).toHaveLength(TIDLIGERE_SIDESTOERRELSE)

    // Alle-filteret blander typer — bekreft at minst to ulike prefikser er med.
    const prefikser = new Set(hrefs.map(h => h.split('/')[1]))
    expect(prefikser.size).toBeGreaterThanOrEqual(2)
  })

  test('«Last mer» vises ikke når det ikke finnes flere rader (#488)', async ({ page }) => {
    // Positivt anker før fravær-sjekken: uten det ville et 500-svar, en
    // redirect til /login eller en tom liste passert testen vakuumt.
    const forventet: Record<string, number> = { tur: ANT_TUR, poll: ANT_POLL, melding: ANT_MELDING }
    for (const type of ['tur', 'poll', 'melding']) {
      await page.goto(`/tidligere?type=${type}`)
      await expect(aktivChipHref(page)).toHaveAttribute('href', `/tidligere?type=${type}`)
      expect(seedHrefs(await alleHrefs(page)), RESEED_HINT).toHaveLength(forventet[type])
      await expect(page.getByTestId('tidligere-last-mer')).toHaveCount(0)
    }

    // Møter har 34 seedede rader — mer enn TIDLIGERE_SIDESTOERRELSE (30), så
    // «Last mer» skal vises på side 1 og forsvinne igjen på side 2. Vi teller
    // seed-rader over begge sidene i stedet for eksakt sidelengde, slik at
    // manuelt opprettede møter i test-instansen ikke gir falsk rødt.
    await page.goto('/tidligere?type=moete')
    const side1 = await alleHrefs(page)
    expect(side1, RESEED_HINT).toHaveLength(TIDLIGERE_SIDESTOERRELSE)
    const lastMer = page.getByTestId('tidligere-last-mer')
    await expect(lastMer).toBeVisible()
    await klikkLastMer(page)
    expect(page.url()).toContain('type=moete')
    await expect(aktivChipHref(page)).toHaveAttribute('href', '/tidligere?type=moete')
    const side2 = await alleHrefs(page)
    expect(side2.filter(h => side1.includes(h)), 'duplikat mellom side 1 og 2').toHaveLength(0)
    expect(seedHrefs([...side1, ...side2])).toHaveLength(ANT_MOETE)
    await expect(page.getByTestId('tidligere-last-mer')).toHaveCount(0)
  })

  test('«Last mer» paginerer gjennom hele historikken uten duplikater (type=alle)', async ({ page }) => {
    await page.goto('/tidligere')

    // Vi går gjennom alle sidene i stedet for å låse side 2 til en eksakt
    // lengde: da tåler testen ekstra rader i den delte test-instansen, og
    // MAKS_SIDER fanger samtidig den uendelige «Last mer»-løkka fra #488.
    const MAKS_SIDER = 5
    const sett = new Set<string>()
    let sider = 0

    for (;;) {
      sider++
      const side = await alleHrefs(page)
      const lastMer = page.getByTestId('tidligere-last-mer')
      const harMer = (await lastMer.count()) > 0

      // Alle sider unntatt den siste skal være helt fulle — en halvfull side
      // med «Last mer» betyr at merge-klippingen mister rader.
      if (harMer) expect(side, `side ${sider} er ikke full`).toHaveLength(TIDLIGERE_SIDESTOERRELSE)
      else expect(side.length, `side ${sider} er tom — ${RESEED_HINT}`).toBeGreaterThan(0)

      for (const href of side) {
        expect(sett.has(href), `duplikat på tvers av sider: ${href}`).toBe(false)
        sett.add(href)
      }

      if (!harMer) break
      expect(sider, '«Last mer» forsvinner ikke — uendelig paginering (#488)').toBeLessThan(MAKS_SIDER)
      await klikkLastMer(page)
    }

    expect(sider, 'seeden er større enn én side — pagineringen ble aldri utøvd').toBeGreaterThanOrEqual(2)
    expect(seedHrefs([...sett]), RESEED_HINT).toHaveLength(ANT_ALLE)
  })

  test('foreldet cursor lander på tom side uten «Last mer»', async ({ page }) => {
    // Tom-grenen er ellers uoppnåelig med seeden: en cursor fra før alle rader
    // (bokmerket eller foreldet lenke) er den realistiske veien dit. Formatet
    // valideres strengt i dekodeCursor, så vi bygger den med produksjonskoden.
    const foreldet = enkodeCursor({
      a: ['1990-01-01T00:00:00Z', '00000000-0000-4000-9100-000000000000'],
      m: ['1990-01-01T00:00:00Z', '00000000-0000-4000-9300-000000000000'],
      p: ['1990-01-01T00:00:00Z', '00000000-0000-4000-9400-000000000000'],
    })
    await page.goto(`/tidligere?cursor=${foreldet}`)

    await expect(page.getByRole('heading', { name: 'Hele historikken' })).toBeVisible()
    await expect(page.getByTestId('tidligere-tom')).toHaveText('Her stopper løypa, gutta.')
    await expect(page.getByTestId('tidligere-liste')).toHaveCount(0)
    // En tom side skal aldri tilby «Last mer» — det var nettopp løkka i #488.
    await expect(page.getByTestId('tidligere-last-mer')).toHaveCount(0)
  })
})

// Ingen assertion på forsidens «Se hele historikken»-lenke eller den
// forsidesynlige «Tidligere»-seksjonen med vilje: de fire «nylige» seed-
// radene (innenfor AGENDA_VINDU_MND) eldes forbi 12-månedersvinduet hvis
// test-instansen ikke resettes på et år. En assertion her ville da feile
// stille lenge etter at seeden ble skrevet, uten at noen kode faktisk brøt.
