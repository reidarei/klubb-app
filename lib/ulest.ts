import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { logg } from '@/lib/logg'

/**
 * Returnerer true hvis det finnes klubb_chat-meldinger fra andre enn brukeren
 * selv som er nyere enn `sistSett`. Brukes til ulest-prikken på Chat-tab i
 * TopHeader. Tar `sistSett` som parameter (typisk fra `getProfil()`) for å
 * spare en ekstra runde mot `profiles` — kallstedet har allerede lest raden.
 *
 * Bruker eksisterende indeks på `klubb_chat (opprettet desc)` (migrasjon 038).
 * Ingen ny indeks lagt til — 15–20 brukere og lav volum gjør det unødvendig.
 *
 * `select('id').limit(1)` i stedet for `count: 'exact', head: true` (#504):
 * vi returnerer uansett bare `count > 0`, men `count: 'exact'` tvinger
 * Postgres til å telle ALLE matchende rader ved hver sidevisning — kalles fra
 * `(app)/layout.tsx`, altså på hver eneste sidelast. `limit(1)` stopper ved
 * første treff.
 */
export async function harUlestChat(
  supabase: SupabaseClient<Database>,
  brukerId: string,
  sistSett: string | null,
): Promise<boolean> {
  // Null = aldri åpnet chat → alt regnes som ulest (alle meldinger fra andre).
  const cutoff = sistSett ?? '1970-01-01T00:00:00Z'

  const { data, error } = await supabase
    .from('klubb_chat')
    .select('id')
    .gt('opprettet', cutoff)
    .neq('profil_id', brukerId)
    .limit(1)

  // Fail-open, MED logging: kalles ved hver sidevisning (app/(app)/layout.tsx)
  // for kun en ulest-prikk i headeren — å kaste her ville tatt ned hele appen
  // for én prikk (se CLAUDE.md § Policy: Databasespørringer).
  if (error) logg.warn('ulest.chat.oppslag.feilet', { code: error.code })
  return (data?.length ?? 0) > 0
}

/**
 * Returnerer true hvis brukeren har minst én ulest OG VIKTIG rad i
 * `varsel_logg`. Brukes til ulest-prikken på profil-avataren i TopHeader. Vi
 * trenger ingen `sist_sett`-kolonne her fordi `varsel_logg.lest` bærer
 * per-rad-statusen — markering skjer automatisk når man åpner et varsel
 * eller bruker "Marker alle som lest"-knappen på profilsiden.
 *
 * `teller_ulest`-filteret (#612) er bevisst: chat-broadcastene (opptil 17
 * per melding) skrives med `teller_ulest = false` nettopp for at de IKKE
 * skal tenne denne prikken — samme filter som "Viktig"-fanen på /profil
 * (VarslerListe) og tellingen i tittelen der bruker. De to skal aldri lyve
 * mot hverandre (jf. #207-lærdommen: en prikk og en telling som ikke er
 * enige er verre enn ingen av delene).
 *
 * Samme `limit(1)`-optimalisering som harUlestChat over (#504) — nå også
 * understøttet av den partial-indeksen `varsel_logg_profil_ulest_idx`
 * (mig. 121, omlagt i mig. 134) som dekker nettopp
 * `(profil_id) where lest = false and teller_ulest`.
 */
export async function harUlestVarsler(
  supabase: SupabaseClient<Database>,
  brukerId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('varsel_logg')
    .select('id')
    .eq('profil_id', brukerId)
    .eq('lest', false)
    .eq('teller_ulest', true)
    .limit(1)

  // Fail-open, MED logging — samme begrunnelse som harUlestChat over.
  if (error) logg.warn('ulest.varsler.oppslag.feilet', { code: error.code })
  return (data?.length ?? 0) > 0
}
