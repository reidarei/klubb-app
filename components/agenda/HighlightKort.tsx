import Link from 'next/link'
import Image from 'next/image'
import Icon from '@/components/ui/Icon'
import Pill, { IKveldChip } from '@/components/ui/Pill'
import Placeholder from '@/components/ui/Placeholder'
import Avatar from '@/components/ui/Avatar'
import { formaterDato } from '@/lib/dato'

type Deltaker = { navn: string; src?: string | null; rolle?: string | null }

export type HighlightKortData = {
  id: string
  type: string // 'tur' | 'moete'
  tittel: string
  start_tidspunkt: string
  oppmoetested: string | null
  bilde_url?: string | null
  antallJa: number
  deltakereForhand: Deltaker[] // opptil 3 for overlappende avatarer
  minStatus: 'ja' | 'kanskje' | 'nei' | null
}

function sceneFor(type: string): 'tur' | 'møte' | 'event' {
  if (type === 'tur') return 'tur'
  if (type === 'moete') return 'møte'
  return 'event'
}

function typeLabel(type: string): string {
  if (type === 'tur') return 'Tur'
  if (type === 'moete') return 'Møte'
  return 'Annet'
}

function statusPill(status: HighlightKortData['minStatus']) {
  if (status === 'ja') return { variant: 'success' as const, tekst: 'Du er med' }
  if (status === 'kanskje') return { variant: 'accent' as const, tekst: 'Kanskje' }
  if (status === 'nei') return { variant: 'danger' as const, tekst: 'Du står over' }
  return { variant: 'accent' as const, tekst: 'Ikke svart' }
}

export default function HighlightKort({ arr }: { arr: HighlightKortData }) {
  const status = statusPill(arr.minStatus)
  const datoTekst = `${formaterDato(arr.start_tidspunkt, 'd. MMM')} · kl. ${formaterDato(arr.start_tidspunkt, 'HH:mm')}`

  return (
    <Link
      href={`/arrangementer/${arr.id}`}
      style={{
        display: 'block',
        textDecoration: 'none',
        color: 'inherit',
        position: 'relative',
        background: 'var(--bg-elevated)',
        backdropFilter: 'var(--blur-card)',
        WebkitBackdropFilter: 'var(--blur-card)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius)',
        boxShadow: '0 8px 30px var(--accent-soft), 0 0 0 1px var(--border-strong)',
        overflow: 'hidden',
      }}
    >
      {/* Hero */}
      {arr.bilde_url ? (
        <div style={{ position: 'relative', aspectRatio: '16/10' }}>
          <Image
            src={arr.bilde_url}
            alt=""
            fill
            style={{ objectFit: 'cover' }}
            sizes="(max-width: 512px) 100vw, 512px"
            priority
          />
        </div>
      ) : (
        <Placeholder label={`image · ${typeLabel(arr.type).toLowerCase()}`} aspectRatio="16/10" type={sceneFor(arr.type)} />
      )}

      {/* I kveld-chip */}
      <div style={{ position: 'absolute', top: 12, right: 12 }}>
        <IKveldChip />
      </div>

      {/* Innhold */}
      <div style={{ padding: '18px 18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Pill variant="accent" small>
            {typeLabel(arr.type)}
          </Pill>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{datoTekst}</span>
        </div>

        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            fontWeight: 500,
            color: 'var(--text-primary)',
            letterSpacing: '-0.3px',
            margin: '0 0 8px',
            lineHeight: 1.15,
          }}
        >
          {arr.tittel}
        </h3>

        {arr.oppmoetested && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <Icon name="mapPin" size={13} color="var(--text-tertiary)" />
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{arr.oppmoetested}</span>
          </div>
        )}

        {/* Bunn-rad: avatarer + påmeldt + status */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            paddingTop: 14,
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
            {arr.deltakereForhand.slice(0, 3).map((d, i) => (
              <div key={i} style={{ marginLeft: i === 0 ? 0 : -6, zIndex: 10 - i, position: 'relative' }}>
                <Avatar
                  name={d.navn}
                  size={24}
                  src={d.src ?? undefined}
                  rolle={d.rolle}
                />
              </div>
            ))}
            <span
              style={{
                marginLeft: 10,
                fontSize: 12,
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap',
              }}
            >
              {arr.antallJa} påmeldt
            </span>
          </div>
          <Pill variant={status.variant}>{status.tekst}</Pill>
        </div>
      </div>
    </Link>
  )
}
