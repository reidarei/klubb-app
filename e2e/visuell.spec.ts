import { test, expect, Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { loggInn, harTestCreds } from './helpers/auth'

/**
 * Visuell baseline for Obsidian-redesign.
 *
 * Tar screenshot av alle 9 ruter i mobil-viewport (390×844) og lagrer til
 * .screenshots/<fase>/<navn>.png. Genererer også en side-ved-side HTML-rapport
 * som viser nåværende tilstand ved siden av Design/skjermbilder/*.png.
 *
 * Miljøvariabel FASE styrer utmappa (default: "baseline").
 *   FASE=fase-2 npx playwright test e2e/visuell.spec.ts
 */

const FASE = process.env.FASE ?? 'baseline'
const UT_DIR = path.join('.screenshots', FASE)
const REF_DIR = path.join('Design', 'skjermbilder')

type Rute = {
  navn: string
  referanse: string
  besok: (page: Page) => Promise<void>
  fullPage?: boolean
}

async function foersteArrangementLenke(page: Page): Promise<string | null> {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  const lenker = await page.$$eval('a[href^="/arrangementer/"]', els =>
    els
      .map(e => e.getAttribute('href'))
      .filter((h): h is string => !!h && !h.includes('/ny') && !h.includes('/rediger') && !h.includes('/tidligere')),
  )
  return lenker[0] ?? null
}

test.describe('Visuell baseline', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md')

  test.beforeAll(() => {
    fs.mkdirSync(UT_DIR, { recursive: true })
  })

  test('fanger alle 9 ruter og genererer rapport', async ({ page }) => {
    test.setTimeout(120_000)

    await loggInn(page)
    const arrLenke = await foersteArrangementLenke(page)

    const ruter: Rute[] = [
      {
        navn: '01-agenda',
        referanse: '01-agenda.png',
        besok: async p => { await p.goto('/') },
        fullPage: true,
      },
      {
        navn: '02-arrangement-detalj',
        referanse: '02-arrangement-detalj.png',
        besok: async p => { if (arrLenke) await p.goto(arrLenke) },
        fullPage: true,
      },
      {
        navn: '03-rediger-arrangement',
        referanse: '03-rediger-arrangement.png',
        besok: async p => { if (arrLenke) await p.goto(`${arrLenke}/rediger`) },
        fullPage: true,
      },
      {
        navn: '04-klubbinfo',
        referanse: '04-klubbinfo.png',
        besok: async p => { await p.goto('/klubbinfo') },
        fullPage: true,
      },
      {
        navn: '05-medlemmer',
        referanse: '05-medlemmer.png',
        besok: async p => { await p.goto('/klubbinfo/medlemmer') },
        fullPage: true,
      },
      {
        navn: '06-kaaringer',
        referanse: '06-kaaringer.png',
        besok: async p => { await p.goto('/kaaringer') },
        fullPage: true,
      },
      {
        navn: '07-profil',
        referanse: '07-profil.png',
        besok: async p => { await p.goto('/profil') },
        fullPage: true,
      },
      {
        navn: '08-rediger-profil',
        referanse: '08-rediger-profil.png',
        besok: async p => { await p.goto('/profil/rediger') },
        fullPage: true,
      },
      {
        navn: '09-innstillinger',
        referanse: '09-innstillinger.png',
        besok: async p => { await p.goto('/innstillinger') },
        fullPage: true,
      },
    ]

    const resultater: { navn: string; naa: string; ref: string; status: 'ok' | 'mangler' }[] = []

    for (const rute of ruter) {
      const utPath = path.join(UT_DIR, `${rute.navn}.png`)
      try {
        await rute.besok(page)
        await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
        await page.waitForTimeout(800)
        await page.screenshot({ path: utPath, fullPage: rute.fullPage ?? true })
        resultater.push({
          navn: rute.navn,
          naa: `${rute.navn}.png`,
          ref: path.posix.join('..', '..', 'Design', 'skjermbilder', rute.referanse),
          status: 'ok',
        })
      } catch (feil) {
        resultater.push({
          navn: rute.navn,
          naa: '',
          ref: path.posix.join('..', '..', 'Design', 'skjermbilder', rute.referanse),
          status: 'mangler',
        })
        console.error(`Feil ved ${rute.navn}:`, feil)
      }
    }

    // Skriv side-ved-side rapport
    const rapport = `<!doctype html>
<html lang="no"><head><meta charset="utf-8"><title>Visuell sammenligning — ${FASE}</title>
<style>
  body { background: #111; color: #eee; font-family: system-ui, sans-serif; margin: 0; padding: 24px; }
  h1 { font-weight: 400; font-size: 20px; margin: 0 0 24px; }
  .rad { display: grid; grid-template-columns: auto auto; gap: 16px; margin-bottom: 40px; justify-content: start; align-items: start; }
  .rad h2 { grid-column: 1 / -1; font-size: 14px; font-weight: 500; color: #aaa; margin: 0; text-transform: uppercase; letter-spacing: 0.05em; }
  .kort { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; }
  .kort .label { font-size: 11px; color: #888; margin-bottom: 6px; text-transform: uppercase; }
  .kort img { height: 85vh; width: auto; display: block; border-radius: 4px; }
  .mangler { color: #e07b7b; padding: 40px; text-align: center; }
</style></head><body>
<h1>Visuell sammenligning — fase «${FASE}»</h1>
${resultater.map(r => `
  <div class="rad">
    <h2>${r.navn}</h2>
    <div class="kort"><div class="label">Design-referanse</div><img src="${r.ref}" alt="ref"></div>
    <div class="kort"><div class="label">Nåværende (${FASE})</div>${r.status === 'ok' ? `<img src="${r.naa}" alt="naa">` : '<div class="mangler">Fanget ikke skjerm</div>'}</div>
  </div>
`).join('')}
</body></html>`

    fs.writeFileSync(path.join(UT_DIR, 'rapport.html'), rapport, 'utf8')
    console.log(`\nRapport: ${path.resolve(UT_DIR, 'rapport.html')}\n`)

    // Verifiser at minst agenda ble fanget
    const feilede = resultater.filter(r => r.status === 'mangler').map(r => r.navn)
    expect(feilede, `Ruter som ikke ble fanget: ${feilede.join(', ')}`).toHaveLength(0)

    // Verifiser at alle 9 referanse-PNG-er finnes
    for (const r of ruter) {
      const ref = path.join(REF_DIR, r.referanse)
      expect(fs.existsSync(ref), `Mangler designreferanse: ${ref}`).toBe(true)
    }
  })
})
