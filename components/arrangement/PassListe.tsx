'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Avatar from '@/components/ui/Avatar'
import { bePassTilgang } from '@/lib/actions/pass'
import { formaterDato } from '@/lib/dato'

export type PassListeDeltaker = {
  id: string
  navn: string
  bilde_url: string | null
  rolle: string | null
  /** Fylt inn hvis vi har gyldig dagstilgang (RLS filtrert). */
  pass: { nummer: string; utloper: string } | null
  /** Status på siste forespørsel: 'venter' | 'godkjent' | 'avslatt' | null */
  forespørselStatus: 'venter' | 'godkjent' | 'avslatt' | null
}

type Props = {
  arrangementId: string
  deltakere: PassListeDeltaker[]
}

/**
 * Liste over Ja-deltakere med passinfo-status. Viser én av tre tilstander
 * per deltaker: «Be om»-knapp, «Venter»-tekst, eller fullt synlig pass.
 * RLS i DB håndhever 1-dags-vinduet — vi viser bare det vi får returnert.
 */
export default function PassListe({ arrangementId, deltakere }: Props) {
  const [, startTransition] = useTransition()
  const [aktiv, setAktiv] = useState<string | null>(null)
  const router = useRouter()

  function be(eierId: string) {
    setAktiv(eierId)
    startTransition(async () => {
      try {
        await bePassTilgang({ eier_id: eierId, arrangement_id: arrangementId })
        router.refresh()
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Klarte ikke å sende forespørsel')
      } finally {
        setAktiv(null)
      }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {deltakere.map((d, i) => (
        <div
          key={d.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 4px',
            borderBottom: i < deltakere.length - 1 ? '0.5px solid var(--border-subtle)' : 'none',
          }}
        >
          <Avatar name={d.navn} size={32} src={d.bilde_url} rolle={d.rolle} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}
            >
              {d.navn}
            </div>
            {d.pass ? (
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color: 'var(--accent)',
                  letterSpacing: '0.5px',
                  marginTop: 2,
                }}
              >
                {d.pass.nummer} · gyldig til{' '}
                {formaterDato(`${d.pass.utloper}T12:00:00Z`, 'd. MMM yyyy')}
              </div>
            ) : d.forespørselStatus === 'venter' ? (
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'var(--text-tertiary)',
                  letterSpacing: '1.4px',
                  textTransform: 'uppercase',
                  marginTop: 2,
                }}
              >
                Venter på godkjenning
              </div>
            ) : d.forespørselStatus === 'avslatt' ? (
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'var(--danger)',
                  letterSpacing: '1.4px',
                  textTransform: 'uppercase',
                  marginTop: 2,
                }}
              >
                Avslått
              </div>
            ) : (
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'var(--text-tertiary)',
                  letterSpacing: '1.4px',
                  textTransform: 'uppercase',
                  marginTop: 2,
                }}
              >
                Ikke spurt
              </div>
            )}
          </div>

          {!d.pass && d.forespørselStatus !== 'venter' && (
            <button
              type="button"
              onClick={() => be(d.id)}
              disabled={aktiv === d.id}
              style={{
                padding: '8px 12px',
                background: 'var(--accent-soft)',
                border: '0.5px solid var(--accent)',
                borderRadius: 999,
                color: 'var(--accent)',
                fontFamily: 'var(--font-body)',
                fontSize: 11,
                fontWeight: 500,
                cursor: aktiv === d.id ? 'wait' : 'pointer',
                flexShrink: 0,
              }}
            >
              {aktiv === d.id ? 'Sender…' : 'Be om passinfo'}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
