import type { SupabaseClient } from '@supabase/supabase-js'
import { naa } from '@/lib/dato'

/**
 * Arrangementet som pågår akkurat nå, hvis noe gjør det.
 *
 * Styrer om en innmeldt posisjon blir en del av et SPOR (#695) eller bare
 * oppdaterer hvor mannen sist var sett. Uten et pågående arrangement finnes det
 * ingen kveld å tegne en rute for, og punktene har ingenting å høre til.
 *
 * «Pågår» = start passert og slutt ikke passert. Et arrangement UTEN
 * `slutt_tidspunkt` regnes som pågående i ARRANGEMENT_ANTATT_TIMER etter start:
 * uten en grense ville en gammel tur uten sluttid gjort hver eneste posisjon
 * til en del av et spor som aldri ble ryddet, fordi oppryddingsjobben leter
 * etter arrangementer som er OVER.
 *
 * Returnerer den som startet SIST når flere overlapper — er du på to ting
 * samtidig, er det den ferskeste du faktisk er på.
 */
export const ARRANGEMENT_ANTATT_TIMER = 12

export async function finnPaagaaendeArrangement(
  supabase: SupabaseClient,
  // sluttTidspunkt er med fordi kartmarkeringer (#697) lar utløpstiden sin
  // følge arrangementets slutt. null betyr «ingen sluttid oppgitt», ikke
  // «varer evig» — kallstedet må da bestemme selv hva som er rimelig.
): Promise<{ id: string; tittel: string; sluttTidspunkt: string | null } | null> {
  const naaIso = naa()
  const tidligstStart = new Date(
    Date.now() - ARRANGEMENT_ANTATT_TIMER * 60 * 60 * 1000,
  ).toISOString()

  const { data, error } = await supabase
    .from('arrangementer')
    .select('id, tittel, slutt_tidspunkt')
    .lte('start_tidspunkt', naaIso)
    // Grensen gjelder begge grener: med sluttid må starten uansett være innenfor
    // et døgn-ish, ellers ville en ukelang tur gjort hele uka til ett spor.
    .gte('start_tidspunkt', tidligstStart)
    .order('start_tidspunkt', { ascending: false })
    .limit(5)

  // Fail-open med vilje: klarer vi ikke slå opp arrangementet, skal posisjonen
  // fortsatt kunne lagres — den blir bare et løst punkt uten spor-tilhørighet.
  // Å kaste her ville gjort en treg spørring til «du får ikke dele posisjon».
  if (error || !data) return null

  const kandidat = data.find(a => !a.slutt_tidspunkt || a.slutt_tidspunkt >= naaIso)
  return kandidat
    ? { id: kandidat.id, tittel: kandidat.tittel, sluttTidspunkt: kandidat.slutt_tidspunkt }
    : null
}
