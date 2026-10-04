'use client'

import { useState, type ReactNode } from 'react'
import PassInfoSkjema from './PassInfoSkjema'
import { formaterDato } from '@/lib/dato'
import { SkjemaGruppe } from '@/components/ui/Skjema'
import { ProfilRad } from '@/components/profil/ProfilRad'

type Props = {
  nummer: string | null
  utloper: string | null // YYYY-MM-DD
}

function sladdet(nummer: string): string {
  const siste4 = nummer.slice(-4)
  return '••••• ' + siste4
}

const VERDI = {
  fontFamily: 'var(--font-mono)',
  fontSize: 14,
  color: 'var(--text-primary)',
  letterSpacing: '0.5px',
  whiteSpace: 'nowrap',
} as const

// Hele raden er knappen — 48 px høy, så treffflaten er god uten utvidelse (#700).
function KnappRad({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        minHeight: 48,
        padding: '0 14px',
        background: 'transparent',
        border: 'none',
        textAlign: 'left',
        fontFamily: 'var(--font-body)',
        fontSize: 15,
        fontWeight: 500,
        color: 'var(--accent)',
      }}
    >
      {children}
    </button>
  )
}

/**
 * Pass-info på profilsiden, som boks med rader. Tom: oppfordring + vilkår
 * under boksen; fylt: sladdet nummer og utløp som rader.
 * Kun eier ser dette (RLS i DB håndhever).
 */
export default function PassInfoKort({ nummer, utloper }: Props) {
  const [redigerer, setRedigerer] = useState(false)
  const harData = nummer && utloper

  if (redigerer) {
    return (
      <PassInfoSkjema
        initialNummer={nummer ?? ''}
        initialUtloper={utloper ?? ''}
        onAvbryt={() => setRedigerer(false)}
      />
    )
  }

  if (!harData) {
    return (
      <SkjemaGruppe
        tittel="Pass"
        hjelp={
          <>
            Lagre passnummer og utløpsdato slik at reiseansvarlig kan booke tur for deg uten å mase.
            Kun du ser dataen som default. Bare arrangøren av en tur du har meldt deg på (Ja) kan be
            om tilgang, generalsekretæren må godkjenne forespørselen, og godkjent tilgang varer i 24
            timer.
          </>
        }
      >
        <KnappRad onClick={() => setRedigerer(true)}>Fyll ut pass-info</KnappRad>
      </SkjemaGruppe>
    )
  }

  return (
    <SkjemaGruppe
      tittel="Pass"
      hjelp="Kun synlig for deg. Arrangør av kommende tur du er meldt på (Ja) kan be om 24-timers tilgang via generalsekretæren."
    >
      <ProfilRad etikett="Passnummer">
        <span style={VERDI}>{sladdet(nummer!)}</span>
      </ProfilRad>
      <ProfilRad etikett="Gyldig til">
        <span style={VERDI}>{formaterDato(`${utloper}T12:00:00Z`, 'd. MMM yyyy')}</span>
      </ProfilRad>
      <KnappRad onClick={() => setRedigerer(true)}>Endre pass-info</KnappRad>
    </SkjemaGruppe>
  )
}
