'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
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
    <form
      action={handleOppdater}
      style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      {feil && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{feil}</div>}
      {ok && <div style={{ color: 'var(--success)', fontSize: 13 }}>Saldo oppdatert</div>}
      <Input
        name="saldo"
        label="Saldo på konto (kr)"
        type="number"
        min={0}
        step={0.01}
        defaultValue={saldo}
        required
      />
      <Button type="submit" variant="primary">Oppdater saldo</Button>
    </form>
  )
}
