import Link from 'next/link'
import SectionLabel from '@/components/ui/SectionLabel'
import versjon from '@/lib/versjon.json'
import { KLUBB_NAVN } from '@/lib/klubb-config'

export default function OmAppen() {
  return (
    <div style={{ padding: '0 20px 20px' }}>
      <header style={{ marginTop: 12, marginBottom: 26 }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--text-tertiary)',
            letterSpacing: '1.6px',
            textTransform: 'uppercase',
            marginBottom: 6,
          }}
        >
          Klubben &middot; {versjon.versjon ?? ''}
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 38,
            fontWeight: 500,
            letterSpacing: '-0.5px',
            lineHeight: 1,
            margin: 0,
            color: 'var(--text-primary)',
          }}
        >
          Om appen
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            color: 'var(--text-secondary)',
            marginTop: 12,
            lineHeight: 1.5,
            maxWidth: 420,
          }}
        >
          Privat klubbapp for {KLUBB_NAVN}. Erstatter Facebook for
          påmelding, klubbinfo og kåringer.
        </p>
      </header>

      {/* Sikkerhet */}
      <section style={{ marginBottom: 30 }}>
        <SectionLabel>Sikkerhet</SectionLabel>
        <Avsnitt overskrift="Kryptert mellom telefon og server">
          All trafikk mellom appen og serveren går over HTTPS — samme krypto
          banker og helsesektoren bruker. På åpent WiFi (kafé, hotell, fly)
          kan ingen lese hva som sendes mellom telefonen din og oss, så
          lenge nettleseren ikke advarer om sertifikatfeil.
        </Avsnitt>
        <Avsnitt overskrift="Tilgangskontroll på databasenivå">
          Hver tabell har egne regler for hvem som kan lese hva. Eksempel:
          en privatsamtale med Michael er kun synlig for dere to —
          databasen returnerer ingen rad til andre, selv ikke admin.
        </Avsnitt>
        <Avsnitt overskrift="Passinformasjon">
          Pass-nummer og utløpsdato lagres i en egen tabell utenfor
          profilen. Bare du ser dataen som default. Tur-arrangører kan be
          om dagstilgang — generalsekretæren må godkjenne, og tilgangen
          varer i 24 timer før den automatisk faller bort.
        </Avsnitt>
        <Avsnitt overskrift="Pålogging">
          Standard e-post + passord. Sesjon utløper automatisk etter en
          stund med inaktivitet. Hvis du mistenker at noen har kommet inn
          på kontoen din, bytt passord under «Rediger profil».
        </Avsnitt>
        <Avsnitt overskrift="Hvorfor det ikke er mer enn dette" siste>
          End-to-end-kryptering (à la Signal/WhatsApp) og tofaktor er
          vurdert. Gevinsten er liten for en lukket gruppe på 17 venner
          som kjenner hverandre — de fleste reelle truslene fikses uansett
          ikke av disse tiltakene, og kostnaden i daglig bruk er
          merkbar. Holdes derfor på dagens nivå.
        </Avsnitt>
      </section>

      {/* Personvern */}
      <section style={{ marginBottom: 30 }}>
        <SectionLabel>Personvern</SectionLabel>
        <Avsnitt overskrift="Hva vi lagrer">
          Alt, til evig tid. Når du dævver blir det fortsatt liggende
          til spott og spe for evig tid.
        </Avsnitt>
        <Avsnitt overskrift="Ingen tracking">
          Vi har ingen annonser, ingen Google Analytics, ingen Facebook-
          piksler, ingen «cookies» som følger deg på tvers av nettsteder.
          Eneste eksterne tjeneste er Vercel sin Web Vitals (anonyme
          ytelsesmålinger uten brukerdata).
        </Avsnitt>
        <Avsnitt overskrift="Hvor data ligger" siste>
          Database og fillagring hos Supabase i Dublin (EU). Hosting hos
          Vercel, også Dublin-region. Data forlater ikke EU-området.
        </Avsnitt>
      </section>

      {/* Funn / spørsmål */}
      <section style={{ marginBottom: 30 }}>
        <SectionLabel>Spørsmål eller forslag?</SectionLabel>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
            marginBottom: 12,
          }}
        >
          Si fra hvis noe er uklart, ikke fungerer, eller burde funnet på
          en annen måte.
        </p>
        <Link
          href="/bli-utvikler"
          style={{
            display: 'block',
            width: '100%',
            padding: '12px 0',
            textAlign: 'center',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 999,
            color: 'var(--accent)',
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          Send innspill
        </Link>
      </section>
    </div>
  )
}

function Avsnitt({
  overskrift,
  siste,
  children,
}: {
  overskrift: string
  siste?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        padding: '14px 4px',
        borderBottom: siste ? 'none' : '0.5px solid var(--border-subtle)',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 15,
          fontWeight: 500,
          color: 'var(--text-primary)',
          letterSpacing: '-0.2px',
          marginBottom: 6,
        }}
      >
        {overskrift}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 13,
          color: 'var(--text-secondary)',
          lineHeight: 1.55,
        }}
      >
        {children}
      </div>
    </div>
  )
}
