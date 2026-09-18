import { expect, test } from '@playwright/test'
import { harTestCreds } from './helpers/auth'
import { adminKlient } from './helpers/admin-klient'

/**
 * Reisemodus (#723, #724).
 *
 * Dekker logikk, ruter og redirect fra «/» per Policy: Visuell verifikasjon —
 * IKKE safe-area-regnestykket, standalone-modus eller togglens eksakte
 * geometri, som kun kan sjekkes på fysisk iPhone (se PosisjonsKart.tsx og
 * arkitekturstyrets uttalelse i #723).
 *
 * Specen seeder sin egen pågående TUR (type «tur», sluttid i fremtiden) og
 * skrur PÅ klubb-flagget `app_innstillinger.reisemodus` selv — begge er
 * forutsetninger reisemodus krever, og ingen av dem kan ligge i seed.sql
 * («pågår nå» er tidsrelativt, og flagget skal være AV som default i prod).
 *
 * Turen eies av PETTER, ikke testbrukeren, samme mønster som
 * kart-timeplan.spec.ts — ingenting her skal kunne kollidere med
 * testbrukerens egne rader i andre specs. Hver test får en FERSK browser-
 * kontekst (Playwright-default), så av-cookien én test setter lekker aldri
 * til neste — testene forutsetter derfor alle at reisemodus starter PÅ.
 */

const PETTER = '00000000-0000-4000-8000-000000000002'
const MERKE = 'Playwright reisemodus'

let arrangementId: string | null = null
let noenTestFeilet = false

