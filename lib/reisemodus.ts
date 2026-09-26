import type { NyligStartetArrangementRad } from '@/lib/posisjon'

// Cookie som bærer id-en til turen brukeren har slått reisemodus AV for, per
// enhet — et visningsvalg på linje med tema, ikke en kolonne i profiles (se
// arkitekturstyrets uttalelse i #723). HttpOnly: dette settes/leses kun
// server-side, via settKartmodus()/hentKartmodus() i lib/kartmodus.ts.
export const REISEMODUS_COOKIE = 'reisemodus_av_for'

/**
 * Reisemodus = et PÅGÅENDE arrangement av type «tur» MED sluttid (ikke
 * passert). Leter EKSPLISITT etter en tur blant radene — ikke bare den som
 * startet sist — så en møte-rad som startet nyere (#780) ikke skygger for en
 * pågående tur lenger bak i lista. Uten dette søket ville en tur og et møte
 * samtidig latt møtets nyere start-tidspunkt vinne, selv når turen fortsatt
 * pågår og reisemodus-flagget skal ha forrang (se #780).
 *
 * `rader` er sortert nyeste-start-først (se
 * hentNyligStartedeArrangementerStrengt i lib/posisjon.ts). Ren funksjon —
 * ingen I/O, testbar uten mocking av lib/dato.ts.
 */
export function velgReiseTur(
  rader: NyligStartetArrangementRad[],
  naaIso: string,
): NyligStartetArrangementRad | null {
  return (
    rader.find(
      a => a.type === 'tur' && a.slutt_tidspunkt !== null && a.slutt_tidspunkt >= naaIso,
    ) ?? null
  )
}
