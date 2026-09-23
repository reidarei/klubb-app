import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { logg } from '@/lib/logg'

type DB = SupabaseClient<Database>

// Henter aggregat (valg_id → antall) for én kåringspoll via RPC.
// Bruker tell_poll_stemmer (mig. 079) som er SECURITY DEFINER og dermed
// gir totaler uten å lekke profil_id. Klient-koden ville ellers sett kun
// egne stemmer pga. RLS i mig. 076.
export async function hentPollStemmerAggregat(
  supabase: DB,
  pollId: string,
): Promise<Map<string, number>> {
  const { map, error } = await kjoerAggregat(supabase, pollId)
  if (error) await loggAggregatFeil([error])
  return map
}

// Intern: kjører RPC-en og RETURNERER feilen i stedet for å logge den, slik at
// batch-varianten kan slå N feil sammen til én Sentry-event. Uten dette ble en
// ødelagt RPC til opptil 30 events per sidelast per bruker — felles fingerprint
// løser gruppering, ikke kvoteforbruk (#492 review).
async function kjoerAggregat(
  supabase: DB,
  pollId: string,
): Promise<{ map: Map<string, number>; error: PostgrestError | null }> {
  const map = new Map<string, number>()
  const { data, error } = await supabase.rpc('tell_poll_stemmer', {
    p_poll_id: pollId,
  })
  if (error) return { map, error }
  if (!data) return { map, error: null }
  for (const r of data as { valg_id: string; antall: number }[]) {
    map.set(r.valg_id, Number(r.antall))
  }
  return { map, error: null }
}

// Én logglinje uansett hvor mange kall som feilet. `count` = antall feilede
// kall, `antall` ville vært et penere navn men whitelisten i lib/logg.ts
// slipper kun gjennom `count`. Første feil brukes som representant — de er i
// praksis identiske (samme RPC, samme årsak).
// `.catch` fordi en logger aldri skal velte kallstedet (samme grunn som på
// /tidligere; intern try/catch i logg.feil hører til #496).
async function loggAggregatFeil(feil: PostgrestError[]) {
  if (feil.length === 0) return
  await logg
    .feil('poll.aggregat.feilet', feil[0], {
      fingerprint: 'poll.aggregat.feilet',
      ctx: { code: feil[0]?.code, count: feil.length },
    })
    .catch(() => {})
}

// Batch-variant for agenda — kjører N kall i parallell. Hvis vi får mange
// kåringspoller samtidig kan dette bli én RPC-runde mer enn nødvendig,
// men antallet aktive kåringspoller per agenda-vindu er svært lavt
// (typisk 0–2), så enkelheten vinner over én round-trip-besparelse.
// UI-konsekvensen av en feilet RPC (0 stemmer vises) fikses ikke her — #499.
export async function hentPollStemmerAggregatBatch(
  supabase: DB,
  pollIds: string[],
): Promise<Map<string, Map<string, number>>> {
  const result = new Map<string, Map<string, number>>()
  if (pollIds.length === 0) return result
  const svar = await Promise.all(pollIds.map(id => kjoerAggregat(supabase, id)))
  pollIds.forEach((id, i) => result.set(id, svar[i].map))
  await loggAggregatFeil(
    svar.map(s => s.error).filter((e): e is PostgrestError => e != null),
  )
  return result
}
