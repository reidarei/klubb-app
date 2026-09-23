import {
  sendKaaringspollVinnerVarsel,
  sendKaaringspollTiebreakVarsel,
  sendKaaringspollIngenStemmerVarsel,
} from '@/lib/varsler'
import { naa } from '@/lib/dato'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

// Utleder hvilken varsel-status en AVSLUTTET kåringspoll skulle hatt, ut fra
// den durable tiebreak_status-kolonnen — brukes av retry-spørringen i
// paaminnelser.ts (poller der var_ny var false, dvs. RPC-en fant en allerede
// lukket poll). Mapping speiler check-constraintet i migrasjon 072
// (`tiebreak_status in ('venter_paa_tiebreak', 'avgjort')` eller null):
// en ny tiebreak_status-verdi der krever at denne mappingen oppdateres.
//
// Merk: velgTiebreakVinner() flipper 'venter_paa_tiebreak' → 'avgjort' når
// generalsekretæren løser en tiebreak manuelt. Denne funksjonen kan derfor
// returnere 'avgjort' for en poll som opprinnelig ble LUKKET som tiebreak —
// det er riktig: vinneren er nå avgjort, og det ER det varselet som skal ut.
// De tre utfallene avslutt_kaaringspoll-RPC-en kan gi. Navngitt så
// stempleKaaringspollVarslet() kan kreve den — en fjerde status ville
// ellers falt stille til else-grenen og stemplet vinner_varslet_paa,
// som permanent filtrerer pollen bort fra retry. Se #521.
export type KaaringUtfall = 'avgjort' | 'venter_paa_tiebreak' | 'ingen_stemmer'

// Narrowing for RPC-svar. Returnerer false på en ukjent status i stedet for
// å la den falle gjennom til feil stempel-kolonne — kallstedet må da ta et
// bevisst valg (typisk: logg og hopp over, så retry plukker den opp igjen).
export function erKaaringUtfall(s: unknown): s is KaaringUtfall {
  return s === 'avgjort' || s === 'venter_paa_tiebreak' || s === 'ingen_stemmer'
}

export function utledKaaringStatus(
  tiebreakStatus: string | null,
): KaaringUtfall {
  if (tiebreakStatus === 'avgjort') return 'avgjort'
  if (tiebreakStatus === 'venter_paa_tiebreak') return 'venter_paa_tiebreak'
  // null + avsluttet_paa satt (kallerens ansvar å filtrere på det) betyr at
  // pollen ble lukket uten stemmer — den eneste avsluttet-tilstanden som
  // ikke bruker tiebreak_status-kolonnen.
  return 'ingen_stemmer'
}

// CAS: stempler poll.vinner_varslet_paa. Kalles KUN når kallstedet har fått
// et terminalt utfall tilbake (sendVarsel returnerte uten å kaste, eller det
// var ingen mottakere å sende til i utgangspunktet) — se CLAUDE.md § Policy:
// Varsler for kontrakten «kaster = ukjent, returnerer = terminalt».
//
// Dekker KUN de to terminale utfallene 'avgjort' og 'ingen_stemmer' — en
// poll som venter på tiebreak har ikke fått noen avgjort vinner ennå, og
// skal stemples via stempleTiebreakVarslet() under (#521).
export async function stempleVinnerVarslet(
  admin: SupabaseClient<Database>,
  pollId: string,
) {
  const { error } = await admin
    .from('poll')
    .update({ vinner_varslet_paa: naa() })
    .eq('id', pollId)
    .is('vinner_varslet_paa', null)
  if (error) throw new Error(`Kunne ikke stemple vinner_varslet_paa for poll ${pollId}: ${error.message}`)
}

// CAS: stempler poll.tiebreak_varslet_paa. Søsterfunksjon til
// stempleVinnerVarslet — se #521: vinner_varslet_paa dekket historisk BÅDE
// tiebreak-varselet («generalsekretæren må avgjøre») og selve vinner-
// varselet, og en poll som senere ble avgjort via velgTiebreakVinner kunne
// se falskt varslet-om-vinneren ut hvis den ekte vinner-sendingen feilet
// (retry-spørringen filtrerte den bort fordi vinner_varslet_paa alt var
// satt av tiebreak-steget). To varsler ⇒ to kolonner.
export async function stempleTiebreakVarslet(
  admin: SupabaseClient<Database>,
  pollId: string,
) {
  const { error } = await admin
    .from('poll')
    .update({ tiebreak_varslet_paa: naa() })
    .eq('id', pollId)
    .is('tiebreak_varslet_paa', null)
  if (error) throw new Error(`Kunne ikke stemple tiebreak_varslet_paa for poll ${pollId}: ${error.message}`)
}

// Dispatcher: velger riktig stempel-kolonne ut fra utfallsstatusen. Brukes
// av kallsteder som IKKE på forhånd vet om utfallet var tiebreak eller
// terminalt — cron-retry-loopen (paaminnelser.ts) og lukkKaaringspollNaa
// (kaaringspoll.ts) har begge status tilgjengelig fra samme kall som ga dem
// behandleKaaringspollAvsluttResultat sitt resultat, så én dispatcher unngår
// duplisert if/else på begge steder. velgTiebreakVinner kjenner derimot
// alltid sitt eget utfall (alltid 'avgjort') og kaller stempleVinnerVarslet
// direkte i stedet for denne.
export async function stempleKaaringspollVarslet(
  admin: SupabaseClient<Database>,
  pollId: string,
  status: KaaringUtfall,
) {
  if (status === 'venter_paa_tiebreak') return stempleTiebreakVarslet(admin, pollId)
  return stempleVinnerVarslet(admin, pollId)
}

// Sentral mapping fra RPC-status til riktig varsel-funksjon. Brukes av
// både cron (paaminnelser.ts) og manuell lukk-flyt (kaaringspoll.ts) så
// vi ikke duplikerer if/else-grenene to steder.
export async function behandleKaaringspollAvsluttResultat({
  pollId,
  spoersmaal,
  status,
  tiebreakIder,
  adminIder,
}: {
  pollId: string
  spoersmaal: string
  status: string
  tiebreakIder: string[]
  adminIder: string[]
}): Promise<{ sendt: boolean }> {
  if (status === 'avgjort') {
    await sendKaaringspollVinnerVarsel({ pollId, spoersmaal })
    return { sendt: true }
  }
  if (status === 'venter_paa_tiebreak') {
    if (tiebreakIder.length === 0) return { sendt: false }
    await sendKaaringspollTiebreakVarsel({
      pollId,
      spoersmaal,
      mottakere: tiebreakIder,
    })
    return { sendt: true }
  }
  if (status === 'ingen_stemmer') {
    if (adminIder.length === 0) return { sendt: false }
    await sendKaaringspollIngenStemmerVarsel({
      pollId,
      spoersmaal,
      mottakere: adminIder,
    })
    return { sendt: true }
  }
  return { sendt: false }
}
