import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Felles cleanup-helper for e2e-tester som oppretter poller. Bruker
 * admin-klienten så sletting fungerer selv om UI feilet halvveis i testen.
 * Viktig: kall via `test.afterEach(ryddTestPoll)` — IKKE som siste steg i
 * testen. Cleanup på slutten kjøres ikke når en assertion før feiler.
 *
 * Bruk:
 *   test.afterEach(ryddTestPoll)
 *   // i testen etter opprettelse:
 *   setTestPollId(pollId)
 */

let testPollId: string | null = null

function lastEnv(): Record<string, string> {
  const envPath = path.resolve('.env.local')
  const env: Record<string, string> = {}
  for (const linje of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmet = linje.trim()
    if (!trimmet || trimmet.startsWith('#')) continue
    const eq = trimmet.indexOf('=')
    if (eq === -1) continue
    env[trimmet.slice(0, eq).trim()] = trimmet.slice(eq + 1).trim()
  }
  return env
}

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
  const env = lastEnv()
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
  )

  // Primær: slett via kjent ID (satt av setTestPollId)
  if (testPollId) {
    const { error } = await supabase.from('poll').delete().eq('id', testPollId)
    if (error) console.error('[rydd-test-poll] ID-sletting feilet:', error)
    testPollId = null
  }

  // Sekundær fallback: slett alle poller med test-mønster i spørsmål. Fanger
  // opp tilfeller der testen feilet før setTestPollId() ble kalt, eller
  // der timeout hindret cleanup fra forrige kjøring.
  //
  // Prefiksene i TEST_MOENSTRE er reservert for tester. Alders-guarden
  // (opprettet < now() - 1 time) hindrer at en fersk ekte poll med
  // kolliderende navn slettes stille via service_role — etterlatte
  // test-poller fra en krasjet kjøring er alltid eldre enn dette og plukkes
  // opp av neste kjøring i stedet. Se #381.
  const timeGuard = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  for (const moenstre of TEST_MOENSTRE) {
    const { error } = await supabase
      .from('poll')
      .delete()
      .like('spoersmaal', moenstre)
      .lt('opprettet', timeGuard)
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
