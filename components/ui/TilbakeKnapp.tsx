// Ingen 'use client': ren presentasjon rundt next/link, brukes fra server-komponenter.
import Link from 'next/link'
import Icon from '@/components/ui/Icon'
import { MIN_TREFFMAAL_PX } from '@/lib/konstanter'

const SIRKEL = 36
// Kun HORISONTAL negativ margin: en vertikal utvidelse oppover havner under sticky
// TopHeader (zIndex 30) og stjeler pluss-punktet (#700), så den usynlige flaten tar
// heller plass i flyten (44 px høy) i stedet for å overlappe.
const UTVID = (MIN_TREFFMAAL_PX - SIRKEL) / 2

type Props = {
  href: string
  /** Destinasjon («Album», «Klubbinfo») — leses opp av VoiceOver som «Tilbake til X». */
  til?: string
}

/**
 * Tilbake = rund pil, aldri tekst (#700). Samme form som pila på arrangementsiden, men med
 * vanlig flate-bakgrunn (ikke blur-overlay, som kun gir mening oppå et bilde).
 */
export default function TilbakeKnapp({ href, til }: Props) {
  return (
    <Link
      href={href}
      aria-label={til ? `Tilbake til ${til}` : 'Tilbake'}
      style={{
        // Egen stabling over nabo-blokker, samme begrunnelse som TreffPille (#700).
        position: 'relative',
        zIndex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: MIN_TREFFMAAL_PX,
        height: MIN_TREFFMAAL_PX,
        marginLeft: -UTVID,
        textDecoration: 'none',
      }}
    >
      <span
        style={{
          width: SIRKEL,
          height: SIRKEL,
          borderRadius: '50%',
          background: 'var(--bg-elevated)',
          border: '0.5px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon
          name="chevron"
          size={16}
          color="var(--text-primary)"
          style={{ transform: 'rotate(180deg)' }}
        />
      </span>
    </Link>
  )
}
