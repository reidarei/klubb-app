import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

// Nøkkelkonstant — speiler primærnøkkelen i app_innstillinger-tabellen.
// Bruk denne i stedet for strengliteralen direkte, så vi fanger typos ved kompilering.
export const FOND_FANE = 'fond_fane'

// Registret over kjente funksjonsflagg med metadata. Nye flagg legges til her.
// beskrivelse tas med i upsert (se oppdaterAppInnstilling) slik at en manglende
// rad opprettes med riktig tekst i stedet for NULL — beskrivelse er nullable i
// migrasjon 111, så en upsert som utelater den ville nulle feltet ved konflikt.
export const KJENTE_FLAGG = {
  [FOND_FANE]: { beskrivelse: 'Vis Fond-fanen for alle medlemmer' },
} as const

export type Flaggnoekkel = keyof typeof KJENTE_FLAGG

export function erKjentFlagg(noekkel: string): noekkel is Flaggnoekkel {
  return noekkel in KJENTE_FLAGG
}

/**
 * Henter ett funksjonsflagg fra app_innstillinger.
 * Returnerer false ved manglende rad eller nettverksfeil — trygg default
 * som aldri eksponerer innhold som er ment å være admin-eksklusivt.
 */
export async function hentAppFlagg(
  supabase: SupabaseClient<Database>,
  noekkel: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('app_innstillinger')
    .select('aktiv')
    .eq('noekkel', noekkel)
    .maybeSingle()
  return data?.aktiv ?? false
}
