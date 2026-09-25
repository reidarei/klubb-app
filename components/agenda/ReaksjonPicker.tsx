'use client'

import type { MouseEvent } from 'react'
import { REAKSJON_EMOJIS, MIN_TREFFMAAL_PX } from '@/lib/konstanter'

// Standard luft mellom eieren og popoveren.
export const PICKER_AVSTAND_PX = 6

/**
 * Presentasjonell reaksjons-popover — seks emojis i en pille forankret
 * over eieren (bottom: calc(100% + avstand), left: 0). Løftet ut av
 * MeldingReaksjoner slik at MeldingTommel kan bruke samme visuelle
 * mønster uten å duplisere det. Se #468.
 */
export default function ReaksjonPicker({
  onVelg,
  isPending,
  avstand = PICKER_AVSTAND_PX,
}: {
  onVelg: (emoji: string) => void
  isPending: boolean
  /** Luft (px) over eieren — økes når eieren har en treffflate som vokser oppover (#700). */
  avstand?: number
}) {
  function stopp(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: `calc(100% + ${avstand}px)`,
        left: 0,
        display: 'flex',
        // Knappene er hver 44 px (#700, se under) — ingen ekstra gap trengs,
        // og vertikal padding er 0 så popoveren ikke blir høyere enn knappene.
        gap: 0,
        padding: '0 4px',
        background: 'var(--bg-elevated-2)',
        border: '0.5px solid var(--border)',
        borderRadius: 999,
        boxShadow: 'var(--shadow-popover)',
        zIndex: 10,
      }}
    >
      {REAKSJON_EMOJIS.map(emoji => (
        <button
          key={emoji}
          type="button"
          disabled={isPending}
          onClick={e => {
            stopp(e)
            onVelg(emoji)
          }}
          // Fast width/height, ikke Treffflate (#700): en usynlig flate rundt
          // hver knapp ville overlappet naboene (Treffflate.tsx, unntak a).
          style={{
            width: MIN_TREFFMAAL_PX,
            height: MIN_TREFFMAAL_PX,
            borderRadius: '50%',
            background: 'transparent',
            border: 'none',
            fontSize: 18,
            // Ingen dimming under isPending — serverturen skal ikke synes (#472-oppf.)
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}
