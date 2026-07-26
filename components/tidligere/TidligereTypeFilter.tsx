// Chip-rad for å filtrere /tidligere på innholdstype. Server-komponent —
// rene lenker med searchParams, samme mønster som app/(app)/innspill/page.tsx.
// Navngitt TidligereTypeFilter for å ikke forveksles med
// components/arrangement/TypeVelger.tsx (som velger arrangøransvar-mal).
// Issue #487.

import Link from 'next/link'
import { TIDLIGERE_FILTRE, type TidligereFilter } from '@/lib/tidligere-filter'

export default function TidligereTypeFilter({ aktiv }: { aktiv: TidligereFilter }) {
  return (
    // nav-landmark så skjermleser kan hoppe rett til filtrene og annonsere hva
    // chip-lenkene gjør — aria-current alene sier ikke hva raden er til for.
    <nav aria-label="Filtrer historikken" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
      {TIDLIGERE_FILTRE.map(f => {
        const erAktiv = aktiv === f.verdi
        return (
          <Link
            key={f.verdi}
            href={f.verdi === 'alle' ? '/tidligere' : `/tidligere?type=${f.verdi}`}
            aria-current={erAktiv ? 'page' : undefined}
            style={{
              padding: '7px 12px',
              borderRadius: 999,
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '1.4px',
              fontWeight: 600,
              textTransform: 'uppercase',
              background: erAktiv ? 'var(--accent-soft)' : 'transparent',
              color: erAktiv ? 'var(--accent)' : 'var(--text-tertiary)',
              border: `0.5px solid ${erAktiv ? 'var(--border-strong)' : 'var(--border-subtle)'}`,
              textDecoration: 'none',
            }}
          >
            {f.etikett}
          </Link>
        )
      })}
    </nav>
  )
}
