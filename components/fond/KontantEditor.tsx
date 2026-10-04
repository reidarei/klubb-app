'use client'

import { useState } from 'react'
import { SkjemaGruppe, SkjemaRad, RadInput } from '@/components/ui/Skjema'
import { SendRad } from '@/components/fond/EditorDeler'
import { oppdaterKontantSaldo } from '@/lib/actions/fond'

type Props = {
  saldo: number
}

export default function KontantEditor({ saldo }: Props) {
  const [feil, setFeil] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  async function handleOppdater(formData: FormData) {
    setFeil(null)
    setOk(false)
    try {
      await oppdaterKontantSaldo(parseFloat(formData.get('saldo') as string))
      setOk(true)
    } catch (e) {
      setFeil(e instanceof Error ? e.message : 'Ukjent feil')
    }
  }

  return (
    <SkjemaGruppe
      feil={feil}
      hjelp={ok ? <span style={{ color: 'var(--success)' }}>Saldo oppdatert</span> : undefined}
    >
      <form className="panel-liste" action={handleOppdater}>
        <SkjemaRad etikett="Saldo på konto (kr)">
          <RadInput name="saldo" type="number" min={0} step={0.01} defaultValue={saldo} required />
        </SkjemaRad>
        <SendRad tekst="Oppdater saldo" />
      </form>
    </SkjemaGruppe>
  )
}
