import SectionLabel from '@/components/ui/SectionLabel'
import Pill from '@/components/ui/Pill'
import { formaterDato } from '@/lib/dato'

type Props = {
  navn: string
  visningsnavn: string | null
  fodselsdato: string | null
  telefon: string | null
  epost: string
  matallergier: string | null
  stikkord: string[]
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
 * (se Rad) i stedet for å kappes med ellipsis: `matallergier` tillater 200
 * tegn (MATALLERGIER_MAKS_LENGDE) og er ment for fraser som «tåler ikke rå
 * løk». Kun profiler som faktisk HAR lang tekst betaler høyden for det.
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
  // som «Ikke satt». Stikkord-grenen trenger ingen tilsvarende vakt: DB-en
  // forbyr tomme/utrimmede elementer (stikkord_gyldig(), mig. 139).
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
        {/* Stikkord: tom liste bruker den VANLIGE raden, så «Ikke satt» står
            høyrestilt som i de fem andre radene. Kun når det finnes stikkord
            bryter vi mønsteret — pills må få wrappe under labelen. Tomt felt
            skjules aldri (#639 — den bugen var å skjule HELE seksjonen ved
            tomt array; her skal alle feltene alltid vises, tomme eller ei). */}
        {stikkord.length === 0 ? (
          <Rad label="Stikkord" verdi={null} last />
        ) : (
          <div style={{ padding: '8px 4px' }}>
            <Label>Stikkord</Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {stikkord.map((s, i) => (
                // Pill er uppercase som default — et stikkord skal ikke skrike.
                // Indeks i key: DB håndhever ikke unikhet på stikkord-arrayet.
                <Pill key={`${s}-${i}`} variant="neutral" style={{ textTransform: 'none' }}>
                  {s}
                </Pill>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

/** Felles etikett-stil for både Rad og stikkord-blokka — én kilde, ikke to. */
function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9.5,
        fontWeight: 600,
        color: 'var(--text-tertiary)',
        textTransform: 'uppercase',
        letterSpacing: '1.6px',
        flexShrink: 0,
      }}
    >
      {children}
    </div>
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
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 12,
        padding: '8px 4px',
        borderBottom: last ? 'none' : '0.5px solid var(--border-subtle)',
      }}
    >
      <Label>{label}</Label>
      {/* Bevisst «Ikke satt», ikke «—»: appen bruker «—» på medlemsdetaljsiden
          der det betyr «denne mannen har ingen». Her, på EGEN profil, betyr
          et tomt felt «du har ikke fylt ut dette ennå» — to ulike ting, to
          ulike konvensjoner. Ikke slå dem sammen for konsistens. */}
      <div
        style={{
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)',
          fontSize: 14,
          lineHeight: 1.4,
          color: verdi ? 'var(--text-primary)' : 'var(--text-tertiary)',
          letterSpacing: mono ? '0.2px' : '0.1px',
          minWidth: 0,
          textAlign: 'right',
          // Verdien wrapper fritt — teksten skal kunne LESES her, ikke bare på
          // kameratenes profilsider. break-word bryter i tillegg en enkelt lang
          // «ord» (en e-postadresse uten mellomrom) i stedet for å flyte utenfor.
          overflowWrap: 'break-word',
        }}
      >
        {/* `||`, ikke `??`: en tom streng skal behandles som «ikke satt».
            Alle verdiene her er strenger (ingen 0-felle), og en blank celle
            er umulig å skille fra en renderingsfeil. #683-review. */}
        {verdi || 'Ikke satt'}
      </div>
    </div>
  )
}
