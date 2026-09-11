import Link from 'next/link'
import Image from 'next/image'
import Icon from '@/components/ui/Icon'
import Avatar from '@/components/ui/Avatar'
import Card from '@/components/ui/Card'
import KommentarerPaaKort, { type KommentarKortData } from '@/components/agenda/KommentarerPaaKort'
import { formaterDato, aarHvisAvvik } from '@/lib/dato'
import { KOMMENTARER_KOLLAPS_DAGER } from '@/lib/konstanter'
import type { ChatProfil } from '@/lib/mention'
import { bildeSrc } from '@/lib/bilde-utils'

export type AvreiseDeltaker = {
  navn: string
  src: string | null
  rolle: string | null
}

/** Avreise-blokka nederst på tur-kortet siste uka før tur (#669). */
export type AvreiseData = {
  /** 0 = i dag. Kan bli 0 her: et UBESVART arrangement i dag havner i
   *  «Ikke svart» som vanlig kort, ikke som highlight. */
  dagerIgjen: number
  /** Alle som har svart ja — ingen kapping, hele gjengen skal være synlig. */
  deltakere: AvreiseDeltaker[]
}

export type ArrangementKortData = {
  id: string
  type: string // 'tur' | 'moete'
  tittel: string
  start_tidspunkt: string
  oppmoetested: string | null
  bilde_url?: string | null
  antallJa: number
  minStatus: 'ja' | 'kanskje' | 'nei' | null
  harAlbum?: boolean
  /** Satt kun for turer innen avreisevinduet — se byggAvreise() i agenda-sortering. */
  avreise?: AvreiseData
}

// Ansiktene i avreise-blokka. Større enn en vanlig listeavatar fordi de skal
// leses som gjengen som drar, ikke som pynt; overlappen holder bunke-uttrykket
// uten å spise for mye bredde når hele klubben har sagt ja.
const AVREISE_ANSIKT_PX = 38
const AVREISE_OVERLAPP = 9

// «7 dager igjen» er riktig på avstand, men blir stivt når det nærmer seg.
function nedtellingTekst(dagerIgjen: number): string {
  if (dagerIgjen <= 0) return 'I dag'
  if (dagerIgjen === 1) return 'I morgen'
  return `${dagerIgjen} dager igjen`
}

function sceneFor(type: string): 'tur' | 'møte' | 'event' {
  if (type === 'tur') return 'tur'
  if (type === 'moete') return 'møte'
  return 'event'
}

function sceneBackground(scene: 'tur' | 'møte' | 'event'): string {
  if (scene === 'tur') {
    return `linear-gradient(180deg, var(--accent-soft) 0%, transparent 60%),
            linear-gradient(135deg, oklch(0.22 0.03 230), oklch(0.14 0.04 260))`
  }
  if (scene === 'møte') {
    return `linear-gradient(180deg, var(--accent-soft) 0%, transparent 60%),
            linear-gradient(135deg, oklch(0.20 0.02 40), oklch(0.12 0.02 30))`
  }
  return `linear-gradient(180deg, var(--accent-soft) 0%, transparent 60%),
          linear-gradient(135deg, oklch(0.20 0.03 200), oklch(0.13 0.03 220))`
}

function statusDotFarge(status: ArrangementKortData['minStatus']): string {
  if (status === 'ja') return 'var(--success)'
  if (status === 'kanskje') return 'var(--accent)'
  return 'var(--text-tertiary)'
}

function statusTekst(status: ArrangementKortData['minStatus']): string {
  if (status === 'ja') return 'Du er med'
  if (status === 'kanskje') return 'Du svarte kanskje'
  if (status === 'nei') return 'Du svarte nei'
  return 'Ikke svart'
}

type Props = {
  arr: ArrangementKortData
  tidligere?: boolean
  kommentarer?: KommentarKortData[]
  /** Totalt antall kommentarer (overskrift kan ellers vise maks 3). */
  totaltKommentarer?: number
  /** Aktive profiler for @mention-forslag i inline kommentar-felt. */
  profiler?: ChatProfil[]
  /** Innlogget brukers id — ekskluderes fra mention-forslag. */
  brukerId?: string
  /** Innlogget brukers navn — sendes til KommentarerPaaKort for optimistisk rad. se #316 */
  brukerNavn?: string
  /** Innlogget brukers bilde_url — sendes til KommentarerPaaKort for optimistisk rad-avatar. se #316 */
  brukerBildeUrl?: string | null
  /** Innlogget brukers rolle — sendes til KommentarerPaaKort for gul glød på optimistisk rad. se #316 */
  brukerRolle?: string | null
  /** Vis kommentar-blokken. Default true. Sett false (f.eks. i ubesvart-seksjonen) for å skjule — se #274. */
  visKommentarer?: boolean
}

