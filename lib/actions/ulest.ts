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
  await supabase.rpc('marker_chat_sett')
}
