'use client'

import { useState, useTransition, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import { leggTilMeldingReaksjon, fjernMeldingReaksjon } from '@/lib/actions/meldinger'

const REAKSJON_EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥', '🙌'] as const

export type ReaksjonGruppe = { emoji: string; profilIder: string[] }

type Props = {
  meldingId: string
  brukerId: string
  reaksjoner: ReaksjonGruppe[]
  /** Controlled-mode: hvis satt, styrer forelderen picker-tilstand
   * (typisk via long-press) og + knappen rendres ikke. Hvis utelatt
   * holder komponenten egen state og viser en + knapp. */
  pickerApen?: boolean
  lukkPicker?: () => void
}

export default function MeldingReaksjoner({
  meldingId,
  brukerId,
  reaksjoner: initial,
  pickerApen,
  lukkPicker,
}: Props) {
  const [reaksjoner, setReaksjoner] = useState<ReaksjonGruppe[]>(initial)
  const [internApen, setInternApen] = useState(false)
  const [, startTransition] = useTransition()
  const router = useRouter()

  const erControlled = pickerApen !== undefined
  const apen = erControlled ? !!pickerApen : internApen

  function lukk() {
    if (erControlled) lukkPicker?.()
    else setInternApen(false)
  }

  function stopp(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

  function toggle(emoji: string) {
    const finnes = reaksjoner.find(r => r.emoji === emoji)
    const harReagert = finnes?.profilIder.includes(brukerId) ?? false

    setReaksjoner(prev => {
      const utenBruker = prev.map(r => ({
        ...r,
        profilIder: r.profilIder.filter(p => p !== brukerId),
      }))
      const ferdig = harReagert
        ? utenBruker
        : utenBruker.map(r => r.emoji === emoji ? { ...r, profilIder: [...r.profilIder, brukerId] } : r)

      const harGruppe = ferdig.some(r => r.emoji === emoji)
      const utvidet = !harReagert && !harGruppe
        ? [...ferdig, { emoji, profilIder: [brukerId] }]
        : ferdig

      return utvidet.filter(r => r.profilIder.length > 0)
    })

    startTransition(async () => {
      try {
        if (harReagert) {
          await fjernMeldingReaksjon(meldingId, emoji)
        } else {
          await leggTilMeldingReaksjon(meldingId, emoji)
        }
        router.refresh()
      } catch {
        setReaksjoner(initial)
      }
    })
  }

  // Controlled-mode uten reaksjoner og uten åpen picker → ingenting
  // (sparer plass på agenda-kortene)
  if (erControlled && reaksjoner.length === 0 && !apen) return null

  return (
    <div
      onClick={stopp}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flexWrap: 'wrap',
      }}
    >
      {reaksjoner.map(r => {
        const harReagert = r.profilIder.includes(brukerId)
        return (
          <button
            key={r.emoji}
            type="button"
            onClick={e => {
              stopp(e)
              toggle(r.emoji)
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 8px',
              borderRadius: 999,
              background: harReagert ? 'var(--accent-soft)' : 'var(--bg-elevated-2)',
              border: harReagert ? '0.5px solid var(--accent)' : '0.5px solid var(--border)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            <span>{r.emoji}</span>
            <span style={{ fontWeight: 500 }}>{r.profilIder.length}</span>
          </button>
        )
      })}

      {/* + knapp kun i uncontrolled mode (detaljside) */}
      {!erControlled && (
        <button
          type="button"
          onClick={e => {
            stopp(e)
            setInternApen(v => !v)
          }}
          aria-label="Legg til reaksjon"
          style={{
            width: 28,
            height: 26,
            borderRadius: 999,
            background: 'transparent',
            border: '0.5px dashed var(--border-strong)',
            color: 'var(--text-tertiary)',
            fontSize: 14,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          +
        </button>
      )}

      {apen && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: 0,
            display: 'flex',
            gap: 4,
            padding: '6px 8px',
            background: 'var(--bg-elevated-2)',
            border: '0.5px solid var(--border)',
            borderRadius: 999,
            boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
            zIndex: 10,
          }}
        >
          {REAKSJON_EMOJIS.map(emoji => (
            <button
              key={emoji}
              type="button"
              onClick={e => {
                stopp(e)
                lukk()
                toggle(emoji)
              }}
              style={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                background: 'transparent',
                border: 'none',
                fontSize: 18,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
