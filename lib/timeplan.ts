import type { SupabaseClient } from '@supabase/supabase-js'
import { naa } from '@/lib/dato'
import { ARRANGEMENT_ANTATT_TIMER, PAAGAAENDE_MAKS_DAGER } from '@/lib/posisjon'

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
 * «Aktuelt» = pågående (SENEST start ved overlapp), ellers nærmeste framtidige.
 * Pågående-regelen og fraværet av typefilter MÅ speile finnPaagaaendeArrangement(),
 * ellers kan «Sporer X»-pilla og timeplan-panelet navngi ulike arrangementer.
 * Ingen grense framover: timeplaner legges inn lenge før avreise.
 *
 * Fail CLOSED: et tomt panel ville løyet («ingen har lagt inn noe»), så
 * feilen skal boble til feilsiden fra page.tsx.
 */
export async function finnAktuellArrangement(
  supabase: SupabaseClient,
): Promise<AktueltArrangement | null> {
  const naaIso = naa()
  const tidligstStart = new Date(
    Date.now() - ARRANGEMENT_ANTATT_TIMER * 60 * 60 * 1000,
  ).toISOString()
  const eldsteAktuelle = new Date(
    Date.now() - PAAGAAENDE_MAKS_DAGER * 24 * 60 * 60 * 1000,
  ).toISOString()

  const FELTER = 'id, tittel, start_tidspunkt, slutt_tidspunkt, sensurerte_felt'

  // To parallelle spørringer: begge kandidatsettene trengs for å velge vinner
  // i JS (pågående slår framtidig), uten en ekstra sekvensiell rundtur.
  const [
    { data: paagaaendeData, error: paagaaendeFeil },
    { data: fremtidigData, error: fremtidigFeil },
  ] = await Promise.all([
    // Bred nedre grense, kun for bounded spørring. ARRANGEMENT_ANTATT_TIMER
    // hører hjemme i filteret under, ellers faller flerdagsturer ut (#735/#736).
    supabase
      .from('arrangementer')
      .select(FELTER)
      .lte('start_tidspunkt', naaIso)
      .gte('start_tidspunkt', eldsteAktuelle)
      .order('start_tidspunkt', { ascending: false })
      .limit(20),
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

  // getTime(), ALDRI strengsammenligning av ISO-tidsstempler: «…+00:00» og «…Z»
  // sorterer ikke likt leksikalsk.
  const naaMs = Date.now()
  // Med sluttid: til sluttiden. Uten: capet antatt varighet (speiler
  // finnPaagaaendeArrangement(), #735/#736).
  const tidligstStartMs = new Date(tidligstStart).getTime()
  const paagaaende = ((paagaaendeData ?? []) as ArrangementRad[]).filter(a =>
    a.slutt_tidspunkt
      ? new Date(a.slutt_tidspunkt).getTime() >= naaMs
      : new Date(a.start_tidspunkt).getTime() >= tidligstStartMs,
  )

  // Sortert desc, så første element startet SIST — vinner ved overlapp.
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
