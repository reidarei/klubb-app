import Link from 'next/link'

export type UtkastData = {
  id: string
  tittel: string
  malNavn: string
  aar: number
  ansvarlige: string[]
  ansvarligeIds: string[]
}

// «Ola», «Ola og Kari», «Ola, Kari og Per»
function formaterAnsvarlige(navn: string[]): string {
  if (navn.length <= 1) return navn[0] ?? ''
  if (navn.length === 2) return `${navn[0]} og ${navn[1]}`
  return `${navn.slice(0, -1).join(', ')} og ${navn[navn.length - 1]}`
}

// Bygger et stabilt anker-id som matcher arrangoransvar-siden, slik at
// lenken navigerer rett til riktig rad og kan purres der.
export function utkastAnkerId(aar: number, malNavn: string): string {
  const slug = malNavn
    .toLowerCase()
    .replace(/[æå]/g, 'a')
    .replace(/ø/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `ansvar-${aar}-${slug}`
}

export default function UtkastKort({
  utkast,
  meg,
}: {
  utkast: UtkastData
  meg: string
}) {
  // Er innlogget bruker blant de ansvarlige? Da leder vi rett til skjemaet
  // for å opprette det konkrete arrangementet med mal forhåndsvalgt. Andre
  // sendes til arrangør-oversikten med anker til riktig rad (for purring).
  const erAnsvarlig = utkast.ansvarligeIds.includes(meg)
  const href = erAnsvarlig
    ? `/arrangementer/ny?mal=${encodeURIComponent(utkast.malNavn)}&aar=${utkast.aar}`
    : `/arrangoransvar#${utkastAnkerId(utkast.aar, utkast.malNavn)}`
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        gap: 0,
        alignItems: 'stretch',
        overflow: 'hidden',
        borderRadius: 'var(--radius-card)',
        border: '1px dashed var(--border-strong)',
        background: 'transparent',
        textDecoration: 'none',
        color: 'inherit',
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
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--text-tertiary)',
            letterSpacing: '1.6px',
            fontWeight: 600,
            textTransform: 'uppercase',
            marginBottom: 8,
          }}
        >
          Mangler info
        </div>

        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 18,
            fontWeight: 500,
            color: 'var(--text-secondary)',
            letterSpacing: '-0.2px',
            margin: '0 0 6px',
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {utkast.tittel}
        </h3>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: 'var(--text-tertiary)',
          }}
        >
          {utkast.ansvarlige.length > 0 ? (
            <>
              <span style={{ color: 'var(--text-secondary)' }}>
                {formaterAnsvarlige(utkast.ansvarlige)}
              </span>
              <span>skal arrangere</span>
            </>
          ) : (
            <span>Ingen ansvarlig ennå</span>
          )}
        </div>
      </div>

      <div
        style={{
          width: 108,
          flexShrink: 0,
          position: 'relative',
          borderLeft: '1px dashed var(--border-strong)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 54,
            fontWeight: 300,
            color: 'var(--text-tertiary)',
            letterSpacing: '-2px',
            lineHeight: 1,
            opacity: 0.55,
          }}
          aria-hidden="true"
        >
          ?
        </span>
      </div>
    </Link>
  )
}
