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

  return (
    <button
      type="button"
      onClick={handleKlikk}
      disabled={isPending}
      style={{
        padding: '8px 14px',
        background: 'var(--accent-soft)',
        border: '0.5px solid var(--accent)',
        borderRadius: 999,
        color: 'var(--accent)',
        fontFamily: 'var(--font-body)',
        fontSize: 12,
        fontWeight: 500,
        cursor: isPending ? 'wait' : 'pointer',
        opacity: isPending ? 0.6 : 1,
      }}
    >
      {isPending ? 'Åpner…' : 'Send melding'}
    </button>
  )
}
