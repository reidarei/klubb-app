import Link from 'next/link'
import { formaterDato } from '@/lib/dato'

/**
 * Ett uleste varsel som rad i «Varsler»-boksen på /profil. Lenker til
 * /varsler/{id} (som markerer lest ved åpning, jf. MarkerLestEffekt) — samme
 * mål som radene i den fulle lista.
 */
export default function UlestVarselRad({
  id,
  tittel,
  opprettet,
}: {
  id: string
  tittel: string
  opprettet: string | null
}) {
  return (
    <Link
      href={`/varsler/${id}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minHeight: 54,
        padding: '8px 14px',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      {/* Prikken er alltid «ulest» her — raden vises kun for uleste. */}
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: 'var(--accent)',
          flexShrink: 0,
          boxShadow: '0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent)',
        }}
      />
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 15,
            fontWeight: 500,
            color: 'var(--text-primary)',
            lineHeight: 1.25,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {tittel}
        </span>
        {opprettet && (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.3 }}>
            {formaterDato(opprettet, 'd. MMM · HH:mm')}
          </span>
        )}
      </span>
    </Link>
  )
}
