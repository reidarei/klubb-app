'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { lukkKaaringspollNaa } from '@/lib/actions/kaaringspoll'

export default function LukkNaaKnapp({
  pollId,
  disabled = false,
}: {
  pollId: string
  disabled?: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [feil, setFeil] = useState<string | null>(null)
  const router = useRouter()
  const hintId = useId()

  function handleLukk() {
    if (!confirm('Vil du lukke kåringen nå? Dette kan ikke angres.')) return
    setFeil(null)
    startTransition(async () => {
      try {
        await lukkKaaringspollNaa(pollId)
        router.refresh()
      } catch (err) {
        setFeil(err instanceof Error ? err.message : 'Kunne ikke lukke kåringen')
      }
    })
  }

  const erDisabled = isPending || disabled
  return (
    <div style={{ marginTop: 24 }}>
      <button
        type="button"
        onClick={handleLukk}
        disabled={erDisabled}
        aria-describedby={disabled ? hintId : undefined}
        style={{
          display: 'block',
          width: '100%',
          padding: '14px 0',
          background: 'transparent',
          border: '1px solid var(--border)',
          borderRadius: 999,
          color: 'var(--danger)',
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          fontWeight: 500,
          opacity: erDisabled ? 0.6 : 1,
        }}
      >
        {isPending ? 'Lukker…' : 'Lukk kåringen nå'}
      </button>
      {/* Forklaring på hvorfor knappen er grå, for skjermleser (#796: erstatter
          title-tooltipen, som aldri vises på touch). */}
      {disabled && (
        <span id={hintId} className="sr-only">
          Ingen har stemt ennå
        </span>
      )}
      {feil && (
        <p
          style={{
            marginTop: 10,
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            color: 'var(--danger)',
            textAlign: 'center',
          }}
        >
          {feil}
        </p>
      )}
    </div>
  )
}
