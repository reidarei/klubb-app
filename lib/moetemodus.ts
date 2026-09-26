import type { NyligStartetArrangementRad } from '@/lib/posisjon'
import { osloKlokkeslettDagenEtter } from '@/lib/dato'
import { MOETEMODUS_SLUTT_KLOKKE } from '@/lib/konstanter'

// Cookie som bærer id-en til møtet brukeren har slått møtemodus AV for, per
// enhet — samme mønster som REISEMODUS_COOKIE i lib/reisemodus.ts (#780).
export const MOETEMODUS_COOKIE = 'moetemodus_av_for'

export type MoetemodusKandidat = {
  id: string
  tittel: string
  /** UTC-instantet for MOETEMODUS_SLUTT_KLOKKE dagen etter møtets startdato. */
  sluttTidspunkt: string
}

/**
 * Møtemodus = et arrangement av type «møte» der møtemodus-vinduet (møtets
 * START → MOETEMODUS_SLUTT_KLOKKE dagen ETTER startdatoen) ikke er passert.
 * Møtets eget slutt_tidspunkt ignoreres BEVISST (se #780):
 * et møte som starter 00:30 skal likevel vare til kl. 06 NESTE morgen, ikke
 * samme natt.
 *
 * `rader` er sortert nyeste-start-først (se
 * hentNyligStartedeArrangementerStrengt i lib/posisjon.ts) — «første rad» som
 * treffer predikatet er derfor møtet med senest start, riktig når flere møter
 * skulle ligge i vinduet samtidig. Ren funksjon — ingen I/O, testbar uten
 * mocking av lib/dato.ts.
 *
 * Merk at spørringen bak `rader` verken filtrerer på type eller på
 * møtevinduet — den henter bredt (30 dager tilbake, ARRANGEMENT_ANTATT_TIMER-
 * uavhengig). AVGRENSNINGEN til «innenfor møtevinduet» skjer HER, i
 * predikatet, ikke i SQL-en — samme prinsipp som finnPaagaaendeArrangement-
 * Strengt() i lib/posisjon.ts.
 */
export function velgMoete(
  rader: NyligStartetArrangementRad[],
  naaIso: string,
): MoetemodusKandidat | null {
  const rad = rader.find(
    a => a.type === 'moete' && naaIso < osloKlokkeslettDagenEtter(a.start_tidspunkt, MOETEMODUS_SLUTT_KLOKKE),
  )
  if (!rad) return null
  return {
    id: rad.id,
    tittel: rad.tittel,
    sluttTidspunkt: osloKlokkeslettDagenEtter(rad.start_tidspunkt, MOETEMODUS_SLUTT_KLOKKE),
  }
}
