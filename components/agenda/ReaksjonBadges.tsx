'use client'

import { type MouseEvent } from 'react'
import ReaksjonPicker from '@/components/agenda/ReaksjonPicker'
import type { ReaksjonGruppe } from '@/lib/reaksjoner'

type Props = {
  brukerId: string
  reaksjoner: ReaksjonGruppe[]
  toggle: (emoji: string) => void
  isPending: boolean
  /** Om picker-popoveren er åpen. Styres av forelderen — enten
   * MeldingReaksjoner (detaljside, egen state) eller MeldingKort (agenda,
   * long-press-styrt). */
  apen: boolean
  lukk: () => void
  /** Når satt vises en «+»-knapp som kaller denne (detaljside/uncontrolled).
   * Utelates på agenda der picker åpnes via long-press på tommelen. Se #468. */
  onPlussKlikk?: () => void
}

/**
 * Presentasjonell reaksjons-rad: badge-piller + valgfri «+»-knapp + picker.
 * Kaller ingen hook selv — reaksjons-state og toggle mates inn. Løftet ut av
 * MeldingReaksjoner (#468/F5) slik at agenda-stien (MeldingKort) kan dele
 * state med MeldingTommel uten å instansiere en ekstra, forkastet hook.
 */
export default function ReaksjonBadges({
  brukerId,
  reaksjoner,
  toggle,
  isPending,
  apen,
  lukk,
  onPlussKlikk,
}: Props) {
  function stopp(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

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
            disabled={isPending}
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
              cursor: isPending ? 'default' : 'pointer',
              opacity: isPending ? 0.6 : 1,
            }}
          >
            <span>{r.emoji}</span>
            <span style={{ fontWeight: 500 }}>{r.profilIder.length}</span>
          </button>
        )
      })}

      {/* + knapp kun i uncontrolled mode (detaljside) */}
      {onPlussKlikk && (
        <button
          type="button"
          onClick={e => {
            stopp(e)
            onPlussKlikk()
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
        <ReaksjonPicker
          isPending={isPending}
          onVelg={emoji => {
            lukk()
            toggle(emoji)
          }}
        />
      )}
    </div>
  )
}
