import SectionLabel from '@/components/ui/SectionLabel'
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
}

/**
 * Egne opplysninger på /profil (#683) — samme felter som medlemsdetaljsiden
 * (`FaktaRad`), men med label og verdi på SAMME linje i stedet for
 * label-over-verdi. FaktaRad er ~50 px/rad; fem slike ville lagt ~250 px
 * mellom heroen og Privatmeldinger og skjøvet resten av siden under folden
 * på iPhone (390×844) — problemet #589 ryddet opp i. Raden her er ~36 px.
 *
 * Høyde er en RETNINGSLINJE her, ikke et krav: målet «hold Privatmeldinger
 * over folden» ble satt under planleggingen av #683, ikke av issuet selv.
 * Der de to kolliderer vinner lesbarheten — derfor wrapper verdien fritt
 * (se OpplysningRad) i stedet for å kappes med ellipsis: `matallergier`
 * tillater 200 tegn (MATALLERGIER_MAKS_LENGDE) og er ment for fraser som
 * «tåler ikke rå løk». Kun profiler som faktisk HAR lang tekst betaler
 * høyden for det.
 *
 * Rad-layouten (`OpplysningRad`, `opplysningVerdiStil`) er delt med
 * `/profil/rediger` (#685) — de to skal se ut som samme skjema i to
 * tilstander, ikke to forskjellige.
 *
 * Stikkord er fritekst siden #685 (Reidar: «jeg vil ikke ha pills») — feltet
 * er nå en vanlig rad på linje med de fem andre, ikke en egen chip-blokk.
 */
export default function EgneOpplysninger({
  navn,
  visningsnavn,
  fodselsdato,
  telefon,
  epost,
  matallergier,
  stikkord,
}: Props) {
  // Truthy-sjekk, ikke != null: et tomt visningsnavn betyr «har ikke et eget
  // visningsnavn» — samme sak som null — og raden skal da skjules, ikke vises
  // som «Ikke satt».
  const visVisningsnavn = visningsnavn && visningsnavn !== navn

  return (
    // 20 px matcher hero og resten av seksjonsrytmen på siden (20–24).
    <section style={{ marginBottom: 20 }}>
      <SectionLabel>Om deg</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {visVisningsnavn && <Rad label="Visningsnavn" verdi={visningsnavn} />}
        <Rad
          label="Fødselsdato"
          verdi={fodselsdato ? formaterDato(`${fodselsdato}T12:00:00Z`, 'd. MMMM yyyy') : null}
        />
        {/* E-post og telefon er bevisst IKKE mailto:/tel:-lenker slik de er på
            medlemsdetaljsiden — dette er dine egne opplysninger, og å ringe
            eller maile seg selv er ikke en handling noen vil gjøre. */}
        <Rad label="Telefon" verdi={telefon} />
        <Rad label="E-post" verdi={epost} mono />
        <Rad label="Matallergier" verdi={matallergier} />
        <Rad label="Stikkord om deg" verdi={stikkord} last />
      </div>
    </section>
  )
}

function Rad({
  label,
  verdi,
  mono,
  last,
}: {
  label: string
  verdi: string | null
  mono?: boolean
  last?: boolean
}) {
  return (
    <OpplysningRad label={label} last={last}>
      {/* Bevisst «Ikke satt», ikke «—»: appen bruker «—» på medlemsdetaljsiden
          der det betyr «denne mannen har ingen». Her, på EGEN profil, betyr
          et tomt felt «du har ikke fylt ut dette ennå» — to ulike ting, to
          ulike konvensjoner. Ikke slå dem sammen for konsistens. */}
      {/* .opplysning-verdi er felles feste for e2e-vakten som sjekker at
          verdien wrapper i stedet for å kappes — samme klasse bærer det
          redigerbare feltet på /profil/rediger. */}
      <div className="opplysning-verdi" style={opplysningVerdiStil({ mono, dempet: !verdi })}>
        {/* `||`, ikke `??`: en tom streng skal behandles som «ikke satt».
            Alle verdiene her er strenger (ingen 0-felle), og en blank celle
            er umulig å skille fra en renderingsfeil. #683-review. */}
        {verdi || 'Ikke satt'}
      </div>
    </OpplysningRad>
  )
}
