'use client'

import { useTransition } from 'react'
import { slettPoll } from '@/lib/actions/poll'

export default function SlettPollKnapp({ pollId }: { pollId: string }) {
  const [isPending, startTransition] = useTransition()

  function handleSlett() {
    if (!confirm('Slette denne avstemmingen? Kan ikke angres.')) return
    startTransition(async () => {
      try {
        await slettPoll(pollId)
      } catch (err) {
        // NEXT_REDIRECT kastes som forventet oppførsel
        if (
          typeof err === 'object' &&
          err !== null &&
          'digest' in err &&
          typeof (err as Record<string, unknown>).digest === 'string' &&
          ((err as Record<string, unknown>).digest as string).startsWith('NEXT_REDIRECT')
        ) {
          throw err
        }
        alert('Kunne ikke slette.')
      }
    })
  }

  return (
    <button
      type="button"
      onClick={handleSlett}
      disabled={isPending}
      style={{
        display: 'block',
        width: '100%',
        padding: '14px 0',
        marginTop: 32,
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: 999,
        color: 'var(--danger)',
        fontFamily: 'var(--font-body)',
        fontSize: 14,
        fontWeight: 500,
        cursor: isPending ? 'wait' : 'pointer',
        opacity: isPending ? 0.6 : 1,
      }}
    >
      {isPending ? 'Sletter…' : 'Slett avstemming'}
    </button>
  )
}
