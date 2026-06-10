import Link from 'next/link'
import SectionLabel from '@/components/ui/SectionLabel'

/**
 * Innspill-knapp for Agenda.
 *
 * Meta-feedback om selve appen (forbedringer, feil) — IKKE et arrangement-forslag.
 * Lenker videre til eksisterende flyt (`/bli-utvikler`) som oppretter GitHub-issue
 * og trigger varsler via sendVarsel().
 */
export default function InnspillKnapp() {
  return (
    <section style={{ marginBottom: 28 }}>
      <SectionLabel>Savner du noe? Opplever du feil?</SectionLabel>
      <Link
        href="/bli-utvikler"
        style={{
          display: 'block',
          width: '100%',
          padding: '14px 0',
          textAlign: 'center',
          background: 'transparent',
          border: '1px solid var(--border)',
          borderRadius: 999,
          color: 'var(--accent)',
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          fontWeight: 500,
          letterSpacing: '0.2px',
          textDecoration: 'none',
        }}
      >
        Send innspill
      </Link>
    </section>
  )
}
