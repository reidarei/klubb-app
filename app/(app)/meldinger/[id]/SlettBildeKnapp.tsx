'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { slettMeldingBilde } from '@/lib/actions/meldinger'
import Treffflate from '@/components/ui/Treffflate'

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
    <Treffflate
      synlig={28}
      disabled={isPending}
      aria-label="Slett bilde"
      onClick={handleSlett}
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        cursor: isPending ? 'wait' : 'pointer',
        opacity: isPending ? 0.5 : 1,
      }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: 'var(--overlay-control-bg)',
          color: 'var(--text-primary)',
          fontSize: 16,
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ×
      </span>
    </Treffflate>
  )
}
