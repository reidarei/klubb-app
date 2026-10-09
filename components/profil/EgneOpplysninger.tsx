import type { ReactNode } from 'react'
import { SkjemaGruppe } from '@/components/ui/Skjema'
import OpplysningRad, { opplysningVerdiStil } from '@/components/profil/OpplysningRad'
import { formaterDato } from '@/lib/dato'

type Props = {
  navn: string
  visningsnavn: string | null
  fodselsdato: string | null
  telefon: string | null
  epost: string
  matallergier: string | null
  stikkord: string | null
  /** Ekstra rader nederst i boksen (f.eks. «Rediger profil»-lenka). */
  children?: ReactNode
}

/**
 * Egne opplysninger på /profil (#683). Label og verdi på SAMME linje (~36 px)
 * i stedet for label-over-verdi som `FaktaRad` (~50 px), så resten av siden
 * ikke skyves under folden (#589).
 *
 * Høyden er en retningslinje, ikke et krav: lesbarhet vinner, så verdien
 * wrapper i stedet for å kappes (`matallergier` tillater 200 tegn).
 *
 * Rad-layouten er delt med `/profil/rediger` (#685) — samme skjema i to tilstander.
 */
export default function EgneOpplysninger({
  navn,
  visningsnavn,
  fodselsdato,
  telefon,
  epost,
  matallergier,
  stikkord,
  children,
}: Props) {
  // Truthy, ikke != null: tomt visningsnavn = ikke satt, og raden skjules.
  const visVisningsnavn = visningsnavn && visningsnavn !== navn

  return (
    // e2e finner seksjonen via «Om deg»-overskriften.
    <SkjemaGruppe tittel="Om deg">
      {visVisningsnavn && <Rad label="Visningsnavn" verdi={visningsnavn} />}
      <Rad
        label="Fødselsdato"
        verdi={fodselsdato ? formaterDato(`${fodselsdato}T12:00:00Z`, 'd. MMMM yyyy') : null}
      />
      {/* Bevisst ikke tel:/mailto: — ingen ringer eller mailer seg selv. */}
      <Rad label="Telefon" verdi={telefon} />
      <Rad label="E-post" verdi={epost} mono />
      <Rad label="Matallergier" verdi={matallergier} />
      <Rad label="Stikkord om deg" verdi={stikkord} />
      {children}
    </SkjemaGruppe>
  )
}

function Rad({
  label,
  verdi,
  mono,
}: {
  label: string
  verdi: string | null
  mono?: boolean
}) {
  return (
    <OpplysningRad label={label}>
      {/* Bevisst «Ikke satt», ikke «—»: på medlemsdetaljsiden betyr «—» «han
          har ingen», her betyr tomt «du har ikke fylt ut». Ikke slå dem sammen. */}
      {/* .opplysning-verdi er feste for e2e-vakten som sjekker at verdien
          wrapper — samme klasse står på feltet i /profil/rediger. */}
      <div className="opplysning-verdi" style={opplysningVerdiStil({ mono, dempet: !verdi })}>
        {/* `||`, ikke `??`: tom streng = ikke satt (#683). */}
        {verdi || 'Ikke satt'}
      </div>
    </OpplysningRad>
  )
}
