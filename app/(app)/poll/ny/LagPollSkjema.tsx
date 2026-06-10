'use client'

import { useState, useTransition, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { opprettPoll } from '@/lib/actions/poll'
import SkjemaBar from '@/components/ui/SkjemaBar'
import SkjemaSeksjon from '@/components/ui/SkjemaSeksjon'
import Segment from '@/components/ui/Segment'
import Icon from '@/components/ui/Icon'
import { formaterDato, datetimeLocalTilIso } from '@/lib/dato'

const monoLabel: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 9.5,
  fontWeight: 600,
  color: 'var(--text-tertiary)',
  letterSpacing: '1.6px',
  textTransform: 'uppercase',
  marginBottom: 4,
}

const inputStil: CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: 'none',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)',
  fontSize: 14,
  outline: 'none',
  padding: 0,
}

const accentStil: CSSProperties = {
  ...inputStil,
  fontFamily: 'var(--font-display)',
  fontSize: 19,
  fontWeight: 500,
  letterSpacing: '-0.3px',
}

function Rad({ last, children }: { last?: boolean; children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '10px 4px',
        borderBottom: last ? 'none' : '0.5px solid var(--border-subtle)',
      }}
    >
      {children}
    </div>
  )
}

// Default svarfrist: én uke frem kl 20:00. Gir brukeren et fornuftig
// utgangspunkt i stedet for tom datoinput.
function defaultFrist(): string {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  const iso = d.toISOString()
  return `${formaterDato(iso, 'yyyy-MM-dd')}T20:00`
}

export default function LagPollSkjema() {
  const [spoersmaal, setSpoersmaal] = useState('')
  const [frist, setFrist] = useState(defaultFrist())
  const [flervalg, setFlervalg] = useState(false)
  const [alternativer, setAlternativer] = useState<string[]>(['', ''])
  const [feil, setFeil] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function oppdaterAlternativ(i: number, verdi: string) {
    setAlternativer(prev => prev.map((a, idx) => (idx === i ? verdi : a)))
  }

  function leggTilAlternativ() {
    if (alternativer.length >= 10) return
    setAlternativer(prev => [...prev, ''])
  }

  function fjernAlternativ(i: number) {
    if (alternativer.length <= 2) return
    setAlternativer(prev => prev.filter((_, idx) => idx !== i))
  }

  function handlePubliser() {
    setFeil('')
    if (!spoersmaal.trim()) {
      setFeil('Spørsmål må fylles ut.')
      return
    }
    if (!frist) {
      setFeil('Svarfrist må settes.')
      return
    }
    const rensede = alternativer.map(a => a.trim()).filter(a => a.length > 0)
    if (rensede.length < 2) {
      setFeil('Legg til minst 2 alternativer.')
      return
    }

    startTransition(async () => {
      try {
        await opprettPoll({
          spoersmaal,
          svarfrist: datetimeLocalTilIso(frist),
          flervalg,
          valg: rensede,
        })
      } catch (err) {
        if (
          typeof err === 'object' &&
          err !== null &&
          'digest' in err &&
          typeof (err as Record<string, unknown>).digest === 'string' &&
          ((err as Record<string, unknown>).digest as string).startsWith('NEXT_REDIRECT')
        ) {
          throw err
        }
        setFeil(err instanceof Error ? err.message : 'Noe gikk galt. Prøv igjen.')
      }
    })
  }

  const valgOptions = [
    { value: 'enkel' as const, label: 'Enkeltvalg' },
    { value: 'fler' as const, label: 'Flervalg' },
  ]

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <SkjemaBar
        overtittel="Ny"
        tittel={spoersmaal || 'Avstemming'}
        onAvbryt={() => router.back()}
        onLagre={handlePubliser}
        lagreLabel="Publiser"
        laster={isPending}
      />

      {/* Spørsmål */}
      <SkjemaSeksjon label="Spørsmål">
        <Rad last>
          <input
            type="text"
            value={spoersmaal}
            onChange={e => setSpoersmaal(e.target.value)}
            style={accentStil}
            placeholder="Hva lurer du på?"
            maxLength={200}
          />
        </Rad>
      </SkjemaSeksjon>

      {/* Alternativer */}
      <SkjemaSeksjon label={`Alternativer (${alternativer.length})`}>
        {alternativer.map((alt, i) => (
          <Rad key={i} last={i === alternativer.length - 1 && alternativer.length >= 10}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={monoLabel}>{i + 1}.</div>
              <input
                type="text"
                value={alt}
                onChange={e => oppdaterAlternativ(i, e.target.value)}
                style={{ ...inputStil, flex: 1 }}
                placeholder="Alternativ"
                maxLength={120}
              />
              {alternativer.length > 2 && (
                <button
                  type="button"
                  onClick={() => fjernAlternativ(i)}
                  aria-label="Fjern alternativ"
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 4,
                    cursor: 'pointer',
                    color: 'var(--text-tertiary)',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <Icon name="x" size={14} />
                </button>
              )}
            </div>
          </Rad>
        ))}
        {alternativer.length < 10 && (
          <Rad last>
            <button
              type="button"
              onClick={leggTilAlternativ}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: 'var(--accent)',
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Icon name="plus" size={14} color="var(--accent)" />
              Legg til alternativ
            </button>
          </Rad>
        )}
      </SkjemaSeksjon>

      {/* Valgtype + frist */}
      <SkjemaSeksjon label="Innstillinger">
        <Rad>
          <div style={monoLabel}>Valgtype</div>
          <Segment
            value={flervalg ? 'fler' : 'enkel'}
            options={valgOptions}
            onChange={v => setFlervalg(v === 'fler')}
          />
        </Rad>
        <Rad last>
          <div style={monoLabel}>Svarfrist</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="datetime-local"
              value={frist}
              onChange={e => setFrist(e.target.value)}
              style={{ ...inputStil, flex: 1 }}
            />
            <Icon name="calendar" size={15} color="var(--text-tertiary)" />
          </div>
        </Rad>
      </SkjemaSeksjon>

      {feil && (
        <p style={{ fontSize: 13, color: 'var(--danger)', marginTop: -8, marginBottom: 16 }}>
          {feil}
        </p>
      )}
    </div>
  )
}
