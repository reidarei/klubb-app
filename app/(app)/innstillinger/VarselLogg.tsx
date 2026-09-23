'use client'

import { useState } from 'react'
import { formaterDato } from '@/lib/dato'
import { varselKortNavn } from '@/lib/varsel-typer'

type VarselRad = {
  id: string
  tittel: string | null
  type: string | null
  kanal: string | null
  opprettet: string | null
  profil_id: string | null
  profiles: { visningsnavn: string | null } | null
}

const PER_SIDE = 10

export default function VarselLogg({
  initial,
  total,
}: {
  initial: VarselRad[]
  total: number
}) {
  const [rader, setRader] = useState(initial)
  const [laster, setLaster] = useState(false)

  const harFlere = rader.length < total

  async function hentFlere() {
    setLaster(true)
    try {
      const res = await fetch(`/api/admin/varsel-logg?offset=${rader.length}&limit=${PER_SIDE}`)
      const { data } = await res.json() as { data: VarselRad[] }
      setRader(prev => [...prev, ...data])
    } finally {
      setLaster(false)
    }
  }

  return (
    <div>
      {/* «utenom chat» i tittelen fordi lista filtreres på teller_ulest = true
          (#612) — uten den opplysningen ville admin lure på hvor chat-varslene
          ble av når døgntelleren over viser et mye høyere tall. */}
      <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--accent)' }}>Siste varsler (utenom chat)</h2>
      {rader.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Ingen varsler sendt ennå.</p>
      ) : (
        <>
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {rader.map((v, i) => (
              <div key={v.id} className="flex items-center justify-between px-4 py-2.5 text-xs"
                style={{
                  background: i % 2 === 0 ? 'var(--bg-elevated)' : 'var(--bg)',
                  borderTop: i > 0 ? '1px solid var(--border)' : undefined,
                }}>
                <div className="min-w-0 flex-1">
                  <p style={{ color: 'var(--text-primary)' }}>{varselKortNavn(v.type)}</p>
                  <p className="truncate" style={{ color: 'var(--text-secondary)' }}>
                    {v.profiles?.visningsnavn ?? '—'}{v.kanal ? ` · ${v.kanal}` : ''}
                  </p>
                </div>
                <p className="shrink-0" style={{ color: 'var(--text-secondary)' }}>
                  {v.opprettet ? formaterDato(v.opprettet, 'd. MMM HH:mm') : ''}
                </p>
              </div>
            ))}
          </div>
          {harFlere && (
            <button
              onClick={hentFlere}
              disabled={laster}
              className="text-xs font-medium mt-2 block"
              style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              {laster ? 'Laster…' : `Vis flere (${total - rader.length} igjen)`}
            </button>
          )}
        </>
      )}
    </div>
  )
}