test.describe('reisemodus (#723)', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md')

  test.beforeAll(async () => {
    const admin = adminKlient('reisemodus')
    if (!admin) return

    const { data: arr, error: arrFeil } = await admin
      .from('arrangementer')
      .insert({
        type: 'tur',
        tittel: `${MERKE} — pågår`,
        start_tidspunkt: new Date(Date.now() - 60 * 1000).toISOString(),
        slutt_tidspunkt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        opprettet_av: PETTER,
      })
      .select('id')
      .single()
    if (arrFeil) throw new Error(`Kunne ikke seede arrangement: ${arrFeil.message}`)
    arrangementId = arr.id

    // Kill-switch — landes AV i migrasjon 150. Skrus PÅ kun for denne specen.
    const { error: flaggFeil } = await admin
      .from('app_innstillinger')
      .upsert(
        { noekkel: 'reisemodus', aktiv: true, beskrivelse: 'Vis reisemodus (fullskjerm kart) mens en tur med sluttid pågår' },
        { onConflict: 'noekkel' },
      )
    if (flaggFeil) throw new Error(`Kunne ikke skru på reisemodus-flagget: ${flaggFeil.message}`)
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) noenTestFeilet = true
  })

  // MÅ rydde UBETINGET (ikke bare når testene selv gikk bra) — et lekket
  // påslått flagg sender alt annet som besøker «/» på instansen til kartet,
  // inkludert andre spec-filer som kjører etterpå. Avviker derfor bevisst fra
  // kart-timeplan.spec.ts sitt «kast bare hvis testene gikk bra»-mønster for
  // NETTOPP flagget; arrangement-slettingen følger fortsatt det vanlige
  // mønsteret siden en gjenglemt tur «bare» kaprer finnPaagaaendeArrangement().
  test.afterAll(async () => {
    const admin = adminKlient('reisemodus')
    if (!admin) return

    const { error: flaggFeil } = await admin
      .from('app_innstillinger')
      .update({ aktiv: false })
      .eq('noekkel', 'reisemodus')
    if (flaggFeil) {
      // Kaster ALLTID, uansett noenTestFeilet — se begrunnelsen over.
      throw new Error(`Kunne ikke skru av reisemodus-flagget: ${flaggFeil.message}`)
    }

    if (!arrangementId) return
    const { error: ryddefeil } = await admin.from('arrangementer').delete().eq('id', arrangementId)
    if (ryddefeil) {
      console.error(`[reisemodus] opprydding feilet: ${ryddefeil.message}`)
      if (!noenTestFeilet) throw new Error(`Kunne ikke rydde arrangement: ${ryddefeil.message}`)
    }
  })

  test('«/» omdirigerer til «/kart» og headeren er borte', async ({ page }) => {
    await page.goto('/')
    await page.waitForURL('**/kart', { timeout: 15_000 })
    await expect(page.getByTestId('posisjonskart')).toBeVisible()

    // Ingen TopHeader — hverken tabs eller den vanlige profil-lenken i navet.
    await expect(page.getByLabel('Hovednavigasjon')).toHaveCount(0)
    await expect(page.getByTestId('reisemodus-bar')).toBeVisible()
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
  })

  test('toggelen river deg ikke ut av en annen side (#723, Reidars avgjørelse)', async ({ page }) => {
    await page.goto('/chat')
    // To nav-er kortvarig i DOM-en samtidig er en kjent React-streaming-
    // reveal-detalj (Suspense-fallbacken fjernes ikke i samme tick som den
    // reelle headeren settes inn) — normalt under et halvt sekund, men
    // `toBeVisible()` feiler UMIDDELBART på et strict-mode-brudd i stedet
    // for å polle, så en generøs timeout på DEN alene hjelper ikke
    // (bekreftet: feilet på ~280ms uansett om timeout var 5s eller 20s).
    // `toHaveCount(1, …)` POLLER derimot til antallet stabiliserer seg —
    // riktig verktøy her, ikke en fast sleep.
    await expect(page.getByLabel('Hovednavigasjon')).toHaveCount(1, { timeout: 20_000 })
    await expect(page.getByLabel('Hovednavigasjon')).toBeVisible()

    const toggle = page.getByTestId('reisemodus-toggle')
    await expect(toggle).toBeVisible({ timeout: 15_000 })
    await expect(toggle).toHaveAttribute('aria-checked', 'true')

    // Slår AV mens vi står på /chat. Ingen redirect skal skje — verifisert
    // ved at vi fortsatt står på /chat etter at toggle-tilstanden er oppdatert
    // (en eventuell redirect() ville navigert FØR revalideringen er ferdig).
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'false', { timeout: 10_000 })
    await expect(page).toHaveURL(/\/chat$/)

    // Slår PÅ igjen — skal alltid gå til /kart, uansett hvor vi sto («han ber
    // eksplisitt om kartet»).
    await toggle.click()
    await page.waitForURL('**/kart', { timeout: 15_000 })
    await expect(page.getByTestId('reisemodus-bar')).toBeVisible()
  })

  /**
   * Geometri-port for headeren på en ikke-kart-rute (#723-review).
   *
   * Admin ser FIRE faner (Agenda/Chat/Klubb/Fond). Legger reisemodus en
   * «Reise»-pille ved siden av avataren, må alt seks elementer få plass på de
   * 390 px viewporten i playwright.config.ts gir — og tabs-containeren har
   * ingen wrap eller overflow å ta overfloden på. Første forsøk sprakk med
   * ~55 px uten at noen `toBeVisible()` merket det: Playwright regner et
   * element som synlig selv når det ligger utenfor viewporten eller under et
   * annet. Derfor MÅLER denne testen bokser i stedet.
   *
   * Merk avgrensningen (CLAUDE.md § Policy: Visuell verifikasjon): dette er en
   * port for at boksene ikke kolliderer, ikke en verifikasjon av at headeren
   * SER riktig ut. Det siste skjer på fysisk iPhone.
   */
  test('admin-headeren rommer fire faner + toggle + avatar på 390 px (#723-review)', async ({ page }) => {
    await page.goto('/chat')
    // Samme strict-mode-hensyn som testen over: to nav-er kan stå i DOM-en et
    // øyeblikk under React-streamingen.
    await expect(page.getByLabel('Hovednavigasjon')).toHaveCount(1, { timeout: 20_000 })
    const nav = page.getByLabel('Hovednavigasjon')
    await expect(page.getByTestId('reisemodus-toggle')).toBeVisible({ timeout: 15_000 })
    // Forutsetningen for at dette ER det trange tilfellet: testbrukeren er
    // admin og ser Fond-fanen. Ryker den, tester vi noe annet enn vi tror.
    await expect(nav.getByRole('link', { name: 'Fond' })).toBeVisible()

    const bokser = await nav.evaluate((el: HTMLElement) =>
      [...el.querySelectorAll('a[href], button')].map(node => {
        const r = node.getBoundingClientRect()
        return {
          navn: (node.getAttribute('aria-label') ?? node.textContent ?? '').trim().slice(0, 24),
          venstre: r.left,
          hoeyre: r.right,
          bredde: r.width,
        }
      }),
    )

    const viewport = page.viewportSize()!
    // 4 faner + toggle + profil-avatar.
    expect(bokser.length).toBe(6)

    for (const b of bokser) {
      expect(b.bredde, `«${b.navn}» har null bredde`).toBeGreaterThan(0)
      expect(b.venstre, `«${b.navn}» starter utenfor venstre kant`).toBeGreaterThanOrEqual(0)
      expect(
        b.hoeyre,
        `«${b.navn}» stikker utenfor viewporten (${viewport.width} px)`,
      ).toBeLessThanOrEqual(viewport.width)
    }

    // Ingen overlapp: sortert på venstrekant skal hver boks starte etter at
    // den forrige er slutt. 0.5 px slingringsmonn for subpiksel-avrunding.
    const sortert = [...bokser].sort((a, b) => a.venstre - b.venstre)
    for (let i = 1; i < sortert.length; i++) {
      expect(
        sortert[i].venstre,
        `«${sortert[i].navn}» overlapper «${sortert[i - 1].navn}»`,
      ).toBeGreaterThanOrEqual(sortert[i - 1].hoeyre - 0.5)
    }
  })
})
