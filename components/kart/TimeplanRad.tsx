'use client'

import Avatar from '@/components/ui/Avatar'
import { formaterDato } from '@/lib/dato'
import type { TimeplanPost } from './TimeplanPanel'

type Props = {
  post: TimeplanPost
  /** Tidspunktet er passert — vises dempet, ikke skjult (#716). */
  erPassert: boolean
  kanFjerne: boolean
  /** Optimistisk rad som ennå ikke er bekreftet av serveren. */
  sender: boolean
  onSenterPaa: (lat: number, lng: number) => void
  onFjern: (id: string) => void
}

export default function TimeplanRad({ post, erPassert, kanFjerne, sender, onSenterPaa, onFjern }: Props) {
  const klokke = formaterDato(post.tidspunkt, 'HH:mm')
  return (
    <div
      data-testid="timeplan-rad"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '9px 2px',
        borderBottom: '0.5px solid var(--border-subtle)',
        opacity: erPassert ? 0.5 : sender ? 0.7 : 1,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--kart-tekst)',
          minWidth: 40,
          paddingTop: 2,
        }}
      >
        {klokke}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            color: 'var(--text-primary)',
            overflowWrap: 'anywhere',
          }}
        >
          {post.tekst}
          {post.lat !== null && post.lng !== null && (
            <button
              type="button"
              onClick={() => onSenterPaa(post.lat as number, post.lng as number)}
              aria-label="Vis stedet på kartet"
              data-testid="timeplan-vis-punkt"
              style={{
                marginLeft: 6,
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: 'var(--accent)',
              }}
            >
              📍
            </button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
          <Avatar
            name={post.opprettetAvNavn}
            src={post.opprettetAvBildeUrl}
            rolle={post.opprettetAvRolle}
            size={16}
          />
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-tertiary)' }}>
            {post.opprettetAvNavn}
          </span>
        </div>
      </div>
      {kanFjerne && !sender && (
        <button
          type="button"
          onClick={() => {
            // window.confirm(), ikke swipe-to-delete — samme mønster som
            // chatten (#716-planlegging).
            if (window.confirm(`Fjerne «${post.tekst}»?`)) onFjern(post.id)
          }}
          aria-label={`Fjern posten «${post.tekst}»`}
          data-testid="timeplan-fjern"
          style={{
            background: 'none',
            border: 'none',
            padding: '2px 4px',
            cursor: 'pointer',
            color: 'var(--text-tertiary)',
            fontSize: 17,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      )}
    </div>
  )
}
