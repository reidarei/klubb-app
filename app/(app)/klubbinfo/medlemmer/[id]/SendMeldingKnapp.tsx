'use client'

import { useTransition } from 'react'
import { aapneSamtale } from '@/lib/actions/samtaler'

export default function SendMeldingKnapp({ motpartId }: { motpartId: string }) {
  const [isPending, startTransition] = useTransition()

  function handleKlikk() {
    startTransition(async () => {
      try {
        await aapneSamtale(motpartId)
      } catch (err) {
        // NEXT_REDIRECT er forventet — la den kastes oppover
        if (
          typeof err === 'object' &&
          err !== null &&
          'digest' in err &&
          typeof (err as Record<string, unknown>).digest === 'string' &&
          ((err as Record<string, unknown>).digest as string).startsWith('NEXT_REDIRECT')
        ) {
          throw err
        }
        alert('Kunne ikke åpne samtale.')
      }
    })
  }

  // Full bredde og minst 44 px høy: knappen selv er treffflaten.
  return (
    <button
      type="button"
      onClick={handleKlikk}
      disabled={isPending}
      style={{
        width: '100%',
        minHeight: 44,
        padding: '11px 14px',
        background: 'var(--accent-soft)',
        border: '0.5px solid var(--accent)',
        borderRadius: 14,
        color: 'var(--accent)',
        fontFamily: 'var(--font-body)',
        fontSize: 15,
        fontWeight: 500,
        opacity: isPending ? 0.6 : 1,
        cursor: 'pointer',
      }}
    >
      {isPending ? 'Åpner…' : 'Send melding'}
    </button>
  )
}
