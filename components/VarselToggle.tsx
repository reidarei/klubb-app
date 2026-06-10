'use client'

import { useTransition } from 'react'
import { oppdaterVarselInnstilling } from '@/app/(app)/innstillinger/actions'
import { ToggleRad } from '@/components/ui/ToggleSwitch'

export default function VarselToggle({
  noekkel,
  aktiv,
  beskrivelse,
  last,
}: {
  noekkel: string
  aktiv: boolean
  beskrivelse: string
  last?: boolean
}) {
  const [isPending, startTransition] = useTransition()

  function toggle() {
    startTransition(() => oppdaterVarselInnstilling(noekkel, !aktiv))
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 4px',
        borderBottom: last ? 'none' : '0.5px solid var(--border-subtle)',
      }}
    >
      <div
        style={{
          flex: 1,
          minWidth: 0,
          fontFamily: 'var(--font-body)',
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--text-primary)',
          lineHeight: 1.3,
        }}
      >
        {beskrivelse}
      </div>
      <ToggleRad
        on={aktiv}
        onChange={toggle}
        disabled={isPending}
        ariaLabel={aktiv ? `Slå av ${beskrivelse}` : `Slå på ${beskrivelse}`}
      />
    </div>
  )
}
