'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { opprettInnskudd, oppdaterInnskudd, slettInnskudd } from '@/lib/actions/fond'
import { formaterDato } from '@/lib/dato'

type Innskudd = {
  id: string
  profil_id: string
  belop: number
  dato: string
}

type Profil = {
  id: string
  navn: string
}

type Props = {
  innskudd: Innskudd[]
  profiler: Profil[]
}

export default function InnskuddEditor({ innskudd, profiler }: Props) {
  const [feil, setFeil] = useState<string | null>(null)
  const [redigerer, setRedigerer] = useState<string | null>(null)

  async function handleOpprett(formData: FormData) {
    setFeil(null)
    try {
      await opprettInnskudd({
        profil_id: formData.get('profil_id') as string,
        belop: parseFloat(formData.get('belop') as string),
        dato: formData.get('dato') as string,
      })
    } catch (e) {
      setFeil(e instanceof Error ? e.message : 'Ukjent feil')
    }
  }

  async function handleOppdater(id: string, formData: FormData) {
    setFeil(null)
    try {
      await oppdaterInnskudd({
        id,
        profil_id: formData.get('profil_id') as string,
        belop: parseFloat(formData.get('belop') as string),
        dato: formData.get('dato') as string,
      })
      setRedigerer(null)
    } catch (e) {
      setFeil(e instanceof Error ? e.message : 'Ukjent feil')
    }
  }

  async function handleSlett(id: string) {
    if (!confirm('Slett innskudd?')) return
    setFeil(null)
    try {
      await slettInnskudd(id)
    } catch (e) {
      setFeil(e instanceof Error ? e.message : 'Ukjent feil')
    }
  }

  function ProfilVelger({ defaultValue }: { defaultValue?: string }) {
    return (
      <div>
        <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>Innskyter</label>
        <select
          name="profil_id"
          defaultValue={defaultValue}
          required
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: 10,
            background: 'var(--bg-elevated-2)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            fontFamily: 'inherit',
            fontSize: 15,
          }}
        >
          <option value="">Velg medlem …</option>
          {profiler.map(p => (
            <option key={p.id} value={p.id}>{p.navn}</option>
          ))}
        </select>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {feil && (
        <div style={{ color: 'var(--danger)', fontSize: 13, fontFamily: 'var(--font-body)' }}>{feil}</div>
      )}

      {innskudd.map(inn =>
        redigerer === inn.id ? (
          <form
            key={inn.id}
            action={fd => handleOppdater(inn.id, fd)}
            style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, background: 'var(--bg-elevated-2)', borderRadius: 10 }}
          >
            <ProfilVelger defaultValue={inn.profil_id} />
            <Input name="belop" label="Beløp (kr)" type="number" min={0} step={0.01} defaultValue={inn.belop} required />
            <Input name="dato" label="Dato" type="date" defaultValue={inn.dato} required />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button type="submit" variant="primary">Lagre</Button>
              <Button type="button" variant="secondary" onClick={() => setRedigerer(null)}>Avbryt</Button>
            </div>
          </form>
        ) : (
          <div
            key={inn.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 14px',
              background: 'var(--bg-elevated)',
              borderRadius: 10,
              border: '1px solid var(--border)',
            }}
          >
            <div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-primary)' }}>
                {profiler.find(p => p.id === inn.profil_id)?.navn ?? inn.profil_id}
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-tertiary)' }}>
                {inn.belop.toLocaleString('nb')} kr · {formaterDato(inn.dato, 'd. MMM yyyy')}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Button variant="secondary" onClick={() => setRedigerer(inn.id)}>Rediger</Button>
              <Button variant="danger" onClick={() => handleSlett(inn.id)}>Slett</Button>
            </div>
          </div>
        )
      )}

      {/* Legg til nytt innskudd */}
      <form
        action={handleOpprett}
        style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, background: 'var(--bg-elevated-2)', borderRadius: 10, border: '1px dashed var(--border)' }}
      >
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
          Legg til innskudd
        </div>
        <ProfilVelger />
        <Input name="belop" label="Beløp (kr)" type="number" min={0} step={0.01} defaultValue={0} required />
        <Input name="dato" label="Dato" type="date" required />
        <Button type="submit" variant="primary">Legg til</Button>
      </form>
    </div>
  )
}
