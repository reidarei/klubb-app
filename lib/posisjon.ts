import type { SupabaseClient } from '@supabase/supabase-js'
import { unstable_rethrow } from 'next/navigation'
import { naa } from '@/lib/dato'
import { DbFeil, logg } from '@/lib/logg'

export type PaagaaendeArrangement = {
  id: string
  tittel: string
  type: string
  sluttTidspunkt: string | null
}

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

// Rådataformen fra hentNyligStartedeArrangementerStrengt() — bevisst navngitt
// med snake_case-feltene direkte fra spørringen, ikke PaagaaendeArrangement:
// denne rada er ikke NØDVENDIGVIS pågående ennå (predikatet ligger hos
// kalleren), og et navn som lovet det ville vært misvisende for moetemodus
// (#780), som leter etter en annen betingelse på SAMME rådata.
export type NyligStartetArrangementRad = {
  id: string
  tittel: string
  type: string
  start_tidspunkt: string
  slutt_tidspunkt: string | null
}

/**
 * Rådata-spørringen bak finnPaagaaendeArrangementStrengt() — arrangementer som
 * startet innenfor PAAGAAENDE_MAKS_DAGER, nyeste først. Trukket ut til egen
 * funksjon (#780) fordi møtemodus trenger NØYAKTIG samme rådata, men et annet
 * predikat («møte, ikke passert 06:00 dagen etter» i stedet for «pågår nå»):
 * å duplisere spørringen ville latt de to driftet fra hverandre på grenser og
 * limit uten at noen merket det.
 *
 * FAIL-CLOSED, som resten av denne fila: en spørringsfeil KASTES (DbFeil) i
 * stedet for å bli til `null`/`[]` — se begrunnelsen på
 * finnPaagaaendeArrangementStrengt() under.
 */
export async function hentNyligStartedeArrangementerStrengt(
  supabase: SupabaseClient,
): Promise<NyligStartetArrangementRad[]> {
  const naaIso = naa()
  // Bred nedre grense, kun for å holde spørringen bounded. Den ekte
  // avgrensningen (hva som faktisk «pågår») gjøres av kalleren, per predikat.
  const eldsteAktuelle = new Date(
    Date.now() - PAAGAAENDE_MAKS_DAGER * 24 * 60 * 60 * 1000,
  ).toISOString()

  const { data, error } = await supabase
    .from('arrangementer')
    .select('id, tittel, type, start_tidspunkt, slutt_tidspunkt')
    .lte('start_tidspunkt', naaIso)
    .gte('start_tidspunkt', eldsteAktuelle)
    .order('start_tidspunkt', { ascending: false })
    .limit(20)

  // Kaster: «ingen rader» og «spørringen feilet» må være to ulike utfall for
  // kalleren. Fail-open-oversettelsen skjer ÉTT sted — i wrapperen under.
  if (error) {
    throw new DbFeil(
      `Oppslag av pågående arrangement feilet: ${error.message}`,
      error.code,
    )
  }
  return data ?? []
}

/**
 * FAIL-CLOSED-varianten: en spørringsfeil KASTES (DbFeil, så PostgREST-koden
 * overlever innpakkingen) i stedet for å bli til `null`.
 *
 * Finnes fordi `null` fra fail-open-varianten under betyr to vidt forskjellige
 * ting — «ingen tur pågår» og «oppslaget feilet» — og reisemodus (#723) må
 * kunne skille dem: uten skillet kan prod ikke se forskjell på en rolig dag og
 * en database som er nede (#723-review). Posisjonsdeling og kartmarkeringer
 * skal fortsatt fail-ope og bruker wrapperen under.
 */
export async function finnPaagaaendeArrangementStrengt(
  supabase: SupabaseClient,
  // sluttTidspunkt er med fordi kartmarkeringer (#697) lar utløpstiden sin
  // følge arrangementets slutt. null betyr «ingen sluttid oppgitt», ikke
  // «varer evig» — kallstedet må da bestemme selv hva som er rimelig.
  //
  // type er med fordi reisemodus (#723) trenger å skille en tur fra et møte
  // — predikatet (type === 'tur' && sluttTidspunkt !== null) skrives
  // eksplisitt i lib/reisemodus.ts, ikke her: denne helperen definerer
  // «pågår», ikke «utløser reisemodus».
): Promise<PaagaaendeArrangement | null> {
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
  const data = await hentNyligStartedeArrangementerStrengt(supabase)

  // Med sluttid: pågår til sluttiden. Uten sluttid: antatt varighet fra start —
  // den grenen MÅ ha en cap, ellers ville et gammelt arrangement uten sluttid
  // stått som «pågående» for alltid.
  const kandidat = data.find(a =>
    a.slutt_tidspunkt
      ? a.slutt_tidspunkt >= naaIso
      : a.start_tidspunkt >= tidligstStart,
  )
  return kandidat
    ? { id: kandidat.id, tittel: kandidat.tittel, type: kandidat.type, sluttTidspunkt: kandidat.slutt_tidspunkt }
    : null
}

/**
 * FAIL-OPEN-varianten, brukt av posisjonsdeling (#693/#695) og kartmarkeringer
 * (#697): klarer vi ikke slå opp arrangementet, skal posisjonen fortsatt kunne
 * lagres — den blir bare et løst punkt uten spor-tilhørighet. Å kaste her ville
 * gjort en treg spørring til «du får ikke dele posisjon».
 *
 * Feilen logges likevel (warn, ikke feil) slik at en feilet spørring ikke ser
 * ut som en rolig dag i observability. Oppførselen er bit-for-bit den samme som
 * før #723-reviewen — kun feilkanalen er flyttet inn hit fra spørringen selv.
 */
export async function finnPaagaaendeArrangement(
  supabase: SupabaseClient,
): Promise<PaagaaendeArrangement | null> {
  try {
    return await finnPaagaaendeArrangementStrengt(supabase)
  } catch (err) {
    // Next signaliserer «denne ruten må rendres dynamisk» med en throw under
    // `next build`. Svelges den her, logges hvert sideoppslag i bygget som en
    // ekte spørringsfeil — samme grep som i lib/reisemodus.ts.
    unstable_rethrow(err)
    logg.warn('posisjon.paagaaende.feilet', {
      code: err instanceof DbFeil ? (err.code ?? 'ukjent') : 'ukjent',
    })
    return null
  }
}
