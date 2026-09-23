// Chip-rad for å filtrere /tidligere på innholdstype. Server-komponent —
// rene lenker med searchParams, samme mønster som app/(app)/innspill/page.tsx.
// Navngitt TidligereTypeFilter for å ikke forveksles med
// components/arrangement/TypeVelger.tsx (som velger arrangøransvar-mal).
// Issue #487.

import { TIDLIGERE_FILTRE, type TidligereFilter } from '@/lib/tidligere-filter'
import FilterChip, { CHIP_RAD_GAP } from '@/components/ui/FilterChip'

export default function TidligereTypeFilter({ aktiv }: { aktiv: TidligereFilter }) {
  return (
    // nav-landmark så skjermleser kan hoppe rett til filtrene og annonsere hva
    // chip-lenkene gjør — aria-current alene sier ikke hva raden er til for.
    // Radgap = CHIP_RAD_GAP (2 * chippens usynlige padding): raden brytes på
    // smale skjermer, og med et mindre radgap ville treffområdene overlappe slik
    // at chippen på rad to stjal trykk fra rad én (#508-klassen). Kolonnegapet
    // er upåvirket — chippens horisontale padding er 0.
    <nav
      aria-label="Filtrer historikken"
      style={{ display: 'flex', gap: `${CHIP_RAD_GAP}px 6px`, flexWrap: 'wrap', marginBottom: 20 }}
    >
      {TIDLIGERE_FILTRE.map(f => {
        const erAktiv = aktiv === f.verdi
        return (
          <FilterChip
            key={f.verdi}
            href={f.verdi === 'alle' ? '/tidligere' : `/tidligere?type=${f.verdi}`}
            aktiv={erAktiv}
          >
            {f.etikett}
          </FilterChip>
        )
      })}
    </nav>
  )
}
