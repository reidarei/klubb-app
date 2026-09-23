// Delt kronebeløp-formattering (fond-siden og profil-andelen).
//
// ALLTID to desimaler — «0,00 kr», ikke «0 kr». Tidligere droppet vi dem på
// hele kroner, men alle beløpene her står i samme regnskap og ofte i samme
// kolonne: «0 kr» rett over «20 751,32 kr» leser som to ulike presisjonsnivåer
// på tall som er like eksakte. Med tabular-nums linjer de seg dessuten bare opp
// når desimalene er der.

// Selve tallet, uten «kr». For steder der enheten alt går fram av konteksten
// — f.eks. nøkkeltall-trioen under totalverdien på /fond. Desimal-regelen bor
// her, så den ikke drifter fra formaterKr.
export function formaterBelop(n: number): string {
  return n.toLocaleString('nb', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formaterKr(n: number): string {
  return `${formaterBelop(n)} kr`
}

// Summér øre-beløp uten flyttall-drift: akkumuler i hele øre, del til slutt.
export function summerKroner(belop: number[]): number {
  return belop.reduce((s, b) => s + Math.round(b * 100), 0) / 100
}

// Beløp med eksplisitt fortegn — for avkastning, der «+2 400 kr» og
// «−2 400 kr» er to helt ulike beskjeder og fortegnet aldri må falle bort.
// Minus-tegn (U+2212), ikke bindestrek: riktig typografi for negative tall.
// Flyttet hit fra fond/page.tsx da Avkastning ble en egen komponent (#555).
export function signKr(n: number): string {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${formaterKr(Math.abs(n))}`
}

// Prosent med én desimal og fortegn. Én desimal er et bevisst valg: fondet
// er lite nok til at to desimaler gir falsk presisjon.
export function prosent(n: number): string {
  return `${n > 0 ? '+' : ''}${n.toLocaleString('nb', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`
}
