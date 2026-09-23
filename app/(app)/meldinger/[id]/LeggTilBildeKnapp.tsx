'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { komprimer } from '@/lib/bilde-utils'
import { lastOppBilde, slettBilde } from '@/lib/actions/bilde-opplasting'
import { leggTilMeldingBilde } from '@/lib/actions/meldinger'
import Icon from '@/components/ui/Icon'

// Legg til bilde(r) på en eksisterende melding etter publisering. Vises kun for
// forfatteren på egne, ikke-FB, ikke-album-koblede innlegg (se page.tsx) — og
// også når innlegget står uten bilder, slik at man kan bytte bilde ved å slette
// og legge til på nytt. Speiler opplastingsflyten i NyMeldingSkjema: komprimer
// på klient → last opp til R2 → knytt til meldingen. Sekvensiell opplasting for
// å spare iOS-minne (Canvas API er single-threaded).
export default function LeggTilBildeKnapp({
  meldingId,
  gjenstaaende,
}: {
  meldingId: string
  // Hvor mange bilder som kan legges til før MELDING_MAKS_BILDER er nådd —
  // regnet ut på serveren så vi ikke sender opp mer enn det som får plass.
  gjenstaaende: number
}) {
  const [isPending, startTransition] = useTransition()
  const [feil, setFeil] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  function handleFilvalg(e: React.ChangeEvent<HTMLInputElement>) {
    const valgte = Array.from(e.target.files ?? []).slice(0, gjenstaaende)
    // Nullstill input med en gang så samme fil kan velges på nytt senere.
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (valgte.length === 0) return
    setFeil('')

    startTransition(async () => {
      try {
        for (const fil of valgte) {
          const komprimert = await komprimer(fil)
          const fd = new FormData()
          fd.append('fil', komprimert)
          fd.append('kategori', 'meldinger')
          const { url } = await lastOppBilde(fd)
          try {
            await leggTilMeldingBilde(meldingId, url)
          } catch (err) {
            // Innsetting feilet etter at bildet lå i R2 — rydd opp orphan-
            // objektet (best-effort) før vi melder feil videre.
            await slettBilde(url).catch(() => {})
            throw err
          }
        }
        router.refresh()
      } catch (err) {
        setFeil(err instanceof Error ? err.message : 'Kunne ikke legge til bildet.')
      }
    })
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFilvalg}
        disabled={isPending}
        style={{ display: 'none' }}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isPending}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 14px',
          background: 'transparent',
          border: '0.5px solid var(--border)',
          borderRadius: 999,
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-body)',
          fontSize: 12,
          cursor: isPending ? 'wait' : 'pointer',
        }}
      >
        <Icon name="image" size={14} color="currentColor" strokeWidth={1.6} />
        {isPending ? 'Laster opp…' : 'Legg til bilde'}
      </button>
      {feil && (
        <div
          style={{
            color: 'var(--danger)',
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            marginTop: 8,
          }}
        >
          {feil}
        </div>
      )}
    </div>
  )
}
