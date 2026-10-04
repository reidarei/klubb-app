'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import { SkjemaGruppe, SkjemaRad, RadInput } from '@/components/ui/Skjema'
import { ListeRad } from '@/components/MalAdminDeler'
import { SendRad } from '@/components/fond/EditorDeler'
import { opprettEiendom, oppdaterEiendom, slettEiendom } from '@/lib/actions/fond'

type Eiendom = {
  id: string
  navn: string
  markedsverdi: number
  anskaffelsesverdi: number
  husleie_i_aar: number
  driftskostnader_i_aar: number
}

type Props = {
  eiendommer: Eiendom[]
}

// Feltene er uncontrolled (defaultValue + name) og leses fra FormData ved innsending.
function Felter({ e }: { e?: Eiendom }) {
  return (
    <>
      <SkjemaRad etikett="Navn">
        <RadInput name="navn" defaultValue={e?.navn} placeholder={e ? undefined : 'F.eks. Skogshytta, Ljørdalen'} required />
      </SkjemaRad>
      <SkjemaRad etikett="Markedsverdi (kr)">
        <RadInput name="markedsverdi" type="number" min={0} step={0.01} defaultValue={e?.markedsverdi ?? 0} required />
      </SkjemaRad>
      <SkjemaRad etikett="Anskaffelsesverdi (kr)">
        <RadInput name="anskaffelsesverdi" type="number" min={0} step={0.01} defaultValue={e?.anskaffelsesverdi ?? 0} required />
      </SkjemaRad>
      <SkjemaRad etikett="Husleie i år (kr)">
        <RadInput name="husleie_i_aar" type="number" min={0} step={0.01} defaultValue={e?.husleie_i_aar ?? 0} required />
      </SkjemaRad>
      {/* Positivt tall — trekkes fra i visningen. Se check-constraint i migrasjon 129. */}
      <SkjemaRad etikett="Driftskostnader i år (kr)">
        <RadInput name="driftskostnader_i_aar" type="number" min={0} step={0.01} defaultValue={e?.driftskostnader_i_aar ?? 0} required />
      </SkjemaRad>
    </>
  )
}

function lesFelter(formData: FormData) {
  return {
    navn: formData.get('navn') as string,
    markedsverdi: parseFloat(formData.get('markedsverdi') as string),
    anskaffelsesverdi: parseFloat(formData.get('anskaffelsesverdi') as string),
    husleie_i_aar: parseFloat(formData.get('husleie_i_aar') as string),
    driftskostnader_i_aar: parseFloat(formData.get('driftskostnader_i_aar') as string),
  }
}

export default function EiendomEditor({ eiendommer }: Props) {
  const [feilListe, setFeilListe] = useState<string | null>(null)
  const [feilNy, setFeilNy] = useState<string | null>(null)
  const [redigerer, setRedigerer] = useState<string | null>(null)

  async function handleOpprett(formData: FormData) {
    setFeilNy(null)
    try {
      await opprettEiendom(lesFelter(formData))
    } catch (e) {
      setFeilNy(e instanceof Error ? e.message : 'Ukjent feil')
    }
  }

  async function handleOppdater(id: string, formData: FormData) {
    setFeilListe(null)
    try {
      await oppdaterEiendom({ id, ...lesFelter(formData) })
      setRedigerer(null)
    } catch (e) {
      setFeilListe(e instanceof Error ? e.message : 'Ukjent feil')
    }
  }

  async function handleSlett(id: string) {
    if (!confirm('Slett eiendommen?')) return
    setFeilListe(null)
    try {
      await slettEiendom(id)
    } catch (e) {
      setFeilListe(e instanceof Error ? e.message : 'Ukjent feil')
    }
  }

  return (
    <div>
      {eiendommer.length > 0 && (
        <SkjemaGruppe feil={feilListe}>
          {eiendommer.map(e =>
            redigerer === e.id ? (
              // panel-liste på skjemaet: skillelinjene mellom radene gjelder bare direkte barn av gruppen.
              <form key={e.id} className="panel-liste" action={fd => handleOppdater(e.id, fd)}>
                <Felter e={e} />
                <SendRad tekst="Lagre" onAvbryt={() => setRedigerer(null)} />
              </form>
            ) : (
              <ListeRad
                key={e.id}
                venstre={
                  <div style={{ padding: '8px 0' }}>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-primary)' }}>{e.navn}</div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-tertiary)' }}>
                      Markedsverdi {e.markedsverdi.toLocaleString('nb')} kr · Anskaffet {e.anskaffelsesverdi.toLocaleString('nb')} kr
                    </div>
                  </div>
                }
              >
                <Button variant="secondary" onClick={() => setRedigerer(e.id)}>Rediger</Button>
                <Button variant="danger" onClick={() => handleSlett(e.id)}>Slett</Button>
              </ListeRad>
            ),
          )}
        </SkjemaGruppe>
      )}

      <SkjemaGruppe tittel="Legg til eiendom" feil={feilNy}>
        <form className="panel-liste" action={handleOpprett}>
          <Felter />
          <SendRad tekst="Legg til" />
        </form>
      </SkjemaGruppe>
    </div>
  )
}
