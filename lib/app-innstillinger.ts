import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

// Nøkkelkonstanter — speiler primærnøkkelen i app_innstillinger-tabellen.
// Bruk disse i stedet for strengliteralen direkte, så vi fanger typos ved kompilering.
export const FOND_FANE = 'fond_fane'
export const CHAT_FANE = 'chat_fane'

// Registret over kjente funksjonsflagg med metadata. Nye flagg legges til her.
// beskrivelse tas med i upsert (se oppdaterAppInnstilling) slik at en manglende
// rad opprettes med riktig tekst i stedet for NULL — beskrivelse er nullable i
// migrasjon 111, så en upsert som utelater den ville nulle feltet ved konflikt.
export const KJENTE_FLAGG = {
  [FOND_FANE]: { beskrivelse: 'Vis Fond-fanen for alle medlemmer' },
  [CHAT_FANE]: { beskrivelse: 'Vis Chat-fanen for alle medlemmer' },
} as const

export type Flaggnoekkel = keyof typeof KJENTE_FLAGG

export function erKjentFlagg(noekkel: string): noekkel is Flaggnoekkel {
  return noekkel in KJENTE_FLAGG
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
  const { data, error } = await supabase
    .from('app_innstillinger')
    .select('aktiv')
    .eq('noekkel', noekkel)
    .maybeSingle()
  if (error) return fallback
  return data?.aktiv ?? fallback
}
