'use client'

import { useState } from 'react'
import SectionLabel from '@/components/ui/SectionLabel'
import PollStemming from './PollStemming'
import PollResultat from './PollResultat'

type Valg = { id: string; tekst: string }

type Props = {
  pollId: string
  flervalg: boolean
  valg: Valg[]
  mineStemmer: string[]
  stemmerPerValg: Record<string, number>
  antallStemmere: number
}

/**
 * Når brukeren har stemt på en åpen poll vises resultatet som primær
 * innhold, med en «Endre svar»-knapp som ekspanderer stemme-UI-en på nytt.
 * Brukes kun på detaljsiden — inline-varianten på agenda håndterer dette
 * internt i PollInlineStemme.
 */
export default function PollStemtVisning({
  pollId,
  flervalg,
  valg,
  mineStemmer,
  stemmerPerValg,
  antallStemmere,
}: Props) {
  const [visStemming, setVisStemming] = useState(false)

  const stemmerMap = new Map<string, number>(
    Object.entries(stemmerPerValg),
  )

  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <SectionLabel count={antallStemmere}>Resultat</SectionLabel>
        </div>
      </div>
      <PollResultat
        valg={valg}
        stemmerPerValg={stemmerMap}
        antallStemmere={antallStemmere}
        mineStemmer={mineStemmer}
      />

      {!visStemming && (
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={() => setVisStemming(true)}
            style={{
              padding: '8px 18px',
              borderRadius: 999,
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--accent)',
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: '0.2px',
              cursor: 'pointer',
            }}
          >
            Endre svar
          </button>
        </div>
      )}

      {visStemming && (
        <div style={{ marginTop: 24 }}>
          <SectionLabel>
            {flervalg ? 'Velg ett eller flere' : 'Velg ett'}
          </SectionLabel>
          <PollStemming
            pollId={pollId}
            flervalg={flervalg}
            valg={valg}
            mineStemmer={mineStemmer}
          />
        </div>
      )}
    </section>
  )
}
