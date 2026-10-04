'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SkjemaGruppe, SkjemaRad, RadInput, DatoFelt, TekstRad, LagreKnapp } from '@/components/ui/Skjema'
import { KLUBB_STED_MAKS, KLUBB_OM_MAKS } from '@/lib/konstanter'
import { lagreKlubbInfo } from './actions'

type Props = {
  /** 'YYYY-MM-DD' */
  stiftet: string
  sted: string
  /** Avsnittene skilt med en blank linje. */
  omTekst: string
}

export default function OmKlubbenSkjema(props: Props) {
  // Lagret tilstand — sammenlignes mot for å vite om noe er endret, og
  // flyttes fram etter vellykket lagring så knappen går tilbake til grå.
  const [lagretVerdi, setLagretVerdi] = useState(props)
  const [stiftet, setStiftet] = useState(props.stiftet)
  const [sted, setSted] = useState(props.sted)
  const [omTekst, setOmTekst] = useState(props.omTekst)
  const [feil, setFeil] = useState<string | null>(null)
  const [lagret, setLagret] = useState(false)
  const [lagrer, startLagring] = useTransition()
  const router = useRouter()

  const endret = stiftet !== lagretVerdi.stiftet || sted !== lagretVerdi.sted || omTekst !== lagretVerdi.omTekst

  function lagre() {
    setFeil(null)
    setLagret(false)
    startLagring(async () => {
      const svar = await lagreKlubbInfo({ stiftet, sted, omTekst })
      if (!svar.ok) {
        setFeil(svar.feil)
        return
      }
      setLagretVerdi({ stiftet, sted, omTekst })
      setLagret(true)
      router.refresh()
    })
  }

  return (
    <div>
      <SkjemaGruppe tittel="Stiftelse">
        <SkjemaRad etikett="Dato">
          <DatoFelt value={stiftet} onChange={e => setStiftet(e.target.value)} aria-label="Stiftelsesdato" />
        </SkjemaRad>
        <SkjemaRad etikett="Sted">
          <RadInput value={sted} onChange={e => setSted(e.target.value)} maxLength={KLUBB_STED_MAKS} />
        </SkjemaRad>
      </SkjemaGruppe>

      <SkjemaGruppe tittel="Tekst på Klubb-siden" hjelp="Tom linje gir nytt avsnitt." feil={feil}>
        <TekstRad
          value={omTekst}
          onChange={e => setOmTekst(e.target.value)}
          maxLength={KLUBB_OM_MAKS}
          aria-label="Om klubben"
        />
      </SkjemaGruppe>

      <LagreKnapp onClick={lagre} endret={endret} lagrer={lagrer} lagret={lagret} />
    </div>
  )
}
