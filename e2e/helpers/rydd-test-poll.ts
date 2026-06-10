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

export async function ryddTestPoll() {
  if (!testPollId) return
  const env = lastEnv()
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
  )
  const { error } = await supabase.from('poll').delete().eq('id', testPollId)
  if (error) console.error('[rydd-test-poll] Sletting feilet:', error)
  testPollId = null
}

/**
 * Hjelper som trekker ut poll-id fra en URL som `/poll/<uuid>`.
 */
export function pollIdFraUrl(url: string): string {
  const match = url.match(/\/poll\/([0-9a-f-]+)/)
  if (!match) throw new Error(`Kunne ikke parse poll-id fra: ${url}`)
  return match[1]
}
