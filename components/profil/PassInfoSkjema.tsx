'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { lagrePassInfo } from '@/lib/actions/pass'
import { PilleKnapp } from '@/components/ui/TreffPille'
import { SkjemaGruppe, SkjemaRad, RadInput, DatoFelt, LagreKnapp } from '@/components/ui/Skjema'

type Props = {
  initialNummer?: string
  initialUtloper?: string
  onAvbryt: () => void
}

export default function PassInfoSkjema({ initialNummer = '', initialUtloper = '', onAvbryt }: Props) {
  const [nummer, setNummer] = useState(initialNummer)
  const [utloper, setUtloper] = useState(initialUtloper)
  const [feil, setFeil] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleLagre() {
    setFeil('')
    if (!nummer.trim() || !utloper) {
      setFeil('Begge felter må fylles ut.')
      return
    }
    startTransition(async () => {
      try {
        await lagrePassInfo({ nummer, utloper })
        router.refresh()
        onAvbryt() // lukk skjema
      } catch (e) {
        setFeil(e instanceof Error ? e.message : 'Noe gikk galt')
      }
    })
  }

  return (
    <div>
      {/* Gruppen bærer tittelen selv, så PassInfoKort ikke trenger egen ramme. */}
      <SkjemaGruppe tittel="Pass-info" feil={feil}>
        <SkjemaRad etikett="Passnummer">
          <RadInput
            type="text"
            value={nummer}
            onChange={e => setNummer(e.target.value)}
            autoComplete="off"
            maxLength={20}
            aria-label="Passnummer"
          />
        </SkjemaRad>
        <SkjemaRad etikett="Utløpsdato">
          <DatoFelt value={utloper} onChange={e => setUtloper(e.target.value)} aria-label="Utløpsdato" />
        </SkjemaRad>
      </SkjemaGruppe>

      {/* Validering skjer ved trykk (feilmelding i gruppen), så knappen er alltid aktiv. */}
      <LagreKnapp onClick={handleLagre} endret lagrer={isPending} />
      <PilleKnapp
        type="button"
        onClick={onAvbryt}
        disabled={isPending}
        style={{ width: '100%', marginTop: 8 }}
        pilleStil={{
          padding: '10px 0',
          background: 'transparent',
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-body)',
          fontSize: 13,
          textAlign: 'center',
        }}
        synligHoyde={39}
      >
        Avbryt
      </PilleKnapp>
    </div>
  )
}
