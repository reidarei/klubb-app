'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { opprettPoll } from '@/lib/actions/poll'
import SkjemaBar from '@/components/ui/SkjemaBar'
import { SkjemaGruppe, SkjemaRad, RadInput, DatoFelt, TekstRad } from '@/components/ui/Skjema'
import { ToggleRad } from '@/components/ui/ToggleSwitch'
import Icon from '@/components/ui/Icon'
import Treffflate from '@/components/ui/Treffflate'
import { MIN_TREFFMAAL_PX } from '@/lib/konstanter'
import { datetimeLocalTilIso, osloDagPluss } from '@/lib/dato'

// Default svarfrist: én uke frem kl 20:00. Gir brukeren et fornuftig
// utgangspunkt i stedet for tom datoinput.
function defaultFrist(): string {
  return `${osloDagPluss(7)}T20:00`
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

      <SkjemaGruppe tittel="Spørsmål">
        <TekstRad
          etikett="Spørsmål"
          minRader={2}
          value={spoersmaal}
          onChange={e => setSpoersmaal(e.target.value)}
          placeholder="Hva lurer du på?"
          maxLength={200}
        />
      </SkjemaGruppe>

      {/* Én rad per alternativ; «Legg til alternativ» er siste rad */}
      <SkjemaGruppe tittel={`Alternativer (${alternativer.length})`}>
        {alternativer.map((alt, i) => (
          <SkjemaRad key={i} etikett={`${i + 1}.`}>
            <RadInput
              type="text"
              value={alt}
              onChange={e => oppdaterAlternativ(i, e.target.value)}
              placeholder="Alternativ"
              maxLength={120}
            />
            {alternativer.length > 2 && (
              <Treffflate
                synlig={22}
                onClick={() => fjernAlternativ(i)}
                aria-label="Fjern alternativ"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <Icon name="x" size={14} />
              </Treffflate>
            )}
          </SkjemaRad>
        ))}
        {alternativer.length < 10 && (
          <div style={{ padding: '0 14px' }}>
            <button
              type="button"
              onClick={leggTilAlternativ}
              style={{
                background: 'none',
                border: 'none',
                // Ekte høyde, ikke usynlig utvidelse: raden ligger rett under en 48 px rad, og en utvidelse
                // ville stjålet nederste kant av raden over (CHIP_RAD_GAP, #508).
                minHeight: MIN_TREFFMAAL_PX,
                padding: 0,
                color: 'var(--accent)',
                fontFamily: 'var(--font-body)',
                fontSize: 15,
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Icon name="plus" size={14} color="var(--accent)" />
              Legg til alternativ
            </button>
          </div>
        )}
      </SkjemaGruppe>

      <SkjemaGruppe tittel="Innstillinger" feil={feil}>
        {/* Bryter, ikke segment: to segmentknapper ved siden av etiketten ble
            for smale til 44 px trykkflate. */}
        <SkjemaRad etikett="Flere svar">
          <ToggleRad on={flervalg} onChange={() => setFlervalg(v => !v)} ariaLabel="Tillat flere svar" />
        </SkjemaRad>
        <SkjemaRad etikett="Svarfrist">
          <DatoFelt type="datetime-local" value={frist} onChange={e => setFrist(e.target.value)} aria-label="Svarfrist" />
        </SkjemaRad>
      </SkjemaGruppe>
    </div>
  )
}
