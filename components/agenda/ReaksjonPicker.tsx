'use client'

import type { MouseEvent } from 'react'
import { REAKSJON_EMOJIS } from '@/lib/konstanter'

/**
 * Presentasjonell reaksjons-popover — seks emojis i en pille forankret
 * over eieren (bottom: calc(100% + 6px), left: 0). Løftet ut av
 * MeldingReaksjoner slik at MeldingTommel kan bruke samme visuelle
 * mønster uten å duplisere det. Se #468.
 */
export default function ReaksjonPicker({
  onVelg,
  isPending,
}: {
  onVelg: (emoji: string) => void
  isPending: boolean
}) {
  function stopp(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

  return (
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
          style={{
            width: 30,
            height: 30,
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
