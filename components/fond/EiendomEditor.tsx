'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { opprettEiendom, oppdaterEiendom, slettEiendom } from '@/lib/actions/fond'

type Eiendom = {
  id: string
  navn: string
  markedsverdi: number
  anskaffelsesverdi: number
}

type Props = {
  eiendommer: Eiendom[]
}

export default function EiendomEditor({ eiendommer }: Props) {
  const [feil, setFeil] = useState<string | null>(null)
  const [redigerer, setRedigerer] = useState<string | null>(null)

  async function handleOpprett(formData: FormData) {
    setFeil(null)
    try {
      await opprettEiendom({
        navn: formData.get('navn') as string,
        markedsverdi: parseInt(formData.get('markedsverdi') as string, 10),
        anskaffelsesverdi: parseInt(formData.get('anskaffelsesverdi') as string, 10),
      })
    } catch (e) {
      setFeil(e instanceof Error ? e.message : 'Ukjent feil')
    }
  }

  async function handleOppdater(id: string, formData: FormData) {
    setFeil(null)
    try {
      await oppdaterEiendom({
        id,
        navn: formData.get('navn') as string,
        markedsverdi: parseInt(formData.get('markedsverdi') as string, 10),
        anskaffelsesverdi: parseInt(formData.get('anskaffelsesverdi') as string, 10),
      })
      setRedigerer(null)
    } catch (e) {
      setFeil(e instanceof Error ? e.message : 'Ukjent feil')
    }
  }

  async function handleSlett(id: string) {
    if (!confirm('Slett eiendommen?')) return
    setFeil(null)
    try {
      await slettEiendom(id)
    } catch (e) {
      setFeil(e instanceof Error ? e.message : 'Ukjent feil')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {feil && (
        <div style={{ color: 'var(--danger)', fontSize: 13, fontFamily: 'var(--font-body)' }}>{feil}</div>
      )}

      {/* Eksisterende eiendommer */}
      {eiendommer.map(e =>
        redigerer === e.id ? (
          <form
            key={e.id}
            action={fd => handleOppdater(e.id, fd)}
            style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, background: 'var(--bg-elevated-2)', borderRadius: 10 }}
          >
            <Input name="navn" label="Navn" defaultValue={e.navn} required />
            <Input name="markedsverdi" label="Markedsverdi (kr)" type="number" min={0} defaultValue={e.markedsverdi} required />
            <Input name="anskaffelsesverdi" label="Anskaffelsesverdi (kr)" type="number" min={0} defaultValue={e.anskaffelsesverdi} required />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button type="submit" variant="primary">Lagre</Button>
              <Button type="button" variant="secondary" onClick={() => setRedigerer(null)}>Avbryt</Button>
            </div>
          </form>
        ) : (
          <div
            key={e.id}
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
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-primary)' }}>{e.navn}</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-tertiary)' }}>
                Markedsverdi {e.markedsverdi.toLocaleString('nb')} kr · Anskaffet {e.anskaffelsesverdi.toLocaleString('nb')} kr
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Button variant="secondary" onClick={() => setRedigerer(e.id)}>Rediger</Button>
              <Button variant="danger" onClick={() => handleSlett(e.id)}>Slett</Button>
            </div>
          </div>
        )
      )}

      {/* Legg til ny eiendom */}
      <form
        action={handleOpprett}
        style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, background: 'var(--bg-elevated-2)', borderRadius: 10, border: '1px dashed var(--border)' }}
      >
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
          Legg til eiendom
        </div>
        <Input name="navn" label="Navn" placeholder="F.eks. Skogshytta, Ljørdalen" required />
        <Input name="markedsverdi" label="Markedsverdi (kr)" type="number" min={0} defaultValue={0} required />
        <Input name="anskaffelsesverdi" label="Anskaffelsesverdi (kr)" type="number" min={0} defaultValue={0} required />
        <Button type="submit" variant="primary">Legg til</Button>
      </form>
    </div>
  )
}
