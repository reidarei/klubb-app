import { test, expect, type Page } from '@playwright/test'
import { harTestCreds } from './helpers/auth'

// Pinner geometrien bak #499/#508-fiksen i den ekte layouten — vitest-testen
// (__tests__/filter-chip-treffomraade.test.tsx) pinner at radene bruker
// CHIP_RAD_GAP, denne pinner at det faktisk gir riktig resultat når raden
// brytes.
//
// FilterChip gir tap-flaten usynlig padding + negativ margin, så treffområdet
// stikker ut av layoutboksen. Når chip-raden brytes på smale skjermer strekker
// chippen på rad to seg opp i rad én. Med for lite radgap vant den — den er
// senere i DOM — hit-testen på piksler som visuelt tilhørte chippen over.
// Testen sjekker det brukeren faktisk merker: at et trykk *inne i en synlig
// pille* treffer den pillens egen lenke.

const BREDDER = [375, 390, 402] // iPhone SE, 12–14, 15/16 Pro

type Maal = {
  tekst: string
  // Hvilken lenke document.elementFromPoint gir i punktet vi prøvde
  traff: string
  radIndeks: number
  trefferHoeyde: number
}

// Sampler punkter langs bunnen og toppen av hver synlig pille — det er der
// nabo-radens treffområde eventuelt legger seg oppå.
async function maalChips(page: Page, navSelector: string): Promise<Maal[]> {
  return page.evaluate(sel => {
    const nav = document.querySelector(sel)
    if (!nav) throw new Error(`Fant ikke ${sel}`)
    const lenker = Array.from(nav.querySelectorAll('a'))

    // Grupper i rader etter toppkanten på den synlige pillen.
    const radTopper: number[] = []
    const radFor = (y: number) => {
      const i = radTopper.findIndex(t => Math.abs(t - y) < 4)
      if (i !== -1) return i
      radTopper.push(y)
      return radTopper.length - 1
    }

    return lenker.map(lenke => {
      const pille = lenke.querySelector('span')!
      const p = pille.getBoundingClientRect()
      const l = lenke.getBoundingClientRect()
      const x = p.left + p.width / 2

      // Prøvepunkter: 1 px innenfor topp- og bunnkanten av den synlige pillen,
      // pluss midten. Alle skal tilhøre denne chippen.
      const punkter = [p.top + 1, p.top + p.height / 2, p.bottom - 1]
      const traff = punkter.map(y => {
        const el = document.elementFromPoint(x, y)
        const a = el?.closest('a')
        return a ? (a.textContent ?? '').trim() : '(ingen)'
      })

      return {
        tekst: (lenke.textContent ?? '').trim(),
        traff: Array.from(new Set(traff)).join(' | '),
        radIndeks: radFor(Math.round(p.top)),
        trefferHoeyde: Math.round(l.height),
      }
    })
  }, navSelector)
}

test.describe('FilterChip — treffområder overlapper ikke mellom rader', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md')

  for (const bredde of BREDDER) {
    test(`/tidligere: hvert trykk i en pille treffer sin egen chip (${bredde} px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: bredde, height: 844 })
      await page.goto('/tidligere')
      await page.waitForLoadState('networkidle')

      const maalinger = await maalChips(page, 'nav[aria-label="Filtrer historikken"]')
      expect(maalinger.length).toBeGreaterThan(1)

      for (const m of maalinger) {
        // Kjernen: alle prøvepunktene inne i pillen skal gi pillens egen lenke.
        // Før fiksen ga bunnpunktene i rad 1 «Poller» (rad 2).
        expect(m.traff, `${bredde} px — pille «${m.tekst}» rad ${m.radIndeks}`).toBe(m.tekst)
        // Tap-målet fra #499 skal fortsatt være der.
        expect(m.trefferHoeyde, `treffhøyde for «${m.tekst}»`).toBeGreaterThanOrEqual(43)
      }
    })
  }

  test('/innspill: samme invariant', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/innspill')
    await page.waitForLoadState('networkidle')

    const maalinger = await maalChips(page, 'nav[aria-label="Filtrer innspill"]')
    expect(maalinger.length).toBeGreaterThan(1)
    for (const m of maalinger) {
      expect(m.traff, `pille «${m.tekst}»`).toBe(m.tekst)
      expect(m.trefferHoeyde, `treffhøyde for «${m.tekst}»`).toBeGreaterThanOrEqual(43)
    }
  })
})
