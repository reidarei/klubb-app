'use client'

// TypeVelger — dropdown som lister alle uoppfylte arrangement-maler
// (unike (aar, arrangement_navn)-kombinasjoner fra arrangoransvar-tabellen
// hvor arrangement_id er null og det finnes tildelte ansvarlige).
// Alltid et "Annet"-valg nederst for fritt arrangement uten ansvar-kobling.
//
// Sortering: (aar asc, purredato asc nulls last), "Annet" alltid sist.

import type { CSSProperties } from 'react'
import type { MalValg } from './mal-valg-typer'

// Re-eksport for bakoverkompatibilitet — byggAnnetValg og ANNET_KEY må ligge i
// en ikke-client-modul for å kunne kalles fra server-side hentMalValg().
export { ANNET_KEY, byggAnnetValg } from './mal-valg-typer'
export type { MalValg } from './mal-valg-typer'

type Props = {
  valg: MalValg[]
  valgtKey: string
  onValg: (v: MalValg) => void
}

const monoLabel: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 9.5,
  fontWeight: 600,
  color: 'var(--text-tertiary)',
  letterSpacing: '1.6px',
  textTransform: 'uppercase',
  marginBottom: 4,
}

const inputStil: CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: 'none',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)',
  fontSize: 14,
  outline: 'none',
  padding: 0,
  appearance: 'none',
  WebkitAppearance: 'none',
  cursor: 'pointer',
}

export default function TypeVelger({ valg, valgtKey, onValg }: Props) {
  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = valg.find(x => x.key === e.target.value)
    if (v) onValg(v)
  }

  return (
    <div>
      <div style={monoLabel}>Arrangement</div>
      <select value={valgtKey} onChange={handleChange} style={inputStil}>
        {valg.map(v => (
          <option key={v.key} value={v.key}>
            {v.mal_navn}
            {v.aar != null ? ` (${v.aar})` : ''}
            {v.ansvarlige.length > 0 ? ` — ${v.ansvarlige.join(', ')}` : ''}
          </option>
        ))}
      </select>
    </div>
  )
}
