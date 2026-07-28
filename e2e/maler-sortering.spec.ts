import { test, expect } from '@playwright/test'
import { harTestCreds } from './helpers/auth'
import { adminKlient } from './helpers/admin-klient'

// Pinner #505 punkt 3: `rekkefolge`/`rekkefølge` har ingen unique-constraint
// (migrasjon 022/023), så to maler kan dele verdi. Uten en andre
// sorteringsnøkkel er den innbyrdes rekkefølgen mellom dem udefinert —
// Postgres garanterer ingen stabil orden for rader med lik ORDER BY-verdi.
// Fikset ved å legge `.order('navn')` som tiebreaker overalt kaaringmaler/
// arrangementmaler sorteres (app/(app)/kaaringer/page.tsx,
// app/(app)/innstillinger/page.tsx, app/(app)/kaaringspoll/ny/page.tsx).
//
// Testen seeder to kåringmaler med IDENTISK rekkefolge — B (alfabetisk sist)
// satt inn FØR A — og verifiserer at /kaaringer likevel alltid viser A først.
// Uten tiebreakeren ville rekkefølgen vært vilkårlig og kunne matchet
// innsettingsrekkefølgen (B, A) på noen kjøringer.

test.describe('Maler — stabil sortering ved kolliderende rekkefolge', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md')

  const NAVN_A = 'Aaa Playwright Sorteringstest'
  const NAVN_B = 'Zzz Playwright Sorteringstest'
  // Smallint-kolonne (maks 32767) — velger en verdi langt unna seedet data
  // for å unngå å endre reell rekkefølge på ekte maler.
  const DELT_REKKEFOLGE = 30000

  let idA: string | null = null
  let idB: string | null = null

  // Fallback som fanger opp rader fra en kjøring som ble avbrutt (timeout,
  // Ctrl-C, krasj i afterEach) før ID-slettingen rakk å kjøre. Lekkede maler er
  // ikke ufarlige: KaaringerVisning rendrer alle maler uavhengig av vinnere, og
  // /kaaringer er skjermbilde-mål i visuell.spec.ts og readme-skjermbilder.spec.ts
  // — to ekstra tomme kort ville ødelagt baseline i alle senere kjøringer.
  // Samme mønster-fallback som e2e/helpers/rydd-test-poll.ts.
  const NAVN_MOENSTER = '%Playwright Sorteringstest'

  async function ryddMaler() {
    const supabase = adminKlient('maler-sortering')
    if (!supabase) return
    if (idA) await supabase.from('kaaringmaler').delete().eq('id', idA)
    if (idB) await supabase.from('kaaringmaler').delete().eq('id', idB)
    idA = null
    idB = null
    const { error } = await supabase.from('kaaringmaler').delete().like('navn', NAVN_MOENSTER)
    if (error) console.error('[maler-sortering] Mønster-sletting feilet:', error)
  }

  // Rydder både før og etter: etter for normal opprydding, før for å ta bort en
  // eventuell lekkasje fra en tidligere avbrutt kjøring (som ellers ville gitt
  // duplikate navn i assertion-en under).
  test.beforeEach(ryddMaler)
  test.afterEach(ryddMaler)

  test('to kåringmaler med identisk rekkefolge vises i navn-orden', async ({ page }) => {
    const supabase = adminKlient('maler-sortering')
    if (!supabase) throw new Error('E2E_SUPABASE_* mangler')

    // B settes inn FØRST — sjekker at det er navnet, ikke innsettingsrekkefølgen,
    // som avgjør visningsorden.
    const { data: b, error: bFeil } = await supabase
      .from('kaaringmaler')
      .insert({ navn: NAVN_B, rekkefolge: DELT_REKKEFOLGE })
      .select('id')
      .single()
    if (bFeil) throw bFeil
    idB = b.id

    const { data: a, error: aFeil } = await supabase
      .from('kaaringmaler')
      .insert({ navn: NAVN_A, rekkefolge: DELT_REKKEFOLGE })
      .select('id')
      .single()
    if (aFeil) throw aFeil
    idA = a.id

    await page.goto('/kaaringer')
    await page.waitForLoadState('networkidle')

    // .toLowerCase(): mal-navnet vises i en boks med CSS text-transform:
    // uppercase, og innerText() returnerer den visuelt transformerte teksten
    // — ikke DOM-verdien. Sammenligning må derfor være case-insensitiv.
    const tekst = (await page.locator('body').innerText()).toLowerCase()
    const posA = tekst.indexOf(NAVN_A.toLowerCase())
    const posB = tekst.indexOf(NAVN_B.toLowerCase())
    expect(posA).toBeGreaterThan(-1)
    expect(posB).toBeGreaterThan(-1)
    expect(posA).toBeLessThan(posB)
  })
})
