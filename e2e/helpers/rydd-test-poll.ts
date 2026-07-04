import { createClient } from '@supabase/supabase-js'

/**
 * Felles cleanup-helper for e2e-tester som oppretter poller. Bruker
 * admin-klienten så sletting fungerer selv om UI feilet halvveis i testen.
 * Viktig: kall via `test.afterEach(ryddTestPoll)` — IKKE som siste steg i
 * testen. Cleanup på slutten kjøres ikke når en assertion før feiler.
 *
 * Kjører mot TEST-INSTANSEN (E2E_SUPABASE_*, se docs/test-instans.md) — aldri
 * prod. playwright.config.ts garanterer at URL-en ikke peker mot sky-Supabase.
 *
 * Bruk:
 *   test.afterEach(ryddTestPoll)
 *   // i testen etter opprettelse:
 *   setTestPollId(pollId)
 */

let testPollId: string | null = null

export function setTestPollId(id: string) {
  testPollId = id
}

// Mønstre i `spoersmaal` som tilhører Playwright-tester. Brukes som fallback
// når setTestPollId() aldri ble kalt (f.eks. testen feilet før opprettelse).
const TEST_MOENSTRE = [
  'Playwright-test %',
  'Inline-test %',
  'Res-test %',
  'Komm-test %',
  'Edit-test %',
]

export async function ryddTestPoll() {
  const url = process.env.E2E_SUPABASE_URL
  const serviceKey = process.env.E2E_SUPABASE_SERVICE_KEY
  if (!url || !serviceKey) {
    // Uten test-instans kjører ingen specs (skip i harTestCreds) — men vær
    // eksplisitt om hvorfor cleanup ikke gjør noe hvis vi likevel havner her.
    console.warn('[rydd-test-poll] E2E_SUPABASE_* mangler — hopper over cleanup')
    return
  }
  const supabase = createClient(url, serviceKey)

  // Primær: slett via kjent ID (satt av setTestPollId)
  if (testPollId) {
    const { error } = await supabase.from('poll').delete().eq('id', testPollId)
    if (error) console.error('[rydd-test-poll] ID-sletting feilet:', error)
    testPollId = null
  }

  // Sekundær fallback: slett alle poller med test-mønster i spørsmål. Fanger
  // opp tilfeller der testen feilet før setTestPollId() ble kalt, eller der
  // timeout hindret cleanup fra forrige kjøring. Test-instansen har ingen
  // ekte data å skåne, så mønster-slettingen trenger ingen alders-guard
  // lenger (den fantes da suiten kjørte mot prod — se #381/#386).
  for (const moenstre of TEST_MOENSTRE) {
    const { error } = await supabase
      .from('poll')
      .delete()
      .like('spoersmaal', moenstre)
    if (error) console.error(`[rydd-test-poll] Mønster-sletting (${moenstre}) feilet:`, error)
  }
}

/**
 * Hjelper som trekker ut poll-id fra en URL som `/poll/<uuid>`.
 */
export function pollIdFraUrl(url: string): string {
  const match = url.match(/\/poll\/([0-9a-f-]+)/)
  if (!match) throw new Error(`Kunne ikke parse poll-id fra: ${url}`)
  return match[1]
}
