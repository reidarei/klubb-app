'use client'

import { useState, useTransition } from 'react'
import ArrangementTidslinje from '@/components/ArrangementTidslinje'
import { norskDatoNaa } from '@/lib/dato'
import type { Json } from '@/lib/supabase/database.types'

type ProfilMedBursdag = {
  id: string
  visningsnavn: string | null
  fodselsdato: string | null
}

type Paamelding = { profil_id: string; status: string; profiles?: { visningsnavn: string | null } | null }

type Arrangement = {
  id: string
  type: string
  tittel: string
  beskrivelse: string | null
  start_tidspunkt: string
  slutt_tidspunkt: string | null
  oppmoetested: string | null
  destinasjon: string | null
  pris_per_person: number | null
  sensurerte_felt: Json
  opprettet_av: string | null
  bilde_url?: string | null
  paameldinger: Paamelding[]
}

type IkkePlanlagt = {
  id: string
  arrangementNavn: string
  ansvarlige: string[]
  estimertDato: string
}

const MAKS_FREM = 48

function beregnBursdager(profiler: ProfilMedBursdag[], frem: number) {
  const now = norskDatoNaa()
  const toMndSiden = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate())
  const fremTid = new Date(now.getFullYear(), now.getMonth() + frem, now.getDate())

  return profiler.flatMap(p => {
    if (!p.fodselsdato) return []
    const [fodselsaar, mnd, dag] = p.fodselsdato.split('-').map(Number)
    const items: { id: string; profilId: string; visningsnavn: string; dato: string; alder: number }[] = []
    const aarRange = Math.ceil(frem / 12) + 2
    for (let i = -1; i <= aarRange; i++) {
      const yr = now.getFullYear() + i
      const bdag = new Date(yr, mnd - 1, dag)
      if (bdag >= toMndSiden && bdag <= fremTid) {
        items.push({
          id: `bursdag-${p.id}-${yr}`,
          profilId: p.id,
          visningsnavn: p.visningsnavn ?? '',
          dato: `${yr}-${String(mnd).padStart(2, '0')}-${String(dag).padStart(2, '0')}`,
          alder: yr - fodselsaar,
        })
      }
    }
    return items
  })
}

export default function TidslinjeWrapper({
  arrangementer,
  profilerMedBursdag,
  innloggetBrukerId,
  ikkePlanlagt = [],
}: {
  arrangementer: Arrangement[]
  profilerMedBursdag: ProfilMedBursdag[]
  innloggetBrukerId: string
  ikkePlanlagt?: IkkePlanlagt[]
}) {
  const [frem, setFrem] = useState(12)
  const [pending, startTransition] = useTransition()
  const bursdager = beregnBursdager(profilerMedBursdag, frem)

  const lastMerKnapp = frem < MAKS_FREM ? (
    <div className="text-center">
      <button
        onClick={() => startTransition(() => setFrem(f => f + 12))}
        disabled={pending}
        className="text-sm font-semibold px-5 py-2.5 rounded-xl"
        style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
      >
        Last mer
      </button>
    </div>
  ) : undefined

  return (
    <ArrangementTidslinje
      arrangementer={arrangementer}
      innloggetBrukerId={innloggetBrukerId}
      bursdager={bursdager}
      ikkePlanlagt={ikkePlanlagt}
      lastMerKnapp={lastMerKnapp}
    />
  )
}
