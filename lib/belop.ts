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
