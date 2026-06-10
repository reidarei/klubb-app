import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

type DB = SupabaseClient<Database>

// Henter aggregat (valg_id → antall) for én kåringspoll via RPC.
// Bruker tell_poll_stemmer (mig. 079) som er SECURITY DEFINER og dermed
// gir totaler uten å lekke profil_id. Klient-koden ville ellers sett kun
// egne stemmer pga. RLS i mig. 076.
export async function hentPollStemmerAggregat(
  supabase: DB,
  pollId: string,
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  const { data, error } = await supabase.rpc('tell_poll_stemmer', {
    p_poll_id: pollId,
  })
  if (error || !data) return map
  for (const r of data as { valg_id: string; antall: number }[]) {
    map.set(r.valg_id, Number(r.antall))
  }
  return map
}

// Batch-variant for agenda — kjører N kall i parallell. Hvis vi får mange
// kåringspoller samtidig kan dette bli én RPC-runde mer enn nødvendig,
// men antallet aktive kåringspoller per agenda-vindu er svært lavt
// (typisk 0–2), så enkelheten vinner over én round-trip-besparelse.
export async function hentPollStemmerAggregatBatch(
  supabase: DB,
  pollIds: string[],
): Promise<Map<string, Map<string, number>>> {
  const result = new Map<string, Map<string, number>>()
  if (pollIds.length === 0) return result
  const aggregater = await Promise.all(
    pollIds.map(id => hentPollStemmerAggregat(supabase, id)),
  )
  pollIds.forEach((id, i) => result.set(id, aggregater[i]))
  return result
}
