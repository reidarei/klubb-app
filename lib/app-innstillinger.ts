import type { SupabaseClient } from '@supabase/supabase-js'
import { unstable_rethrow } from 'next/navigation'
import type { Database } from '@/lib/supabase/database.types'
import { DbFeil } from '@/lib/logg'

// Nøkkelkonstanter — speiler primærnøkkelen i app_innstillinger-tabellen.
// Bruk disse i stedet for strengliteralen direkte, så vi fanger typos ved kompilering.
export const FOND_FANE = 'fond_fane'
export const CHAT_FANE = 'chat_fane'
// Kill-switch for reisemodus (#723/#724) — fallback false, se lib/reisemodus.ts.
export const REISEMODUS = 'reisemodus'

// Registret over kjente funksjonsflagg med metadata. Nye flagg legges til her.
// beskrivelse tas med i upsert (se oppdaterAppInnstilling) slik at en manglende
// rad opprettes med riktig tekst i stedet for NULL — beskrivelse er nullable i
// migrasjon 111, så en upsert som utelater den ville nulle feltet ved konflikt.
export const KJENTE_FLAGG = {
  [FOND_FANE]: { beskrivelse: 'Vis Fond-fanen for alle medlemmer' },
  [CHAT_FANE]: { beskrivelse: 'Vis Chat-fanen for alle medlemmer' },
  [REISEMODUS]: { beskrivelse: 'Vis reisemodus (fullskjerm kart) mens en tur med sluttid pågår' },
} as const

export type Flaggnoekkel = keyof typeof KJENTE_FLAGG

export function erKjentFlagg(noekkel: string): noekkel is Flaggnoekkel {
  return noekkel in KJENTE_FLAGG
}

/**
 * FAIL-CLOSED-varianten: kaster ved spørringsfeil, og skiller «ingen rad»
 * (null) fra «raden finnes og sier av» (false).
 *
 * Finnes av samme grunn som finnPaagaaendeArrangementStrengt(): en kaller som
 * må kunne se forskjell på «kill-switchen er av» og «vi fikk ikke lest
 * flagget» får ikke det skillet gjennom en boolsk fallback (#723-review).
 */
export async function hentAppFlaggStrengt(
  supabase: SupabaseClient<Database>,
  noekkel: string,
): Promise<boolean | null> {
  const { data, error } = await supabase
    .from('app_innstillinger')
    .select('aktiv')
    .eq('noekkel', noekkel)
    .maybeSingle()
  if (error) {
    throw new DbFeil(`Flagg-oppslag feilet for «${noekkel}»: ${error.message}`, error.code)
  }
  // null = ingen rad. Kalleren bestemmer hva det skal bety — hentAppFlagg()
  // under lar det falle til `fallback`, akkurat som før.
  return data?.aktiv ?? null
}

/**
 * Henter ett funksjonsflagg fra app_innstillinger.
 * Ved manglende rad eller nettverksfeil returneres `fallback`. Default false =
 * fail-closed, riktig for flagg som eksponerer admin-eksklusivt innhold (fond).
 * Flagg som skjuler eksisterende innhold (chat) bør sende fallback=true, så en
 * forbigående DB-feil ikke gjemmer fanen for medlemmene.
 */
export async function hentAppFlagg(
  supabase: SupabaseClient<Database>,
  noekkel: string,
  fallback = false,
): Promise<boolean> {
  try {
    return (await hentAppFlaggStrengt(supabase, noekkel)) ?? fallback
  } catch (err) {
    // Se lib/posisjon.ts: Next sitt dynamic-bailout-signal er en throw og må
    // aldri svelges av en fail-open-wrapper.
    unstable_rethrow(err)
    return fallback
  }
}
