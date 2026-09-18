'use client'

import { useState, useTransition } from 'react'
import { meldKlientfeil } from '@/lib/klient-logg'
import Segment from '@/components/ui/Segment'
import { oppdaterTema } from '@/lib/actions/tema'
import { skrivTemaTilStorage } from '@/lib/tema-klient'
import { TEMA_EVENT, TEMA_VALG, type TemaValg } from '@/lib/konstanter'
import SectionLabel from '@/components/ui/SectionLabel'

const TEMA_ETIKETTER: Record<TemaValg, string> = {
  system: 'System',
  dark: 'Mørk',
  light: 'Lys',
}

const temaAlternativer = TEMA_VALG.map(v => ({ value: v, label: TEMA_ETIKETTER[v] }))

export default function UtseendeValg({ initial }: { initial: TemaValg }) {
  const [valg, setValg] = useState<TemaValg>(initial)
  const [, startTransition] = useTransition()

  function velg(v: TemaValg) {
    // Hindrer at klikk på allerede valgt tema lekker en ny mq-lytter
    // i TemaSync (system-grenen kan sette opp lytter to ganger).
    if (v === valg) return
    setValg(v)
    skrivTemaTilStorage(v)
    // CustomEvent fanges av TemaSync i layout — øyeblikkelig visuelt bytte uten full re-render
    window.dispatchEvent(new CustomEvent(TEMA_EVENT, { detail: v }))
    // Skriv cookie server-side for persistens på tvers av enheter/nettlesere
    // MÅ awaites inne i transitionen. Som løs promise avsluttes transitionen
    // med én gang, isPending faller tilbake til false før serveren har svart,
    // og React tegner på nytt med den GAMLE verdien — bryteren ser død ut selv
    // om skrivingen gikk fint. Reidar traff dette på reisemodus-bryteren og
    // trykket flere ganger (#742); den skrev hver gang.
    // Tema feiler bevisst åpent — valget er allerede lagt i localStorage av
    // kallstedet, så en feilet serverskriving betyr kun at det ikke følger med
    // til neste enhet. Men den skal logges, ikke svelges i en tom lambda
    // (CLAUDE.md § Policy: Side-effekter ved sidelast).
    startTransition(async () => {
      try {
        await oppdaterTema(v)
      } catch (err) {
        meldKlientfeil('tema.lagre.feilet', err)
      }
    })
  }

  return (
    <section style={{ marginBottom: 20 }}>
      <SectionLabel>Utseende</SectionLabel>
      <Segment
        value={valg}
        onChange={velg}
        options={temaAlternativer}
      />
    </section>
  )
}
