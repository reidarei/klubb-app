// Kartets startutsnitt (#735) — hvem regnes med når kartet zoomes inn ved
// åpning.
//
// Å ramme inn ALLE punkter (hver manns siste posisjon + hver markering) er
// riktig når gjengen er samlet, men galt når noen er underveis: én mann som
// fortsatt står på avreisestedet drar utsnittet over et helt hav, og kartet
// blir ubrukelig for dem som faktisk er framme (#735).
//
// Ingen Date-bruk her, med vilje: to telefoner som åpner kartet tjue
// minutter fra hverandre skal beregne SAMME utsnitt av SAMME punktsett.
// Å vekte punkter etter ferskhet ble vurdert og forkastet — det ville gjort
// utsnittet avhengig av NÅR man ser på kartet, ikke bare HVOR punktene er,
// og to menn som åpner appen med noen minutters mellomrom kunne da fått
// ulikt utsnitt av identisk data. Regelen holder seg derfor til ren geografi.

import { avstandM } from './geo-avstand'
import { KART_KLYNGE_AVSTAND_M, KART_KLYNGE_MIN_ANDEL } from './konstanter'

/**
 * Velger hvilke punkter startutsnittet skal ramme inn.
 *
 * Posisjoner og markeringer holdes bevisst ATSKILT, og bare posisjonene
 * stemmer over hvor utsnittet havner. Markeringer er steder, ikke menn: de
 * blir liggende igjen lenge etter at gjengen har dratt videre, og hvis de
 * fikk stemme kunne 8 mann i Lisboa tape 8–8 mot 4 mann på Gardermoen pluss
 * 4 gamle markeringer samme sted. I verste fall kunne en klynge markeringer
 * alene vunnet, og kartet ville åpnet et sted INGEN befinner seg.
 *
 * Steg for steg:
 * 1. Finnes ingen posisjoner, klynges det ikke — alle markeringene returneres
 *    (#699). Det er «ram inn alt», som før denne funksjonen fantes: det er
 *    ingenting å klynge PÅ, og markeringene er alt kartet har å vise.
 * 2. Posisjonene klynges. To posisjoner hører til samme klynge hvis avstanden
 *    mellom dem er under KART_KLYNGE_AVSTAND_M, ELLER de er transitivt lenket
 *    via andre posisjoner («single linkage» — en posisjon trenger bare være
 *    nær ÉN annen i klyngen, ikke nær alle). Union-Find (disjoint-set) finner
 *    disse klyngene effektivt.
 * 3. Har den største klyngen et STRENGT flertall (mer enn KART_KLYNGE_MIN_ANDEL
 *    av posisjonene), er DEN hovedtyngden. Ellers er hovedtyngden alle
 *    posisjonene — ved f.eks. en 5/4/3-splitt på 12 mann er ingen gruppe over
 *    halvparten, og kartet skal fortsatt vise alle i stedet for å gjemme to
 *    tredjedeler av gjengen bak den største enkeltgruppa.
 * 4. Markeringene som ligger innenfor KART_KLYNGE_AVSTAND_M av et punkt i
 *    hovedtyngden legges til. En markering på den andre siden av kloden skal
 *    ikke dra utsnittet dit (#735).
 *
 * Renser IKKE bort noe fra kartet eller lista — kallstedet bruker
 * returverdien KUN til fitBounds/senter. Alt tegnes uansett (se
 * PosisjonsKart.tsx).
 */
export function velgKlyngeUtsnitt(
  posisjoner: [number, number][],
  markeringer: [number, number][],
): [number, number][] {
  // Ingen posisjoner: markeringene er alt vi har, og alle skal med (#699).
  if (posisjoner.length === 0) return [...markeringer]

  const foreldre = posisjoner.map((_, i) => i)

  function finnRot(i: number): number {
    while (foreldre[i] !== i) {
      // Sti-komprimering: peker rett på besteforelder, halverer stien for
      // neste oppslag. Ren ytelse — endrer ikke hvilke røtter som finnes.
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

  // Hovedtyngden: den største klyngen hvis den har strengt flertall, ellers
  // alle posisjonene (ingen klar hovedtyngde ⇒ kartet skal vise alle mann).
  const hovedtyngde: [number, number][] =
    storste.length / posisjoner.length > KART_KLYNGE_MIN_ANDEL
      ? storste.map(i => posisjoner[i])
      : posisjoner

  // Markeringene deltok ikke i avstemningen, men blir med i utsnittet hvis de
  // uansett ligger der gjengen er — ellers ville kartet zoomet forbi stedet
  // man nettopp satte en markering på.
  const naere = markeringer.filter(([mLat, mLng]) =>
    hovedtyngde.some(([pLat, pLng]) => avstandM(mLat, mLng, pLat, pLng) < KART_KLYNGE_AVSTAND_M),
  )

  return [...hovedtyngde, ...naere]
}
