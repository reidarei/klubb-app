'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { opprettKaaringspoll } from '@/lib/actions/kaaringspoll'
import SkjemaBar from '@/components/ui/SkjemaBar'
import { SkjemaGruppe, SkjemaRad, RadInput, DatoFelt, ValgFelt } from '@/components/ui/Skjema'
import { formaterDato, datetimeLocalTilIso, osloDagPluss } from '@/lib/dato'

type Mal = {
  id: string
  navn: string
  kandidat_kilde: string
}

type ArrangementValg = {
  id: string
  tittel: string
  start_tidspunkt: string
}

// Default svarfrist: én uke frem kl 20:00.
function defaultFrist(): string {
  return `${osloDagPluss(7)}T20:00`
}

type Props = {
  maler: Mal[]
  defaultAar: number
  medlemAntall: number
  moeteAntall: number
  arrangementer: ArrangementValg[]
}

export default function OpprettSkjema({
  maler,
  defaultAar,
  medlemAntall,
  moeteAntall,
  arrangementer,
}: Props) {
  const [malId, setMalId] = useState(maler[0]?.id ?? '')
  const [aar, setAar] = useState(defaultAar)
  const [frist, setFrist] = useState(defaultFrist())
  const [arrangementId, setArrangementId] = useState<string>('')
  const [feil, setFeil] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const valgtMal = maler.find(m => m.id === malId)
  const antallKandidater = valgtMal?.kandidat_kilde === 'arrangement_moete' ? moeteAntall : medlemAntall
  const forFaaKandidater = antallKandidater < 2

  function handlePubliser() {
    setFeil('')
    if (!malId) {
      setFeil('Velg en kåringsmal.')
      return
    }
    if (!frist) {
      setFeil('Sett en svarfrist.')
      return
    }
    if (forFaaKandidater) {
      setFeil(`Trenger minst 2 kandidater (fant ${antallKandidater}).`)
      return
    }
    startTransition(async () => {
      try {
        await opprettKaaringspoll({
          kaaringMalId: malId,
          aar,
          svarfrist: datetimeLocalTilIso(frist),
          arrangementId: arrangementId || null,
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
        setFeil(err instanceof Error ? err.message : 'Noe gikk galt.')
      }
    })
  }

  if (maler.length === 0) {
    return (
      <div style={{ padding: '40px 20px' }}>
        <p style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
          Ingen ledige kåringsmaler for {defaultAar} — alle har allerede en poll, eller ingen
          maler er definert.
        </p>
      </div>
    )
  }

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <SkjemaBar
        overtittel="Ny"
        tittel={valgtMal ? `${valgtMal.navn} ${aar}` : 'Kåring'}
        onAvbryt={() => router.back()}
        onLagre={handlePubliser}
        lagreLabel="Publiser"
        laster={isPending}
      />

      <SkjemaGruppe tittel="Kåring">
        <SkjemaRad etikett="Mal">
          <ValgFelt
            value={malId}
            valg={maler.map(m => ({ verdi: m.id, etikett: m.navn }))}
            onChange={e => setMalId(e.target.value)}
            aria-label="Mal"
          />
        </SkjemaRad>
      </SkjemaGruppe>

      <SkjemaGruppe tittel="Innstillinger">
        <SkjemaRad etikett="År">
          <RadInput
            type="number"
            min={2008}
            max={2100}
            value={aar}
            onChange={e => setAar(parseInt(e.target.value || `${defaultAar}`, 10))}
          />
        </SkjemaRad>
        <SkjemaRad etikett="Svarfrist">
          <DatoFelt type="datetime-local" value={frist} onChange={e => setFrist(e.target.value)} aria-label="Svarfrist" />
        </SkjemaRad>
        <SkjemaRad etikett="Arrangement">
          {arrangementer.length === 0 ? (
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                color: 'var(--text-tertiary)',
                fontStyle: 'italic',
                textAlign: 'right',
              }}
            >
              Ingen aktuelle å koble til
            </span>
          ) : (
            <ValgFelt
              value={arrangementId}
              valg={[
                { verdi: '', etikett: '— ikke koblet —' },
                ...arrangementer.map(a => ({
                  verdi: a.id,
                  etikett: `${a.tittel} (${formaterDato(a.start_tidspunkt, 'd. MMM yyyy')})`,
                })),
              ]}
              onChange={e => setArrangementId(e.target.value)}
              plassholder="— ikke koblet —"
              aria-label="Arrangement"
            />
          )}
        </SkjemaRad>
      </SkjemaGruppe>

      <div
        style={{
          marginTop: 16,
          padding: 12,
          borderRadius: 'var(--radius-card)',
          background: forFaaKandidater ? 'var(--danger-soft)' : 'var(--bg-elevated)',
          color: forFaaKandidater ? 'var(--danger)' : 'var(--text-secondary)',
          fontFamily: 'var(--font-body)',
          fontSize: 13,
        }}
      >
        {valgtMal?.kandidat_kilde === 'arrangement_moete'
          ? `${antallKandidater} møte${antallKandidater === 1 ? '' : 'r'} blir kandidater.`
          : `${antallKandidater} medlem${antallKandidater === 1 ? '' : 'mer'} blir kandidater.`}
        {forFaaKandidater && ' Trenger minst 2.'}
      </div>

      {feil && (
        <p role="alert" style={{ fontSize: 13, color: 'var(--danger)', margin: '12px 4px 0' }}>{feil}</p>
      )}
    </div>
  )
}
