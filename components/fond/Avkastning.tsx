import { signKr, prosent } from '@/lib/belop'

// Flyttet ut av app/(app)/fond/page.tsx da FondPostRad fikk bruk for den
// (#555). Ingen endring i utseende — kun flyttet så begge kan importere.

const retningFarge = (n: number) =>
  n > 0 ? 'var(--success)' : n < 0 ? 'var(--danger)' : 'var(--text-secondary)'

// Avkastningslinje i Nordnet-stil: fortegn, kroner og prosent, farget grønn/rød
export default function Avkastning({
  kroner,
  pst,
  size = 12,
}: {
  kroner: number
  pst: number
  size?: number
}) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-body)',
        fontSize: size,
        fontWeight: 600,
        color: retningFarge(kroner),
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }}
    >
      {signKr(kroner)} ({prosent(pst)})
    </span>
  )
}
