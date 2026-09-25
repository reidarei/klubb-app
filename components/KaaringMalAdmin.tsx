'use client'

import { useState, useTransition, type ButtonHTMLAttributes, type CSSProperties } from 'react'
import { leggTilKaaringMal, oppdaterKaaringMal, slettKaaringMal } from '@/lib/actions/kaaringmaler'
import { treffflateRundt } from '@/components/ui/Treffflate'
import { MIN_TREFFMAAL_PX } from '@/lib/konstanter'

// Synlig pille: 26 px høy (text-xs + py-1 + 1 px kant), minWidth 44 (#700).
const ADMIN_KNAPP_TREFF = treffflateRundt({ hoyde: 26 })
// Radhøyde ≥ tap-flaten (+1 for borderTop), så knappene i nabo-radene ikke overlapper vertikalt.
const RAD_MIN_HOYDE = MIN_TREFFMAAL_PX + 1

// Usynlig knapp vokser vertikalt til 44; pillen inni bærer utseendet og får reell
// minstebredde, så ingen X-utvidelse trengs og gap-1 mellom naboer overlapper ikke.
function AdminKnapp({
  stil,
  children,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style' | 'className' | 'type'> & { stil: CSSProperties }) {
  return (
    <button
      type="button"
      {...props}
      style={{
        ...ADMIN_KNAPP_TREFF.stil,
        background: 'none',
        border: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        flexShrink: 0,
        fontFamily: 'inherit',
        cursor: 'pointer',
      }}
    >
      <span
        className="text-xs px-2 py-1 rounded-lg"
        style={{ display: 'block', minWidth: MIN_TREFFMAAL_PX, textAlign: 'center', border: '1px solid transparent', ...stil }}
      >
        {children}
      </span>
    </button>
  )
}

type Mal = { id: string; navn: string; rekkefolge: number }

const inputStil: React.CSSProperties = {
  background: 'var(--bg-elevated-2)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
  borderRadius: '0.75rem',
  padding: '0.35rem 0.6rem',
  fontSize: '0.875rem',
  fontFamily: 'inherit',
  flex: 1,
  minWidth: 0,
}

function MalRad({ mal }: { mal: Mal }) {
  const [redigerer, setRedigerer] = useState(false)
  const [bekrefterSlett, setBekrefterSlett] = useState(false)
  const [navn, setNavn] = useState(mal.navn)
  const [isPending, startTransition] = useTransition()

  function handleLagre() {
    if (!navn.trim()) return
    startTransition(async () => {
      await oppdaterKaaringMal(mal.id, navn)
      setRedigerer(false)
    })
  }

  function handleSlett() {
    startTransition(async () => {
      await slettKaaringMal(mal.id)
    })
  }

  if (redigerer) {
    return (
      <div className="flex gap-2 items-center py-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <input
          value={navn}
          onChange={e => setNavn(e.target.value)}
          style={inputStil}
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') handleLagre(); if (e.key === 'Escape') setRedigerer(false) }}
        />
        <AdminKnapp onClick={handleLagre} disabled={isPending}
          stil={{ background: 'var(--accent)', color: 'var(--accent-foreground)', opacity: isPending ? 0.5 : 1 }}>
          {isPending ? '…' : 'OK'}
        </AdminKnapp>
        <AdminKnapp onClick={() => { setNavn(mal.navn); setRedigerer(false) }}
          stil={{ border: '1px solid var(--border)', color: 'var(--text-secondary)', background: 'none' }}>
          ✕
        </AdminKnapp>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-2 py-2" style={{ borderTop: '1px solid var(--border-subtle)', minHeight: RAD_MIN_HOYDE }}>
      <p className="text-sm flex-1 min-w-0 truncate" style={{ color: 'var(--text-primary)' }}>{mal.navn}</p>
      <div className="flex gap-1 shrink-0">
        {bekrefterSlett ? (
          <>
            <AdminKnapp onClick={handleSlett} disabled={isPending}
              stil={{ background: 'var(--danger)', color: 'var(--text-primary)', opacity: isPending ? 0.5 : 1 }}>
              Slett
            </AdminKnapp>
            <AdminKnapp onClick={() => setBekrefterSlett(false)}
              stil={{ border: '1px solid var(--border)', color: 'var(--text-secondary)', background: 'none' }}>
              Nei
            </AdminKnapp>
          </>
        ) : (
          <>
            <AdminKnapp onClick={() => setRedigerer(true)}
              stil={{ border: '1px solid var(--border)', color: 'var(--text-secondary)', background: 'none' }}>
              Rediger
            </AdminKnapp>
            <AdminKnapp onClick={() => setBekrefterSlett(true)}
              stil={{ border: '1px solid var(--border)', color: 'var(--danger)', background: 'none' }}>
              Slett
            </AdminKnapp>
          </>
        )}
      </div>
    </div>
  )
}

function NyMalForm() {
  const [navn, setNavn] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleLeggTil() {
    if (!navn.trim()) return
    startTransition(async () => {
      await leggTilKaaringMal(navn)
      setNavn('')
    })
  }

  return (
    <div className="flex gap-2 items-center pt-3 mt-1" style={{ borderTop: '1px solid var(--border-subtle)' }}>
      <input
        value={navn}
        onChange={e => setNavn(e.target.value)}
        placeholder="Ny kåringmal…"
        style={inputStil}
        onKeyDown={e => { if (e.key === 'Enter') handleLeggTil() }}
      />
      <AdminKnapp onClick={handleLeggTil} disabled={isPending || !navn.trim()}
        stil={{ background: 'var(--accent)', color: 'var(--accent-foreground)', opacity: (isPending || !navn.trim()) ? 0.5 : 1 }}>
        {isPending ? '…' : '+ Legg til'}
      </AdminKnapp>
    </div>
  )
}

export default function KaaringMalAdmin({ maler }: { maler: Mal[] }) {
  return (
    <div>
      {maler.map(mal => <MalRad key={mal.id} mal={mal} />)}
      <NyMalForm />
    </div>
  )
}
