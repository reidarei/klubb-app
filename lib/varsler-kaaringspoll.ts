import {
  sendKaaringspollVinnerVarsel,
  sendKaaringspollTiebreakVarsel,
  sendKaaringspollIngenStemmerVarsel,
} from '@/lib/varsler'

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
