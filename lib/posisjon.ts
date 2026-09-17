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

// Hvor langt tilbake vi i det hele tatt LETER etter et pågående arrangement.
// Ikke en varighetsregel — kun en grense som holder spørringen bounded, så en
// flerdagstur fanges uten at vi drar inn hele historikken (#735).
export const PAAGAAENDE_MAKS_DAGER = 30

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

  // Et arrangement MED sluttid varer til sluttiden, uansett hvor lenge siden det
  // startet. Fram til #735 lå 12-timersgrensen i selve spørringen og gjaldt begge
  // grener — da sluttet en flerdagstur å være «pågående» fra og med dag 2, midt i
  // turen: nye punkter mistet arrangement_id, kartet falt til 24-timersvinduet, og
  // markeringer sluttet å arve turens sluttid. Oppryddingsjobben har alltid hatt
  // den riktige, asymmetriske regelen (kun grenen UTEN sluttid er capet); dette
  // bringer helperen i synk med den.
  const eldsteAktuelle = new Date(
    Date.now() - PAAGAAENDE_MAKS_DAGER * 24 * 60 * 60 * 1000,
  ).toISOString()

  const { data, error } = await supabase
    .from('arrangementer')
    .select('id, tittel, start_tidspunkt, slutt_tidspunkt')
    .lte('start_tidspunkt', naaIso)
    // Bred nedre grense, kun for å holde spørringen bounded. Den ekte
    // avgrensningen gjøres per gren i .find() under.
    .gte('start_tidspunkt', eldsteAktuelle)
    .order('start_tidspunkt', { ascending: false })
    .limit(20)

  // Fail-open med vilje: klarer vi ikke slå opp arrangementet, skal posisjonen
  // fortsatt kunne lagres — den blir bare et løst punkt uten spor-tilhørighet.
  // Å kaste her ville gjort en treg spørring til «du får ikke dele posisjon».
  if (error || !data) return null

  // Med sluttid: pågår til sluttiden. Uten sluttid: antatt varighet fra start —
  // den grenen MÅ ha en cap, ellers ville et gammelt arrangement uten sluttid
  // stått som «pågående» for alltid.
  const kandidat = data.find(a =>
    a.slutt_tidspunkt
      ? a.slutt_tidspunkt >= naaIso
      : a.start_tidspunkt >= tidligstStart,
  )
  return kandidat
    ? { id: kandidat.id, tittel: kandidat.tittel, sluttTidspunkt: kandidat.slutt_tidspunkt }
    : null
}
