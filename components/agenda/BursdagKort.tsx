import Link from 'next/link'
import Image from 'next/image'
import Icon from '@/components/ui/Icon'
import Avatar from '@/components/ui/Avatar'
import { SolidChip } from '@/components/ui/Pill'
import { formaterDato, aarHvisAvvik } from '@/lib/dato'
import { bildeSrc } from '@/lib/bilde-utils'

export type BursdagData = {
  id: string
  profilId: string
  navn: string
  dato: string // YYYY-MM-DD
  alder: number
  bildeUrl?: string | null
  rolle?: string | null
  // KI-generert bursdagsbilde (#641) — satt kun når det finnes en 'ferdig'
  // rad for DAGENS feiringsdato (se lib/agenda-sortering.ts). Koblingen
  // skjer alltid på profilId fra embedet, aldri på datosammenligning — se
  // kommentaren ved beregnBursdager().
  generertBildeUrl?: string | null
}

// Default-eksporten er en tynn velger mellom de to visningene (#640): på
// selve dagen er bursdagen dagens hovedsak og skal blåses opp, resten av
// året er den en vanlig rad blant andre kort.
//
// `stort` er en påkrevd prop, ikke noe komponenten regner ut selv: PLASSERINGEN
// avgjøres av byggAgenda (som splitter på sin egen `naa`), og hvis komponenten
// i tillegg kalte iDagOslo() ville vi hatt to uavhengige kilder til «er det i
// dag». Straddler rendringen midnatt kan de divergere — et kompakt kort alene
// i toppblokken uten seksjonslabel, eller en hero nede i «Kommende». Kallstedet
// vet allerede hvilken bøtte kortet havnet i, så det bestemmer også varianten.
export default function BursdagKort({ bursdag, stort }: { bursdag: BursdagData; stort: boolean }) {
  return stort ? <StortBursdagKort bursdag={bursdag} /> : <KompaktBursdagKort bursdag={bursdag} />
}

