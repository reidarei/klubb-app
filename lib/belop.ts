// Delt kronebeløp-formattering (fond-siden og profil-andelen).
// Hele kroner vises uten desimaler; beløp med øre får alltid to
// («6 612,20 kr», aldri «6 612,2 kr»).

const desimaler = (n: number) => (Number.isInteger(n) ? 0 : 2)

export function formaterKr(n: number): string {
  return `${n.toLocaleString('nb', { minimumFractionDigits: desimaler(n), maximumFractionDigits: 2 })} kr`
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
