'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { opprettVerdipapir, oppdaterVerdipapir, slettVerdipapir } from '@/lib/actions/fond'

type Verdipapir = {
  id: string
  navn: string
  type: string
  verdi: number
  anskaffelsesverdi: number
}

type Props = {
  verdipapirer: Verdipapir[]
}

export default function VerdipapirEditor({ verdipapirer }: Props) {
  const [feil, setFeil] = useState<string | null>(null)
  const [redigerer, setRedigerer] = useState<string | null>(null)

  async function handleOpprett(formData: FormData) {
    setFeil(null)
    try {
      await opprettVerdipapir({
        navn: formData.get('navn') as string,
        type: formData.get('type') as 'aksje' | 'fond',
        verdi: parseInt(formData.get('verdi') as string, 10),
        anskaffelsesverdi: parseInt(formData.get('anskaffelsesverdi') as string, 10),
      })
    } catch (e) {
      setFeil(e instanceof Error ? e.message : 'Ukjent feil')
    }
  }

  async function handleOppdater(id: string, formData: FormData) {
    setFeil(null)
    try {
      await oppdaterVerdipapir({
        id,
        navn: formData.get('navn') as string,
        type: formData.get('type') as 'aksje' | 'fond',
        verdi: parseInt(formData.get('verdi') as string, 10),
        anskaffelsesverdi: parseInt(formData.get('anskaffelsesverdi') as string, 10),
      })
      setRedigerer(null)
    } catch (e) {
      setFeil(e instanceof Error ? e.message : 'Ukjent feil')
    }
  }

  async function handleSlett(id: string) {
    if (!confirm('Slett verdipapir?')) return
    setFeil(null)
    try {
      await slettVerdipapir(id)
    } catch (e) {
      setFeil(e instanceof Error ? e.message : 'Ukjent feil')
    }
  }

  // Felles skjema-innhold for opprett og rediger
  function TypeVelger({ defaultValue = 'fond' }: { defaultValue?: string }) {
    return (
      <div>
        <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>Type</label>
        <select
          name="type"
          defaultValue={defaultValue}
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
          <option value="fond">Fond</option>
          <option value="aksje">Aksje</option>
        </select>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {feil && (
        <div style={{ color: 'var(--danger)', fontSize: 13, fontFamily: 'var(--font-body)' }}>{feil}</div>
      )}

      {verdipapirer.map(v =>
        redigerer === v.id ? (
          <form
            key={v.id}
            action={fd => handleOppdater(v.id, fd)}
            style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, background: 'var(--bg-elevated-2)', borderRadius: 10 }}
          >
            <Input name="navn" label="Navn" defaultValue={v.navn} required />
            <TypeVelger defaultValue={v.type} />
            <Input name="verdi" label="Verdi (kr)" type="number" min={0} defaultValue={v.verdi} required />
            <Input name="anskaffelsesverdi" label="Anskaffelsesverdi (kr)" type="number" min={0} defaultValue={v.anskaffelsesverdi} required />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button type="submit" variant="primary">Lagre</Button>
              <Button type="button" variant="secondary" onClick={() => setRedigerer(null)}>Avbryt</Button>
            </div>
          </form>
        ) : (
          <div
            key={v.id}
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
                {v.navn} <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>({v.type})</span>
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-tertiary)' }}>
                Verdi {v.verdi.toLocaleString('nb')} kr · Anskaffet {v.anskaffelsesverdi.toLocaleString('nb')} kr
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Button variant="secondary" onClick={() => setRedigerer(v.id)}>Rediger</Button>
              <Button variant="danger" onClick={() => handleSlett(v.id)}>Slett</Button>
            </div>
          </div>
        )
      )}

      {/* Legg til nytt verdipapir */}
      <form
        action={handleOpprett}
        style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, background: 'var(--bg-elevated-2)', borderRadius: 10, border: '1px dashed var(--border)' }}
      >
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
          Legg til verdipapir
        </div>
        <Input name="navn" label="Navn" placeholder="F.eks. DNB Global Indeks" required />
        <TypeVelger />
        <Input name="verdi" label="Verdi (kr)" type="number" min={0} defaultValue={0} required />
        <Input name="anskaffelsesverdi" label="Anskaffelsesverdi (kr)" type="number" min={0} defaultValue={0} required />
        <Button type="submit" variant="primary">Legg til</Button>
      </form>
    </div>
  )
}
