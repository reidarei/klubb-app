'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import { SkjemaGruppe, SkjemaRad, RadInput } from '@/components/ui/Skjema'
import { ListeRad } from '@/components/MalAdminDeler'
import { ValgRad, DatoRad, SendRad } from '@/components/fond/EditorDeler'
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
  const [feilListe, setFeilListe] = useState<string | null>(null)
  const [feilNy, setFeilNy] = useState<string | null>(null)
  const [redigerer, setRedigerer] = useState<string | null>(null)
  // Økes etter vellykket «Legg til»: remonterer skjemaet så ValgRad/DatoRad (state) nullstilles som før.
  const [nyNokkel, setNyNokkel] = useState(0)

  const profilValg = profiler.map(p => ({ verdi: p.id, etikett: p.navn }))

  async function handleOpprett(formData: FormData) {
    setFeilNy(null)
    try {
      await opprettInnskudd({
        profil_id: formData.get('profil_id') as string,
        belop: parseFloat(formData.get('belop') as string),
        dato: formData.get('dato') as string,
      })
      setNyNokkel(n => n + 1)
    } catch (e) {
      setFeilNy(e instanceof Error ? e.message : 'Ukjent feil')
    }
  }

  async function handleOppdater(id: string, formData: FormData) {
    setFeilListe(null)
    try {
      await oppdaterInnskudd({
        id,
        profil_id: formData.get('profil_id') as string,
        belop: parseFloat(formData.get('belop') as string),
        dato: formData.get('dato') as string,
      })
      setRedigerer(null)
    } catch (e) {
      setFeilListe(e instanceof Error ? e.message : 'Ukjent feil')
    }
  }

  async function handleSlett(id: string) {
    if (!confirm('Slett innskudd?')) return
    setFeilListe(null)
    try {
      await slettInnskudd(id)
    } catch (e) {
      setFeilListe(e instanceof Error ? e.message : 'Ukjent feil')
    }
  }

  return (
    <div>
      {innskudd.length > 0 && (
        <SkjemaGruppe feil={feilListe}>
          {innskudd.map(inn =>
            redigerer === inn.id ? (
              // panel-liste på skjemaet: skillelinjene mellom radene gjelder bare direkte barn av gruppen.
              <form key={inn.id} className="panel-liste" action={fd => handleOppdater(inn.id, fd)}>
                <ValgRad etikett="Innskyter" name="profil_id" defaultValue={inn.profil_id} valg={profilValg} plassholder="Velg medlem …" required />
                <SkjemaRad etikett="Beløp (kr)">
                  <RadInput name="belop" type="number" min={0} step={0.01} defaultValue={inn.belop} required />
                </SkjemaRad>
                <DatoRad etikett="Dato" name="dato" defaultValue={inn.dato} required />
                <SendRad tekst="Lagre" onAvbryt={() => setRedigerer(null)} />
              </form>
            ) : (
              <ListeRad
                key={inn.id}
                venstre={
                  <div style={{ padding: '8px 0' }}>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-primary)' }}>
                      {profiler.find(p => p.id === inn.profil_id)?.navn ?? inn.profil_id}
                    </div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-tertiary)' }}>
                      {inn.belop.toLocaleString('nb')} kr · {formaterDato(inn.dato, 'd. MMM yyyy')}
                    </div>
                  </div>
                }
              >
                <Button variant="secondary" onClick={() => setRedigerer(inn.id)}>Rediger</Button>
                <Button variant="danger" onClick={() => handleSlett(inn.id)}>Slett</Button>
              </ListeRad>
            ),
          )}
        </SkjemaGruppe>
      )}

      <SkjemaGruppe tittel="Legg til innskudd" feil={feilNy}>
        <form key={nyNokkel} className="panel-liste" action={handleOpprett}>
          <ValgRad etikett="Innskyter" name="profil_id" valg={profilValg} plassholder="Velg medlem …" required />
          <SkjemaRad etikett="Beløp (kr)">
            <RadInput name="belop" type="number" min={0} step={0.01} defaultValue={0} required />
          </SkjemaRad>
          <DatoRad etikett="Dato" name="dato" required />
          <SendRad tekst="Legg til" />
        </form>
      </SkjemaGruppe>
    </div>
  )
}
