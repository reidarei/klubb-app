// Kartets startutsnitt: hvem regnes med når kartet zoomes inn ved åpning.
// Å ramme inn alt er galt når noen er underveis — én mann igjen på
// avreisestedet drar utsnittet over et helt hav (#735).
//
// Ingen Date-bruk, med vilje: to telefoner som åpner kartet med minutters
// mellomrom skal beregne SAMME utsnitt av samme punktsett. Ferskhetsvekting
// er derfor forkastet — regelen er ren geografi.

import { avstandM } from './geo-avstand'
import { KART_KLYNGE_AVSTAND_M, KART_KLYNGE_MIN_ANDEL } from './konstanter'

/**
 * Velger hvilke punkter startutsnittet skal ramme inn.
 *
 * Bare posisjonene stemmer over hvor utsnittet havner. Markeringer er steder,
 * ikke menn: de blir liggende etter at gjengen har dratt videre, og fikk de
 * stemme kunne gamle markeringer vippe utsnittet — i verste fall dit INGEN er.
 *
 * 1. Ingen posisjoner → alle markeringene returneres («ram inn alt», #699).
 * 2. Posisjonene klynges med single linkage: under KART_KLYNGE_AVSTAND_M fra
 *    ÉN annen i klyngen holder (transitivt). Union-Find.
 * 3. Har største klynge STRENGT flertall (> KART_KLYNGE_MIN_ANDEL), er den
 *    hovedtyngden; ellers alle posisjonene (f.eks. 5/4/3 av 12 → vis alle).
 * 4. Markeringer innenfor KART_KLYNGE_AVSTAND_M av hovedtyngden legges til (#735).
 *
 * Fjerner ikke noe fra kartet — returverdien brukes KUN til fitBounds/senter.
 */
export function velgKlyngeUtsnitt(
  posisjoner: [number, number][],
  markeringer: [number, number][],
): [number, number][] {
  if (posisjoner.length === 0) return [...markeringer]

  const foreldre = posisjoner.map((_, i) => i)

  function finnRot(i: number): number {
    while (foreldre[i] !== i) {
      // Sti-halvering — ren ytelse, endrer ikke hvilke røtter som finnes.
      foreldre[i] = foreldre[foreldre[i]]
      i = foreldre[i]
    }
    return i
  }

  function slaaSammen(a: number, b: number): void {
    const ra = finnRot(a)
    const rb = finnRot(b)
    if (ra !== rb) foreldre[ra] = rb
  }

  for (let i = 0; i < posisjoner.length; i++) {
    for (let j = i + 1; j < posisjoner.length; j++) {
      const [aLat, aLng] = posisjoner[i]
      const [bLat, bLng] = posisjoner[j]
      if (avstandM(aLat, aLng, bLat, bLng) < KART_KLYNGE_AVSTAND_M) {
        slaaSammen(i, j)
      }
    }
  }

  const klynger = new Map<number, number[]>()
  for (let i = 0; i < posisjoner.length; i++) {
    const rot = finnRot(i)
    const klynge = klynger.get(rot)
    if (klynge) klynge.push(i)
    else klynger.set(rot, [i])
  }

  let storste: number[] = []
  for (const klynge of klynger.values()) {
    if (klynge.length > storste.length) storste = klynge
  }

  const hovedtyngde: [number, number][] =
    storste.length / posisjoner.length > KART_KLYNGE_MIN_ANDEL
      ? storste.map(i => posisjoner[i])
      : posisjoner

  // Ellers ville kartet zoomet forbi stedet man nettopp satte en markering på.
  const naere = markeringer.filter(([mLat, mLng]) =>
    hovedtyngde.some(([pLat, pLng]) => avstandM(mLat, mLng, pLat, pLng) < KART_KLYNGE_AVSTAND_M),
  )

  return [...hovedtyngde, ...naere]
}
