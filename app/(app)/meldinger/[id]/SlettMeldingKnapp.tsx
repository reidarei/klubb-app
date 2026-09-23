'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { slettMelding } from '@/lib/actions/meldinger'

export default function SlettMeldingKnapp({ meldingId }: { meldingId: string }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSlett() {
    if (!confirm('Slette dette innlegget? Kan ikke angres.')) return
    startTransition(async () => {
      try {
        await slettMelding(meldingId)
        router.push('/')
      } catch {
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
      {isPending ? 'Sletter…' : 'Slett innlegg'}
    </button>
  )
}
