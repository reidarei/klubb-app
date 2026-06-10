import Link from 'next/link'
import Icon from '@/components/ui/Icon'
import Avatar from '@/components/ui/Avatar'
import { formaterDato, aarHvisAvvik } from '@/lib/dato'

export type BursdagData = {
  id: string
  profilId: string
  navn: string
  dato: string // YYYY-MM-DD
  alder: number
  bildeUrl?: string | null
  rolle?: string | null
}

export default function BursdagKort({ bursdag }: { bursdag: BursdagData }) {
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
        <Icon name="wine" size={24} color="var(--text-tertiary)" strokeWidth={1.25} />
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
          <span>
            {dag}. {mnd}{aar && ` ${aar}`}
          </span>
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
