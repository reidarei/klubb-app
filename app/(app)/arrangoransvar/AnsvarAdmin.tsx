'use client'

import { useState, useTransition } from 'react'
import { leggTilAnsvarlig, fjernAnsvarlig } from '@/lib/actions/arrangoransvar'
import Icon from '@/components/ui/Icon'

const selectStil: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: 'var(--bg-elevated)',
  border: '0.5px solid var(--border)',
  color: 'var(--text-primary)',
  borderRadius: 999,
  padding: '8px 12px',
  fontSize: 12,
  fontFamily: 'var(--font-body)',
  outline: 'none',
}

const pillKnapp: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 999,
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '1.4px',
  textTransform: 'uppercase',
  cursor: 'pointer',
}

export default function AnsvarAdmin({
  ansvarlige,
  arrangementNavn,
  aar,
  medlemmer,
}: {
  ansvarlige: { ansvarId: string; profilId: string }[]
  arrangementNavn: string
  aar: number
  medlemmer: { id: string; navn: string }[]
}) {
  const [aapen, setAapen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const tildelte = new Set(ansvarlige.map(a => a.profilId))
  const tilgjengelige = medlemmer.filter(m => !tildelte.has(m.id))

  function handleLeggTil(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const profilId = fd.get('ansvarlig_id') as string
    if (!profilId) return
    startTransition(async () => {
      await leggTilAnsvarlig({ aar, arrangement_navn: arrangementNavn, ansvarlig_id: profilId })
    })
    e.currentTarget.reset()
  }

  function handleFjern(ansvarId: string) {
    startTransition(async () => {
      await fjernAnsvarlig(ansvarId)
    })
  }

  if (!aapen) {
    return (
      <button
        type="button"
        onClick={() => setAapen(true)}
        style={{
          ...pillKnapp,
          background: 'transparent',
          border: '0.5px solid var(--border)',
          color: 'var(--text-secondary)',
        }}
      >
        Endre
      </button>
    )
  }

  return (
    <div
      style={{
        marginTop: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        opacity: isPending ? 0.5 : 1,
      }}
    >
      {ansvarlige.map(a => {
        const navn = medlemmer.find(m => m.id === a.profilId)?.navn ?? '–'
        return (
          <div
            key={a.ansvarId}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <span
              style={{
                flex: 1,
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                color: 'var(--text-primary)',
              }}
            >
              {navn}
            </span>
            <button
              type="button"
              onClick={() => handleFjern(a.ansvarId)}
              disabled={isPending}
              aria-label="Fjern ansvarlig"
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                background: 'transparent',
                border: '0.5px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--danger)',
              }}
            >
              <Icon name="x" size={12} color="var(--danger)" strokeWidth={2} />
            </button>
          </div>
        )
      })}

      {tilgjengelige.length > 0 && (
        <form onSubmit={handleLeggTil} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select name="ansvarlig_id" defaultValue="" style={selectStil}>
            <option value="" disabled>Legg til ansvarlig…</option>
            {tilgjengelige.map(m => (
              <option key={m.id} value={m.id}>{m.navn}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={isPending}
            aria-label="Legg til"
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'var(--accent)',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <Icon name="plus" size={14} color="#0a0a0a" strokeWidth={2.5} />
          </button>
        </form>
      )}

      <button
        type="button"
        onClick={() => setAapen(false)}
        style={{
          ...pillKnapp,
          alignSelf: 'flex-start',
          background: 'transparent',
          border: '0.5px solid var(--border)',
          color: 'var(--text-secondary)',
        }}
      >
        Ferdig
      </button>
    </div>
  )
}
