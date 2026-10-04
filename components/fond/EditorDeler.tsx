'use client'

// Små deler de fire fond-editorene deler. Resten bygges med Skjema.tsx — se
// «Policy: Skjemaer» i CLAUDE.md. Skjemaene er vanlige <form action>, så
// ValgRad/DatoRad holder verdien i state men har `name` på det native feltet,
// og FormData får dem med som før.

import { useState, type ReactNode } from 'react'
import Button from '@/components/ui/Button'
import { SkjemaRad, ValgFelt, DatoFelt } from '@/components/ui/Skjema'
import { ListeRad } from '@/components/MalAdminDeler'

export function ValgRad({
  etikett,
  name,
  defaultValue = '',
  valg,
  plassholder,
  required,
}: {
  etikett: string
  name: string
  defaultValue?: string
  valg: { verdi: string; etikett: string }[]
  plassholder?: string
  required?: boolean
}) {
  const [verdi, setVerdi] = useState(defaultValue)
  return (
    <SkjemaRad etikett={etikett}>
      <ValgFelt
        name={name}
        value={verdi}
        valg={valg}
        plassholder={plassholder}
        required={required}
        onChange={e => setVerdi(e.target.value)}
      />
    </SkjemaRad>
  )
}

export function DatoRad({
  etikett,
  name,
  defaultValue = '',
  required,
}: {
  etikett: string
  name: string
  defaultValue?: string
  required?: boolean
}) {
  const [verdi, setVerdi] = useState(defaultValue)
  return (
    <SkjemaRad etikett={etikett}>
      <DatoFelt name={name} value={verdi} required={required} onChange={e => setVerdi(e.target.value)} />
    </SkjemaRad>
  )
}

/** Siste rad i et skjema: send inn (og eventuelt avbryt). */
export function SendRad({
  tekst,
  onAvbryt,
}: {
  tekst: ReactNode
  onAvbryt?: () => void
}) {
  return (
    <ListeRad>
      {onAvbryt && (
        <Button type="button" variant="secondary" onClick={onAvbryt}>
          Avbryt
        </Button>
      )}
      <Button type="submit" variant="primary">
        {tekst}
      </Button>
    </ListeRad>
  )
}