// Kompakt rad — uendret fra før #640, brukt i «Kommende» for bursdager fram
// i tid. Siden denne komponenten nå kun rendres når stort=false, er den gamle
// erIDag-forgreningen fjernet til fordel for den nøytrale (dato-visende) stilen.
function KompaktBursdagKort({ bursdag }: { bursdag: BursdagData }) {
  const mnd = formaterDato(bursdag.dato, 'MMM').toUpperCase()
  const dag = formaterDato(bursdag.dato, 'd')
  const aar = aarHvisAvvik(bursdag.dato)

  return (
    <Link
      href={`/klubbinfo/medlemmer/${bursdag.profilId}`}
      style={{
        display: 'flex',
        gap: 0,
        alignItems: 'stretch',
        overflow: 'hidden',
        borderRadius: 'var(--radius-card)',
        border: '0.5px solid var(--border-subtle)',
        background: 'var(--bg-elevated)',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div
        style={{
          width: 56,
          flexShrink: 0,
          borderRight: '0.5px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Samme glyf som bursdager får i MiniKalender — se #550. */}
        <Icon name="flute" size={24} color="var(--text-tertiary)" strokeWidth={1.25} />
      </div>

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '14px 14px 14px 16px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 8,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--text-tertiary)',
            letterSpacing: '1.6px',
            fontWeight: 600,
            textTransform: 'uppercase',
          }}
        >
          <span>{`${dag}. ${mnd}${aar ? ` ${aar}` : ''}`}</span>
        </div>

        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 18,
            fontWeight: 500,
            color: 'var(--text-primary)',
            letterSpacing: '-0.2px',
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {bursdag.navn}{' '}
          <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>
            fyller {bursdag.alder}
          </span>
        </h3>
      </div>

      <div
        style={{
          width: 108,
          flexShrink: 0,
          borderLeft: '0.5px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Avatar
          name={bursdag.navn}
          src={bursdag.bildeUrl ?? null}
          size={64}
          rolle={bursdag.rolle}
        />
      </div>
    </Link>
  )
}

// Stort hero-kort — kun rendret på selve bursdagen (#640). Samme visuelle
// oppskrift som HighlightKort (bilde-hero + chip + innholdsblokk), men med
// en Avatar i stedet for et 16/10-arrangementsbilde: en mann er ikke et
// landskap, og Avatar takler manglende bilde (initial-gradient) selv.
function StortBursdagKort({ bursdag }: { bursdag: BursdagData }) {
  // Kun satt når det finnes et FERDIG generert bilde for DAGENS feiring
  // (#641) — ingen 'paagaar', ingen skeleton. Uten et generert bilde ER
  // hero-en allerede ansiktet hans (Avatar under), så det er ikke noe å
  // vise mens man venter.
  const generertBilde = bildeSrc(bursdag.generertBildeUrl ?? null)

  return (
    <Link
      href={`/klubbinfo/medlemmer/${bursdag.profilId}`}
      style={{
        display: 'block',
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--accent)',
        // --accent-soft har alpha ~0.15 og fungerer som halo-ring (0 0 0 4px)
        // andre steder i appen, ikke som slagskygge — en 30px uskarp skygge i
        // den fargen er praktisk talt usynlig. --shadow-floating gir kortet det
        // løftet fra flaten som faktisk er synlig i begge temaer.
        boxShadow: 'var(--shadow-floating), 0 0 0 1px var(--border-strong)',
        background: 'var(--bg-elevated)',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      {/* Hero: KI-generert bursdagsbilde når det finnes (#641), ellers samme
          Avatar-fallback som før — en mann uten generert bilde er allerede
          representert av sitt eget profilbilde/initial-gradient. */}
      {generertBilde ? (
        <div style={{ position: 'relative', aspectRatio: '4/3' }}>
          <Image
            src={generertBilde}
            alt={`Bursdagsbilde av ${bursdag.navn}, laget av KI`}
            fill
            style={{ objectFit: 'cover' }}
            // Samme mønster som HighlightKort — begge kan i prinsippet vises
            // øverst på agenda samtidig (bursdagskortet + et highlight-kort
            // rett under), og to `priority`-bilder over folden er bevisst:
            // begge er reelt synlige ved førstemaling på mobil.
            sizes="(max-width: 512px) 100vw, 512px"
            priority
          />
        </div>
      ) : (
        <div
          style={{
            position: 'relative',
            aspectRatio: '4/3',
            background: 'var(--accent-soft)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Avatar name={bursdag.navn} src={bursdag.bildeUrl ?? null} size={168} rolle={bursdag.rolle} />
        </div>
      )}

      <div style={{ position: 'absolute', top: 12, right: 12 }}>
        <SolidChip>I dag</SolidChip>
      </div>

      <div style={{ padding: '18px 18px 20px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--accent)',
            letterSpacing: '1.6px',
            fontWeight: 600,
            textTransform: 'uppercase',
          }}
        >
          {/* Samme glyf som bursdager får i MiniKalender — se #550. */}
          <Icon name="flute" size={16} color="var(--accent)" strokeWidth={1.25} />
          <span>BURSDAG</span>
          {/* KI-merket (#641) — kun når hero-en faktisk er det genererte
              bildet. Ingen overlay, ingen scrim, ingen ny fargetoken:
              «LAGET AV KI» i --text-tertiary på samme rad, samme
              font-mono/letterspacing som «BURSDAG». */}
          {generertBilde && <span style={{ color: 'var(--text-tertiary)' }}>· LAGET AV KI</span>}
        </div>

        <h3
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: 'var(--font-display)',
            fontSize: 26,
            fontWeight: 500,
            color: 'var(--text-primary)',
            letterSpacing: '-0.3px',
            lineHeight: 1.15,
            margin: '8px 0 0',
          }}
        >
          {/* Ekte ansikt ved siden av navnet — kun når hero-en er det
              genererte bildet, slik at man alltid kan se hvem det faktisk
              er selv om bildet ikke ligner perfekt. */}
          {generertBilde && (
            <Avatar name={bursdag.navn} src={bursdag.bildeUrl ?? null} size={28} rolle={bursdag.rolle} />
          )}
          <span>
            {bursdag.navn} <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>fyller {bursdag.alder}</span>
          </span>
        </h3>
      </div>
    </Link>
  )
}
