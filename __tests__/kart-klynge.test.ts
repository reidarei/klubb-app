import { describe, it, expect } from 'vitest'
import { velgKlyngeUtsnitt } from '@/lib/kart-klynge'

// Punktene under er syntetiske (rene gradforskyvninger langs samme
// lengdegrad), ikke virkelige byer — avstandene er valgt for å pinne
// grensetilfellene presist (under/over KART_KLYNGE_AVSTAND_M), ikke for å
// demonstrere en bestemt reise.

// Tett klynge i «Lisboa»-området (#735-scenarioet) — alle par under 50 km
// fra hverandre, store nok avstander til at ingen to punkter er identiske.
const LISBOA: [number, number][] = [
  [38.700, -9.140],
  [38.705, -9.145],
  [38.710, -9.150],
  [38.715, -9.135],
  [38.720, -9.130],
  [38.725, -9.155],
  [38.730, -9.125],
  [38.735, -9.160],
]

// Tett klynge i «Oslo»-området — samme prinsipp, langt (>2000 km) fra
// Lisboa-klyngen over, så ingen kryssklynging kan skje ved en feil.
const OSLO: [number, number][] = [
  [59.910, 10.750],
  [59.915, 10.755],
  [59.920, 10.745],
  [59.925, 10.760],
]

// Tredje klynge, «Trondheim»-området — brukt i 5/4/3-splitten. Også
// tusenvis av km fra de to andre.
const TRONDHEIM: [number, number][] = [
  [63.430, 10.390],
  [63.435, 10.395],
  [63.440, 10.385],
]

// Fire markeringer i «Oslo»-området — samme sted som OSLO-posisjonene, men
// markeringer teller ikke som menn. Brukes til å pinne at de ikke kan stemme
// hovedtyngden bort fra der folk faktisk er.
const OSLO_MARKERINGER: [number, number][] = [
  [59.912, 10.752],
  [59.917, 10.757],
  [59.922, 10.747],
  [59.927, 10.762],
]

