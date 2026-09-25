'use client'

import { useState, useTransition, type ButtonHTMLAttributes, type CSSProperties } from 'react'
import { leggTilMal, oppdaterMal, slettMal } from '@/lib/actions/arrangementmaler'
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

type Mal = { id: string; navn: string; rekkefølge: number; purredato: string | null }

const MAANEDER = [
  'Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Desember',
]

function parsePurredato(purredato: string | null): { maaned: number; dag: number } | null {
  if (!purredato) return null
  const [, mm, dd] = purredato.split('-').map(Number)
  return { maaned: mm, dag: dd }
}

function tilLagringsdato(maaned: number, dag: number): string {
  return `2000-${String(maaned).padStart(2, '0')}-${String(dag).padStart(2, '0')}`
}

function dagerIMaaned(maaned: number): number {
  // Bruker år 2000 (skuddår) slik at 29. feb er tilgjengelig
  return new Date(2000, maaned, 0).getDate()
}

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

const selectStil: React.CSSProperties = {
  background: 'var(--bg-elevated-2)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
  borderRadius: '0.75rem',
  padding: '0.35rem 0.4rem',
  fontSize: '0.8rem',
  fontFamily: 'inherit',
}

function MalRad({ mal }: { mal: Mal }) {
  const [redigerer, setRedigerer] = useState(false)
  const [bekrefterSlett, setBekrefterSlett] = useState(false)
  const [navn, setNavn] = useState(mal.navn)
  const parsed = parsePurredato(mal.purredato)
  const [maaned, setMaaned] = useState<number | null>(parsed?.maaned ?? null)
  const [dag, setDag] = useState<number>(parsed?.dag ?? 1)
  const [isPending, startTransition] = useTransition()

  function handleLagre() {
    if (!navn.trim()) return
    const nyPurredato = maaned ? tilLagringsdato(maaned, dag) : null
    startTransition(async () => {
      await oppdaterMal(mal.id, navn, nyPurredato)
      setRedigerer(false)
    })
  }

  function handleSlett() {
    startTransition(async () => {
      await slettMal(mal.id)
    })
  }

  function handleAvbryt() {
    setNavn(mal.navn)
    const p = parsePurredato(mal.purredato)
    setMaaned(p?.maaned ?? null)
    setDag(p?.dag ?? 1)
    setRedigerer(false)
  }

  function handleMaanedEndring(val: string) {
    if (val === '') {
      setMaaned(null)
    } else {
      const nyMaaned = parseInt(val)
      setMaaned(nyMaaned)
      const maxDag = dagerIMaaned(nyMaaned)
      if (dag > maxDag) setDag(maxDag)
    }
  }

  // Vis purredato-tekst i normal-visning
  function purredatoTekst(): string | null {
    if (!mal.purredato) return null
    const p = parsePurredato(mal.purredato)
    if (!p) return null
    return `${p.dag}. ${MAANEDER[p.maaned - 1].toLowerCase()}`
  }

  if (redigerer) {
    const antallDager = maaned ? dagerIMaaned(maaned) : 31
    return (
      <div className="py-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <div className="flex gap-2 items-center mb-2">
          <input
            value={navn}
            onChange={e => setNavn(e.target.value)}
            style={inputStil}
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') handleLagre(); if (e.key === 'Escape') handleAvbryt() }}
          />
          <AdminKnapp onClick={handleLagre} disabled={isPending}
            stil={{ background: 'var(--accent)', color: 'var(--accent-foreground)', opacity: isPending ? 0.5 : 1 }}>
            {isPending ? '…' : 'OK'}
          </AdminKnapp>
          <AdminKnapp onClick={handleAvbryt}
            stil={{ border: '1px solid var(--border)', color: 'var(--text-secondary)', background: 'none' }}>
            ✕
          </AdminKnapp>
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Purring:</span>
          <select value={maaned ?? ''} onChange={e => handleMaanedEndring(e.target.value)} style={selectStil}>
            <option value="">Ingen</option>
            {MAANEDER.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
          {maaned && (
            <select value={dag} onChange={e => setDag(parseInt(e.target.value))} style={selectStil}>
              {Array.from({ length: antallDager }, (_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1}.</option>
              ))}
            </select>
          )}
        </div>
      </div>
    )
  }

  const pTekst = purredatoTekst()

  return (
    <div className="flex items-center justify-between gap-2 py-2" style={{ borderTop: '1px solid var(--border-subtle)', minHeight: RAD_MIN_HOYDE }}>
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{mal.navn}</p>
        {pTekst && (
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Purring {pTekst}</p>
        )}
      </div>
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
      await leggTilMal(navn)
      setNavn('')
    })
  }

  return (
    <div className="flex gap-2 items-center pt-3 mt-1" style={{ borderTop: '1px solid var(--border-subtle)' }}>
      <input
        value={navn}
        onChange={e => setNavn(e.target.value)}
        placeholder="Nytt arrangement…"
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

export default function ArrangementmalerAdmin({ maler }: { maler: Mal[] }) {
  return (
    <div>
      {maler.map(mal => <MalRad key={mal.id} mal={mal} />)}
      <NyMalForm />
    </div>
  )
}
