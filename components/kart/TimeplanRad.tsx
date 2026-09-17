'use client'

import Avatar from '@/components/ui/Avatar'
import { formaterDato } from '@/lib/dato'
import { aapneVeibeskrivelse } from '@/lib/kart-navigasjon'
import { avstandM, formaterAvstand } from '@/lib/geo-avstand'
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
  /** Din siste delte posisjon (#728) — null hvis du ikke deler. */
  megPunkt: { lat: number; lng: number } | null
}

export default function TimeplanRad({
  post,
  erPassert,
  kanFjerne,
  sender,
  onSenterPaa,
  onFjern,
  megPunkt,
}: Props) {
  const klokke = formaterDato(post.tidspunkt, 'HH:mm')
  // Trykkbar når posten har EN ELLER ANNEN stedsangivelse (#732). Adresse
  // foretrekkes over koordinat ved navigering — Google er bedre på
  // gateadresser enn vår Nominatim-geokoding, se lib/kart-navigasjon.ts.
  const trykkbar = post.adresse !== null || (post.lat !== null && post.lng !== null)
  const naviger = () => {
    if (post.adresse !== null) {
      aapneVeibeskrivelse({ adresse: post.adresse })
    } else if (post.lat !== null && post.lng !== null) {
      aapneVeibeskrivelse({ lat: post.lat, lng: post.lng })
    }
  }
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
        {/* Hele raden er trykkbar til Google Maps når det finnes ET STED å
            navigere til (#732) — uten lokasjon er dette ren tekst, ingen
            knapp, ingen cursor: pointer. 📍 er en EGEN, mindre handling
            («vis stedet PÅ VÅRT kart») som kun vises når vi faktisk har et
            koordinat å sentrere på — en adresse alene har ikke det. */}
        {trykkbar ? (
          <button
            type="button"
            onClick={naviger}
            aria-label={`Veibeskrivelse til «${post.tekst}» i Google Maps`}
            data-testid="timeplan-naviger"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              color: 'var(--text-primary)',
              overflowWrap: 'anywhere',
              background: 'none',
              border: 'none',
              padding: 0,
              margin: 0,
              textAlign: 'left',
              cursor: 'pointer',
              display: 'block',
              width: '100%',
            }}
          >
            {post.tekst}
          </button>
        ) : (
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              color: 'var(--text-primary)',
              overflowWrap: 'anywhere',
            }}
          >
            {post.tekst}
          </div>
        )}
        {post.lat !== null && post.lng !== null && (
          <button
            type="button"
            onClick={() => onSenterPaa(post.lat as number, post.lng as number)}
            aria-label="Vis stedet på kartet"
            data-testid="timeplan-vis-punkt"
            style={{
              marginTop: 2,
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: 'var(--accent)',
              fontSize: 13,
            }}
          >
            📍 Vis på kartet
          </button>
        )}
        {post.lat !== null && post.lng !== null && megPunkt && (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-tertiary)' }}>
            {formaterAvstand(avstandM(megPunkt.lat, megPunkt.lng, post.lat, post.lng))} unna
          </div>
        )}
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
