// Ankomst via en delt steds-lenke (#753) — ren beslutningsmodul, samme rolle
// som lib/kart-utsnitt.ts/lib/kart-klynge.ts. Egen fil fordi dette er det
// eneste av #753 som kan vitest-testes meningsfullt: selve flyvningen skjer
// i Leaflets rAF-løkke og finnes ikke i jsdom (L.Browser.any3d er false der,
// så flyTo degenererer til et synkront setView).

import { KART_DELT_STED_START_ZOOM, KART_DELT_STED_ZOOM, KART_DELT_STED_FLY_SEK } from './konstanter'

export type Ankomst = {
  startZoom: number
  sluttZoom: number
  animer: boolean
  varighetSek: number
}

/**
 * Planlegger ankomsten på et delt sted. `redusertBevegelse` kommer fra
 * `foretrekkerRedusertBevegelse()` (eller en stub i test) — funksjonen selv
 * tar ingen DOM-avhengighet, så den er trivielt testbar.
 *
 * Reduced motion: start === slutt, ingen animasjon. Funksjonen (å lande
 * innzoomet på stedet) forsvinner ikke — det er BEVEGELSEN som gjør.
 */
export function planleggAnkomst(redusertBevegelse: boolean): Ankomst {
  if (redusertBevegelse) {
    return {
      startZoom: KART_DELT_STED_ZOOM,
      sluttZoom: KART_DELT_STED_ZOOM,
      animer: false,
      varighetSek: 0,
    }
  }
  return {
    startZoom: KART_DELT_STED_START_ZOOM,
    sluttZoom: KART_DELT_STED_ZOOM,
    animer: true,
    varighetSek: KART_DELT_STED_FLY_SEK,
  }
}

/**
 * `window.matchMedia` finnes ikke i jsdom, og `__tests__/kart-oppdatering.
 * test.tsx` rendrer den EKTE PosisjonsKart — et ubeskyttet kall her ville
 * knekt den testen. Guarden er derfor ikke pynt.
 *
 * Ingen 'change'-lytter: ankomsten avgjøres ÉN gang, ved mount/lenketrykk —
 * det er en engangshendelse, ikke en løpende tilstand appen skal følge med
 * på resten av besøket. (TopHeader abonnerer på endring fordi PILLEN lever
 * gjennom hele sesjonen; en flyvning som allerede er ferdig har ingenting å
 * reagere på om brukeren skrur om innstillingen midt i.)
 */
export function foretrekkerRedusertBevegelse(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
