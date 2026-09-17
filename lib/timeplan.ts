import type { SupabaseClient } from '@supabase/supabase-js'
import { naa } from '@/lib/dato'
import { ARRANGEMENT_ANTATT_TIMER } from '@/lib/posisjon'

export type AktueltArrangement = {
  id: string
  tittel: string
  startTidspunkt: string
  sluttTidspunkt: string | null
  /** sensurerte_felt.destinasjon === true — en blåtur. Nålen skal nektes. */
  destinasjonSensurert: boolean
}

type ArrangementRad = {
  id: string
  tittel: string
  start_tidspunkt: string
  slutt_tidspunkt: string | null
  sensurerte_felt: Record<string, boolean> | null
}

/**
 * Arrangementet timeplan-knappen på kartet skal peke til (#716).
 *
 * «Aktuelt» = ikke over ennå: et pågående arrangement (med SENEST start ved
 * overlapp — samme regel som finnPaagaaendeArrangement(), slik at «Sporer
 * X»-pilla og timeplan-panelet aldri navngir to ulike arrangementer på
 * samme skjerm), ellers det nærmeste FRAMTIDIGE. Ingen 7-dagersgrense: en
 * timeplan legges typisk inn lenge før avreise, og en usynlig vegg uten
 * forklaring er verre enn ingen grense i det hele tatt.
 *
 * Ingen typefilter — et årsmøte kan ha et program like gjerne som en tur.
 * Filtreres møter bort, kunne denne helperen og finnPaagaaendeArrangement()
 * (som heller ikke filtrerer) navngi to forskjellige arrangementer på samme
 * skjerm.
 *
 * Fail CLOSED (kaster), til forskjell fra finnPaagaaendeArrangement() som
 * feiler åpent. Der er utfallet av en feilet spørring «posisjonen lagres
 * uten spor-tilhørighet» — fortsatt nyttig. Her ville et fail-open gitt et
 * TOMT panel som lyver om innholdet i en beslutning («ingenting på
 * programmet» leses som «ingen har lagt inn noe», ikke som «vi klarte ikke
 * hente det»). Kallstedet (page.tsx) skal la feilen boble til feilsiden,
 * akkurat som for delinger/punkter/markeringer på samme side.
 */
export async function finnAktuellArrangement(
  supabase: SupabaseClient,
): Promise<AktueltArrangement | null> {
  const naaIso = naa()
  const tidligstStart = new Date(
    Date.now() - ARRANGEMENT_ANTATT_TIMER * 60 * 60 * 1000,
  ).toISOString()

  const FELTER = 'id, tittel, start_tidspunkt, slutt_tidspunkt, sensurerte_felt'

  // To parallelle spørringer i stedet for én med en OR-streng: vi trenger
  // BEGGE kandidatsettene for å avgjøre riktig vinner i JS (pågående slår
  // framtidig), og en RPC eller en tredje, sekvensiell rundtur ble avvist
  // under planleggingen — dette er fortsatt bølge 1, bare to promise-er i
  // stedet for én.
  const [
    { data: paagaaendeData, error: paagaaendeFeil },
    { data: fremtidigData, error: fremtidigFeil },
  ] = await Promise.all([
    // Samme vindu som finnPaagaaendeArrangement(): startet innen de siste
    // ARRANGEMENT_ANTATT_TIMER timene. Et arrangement UTEN sluttid regnes
    // som «over» utenfor dette vinduet.
    supabase
      .from('arrangementer')
      .select(FELTER)
      .lte('start_tidspunkt', naaIso)
      .gte('start_tidspunkt', tidligstStart)
      .order('start_tidspunkt', { ascending: false })
      .limit(5),
    supabase
      .from('arrangementer')
      .select(FELTER)
      .gt('start_tidspunkt', naaIso)
      .order('start_tidspunkt', { ascending: true })
      .limit(1),
  ])

  if (paagaaendeFeil) {
    throw new Error(`Kunne ikke hente pågående arrangement: ${paagaaendeFeil.message}`)
  }
  if (fremtidigFeil) {
    throw new Error(`Kunne ikke hente kommende arrangement: ${fremtidigFeil.message}`)
  }

  // Blant kandidatene i vinduet: filtrer bort dem som faktisk ER over (har
  // sluttid, og den er passert). new Date(...).getTime() — ALDRI streng-
  // sammenligning av ISO-tidsstempler (…+00:00 vs …Z er ikke det samme
  // sortert leksikalsk, se finnPaagaaendeArrangement()-historikken).
  const naaMs = Date.now()
  const paagaaende = ((paagaaendeData ?? []) as ArrangementRad[]).filter(
    a => !a.slutt_tidspunkt || new Date(a.slutt_tidspunkt).getTime() >= naaMs,
  )

  // Listen er sortert desc på start_tidspunkt, så første element er den som
  // startet SIST — riktig vinner ved overlapp.
  const vinner = paagaaende[0] ?? (fremtidigData?.[0] as ArrangementRad | undefined) ?? null
  if (!vinner) return null

  return {
    id: vinner.id,
    tittel: vinner.tittel,
    startTidspunkt: vinner.start_tidspunkt,
    sluttTidspunkt: vinner.slutt_tidspunkt,
    destinasjonSensurert: vinner.sensurerte_felt?.destinasjon === true,
  }
}
