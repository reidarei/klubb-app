'use server'

import { ensureInnlogget } from '@/lib/auth'

/**
 * Marker at brukeren har sett klubb-chat nå. Kalles fra /chat-siden ved
 * server-render — fjerner ulest-prikken på Chat-tab neste gang headeren
 * rendres. Bruker en Postgres-RPC slik at tidsstemplet settes med DB-ens
 * egen now() — samme klokke som klubb_chat.opprettet — for å unngå
 * klokkedrift mellom Node og Postgres.
 */
export async function markerChatSett() {
  const { supabase } = await ensureInnlogget()
  const { error } = await supabase.rpc('marker_chat_sett')
  // Feilen ble tidligere aldri hentet ut: feilet RPC-en, ble ulest-prikken
  // hengende uten et eneste spor. ESLint-regelen hk/supabase-feil-maa-hentes
  // fanget det ikke, fordi den sporer bruk av `data` — og her ble verken `data`
  // eller `error` rørt. Kallstedet i app/(app)/chat/page.tsx er fire-and-forget
  // med .catch(logg.feil), så et kast her blir synlig uten å velte siden.
  if (error) throw new Error(`marker_chat_sett feilet: ${error.message}`)
}
