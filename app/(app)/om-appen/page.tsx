import Link from 'next/link'
import SectionLabel from '@/components/ui/SectionLabel'
import Icon from '@/components/ui/Icon'
import Endringslogg from '@/components/Endringslogg'
import versjon from '@/lib/versjon.json'
import { KLUBB_NAVN, DATA_LOKASJON } from '@/lib/klubb-config'
import { byggEndringslogg } from '@/lib/endringslogg'
import { ENDRINGER } from '@/lib/endringslogg-data'

export default function OmAppen() {
  const endringsRader = byggEndringslogg(ENDRINGER, versjon.versjon)

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
          en privatsamtale med et annet medlem er kun synlig for dere to —
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
          vurdert. Gevinsten er liten for en lukket gruppe på 15–20
          venner som kjenner hverandre — de fleste reelle truslene fikses uansett
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
          Ytelsesmålinger (anonyme, uten brukerdata) går til Vercel.
        </Avsnitt>
        <Avsnitt overskrift="AI-funksjoner">
          Når du skriver et innlegg, sendes teksten til Anthropic (AI-leverandør
          i USA) for å tolke en eventuell dato, slik at innlegget kan festes
          øverst frem til den datoen. Dette skjer automatisk mens du skriver, og
          bare på nye innlegg — ingen annen tekst i appen sendes ut.
        </Avsnitt>
        <Avsnitt overskrift="E-postvarsler">
          Varsler du får på e-post sendes via Resend (e-postleverandør i USA).
          Innholdet i varselet — for eksempel en chatmelding eller navnet på
          et arrangement — passerer dermed deres servere. Push-varsler går
          ikke denne veien — de leveres kryptert via Apple/Google sine
          varslingstjenester, som ikke kan lese innholdet.
        </Avsnitt>
        <Avsnitt overskrift="Innspill og feilrapportering">
          Sender du inn et innspill, blir det en sak i et privat GitHub-repo
          (USA) med navnet ditt og teksten du skrev. Tekniske feil rapporteres
          til Sentry for feilsøking, og der følger profil-id-en din med.
        </Avsnitt>
        {/* Teksten hentes fra klubb-config, ikke hardkodes her — se
         * kommentaren ved DATA_LOKASJON i lib/klubb-config.ts (#579). */}
        <Avsnitt overskrift="Hvor data ligger" siste>
          {DATA_LOKASJON}
        </Avsnitt>
      </section>

      {/* Hva er nytt — «mindre»-rader er utledet fra versjonsnummeret, ikke
       * lagret. Se lib/endringslogg.ts og #595. */}
      {endringsRader.length > 0 && (
        <section style={{ marginBottom: 30 }}>
          <SectionLabel>Hva er nytt</SectionLabel>
          <Endringslogg rader={endringsRader} />
        </section>
      )}

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

      {/* Apropos — bevisst brutt ut av «Om»-stilen (SectionLabel + Avsnitt-liste)
       * og gitt eget kort: dette er en oppfordring til gutta, ikke informasjon
       * om appen. Se #573. */}
      <aside
        style={{
          marginTop: 34,
          padding: '24px 22px 26px',
          background:
            'radial-gradient(ellipse at top left, var(--accent-soft), transparent 62%), var(--bg-elevated)',
          border: '0.5px solid var(--border-strong)',
          borderRadius: 'var(--radius)',
          backdropFilter: 'var(--blur-card)',
          WebkitBackdropFilter: 'var(--blur-card)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--accent)',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            marginBottom: 12,
          }}
        >
          <Icon name="sparkle" size={13} color="var(--accent)" strokeWidth={1.8} />
          Apropos
        </div>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 26,
            fontWeight: 500,
            letterSpacing: '-0.4px',
            lineHeight: 1.15,
            margin: 0,
            marginBottom: 12,
            color: 'var(--text-primary)',
          }}
        >
          Vil du være med og bygge?
        </h2>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
          }}
        >
          <p style={{ margin: 0, marginBottom: 12 }}>
            Appen er skrevet fra bunnen for klubbens behov, og koden ligger i
            et eget GitHub-repo. Mangler det noe, er det ingen leverandør som
            må spørres først — det er bare å bygge det.
          </p>
          <p style={{ margin: 0, marginBottom: 12 }}>
            Bidrag går inn som pull request: du lager en egen branch, gjør
            endringen der, og sender den inn til gjennomlesing før den merges
            og går live for gutta.
          </p>
          <p style={{ margin: 0 }}>
            Repoet er privat, så du må inviteres inn. Ta kontakt med en av
            admin-ene, så ordner vi tilgang. Har du aldri kodet før, men vil
            prøve — si fra likevel. Terskelen er lav.
          </p>
        </div>
      </aside>
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