describe('velgKlyngeUtsnitt (#735)', () => {
  it('1. tom liste inn gir tom liste ut', () => {
    expect(velgKlyngeUtsnitt([], [])).toEqual([])
  })

  it('2. ett enkelt punkt returneres uendret', () => {
    const punkt: [number, number] = [59.9139, 10.7522]
    expect(velgKlyngeUtsnitt([punkt], [])).toEqual([punkt])
  })

  it('3. alle punkter innenfor 50 km av hverandre gir alle punktene tilbake', () => {
    const resultat = velgKlyngeUtsnitt(LISBOA, [])
    expect(resultat).toHaveLength(LISBOA.length)
    expect(new Set(resultat)).toEqual(new Set(LISBOA))
  })

  it('4. klar hovedtyngde (8 av 12, to klynger langt fra hverandre) gir kun hovedklyngen', () => {
    const punkter = [...LISBOA, ...OSLO]
    const resultat = velgKlyngeUtsnitt(punkter, [])
    expect(resultat).toHaveLength(LISBOA.length)
    for (const p of resultat) expect(LISBOA).toContainEqual(p)
    for (const p of OSLO) expect(resultat).not.toContainEqual(p)
  })

  it('5. den minste klyngen forsvinner aldri fra input — kun fra RETURVERDIEN', () => {
    // Presisering fra planen: funksjonen filtrerer kun hva fitBounds får,
    // den fjerner ingenting fra kildelistene kallstedet selv holder på.
    const punkter = [...LISBOA, ...OSLO]
    const kopi = [...punkter]
    velgKlyngeUtsnitt(punkter, [])
    expect(punkter).toEqual(kopi)
  })

  it('6. nøyaktig 50/50-splitt (ingen STRENGT flertall) gir alle punktene tilbake', () => {
    const gruppeA: [number, number][] = OSLO.slice(0, 2)
    const gruppeB: [number, number][] = LISBOA.slice(0, 2)
    const resultat = velgKlyngeUtsnitt([...gruppeA, ...gruppeB], [])
    expect(resultat).toHaveLength(4)
  })

  it('7. 5/4/3-splitt uten flertall (42 % størst) gir alle punktene tilbake', () => {
    const punkter = [...LISBOA.slice(0, 5), ...OSLO, ...TRONDHEIM]
    expect(punkter).toHaveLength(12)
    const resultat = velgKlyngeUtsnitt(punkter, [])
    expect(resultat).toHaveLength(12)
  })

  it('8. to punkter rett under 50 km (49 km) smelter sammen til én klynge', () => {
    // 59.9139°N og 60.354567...°N langs samme lengdegrad er nøyaktig 49 km —
    // se avstandM-testen for samme haversine-regnestykke.
    const naer: [number, number] = [59.9139, 10.7522]
    const naer2: [number, number] = [60.3545675869, 10.7522]
    const fjern: [number, number] = [54.51797036448762, 10.7522] // ~600 km fra begge
    const resultat = velgKlyngeUtsnitt([naer, naer2, fjern], [])
    expect(resultat).toHaveLength(2)
    expect(resultat).toContainEqual(naer)
    expect(resultat).toContainEqual(naer2)
    expect(resultat).not.toContainEqual(fjern)
  })

  it('9. to punkter rett over 50 km (51 km) smelter IKKE sammen', () => {
    const a: [number, number] = [59.9139, 10.7522]
    const b: [number, number] = [60.3725540190, 10.7522] // 51 km fra a
    const fjern: [number, number] = [55.4988101443, 10.7522] // >500 km fra begge
    // Ingen av de tre er innenfor 50 km av noen andre — tre egne klynger på
    // 1/3 hver, ingen har strengt flertall, alt returneres.
    const resultat = velgKlyngeUtsnitt([a, b, fjern], [])
    expect(resultat).toHaveLength(3)
  })

  it('10. en markering langt fra hovedtyngden faller ut av utsnittet', () => {
    // Markeringen stemmer ikke, og blir kun med hvis den ligger innenfor
    // KART_KLYNGE_AVSTAND_M av hovedtyngden. Sydney gjør ikke det.
    const fjernMarkering: [number, number] = [-33.865, 151.209] // Sydney
    const resultat = velgKlyngeUtsnitt(LISBOA, [fjernMarkering])
    expect(resultat).toHaveLength(LISBOA.length)
    expect(resultat).not.toContainEqual(fjernMarkering)
  })

  it('10b. en markering nær hovedtyngden blir med i utsnittet', () => {
    const naerMarkering: [number, number] = [38.712, -9.142]
    const resultat = velgKlyngeUtsnitt(LISBOA, [naerMarkering])
    expect(resultat).toHaveLength(LISBOA.length + 1)
    expect(resultat).toContainEqual(naerMarkering)
  })

  it('11. rekkefølgen på input endrer ikke hvilken klynge som vinner', () => {
    const punkter = [...LISBOA, ...OSLO]
    const snudd = [...punkter].reverse()
    const resultat1 = velgKlyngeUtsnitt(punkter, [])
    const resultat2 = velgKlyngeUtsnitt(snudd, [])
    expect(new Set(resultat1)).toEqual(new Set(resultat2))
    expect(resultat1).toHaveLength(LISBOA.length)
  })

  it('12. transitiv lenking: en kjede av punkter smelter sammen selv om endene er langt fra hverandre', () => {
    // Fire punkter langs samme lengdegrad, hvert ledd ~33,4 km (under 50 km),
    // men avstanden fra første til siste er ~100 km (godt over 50 km) — de
    // kan altså KUN høre til samme klynge via transitiv lenking gjennom
    // punktene imellom, ikke ved at noe par er direkte innenfor grensen.
    const kjede: [number, number][] = [
      [60.0, 10.0],
      [60.3, 10.0], // ~33,4 km fra forrige
      [60.6, 10.0], // ~33,4 km fra forrige, ~66,7 km fra det første
      [60.9, 10.0], // ~33,4 km fra forrige, ~100,1 km fra det første
    ]
    const utenforKjeden: [number, number] = [55.0, 10.0] // ~556 km unna alt i kjeden

    const resultat = velgKlyngeUtsnitt([...kjede, utenforKjeden], [])

    // Kjeden er 4 av 5 punkter (80 %) — strengt flertall, og hele kjeden
    // skal med, ikke bare de punktene som er innenfor 50 km av HVERANDRE.
    expect(resultat).toHaveLength(4)
    for (const p of kjede) expect(resultat).toContainEqual(p)
    expect(resultat).not.toContainEqual(utenforKjeden)
  })

  it('13. markeringer stemmer ikke: 8 mann i Lisboa slår 4 mann + 4 markeringer i Oslo', () => {
    // Regresjonen dette pinner: da markeringer ble sendt inn i samme liste som
    // posisjonene, ble dette 8–8 — ikke lenger strengt flertall — og kartet
    // spente igjen over hele havet. Markeringene er steder som blir liggende
    // igjen; de skal ikke kunne stemme utsnittet bort fra der folk faktisk er.
    const resultat = velgKlyngeUtsnitt([...LISBOA, ...OSLO], OSLO_MARKERINGER)
    expect(resultat).toHaveLength(LISBOA.length)
    for (const p of resultat) expect(LISBOA).toContainEqual(p)
    for (const p of OSLO) expect(resultat).not.toContainEqual(p)
    for (const p of OSLO_MARKERINGER) expect(resultat).not.toContainEqual(p)
  })

  it('14. markeringer alene kan aldri vinne over en enslig mann', () => {
    // Den verste varianten av samme feil: to markeringer ville utgjort
    // flertall mot én posisjon, og kartet ville åpnet et sted INGEN er.
    const mann: [number, number] = LISBOA[0]
    const resultat = velgKlyngeUtsnitt([mann], OSLO_MARKERINGER)
    expect(resultat).toEqual([mann])
  })

  it('15. uten posisjoner rammes samtlige markeringer inn (#699)', () => {
    // Ingenting å klynge PÅ — da er «ram inn alt» riktig, selv når
    // markeringene ligger langt fra hverandre.
    const markeringer = [...LISBOA.slice(0, 2), ...OSLO]
    const resultat = velgKlyngeUtsnitt([], markeringer)
    expect(resultat).toHaveLength(markeringer.length)
    expect(new Set(resultat)).toEqual(new Set(markeringer))
  })
})
