'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import { SkjemaGruppe, SkjemaRad, RadInput } from '@/components/ui/Skjema'
import { ListeRad } from '@/components/MalAdminDeler'
import { ValgRad, SendRad } from '@/components/fond/EditorDeler'
import { opprettVerdipapir, oppdaterVerdipapir, slettVerdipapir } from '@/lib/actions/fond'

type Verdipapir = {
  id: string
  navn: string
  type: string
  verdi: number
  anskaffelsesverdi: number
  utbytte_i_aar: number
}

type Props = {
  verdipapirer: Verdipapir[]
}

const TYPER = [
  { verdi: 'fond', etikett: 'Fond' },
  { verdi: 'aksje', etikett: 'Aksje' },
]

// Feltene er uncontrolled (defaultValue + name) og leses fra FormData ved innsending.
function Felter({ v }: { v?: Verdipapir }) {
  return (
    <>
      <SkjemaRad etikett="Navn">
        <RadInput name="navn" defaultValue={v?.navn} placeholder={v ? undefined : 'F.eks. DNB Global Indeks'} required />
      </SkjemaRad>
      <ValgRad etikett="Type" name="type" defaultValue={v?.type ?? 'fond'} valg={TYPER} />
      <SkjemaRad etikett="Verdi (kr)">
        <RadInput name="verdi" type="number" min={0} step={0.01} defaultValue={v?.verdi ?? 0} required />
      </SkjemaRad>
      <SkjemaRad etikett="Anskaffelsesverdi (kr)">
        <RadInput name="anskaffelsesverdi" type="number" min={0} step={0.01} defaultValue={v?.anskaffelsesverdi ?? 0} required />
      </SkjemaRad>
      <SkjemaRad etikett="Utbytte i år (kr)">
        <RadInput name="utbytte_i_aar" type="number" min={0} step={0.01} defaultValue={v?.utbytte_i_aar ?? 0} required />
      </SkjemaRad>
    </>
  )
}

export default function VerdipapirEditor({ verdipapirer }: Props) {
  const [feilListe, setFeilListe] = useState<string | null>(null)
  const [feilNy, setFeilNy] = useState<string | null>(null)
  const [redigerer, setRedigerer] = useState<string | null>(null)
  // Økes etter vellykket «Legg til»: remonterer skjemaet så ValgRad/DatoRad (state) nullstilles som før.
  const [nyNokkel, setNyNokkel] = useState(0)

  async function handleOpprett(formData: FormData) {
    setFeilNy(null)
    try {
      await opprettVerdipapir({
        navn: formData.get('navn') as string,
        type: formData.get('type') as 'aksje' | 'fond',
        verdi: parseFloat(formData.get('verdi') as string),
        anskaffelsesverdi: parseFloat(formData.get('anskaffelsesverdi') as string),
        utbytte_i_aar: parseFloat(formData.get('utbytte_i_aar') as string),
      })
      setNyNokkel(n => n + 1)
    } catch (e) {
      setFeilNy(e instanceof Error ? e.message : 'Ukjent feil')
    }
  }

  async function handleOppdater(id: string, formData: FormData) {
    setFeilListe(null)
    try {
      await oppdaterVerdipapir({
        id,
        navn: formData.get('navn') as string,
        type: formData.get('type') as 'aksje' | 'fond',
        verdi: parseFloat(formData.get('verdi') as string),
        anskaffelsesverdi: parseFloat(formData.get('anskaffelsesverdi') as string),
        utbytte_i_aar: parseFloat(formData.get('utbytte_i_aar') as string),
      })
      setRedigerer(null)
    } catch (e) {
      setFeilListe(e instanceof Error ? e.message : 'Ukjent feil')
    }
  }

  async function handleSlett(id: string) {
    if (!confirm('Slett verdipapir?')) return
    setFeilListe(null)
    try {
      await slettVerdipapir(id)
    } catch (e) {
      setFeilListe(e instanceof Error ? e.message : 'Ukjent feil')
    }
  }

  return (
    <div>
      {verdipapirer.length > 0 && (
        <SkjemaGruppe feil={feilListe}>
          {verdipapirer.map(v =>
            redigerer === v.id ? (
              // panel-liste på skjemaet: skillelinjene mellom radene gjelder bare direkte barn av gruppen.
              <form key={v.id} className="panel-liste" action={fd => handleOppdater(v.id, fd)}>
                <Felter v={v} />
                <SendRad tekst="Lagre" onAvbryt={() => setRedigerer(null)} />
              </form>
            ) : (
              <ListeRad
                key={v.id}
                venstre={
                  <div style={{ padding: '8px 0' }}>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-primary)' }}>
                      {v.navn} <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>({v.type})</span>
                    </div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-tertiary)' }}>
                      Verdi {v.verdi.toLocaleString('nb')} kr · Anskaffet {v.anskaffelsesverdi.toLocaleString('nb')} kr
                    </div>
                  </div>
                }
              >
                <Button variant="secondary" onClick={() => setRedigerer(v.id)}>Rediger</Button>
                <Button variant="danger" onClick={() => handleSlett(v.id)}>Slett</Button>
              </ListeRad>
            ),
          )}
        </SkjemaGruppe>
      )}

      <SkjemaGruppe tittel="Legg til verdipapir" feil={feilNy}>
        <form key={nyNokkel} className="panel-liste" action={handleOpprett}>
          <Felter />
          <SendRad tekst="Legg til" />
        </form>
      </SkjemaGruppe>
    </div>
  )
}
