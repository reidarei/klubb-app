// Fyller hull i «Reiseruta»-tidslinja på /stedene med årstall klubben ikke
// har vært på tur — se #508. Ren, testbar hjelper: logikken skal ikke ligge
// i selve server-komponenten, samme mønster som lib/tidligere-cursor.ts.

// Minimalt sett med felt tidslinja faktisk bruker fra en ekte tur-rad. Selve
// page.tsx har flere felt (tittel, plottet, by), men hjelperen her trenger
// kun årstallet for å avgjøre hull — union-typen holder resten generisk via
// et typeparameter slik at page.tsx sin egen radtype kan sendes rett inn.
type TurRad = { aar: number }

export type HullRad = { aar: number; hull: true }

export type ReiseruteRad<T extends TurRad> = T | HullRad

// Type guard slik at forbrukere (page.tsx) kan narrowe unionen uten å måtte
// gjenta 'hull' in-sjekken selv — en lokal boolean holder ikke narrowingen
// gjennom en ternary i alle TS-versjoner, en egen predikat-funksjon gjør.
export function erHullRad<T extends TurRad>(rad: ReiseruteRad<T>): rad is HullRad {
  return 'hull' in rad
}

// Genererer én hull-rad per år uten tur, mellom laveste og høyeste registrerte
// år, og slår dem sammen med de ekte radene i stigende år-orden.
//
// Fyller ALDRI utover siste registrerte tur-år: ellers ville inneværende år
// dukket opp som «ingen tur» allerede i januar, før året er over og svaret
// faktisk er gitt.
//
// Regelen er generisk (utleder min/maks fra dataene), ikke hardkodet til
// dagens hull (2020/2021 — pandemi-årene klubben ikke reiste).
export function fyllHullAar<T extends TurRad>(rader: T[]): ReiseruteRad<T>[] {
  if (rader.length === 0) return []

  const aarMedTur = new Set(rader.map(r => r.aar))
  const minAar = Math.min(...aarMedTur)
  const maksAar = Math.max(...aarMedTur)

  const hull: HullRad[] = []
  for (let aar = minAar; aar <= maksAar; aar++) {
    if (!aarMedTur.has(aar)) hull.push({ aar, hull: true })
  }

  return [...rader, ...hull].sort((a, b) => a.aar - b.aar)
}
