'use client'

import { useState, useTransition } from 'react'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import { hentPublisertOppgjor, skrivPublisertOppgjor, type OppgjorDiff } from '@/lib/actions/fond'
import { formaterDato } from '@/lib/dato'

// Formaterer et beløp som kr med to desimaler
function kr(n: number | null): string {
  if (n === null) return '–'
  return n.toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kr'
}

// Viser endring med fortegn og farge (grønn = positiv/ingen endring, rød = reduksjon)
function Endring({ app, hentet }: { app: number | null; hentet: number }) {
  const diff = app !== null ? hentet - app : null
  if (diff === null) return <span style={{ color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>ny</span>
  if (diff === 0) return <span style={{ color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>–</span>
  const farge = diff > 0 ? 'var(--success)' : 'var(--danger)'
  const tegn = diff > 0 ? '+' : ''
  return (
    <span style={{ color: farge, fontVariantNumeric: 'tabular-nums' }}>
      {tegn}{diff.toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr
    </span>
  )
}

export default function HentOppgjor() {
  const [henterPending, startHent] = useTransition()
  const [skriverPending, startSkriv] = useTransition()
  const [diff, setDiff] = useState<OppgjorDiff | null>(null)
  const [feil, setFeil] = useState<string | null>(null)
  const [suksess, setSuksess] = useState(false)

  // Sjekk om noen rad har flere innskudd-rader — blokkerer skriving
  const harFlereRader = diff?.rader.some((r) => r.antallRader > 1) ?? false

  function handleHent() {
    setFeil(null)
    setSuksess(false)
    setDiff(null)
    startHent(async () => {
      const resultat = await hentPublisertOppgjor()
      if (resultat.ok) setDiff(resultat.diff)
      else setFeil(resultat.feil)
    })
  }

  function handleSkriv() {
    if (!diff) return
    setFeil(null)
    setSuksess(false)
    // Bygg oppgjør-payload fra diff (rekonstruerer Oppgjor-kontrakten for server-re-validering)
    const payload = {
      versjon: 1 as const,
      generert: diff.generert,
      snapshot_dato: diff.snapshot_dato,
      saldo: diff.saldo.hentet,
      andeler: diff.rader.map((r) => ({
        visningsnavn: r.visningsnavn,
        belop: r.hentetVerdi,
      })),
    }
    startSkriv(async () => {
      const resultat = await skrivPublisertOppgjor(payload)
      if (resultat.ok) { setSuksess(true); setDiff(null) }
      else setFeil(resultat.feil)
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Trinn 1: Hent-knapp */}
      <Button
        variant="secondary"
        onClick={handleHent}
        disabled={henterPending || skriverPending}
      >
        {henterPending ? 'Henter…' : 'Hent publisert oppgjør'}
      </Button>

      {/* Feilmelding */}
      {feil && (
        <div style={{ color: 'var(--danger)', fontSize: 13 }}>{feil}</div>
      )}

      {/* Suksessmelding */}
      {suksess && (
        <div style={{ color: 'var(--success)', fontSize: 13 }}>
          Oppgjør skrevet til appen.
        </div>
      )}

      {/* Trinn 2: diff-tabell */}
      {diff && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            Oppgjør per {diff.snapshot_dato}, generert {formaterDato(diff.generert, 'd. MMM yyyy HH:mm')}
          </div>

          {/* Blokkerende advarsel ved duplikat-rader */}
          {harFlereRader && (
            <div style={{ color: 'var(--danger)', fontSize: 13 }}>
              En eller flere innbyggere har flere innskudd-rader. Rydd opp i editoren nedenfor før oppgjøret kan skrives.
            </div>
          )}

          {/* Tabell — per-rad-diff */}
          <Card>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: 'var(--text-tertiary)', textAlign: 'right' }}>
                  <th style={{ textAlign: 'left', fontWeight: 500, paddingBottom: 6 }}>Navn</th>
                  <th style={{ fontWeight: 500, paddingBottom: 6 }}>I appen</th>
                  <th style={{ fontWeight: 500, paddingBottom: 6 }}>Hentet</th>
                  <th style={{ fontWeight: 500, paddingBottom: 6 }}>Endring</th>
                </tr>
              </thead>
              <tbody>
                {diff.rader.map((r) => (
                  <tr key={r.profil_id} style={{ borderTop: '0.5px solid var(--border-subtle)' }}>
                    <td style={{ padding: '6px 0', color: 'var(--text-primary)' }}>
                      {r.visningsnavn}
                      {r.antallRader > 1 && (
                        <span style={{ color: 'var(--danger)', fontSize: 11, marginLeft: 4 }}>
                          ({r.antallRader} rader!)
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                      {kr(r.appVerdi)}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                      {kr(r.hentetVerdi)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Endring app={r.appVerdi} hentet={r.hentetVerdi} />
                    </td>
                  </tr>
                ))}
                {/* Saldo-rad */}
                <tr style={{ borderTop: '1px solid var(--border)', fontWeight: 600 }}>
                  <td style={{ padding: '8px 0', color: 'var(--text-primary)' }}>Saldo</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                    {kr(diff.saldo.app)}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                    {kr(diff.saldo.hentet)}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Endring app={diff.saldo.app} hentet={diff.saldo.hentet} />
                  </td>
                </tr>
              </tbody>
            </table>
          </Card>

          {/* Trinn 3: Skriv-knapp */}
          <Button
            variant="primary"
            onClick={handleSkriv}
            disabled={harFlereRader || skriverPending || henterPending}
          >
            {skriverPending ? 'Skriver…' : 'Skriv til appen'}
          </Button>
        </div>
      )}
    </div>
  )
}