export default function ArrangementKort({ arr, tidligere = false, kommentarer = [], totaltKommentarer, profiler, brukerId, brukerNavn, brukerBildeUrl, brukerRolle, visKommentarer = true }: Props) {
  const iso = arr.start_tidspunkt
  const mnd = formaterDato(iso, 'MMM').toUpperCase()
  const dag = formaterDato(iso, 'd')
  const tid = formaterDato(iso, 'HH:mm')
  const aar = aarHvisAvvik(iso)
  const scene = sceneFor(arr.type)
  const bilde = bildeSrc(arr.bilde_url)

  // Beregn kun kollaps-flagg når blokken faktisk skal vises (sparer Date-arbeid på hver render i ubesvart-seksjonen).
  const visKommentarBlokk = !tidligere && visKommentarer
  const siste = visKommentarBlokk ? kommentarer[kommentarer.length - 1] : undefined
  const alderMs = siste ? Date.now() - new Date(siste.opprettet).getTime() : 0
  // Kollaps kun på ALDER, aldri på tom liste (se #648-review): `apen` i
  // KommentarerPaaKort er state satt ved mount, og en tom liste er nettopp
  // tilstanden som kan bli ikke-tom av en optimistisk rad rett etterpå. Startet
  // kortet kollapset, ville medlemmets egen ferske kommentar vært usynlig — og
  // `apen` reagerer ikke på at propen senere går tilbake til false.
  const skalKollapse =
    visKommentarBlokk &&
    kommentarer.length > 0 &&
    alderMs > KOMMENTARER_KOLLAPS_DAGER * 24 * 60 * 60 * 1000

  return (
    <Link
      href={`/arrangementer/${arr.id}`}
      style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
    >
      <Card
        padding={false}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          opacity: tidligere ? 'var(--tidligere-opacity)' : 1,
          borderRadius: 'var(--radius-card)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'stretch',
            gap: 0,
          }}
        >
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
          {/* Dato-label */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 8,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--accent)',
              letterSpacing: '1.6px',
              fontWeight: 600,
              textTransform: 'uppercase',
            }}
          >
            <span>
              {dag}. {mnd}{aar && ` ${aar}`}
            </span>
            <span style={{ color: 'var(--text-tertiary)', letterSpacing: '1.2px' }}>· {tid}</span>
            {arr.harAlbum && (
              <span
                aria-label="Har album"
                title="Har album"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  marginLeft: 'auto',
                  color: 'var(--text-tertiary)',
                }}
              >
                <Icon name="image" size={12} color="currentColor" />
              </span>
            )}
          </div>

          {/* Tittel */}
          <h3
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 18,
              fontWeight: 500,
              color: 'var(--text-primary)',
              letterSpacing: '-0.2px',
              margin: '0 0 6px',
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {arr.tittel}
          </h3>

          {/* Sted */}
          {arr.oppmoetested && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Icon name="mapPin" size={11} color="var(--text-tertiary)" />
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {arr.oppmoetested}
              </span>
            </div>
          )}

          {/* Status-rad */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              color: 'var(--text-tertiary)',
            }}
          >
            {tidligere ? (
              <>
                <Icon name="checkmark" size={11} color="var(--text-tertiary)" strokeWidth={1.8} />
                <span>{arr.antallJa} deltok</span>
              </>
            ) : (
              <>
                <span
                  aria-hidden="true"
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: statusDotFarge(arr.minStatus),
                    flexShrink: 0,
                  }}
                />
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {arr.antallJa} påmeldt · {statusTekst(arr.minStatus)}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Thumb til høyre */}
        <div
          style={{
            width: 108,
            flexShrink: 0,
            position: 'relative',
            borderLeft: '0.5px solid var(--border-subtle)',
            // Leser `bilde` (trakten), ikke råverdien: scene-fargen er fallback for
            // at SVG-mønsteret vises, og den beslutningen tas av samme variabel.
            background: bilde ? undefined : sceneBackground(scene),
            overflow: 'hidden',
          }}
        >
          {bilde ? (
            <Image
              src={bilde}
              alt=""
              fill
              style={{ objectFit: 'cover' }}
              sizes="108px"
            />
          ) : (
            <svg
              width="100%"
              height="100%"
              style={{ position: 'absolute', inset: 0, opacity: 0.08 }}
              aria-hidden="true"
            >
              <defs>
                <pattern
                  id={`thumb-stripes-${arr.id}`}
                  patternUnits="userSpaceOnUse"
                  width="8"
                  height="8"
                  patternTransform="rotate(45)"
                >
                  <rect width="4" height="8" fill="var(--accent)" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill={`url(#thumb-stripes-${arr.id})`} />
            </svg>
          )}
        </div>
        </div>

        {/* Avreise-blokka (#669) — kun turer, siste uka før avreise. Ligger
            utenfor topp-raden slik at den får hele kortbredden under både
            teksten og thumben. `arr.avreise` er satt av byggAvreise(), som
            eier alle vilkårene; her er det ren rendring. */}
        {arr.avreise && !tidligere && (
          <div
            data-testid="avreise-blokk"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              padding: '12px 14px 13px',
              borderTop: '0.5px solid var(--border-subtle)',
            }}
          >
            {/* Alle som har sagt ja, ingen «+N»-teller: hele gjengen skal
                være synlig. Rada brytes derfor i stedet for å kappes —
                paddingLeft på containeren nuller ut den negative margin-en
                på det første ansiktet i HVER rad, så radene starter likt. */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                minWidth: 0,
                paddingLeft: AVREISE_OVERLAPP,
                rowGap: 6,
              }}
            >
              {arr.avreise.deltakere.map((d, i, alle) => (
                // zIndex synkende: den første avataren ligger øverst, så
                // overlappen leses som en bunke fra venstre. Telles ned fra
                // antallet, ikke fra et fast tall, siden lista ikke er kappet.
                <div
                  key={`${d.navn}-${i}`}
                  data-testid="avreise-ansikt"
                  style={{
                    marginLeft: -AVREISE_OVERLAPP,
                    zIndex: alle.length - i,
                    position: 'relative',
                  }}
                >
                  <Avatar
                    name={d.navn}
                    size={AVREISE_ANSIKT_PX}
                    src={d.src ?? undefined}
                    rolle={d.rolle}
                  />
                </div>
              ))}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '1.3px',
                  textTransform: 'uppercase',
                  color: 'var(--text-tertiary)',
                  whiteSpace: 'nowrap',
                }}
              >
                {nedtellingTekst(arr.avreise.dagerIgjen)}
              </span>
              {/* Kondensstripa: prikket der reisa ikke har skjedd ennå, hel der
                  den er i gang. Dekorativ — nedtellingen står i teksten. */}
              <svg
                width="132"
                height="18"
                viewBox="0 0 132 18"
                fill="none"
                aria-hidden="true"
                style={{ flexShrink: 0 }}
              >
                <path
                  d="M2 14C26 14 44 11.5 62 8.5"
                  stroke="var(--accent)"
                  strokeOpacity="0.28"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeDasharray="1 5"
                />
                <path
                  d="M62 8.5C80 5.5 96 4 112 4"
                  stroke="var(--accent)"
                  strokeOpacity="0.55"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <path d="M114 1.5L124 4L114 6.5L116.5 4L114 1.5Z" fill="var(--accent)" />
                <path
                  d="M117.5 4L128.5 4"
                  stroke="var(--accent)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
        )}

        {/* Kommentarer — inne i kortet, kollapsbart, med inline input; se #274 for visKommentarer-flagg */}
        {visKommentarBlokk && (
          <KommentarerPaaKort
            kommentarer={kommentarer}
            scope={{ type: 'arrangement', id: arr.id }}
            startKollapset={skalKollapse}
            totaltAntall={totaltKommentarer}
            profiler={profiler}
            brukerId={brukerId}
            brukerNavn={brukerNavn}
            brukerBildeUrl={brukerBildeUrl}
            brukerRolle={brukerRolle}
          />
        )}
      </Card>
    </Link>
  )
}
