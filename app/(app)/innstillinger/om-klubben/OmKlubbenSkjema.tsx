'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PilleKnapp } from '@/components/ui/TreffPille'
import { KLUBB_STED_MAKS, KLUBB_OM_MAKS } from '@/lib/konstanter'
import { lagreKlubbInfo } from './actions'

type Props = {
  /** 'YYYY-MM-DD' */
  stiftet: string
  sted: string
  /** Avsnittene skilt med en blank linje. */
  omTekst: string
}

const feltStil = {
  background: 'var(--bg-elevated-2)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)',
  fontSize: 16, // 16 px: under det zoomer iOS inn ved fokus
  padding: '10px 12px',
  width: '100%',
} as const

export default function OmKlubbenSkjema(props: Props) {
  const [stiftet, setStiftet] = useState(props.stiftet)
  const [sted, setSted] = useState(props.sted)
  const [omTekst, setOmTekst] = useState(props.omTekst)
  const [feil, setFeil] = useState<string | null>(null)
  const [lagret, setLagret] = useState(false)
  const [lagrer, startLagring] = useTransition()
  const router = useRouter()

  const endret = stiftet !== props.stiftet || sted !== props.sted || omTekst !== props.omTekst

  function lagre() {
    setFeil(null)
    setLagret(false)
    startLagring(async () => {
      const svar = await lagreKlubbInfo({ stiftet, sted, omTekst })
      if (!svar.ok) {
        setFeil(svar.feil)
        return
      }
      setLagret(true)
      router.refresh()
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <label style={feltRad}>
        <span style={etikettStil}>Stiftet</span>
        <input
          type="date"
          className="skjemafelt"
          value={stiftet}
          onChange={e => setStiftet(e.target.value)}
          style={feltStil}
        />
      </label>

      <label style={feltRad}>
        <span style={etikettStil}>Sted</span>
        <input
          className="skjemafelt"
          value={sted}
          onChange={e => setSted(e.target.value)}
          maxLength={KLUBB_STED_MAKS}
          style={feltStil}
        />
      </label>

      <label style={feltRad}>
        <span style={etikettStil}>Om klubben</span>
        <textarea
          className="skjemafelt"
          value={omTekst}
          onChange={e => setOmTekst(e.target.value)}
          maxLength={KLUBB_OM_MAKS}
          rows={8}
          style={{ ...feltStil, lineHeight: 1.5, resize: 'vertical' }}
        />
        <span style={hjelpStil}>Lag nytt avsnitt med en tom linje.</span>
      </label>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <PilleKnapp
          type="button"
          onClick={lagre}
          disabled={!endret || lagrer}
          pilleStil={{
            display: 'inline-block',
            padding: '8px 18px',
            borderRadius: 999,
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            fontWeight: 500,
            background: endret ? 'var(--accent)' : 'var(--bg-elevated-2)',
            color: endret ? 'var(--accent-foreground)' : 'var(--text-tertiary)',
            border: '0.5px solid var(--border)',
          }}
          synligHoyde={36}
        >
          {lagrer ? 'Lagrer …' : 'Lagre'}
        </PilleKnapp>
        {lagret && !endret && <span style={{ ...hjelpStil, color: 'var(--accent)' }}>Lagret</span>}
      </div>

      {feil && (
        <p role="alert" style={{ ...hjelpStil, color: 'var(--danger)', margin: 0 }}>
          {feil}
        </p>
      )}
    </div>
  )
}

const feltRad = { display: 'flex', flexDirection: 'column', gap: 6 } as const

const etikettStil = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  fontWeight: 600,
  color: 'var(--text-tertiary)',
  letterSpacing: '1.2px',
  textTransform: 'uppercase',
} as const

const hjelpStil = {
  fontFamily: 'var(--font-body)',
  fontSize: 12,
  color: 'var(--text-tertiary)',
} as const
