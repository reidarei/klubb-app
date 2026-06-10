'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { godkjennPassTilgang, avslaaPassTilgang } from '@/lib/actions/pass'
import { formaterDato } from '@/lib/dato'

type Props = {
  forespørselId: string
  sokerNavn: string
  eierNavn: string
  arrangementTittel: string
  arrangementStart: string | null
  opprettet: string
  siste: boolean
}

export default function GodkjenningRad({
  forespørselId,
  sokerNavn,
  eierNavn,
  arrangementTittel,
  arrangementStart,
  opprettet,
  siste,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleGodkjenn() {
    if (!confirm(`Godkjenne ${sokerNavn} sin tilgang til ${eierNavn} sitt pass i 24 timer?`)) return
    startTransition(async () => {
      try {
        await godkjennPassTilgang(forespørselId)
        router.refresh()
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Klarte ikke å godkjenne')
      }
    })
  }

  function handleAvslaa() {
    if (!confirm(`Avslå ${sokerNavn} sin forespørsel?`)) return
    startTransition(async () => {
      try {
        await avslaaPassTilgang(forespørselId)
        router.refresh()
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Klarte ikke å avslå')
      }
    })
  }

  return (
    <div
      style={{
        padding: '14px 4px',
        borderBottom: siste ? 'none' : '0.5px solid var(--border-subtle)',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          color: 'var(--text-primary)',
          marginBottom: 4,
        }}
      >
        <strong>{sokerNavn}</strong> ber om passinfo for <strong>{eierNavn}</strong>
      </div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--text-tertiary)',
          letterSpacing: '1.2px',
          textTransform: 'uppercase',
          marginBottom: 12,
        }}
      >
        {arrangementTittel}
        {arrangementStart && ` · ${formaterDato(arrangementStart, 'd. MMM yyyy')}`}
        {' · spurt '}
        {formaterDato(opprettet, 'd. MMM HH:mm')}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={handleAvslaa}
          disabled={isPending}
          style={{
            padding: '8px 14px',
            background: 'transparent',
            border: '0.5px solid var(--border)',
            borderRadius: 999,
            color: 'var(--danger)',
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            cursor: isPending ? 'wait' : 'pointer',
          }}
        >
          Avslå
        </button>
        <button
          type="button"
          onClick={handleGodkjenn}
          disabled={isPending}
          style={{
            padding: '8px 14px',
            background: 'var(--accent)',
            border: 'none',
            borderRadius: 999,
            color: '#0a0a0a',
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            fontWeight: 600,
            cursor: isPending ? 'wait' : 'pointer',
          }}
        >
          Godkjenn (24t)
        </button>
      </div>
    </div>
  )
}
