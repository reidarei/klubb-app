'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { slettMeldingBilde } from '@/lib/actions/meldinger'

// Klient-komponent for å slette ett bilde fra en melding.
// Mønsteret speiler SlettMeldingKnapp — confirm + router.refresh() for
// optimistisk UI uten full re-navigasjon. Vises kun for eier og admin (se
// page.tsx). R2-objektet orphanes — akseptert per policy i #174.
export default function SlettBildeKnapp({ bildeId }: { bildeId: string }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSlett() {
    if (!confirm('Slette dette bildet?')) return
    startTransition(async () => {
      try {
        await slettMeldingBilde(bildeId)
        router.refresh()
      } catch {
        alert('Kunne ikke slette bildet.')
      }
    })
  }

  return (
    <button
      type="button"
      onClick={handleSlett}
      disabled={isPending}
      aria-label="Slett bilde"
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        width: 28,
        height: 28,
        borderRadius: '50%',
        background: 'rgba(0,0,0,0.55)',
        border: 'none',
        color: 'white',
        fontSize: 16,
        lineHeight: 1,
        cursor: isPending ? 'wait' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        opacity: isPending ? 0.5 : 1,
      }}
    >
      ×
    </button>
  )
}
