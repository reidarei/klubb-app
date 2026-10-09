import type { SupabaseClient } from '@supabase/supabase-js'
import { unstable_rethrow } from 'next/navigation'
import type { Database } from '@/lib/supabase/database.types'
import { DbFeil } from '@/lib/logg'

// Nøkler i app_innstillinger — bruk konstantene, så typos fanges ved kompilering.
export const FOND_FANE = 'fond_fane'
export const CHAT_FANE = 'chat_fane'
// Kill-switch for reisemodus (#723/#724) — fallback false, se lib/reisemodus.ts.
export const REISEMODUS = 'reisemodus'
// Kill-switch for møtemodus (#780) — fallback false, se lib/moetemodus.ts.
export const MOETEMODUS = 'moetemodus'
// KI-bursdagsbilde (#641), I TILLEGG til BURSDAGSBILDE_PAA: credentials avgjør
// om instansen KAN, flagget om klubben VIL. Fallback false — et eksternt
// KI-kall skal aldri skje fordi flagget ikke lot seg lese.
export const BURSDAGSBILDE = 'bursdagsbilde'

// Register over kjente flagg; nye flagg legges til her. beskrivelse sendes med
// i upserten for INSERT-grenen på en fersk instans (kolonnen er nullable, mig. 111).
// Enkelt-objekt-upsert setter kun egne kolonner ved konflikt; et bulk-upsert
// ville nullet manglende nøkler (#771, #767).
export const KJENTE_FLAGG = {
  [FOND_FANE]: { beskrivelse: 'Vis Fond-fanen for alle medlemmer' },
  [CHAT_FANE]: { beskrivelse: 'Vis Chat-fanen for alle medlemmer' },
  [REISEMODUS]: { beskrivelse: 'Vis reisemodus (fullskjerm kart) mens en tur med sluttid pågår' },
  [MOETEMODUS]: { beskrivelse: 'Vis møtemodus (fullskjerm kart) fra møtestart til kl. 06 dagen etter' },
  [BURSDAGSBILDE]: { beskrivelse: 'Lag KI-generert bursdagsbilde til bursdagskortet' },
} as const

export type Flaggnoekkel = keyof typeof KJENTE_FLAGG

// Object.hasOwn, ikke `in`: `in` slipper gjennom Object.prototype
// ('toString' in KJENTE_FLAGG er sant).
export function erKjentFlagg(noekkel: string): noekkel is Flaggnoekkel {
  return Object.hasOwn(KJENTE_FLAGG, noekkel)
}

/**
 * Fail-closed: kaster ved spørringsfeil og skiller «ingen rad» (null) fra
 * «raden sier av» (false) — for kallere som må se forskjell på «av» og
 * «kunne ikke lese» (#723).
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
  return data?.aktiv ?? null
}

/**
 * Henter ett flagg; manglende rad eller feil gir `fallback`. Default false er
 * riktig for flagg som eksponerer innhold (fond). Flagg som skjuler
 * eksisterende innhold (chat) bør sende true, så en DB-feil ikke gjemmer fanen.
 */
export async function hentAppFlagg(
  supabase: SupabaseClient<Database>,
  noekkel: string,
  fallback = false,
): Promise<boolean> {
  try {
    return (await hentAppFlaggStrengt(supabase, noekkel)) ?? fallback
  } catch (err) {
    // Next sitt dynamic-bailout-signal er en throw og må aldri svelges her.
    unstable_rethrow(err)
    return fallback
  }
}
