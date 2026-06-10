import Link from 'next/link'
import Icon from '@/components/ui/Icon'
import { formaterDato, aarHvisAvvik } from '@/lib/dato'
import { KLUBB_KORTNAVN, KLUBB_NAVN_LINJE_1, KLUBB_NAVN_LINJE_2 } from '@/lib/klubb-config'

export type KlubbJubileumData = {
  id: string
  dato: string // YYYY-MM-DD for kommende stiftelsesdag
  alder: number
}

export default function KlubbJubileumKort({ jubileum }: { jubileum: KlubbJubileumData }) {
  const mnd = formaterDato(jubileum.dato, 'MMM').toUpperCase()
  const dag = formaterDato(jubileum.dato, 'd')
  const aar = aarHvisAvvik(jubileum.dato)

  return (
    <Link
      href="/klubbinfo"
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
        <Icon name="sparkle" size={24} color="var(--accent)" strokeWidth={1.25} />
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
          {KLUBB_KORTNAVN}{' '}
          <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>
            fyller {jubileum.alder}
          </span>
        </h3>
      </div>

      <div
        style={{
          width: 108,
          flexShrink: 0,
          borderLeft: '0.5px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 10px',
          fontFamily: 'var(--font-display)',
          color: 'var(--accent)',
          fontSize: 15,
          fontWeight: 500,
          lineHeight: 1.05,
          letterSpacing: '-0.3px',
          textAlign: 'center',
        }}
        aria-hidden="true"
      >
        <span style={{ fontStyle: 'italic' }}>{KLUBB_NAVN_LINJE_1}</span>
        <span>{KLUBB_NAVN_LINJE_2}</span>
      </div>
    </Link>
  )
}
