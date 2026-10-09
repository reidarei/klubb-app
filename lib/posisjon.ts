import type { SupabaseClient } from '@supabase/supabase-js'
import { unstable_rethrow } from 'next/navigation'
import { DbFeil, logg } from '@/lib/logg'
import { MOETEMODUS_FOER_START_TIMER } from '@/lib/konstanter'

export type PaagaaendeArrangement = {
  id: string
  tittel: string
  type: string
  sluttTidspunkt: string | null
}

/**
 * Antatt varighet for et arrangement UTEN `slutt_tidspunkt` (se
 * finnPaagaaendeArrangementStrengt). Uten en grense ville en gammel tur uten
 * sluttid gjort hver posisjon til et spor som aldri ryddes — oppryddingsjobben
 * leter etter arrangementer som er OVER.
 */
export const ARRANGEMENT_ANTATT_TIMER = 12

// Hvor langt tilbake vi LETER etter et pågående arrangement. Ikke en
// varighetsregel — kun bounded spørring som fortsatt fanger flerdagsturer (#735).
export const PAAGAAENDE_MAKS_DAGER = 30

// Rådata, ikke PaagaaendeArrangement: rada er ikke nødvendigvis pågående —
// predikatet ligger hos kalleren, og møtemodus bruker et annet (#780).
export type NyligStartetArrangementRad = {
  id: string
  tittel: string
  type: string
  start_tidspunkt: string
  slutt_tidspunkt: string | null
}

/**
 * Rådata-spørringen bak finnPaagaaendeArrangementStrengt(): arrangementer som
 * startet innenfor PAAGAAENDE_MAKS_DAGER, nyeste først. Delt med møtemodus
 * (#780), som har et annet predikat på samme rådata — ikke dupliser spørringen.
 *
 * FAIL-CLOSED: spørringsfeil kastes som DbFeil, aldri `[]`.
 */
export async function hentNyligStartedeArrangementerStrengt(
  supabase: SupabaseClient,
): Promise<NyligStartetArrangementRad[]> {
  // Bred nedre grense, kun for bounded spørring; «pågår» avgjøres av kalleren.
  const eldsteAktuelle = new Date(
    Date.now() - PAAGAAENDE_MAKS_DAGER * 24 * 60 * 60 * 1000,
  ).toISOString()
  // Øvre grense er nå + møtemodus-forløpet, ikke nå: møtemodus slår seg på
  // FØR start. Radene kan derfor inneholde arrangementer som ikke har startet —
  // hvert predikat som betyr «har startet» må sjekke start_tidspunkt <= nå selv.
  const senesteStart = new Date(
    Date.now() + MOETEMODUS_FOER_START_TIMER * 60 * 60 * 1000,
  ).toISOString()

  const { data, error } = await supabase
    .from('arrangementer')
    .select('id, tittel, type, start_tidspunkt, slutt_tidspunkt')
    .lte('start_tidspunkt', senesteStart)
    .gte('start_tidspunkt', eldsteAktuelle)
    .order('start_tidspunkt', { ascending: false })
    .limit(20)

  // Fail-open-oversettelsen skjer ETT sted — i finnPaagaaendeArrangement().
  if (error) {
    throw new DbFeil(
      `Oppslag av pågående arrangement feilet: ${error.message}`,
      error.code,
    )
  }
  return data ?? []
}

/**
 * Arrangementet som pågår akkurat nå, hvis noe gjør det. Styrer bl.a. om en
 * innmeldt posisjon blir del av et SPOR (#695).
 *
 * «Pågår» = start passert og slutt ikke passert; uten sluttid gjelder
 * ARRANGEMENT_ANTATT_TIMER fra start. Ved overlapp vinner den som startet SIST.
 *
 * FAIL-CLOSED: spørringsfeil kastes (DbFeil, så PostgREST-koden overlever),
 * fordi kartmodus må skille «ingen tur pågår» fra «oppslaget feilet» (#723).
 * Posisjonsdeling og markeringer bruker fail-open-wrapperen under.
 */
export async function finnPaagaaendeArrangementStrengt(
  supabase: SupabaseClient,
  // sluttTidspunkt: markeringer arver utløpstid herfra (#697); null = «ikke
  // oppgitt», ikke «evig». type: reisemodus-predikatet ligger i
  // lib/reisemodus.ts — denne helperen definerer bare «pågår» (#723).
): Promise<PaagaaendeArrangement | null> {
  // Millisekunder, ikke ISO-strenger: PostgREST svarer «…+00:00», naa() gir
  // «…Z», og de sorterer ikke likt leksikalsk (#851, samme som lib/timeplan.ts).
  const naaMs = Date.now()
  const tidligstStartMs = naaMs - ARRANGEMENT_ANTATT_TIMER * 60 * 60 * 1000

  // Timesgrensen hører KUN til grenen uten sluttid — i spørringen ville den
  // kuttet flerdagsturer fra dag 2 (#735). Samme asymmetri som oppryddingsjobben.
  const data = await hentNyligStartedeArrangementerStrengt(supabase)

  // start <= nå: radene kan inneholde møter som ennå ikke har startet (møtemodus-forløpet).
  const kandidat = data.find(a => {
    const startMs = new Date(a.start_tidspunkt).getTime()
    return startMs <= naaMs &&
      (a.slutt_tidspunkt
        ? new Date(a.slutt_tidspunkt).getTime() >= naaMs
        : startMs >= tidligstStartMs)
  })
  return kandidat
    ? { id: kandidat.id, tittel: kandidat.tittel, type: kandidat.type, sluttTidspunkt: kandidat.slutt_tidspunkt }
    : null
}

/**
 * FAIL-OPEN-varianten for posisjonsdeling (#693/#695) og kartmarkeringer (#697):
 * feiler oppslaget, lagres posisjonen likevel som et løst punkt uten spor —
 * en treg spørring skal ikke bli «du får ikke dele posisjon». Logges som warn
 * så en feil ikke ser ut som en rolig dag.
 */
export async function finnPaagaaendeArrangement(
  supabase: SupabaseClient,
): Promise<PaagaaendeArrangement | null> {
  try {
    return await finnPaagaaendeArrangementStrengt(supabase)
  } catch (err) {
    // Next signaliserer «må rendres dynamisk» med en throw under `next build`;
    // svelges den, logges hvert byggoppslag som spørringsfeil (jf. lib/kartmodus.ts).
    unstable_rethrow(err)
    logg.warn('posisjon.paagaaende.feilet', {
      code: err instanceof DbFeil ? (err.code ?? 'ukjent') : 'ukjent',
    })
    return null
  }
}
