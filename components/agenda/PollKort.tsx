import Link from 'next/link'
import Icon from '@/components/ui/Icon'
import Card from '@/components/ui/Card'
import KommentarerPaaKort, { type KommentarKortData } from '@/components/agenda/KommentarerPaaKort'
import { formaterDato, aarHvisAvvik } from '@/lib/dato'
import PollInlineStemme from '@/components/poll/PollInlineStemme'
import type { ChatProfil } from '@/lib/mention'

// Terskel for når alternativene vises som inline stemmeknapper på agenda-
// kortet. Justeres fritt — 2 gir et rent Ja/Nei-oppsett som ligner RSVP-
// blokka. Øk denne når du har verifisert at flere knapper fortsatt ser bra
// ut i mobile bredder (390 px).
export const MAKS_INLINE_VALG = 2

export type PollKortData = {
  id: string
  spoersmaal: string
  svarfrist: string
  flervalg: boolean
  antallStemmer: number
  harStemt: boolean
  avsluttet: boolean
  valg: { id: string; tekst: string }[]
  mineStemmer: string[]
  stemmerPerValg: Record<string, number>
}

type Props = {
  poll: PollKortData
  /** Plasser kortet i «tidligere»-stil (dempet opacity). */
  tidligere?: boolean
  kommentarer?: KommentarKortData[]
  /** Totalt antall kommentarer (overskrift kan ellers vise maks 3). */
  totaltKommentarer?: number
  /** Aktive profiler for @mention-forslag i inline kommentar-felt. */
  profiler?: ChatProfil[]
  /** Innlogget brukers id — ekskluderes fra mention-forslag. */
  brukerId?: string
}

function fristLabel(avsluttet: boolean, iso: string): string {
  if (avsluttet) return 'avsluttet'
  const mnd = formaterDato(iso, 'MMM').toUpperCase()
  const dag = formaterDato(iso, 'd')
  const tid = formaterDato(iso, 'HH:mm')
  const aar = aarHvisAvvik(iso)
  return `frist ${dag}. ${mnd}${aar ? ` ${aar}` : ''} ${tid}`
}

export default function PollKort({ poll, tidligere = false, kommentarer = [], totaltKommentarer, profiler, brukerId }: Props) {
  const erInline = !poll.avsluttet && !tidligere && poll.valg.length <= MAKS_INLINE_VALG

  // Felles topp-innhold (label + spørsmål). Både inline og kompakt bruker
  // dette — forskjellen er hva som henger under/ved siden av.
  const topp = (
    <>
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
        <span>Avstemming</span>
        <span style={{ color: 'var(--text-tertiary)', letterSpacing: '1.2px' }}>
          · {fristLabel(poll.avsluttet, poll.svarfrist)}
        </span>
      </div>

      <h3
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 18,
          fontWeight: 500,
          color: 'var(--text-primary)',
          letterSpacing: '-0.2px',
          margin: erInline ? '0 0 12px' : '0 0 6px',
          lineHeight: 1.2,
        }}
      >
        {poll.spoersmaal}
      </h3>
    </>
  )

  const statusTekst = (() => {
    if (poll.avsluttet) return `${poll.antallStemmer} stemt`
    if (poll.harStemt) return `${poll.antallStemmer} stemt · Du har stemt`
    return `${poll.antallStemmer} stemt · Ikke stemt`
  })()

  // === Inline-variant: stemmeknapper direkte på agenda-kortet ===
  if (erInline) {
    return (
      <Link
        href={`/poll/${poll.id}`}
        style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
      >
        <Card
          padding={false}
          style={{
            borderRadius: 'var(--radius-card)',
          }}
        >
          <div style={{ padding: '14px 16px' }}>
            {topp}

            <PollInlineStemme
              pollId={poll.id}
              flervalg={poll.flervalg}
              valg={poll.valg}
              mineStemmer={poll.mineStemmer}
              stemmerPerValg={poll.stemmerPerValg}
              antallStemmere={poll.antallStemmer}
            />

            <div
              style={{
                marginTop: 10,
                fontSize: 11,
                color: 'var(--text-tertiary)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: poll.harStemt ? 'var(--success)' : 'var(--text-tertiary)',
                  flexShrink: 0,
                }}
              />
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {statusTekst}
              </span>
            </div>
          </div>

          <KommentarerPaaKort
            kommentarer={kommentarer}
            scope={{ type: 'poll', id: poll.id }}
            totaltAntall={totaltKommentarer}
            profiler={profiler}
            brukerId={brukerId}
          />
        </Card>
      </Link>
    )
  }

  // === Kompakt kort: brukes når antall valg > MAKS_INLINE_VALG eller avsluttet ===
  return (
    <Link
      href={`/poll/${poll.id}`}
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
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
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
          {topp}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              color: 'var(--text-tertiary)',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: poll.harStemt ? 'var(--success)' : 'var(--text-tertiary)',
                flexShrink: 0,
              }}
            />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {statusTekst}
            </span>
          </div>
        </div>

        <div
          style={{
            width: 108,
            flexShrink: 0,
            position: 'relative',
            borderLeft: '0.5px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: `linear-gradient(180deg, var(--accent-soft) 0%, transparent 70%)`,
          }}
        >
          <Icon name="chart" size={34} color="var(--accent)" strokeWidth={1.4} />
        </div>
        </div>

        {!poll.avsluttet && !tidligere && (
          <KommentarerPaaKort
            kommentarer={kommentarer}
            scope={{ type: 'poll', id: poll.id }}
            totaltAntall={totaltKommentarer}
            profiler={profiler}
            brukerId={brukerId}
          />
        )}
      </Card>
    </Link>
  )
}
