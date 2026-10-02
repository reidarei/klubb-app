// Ingen 'use client': ren presentasjon rundt next/link, brukes fra server-komponenter.
import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { MIN_TREFFMAAL_PX } from '@/lib/konstanter'
import { treffflateRundt } from '@/components/ui/Treffflate'

// Tilbake-navigasjon er IKKE en tekstlenke: bruk TilbakeKnapp (rund pil).
// Konservativt LAVERE enn reell linjehøyde (små mono-tekster er ~13–17 px): gir litt mer
// usynlig utvidelse enn strengt nødvendig, så en finjustering av skrift/linjehøyde ikke
// kan sende lenken under 44 px (samme grep som SkjemaBar, #700).
const SYNLIG_HOYDE = 12
const TREFF = treffflateRundt({ hoyde: SYNLIG_HOYDE })

type Props = {
  href: string
  children: ReactNode
  /**
   * Typografi/farge/layout. marginTop/marginBottom (tall) legges SAMMEN med den negative
   * treffflate-marginen; padding og minWidth styres av komponenten.
   */
  style?: Omit<
    CSSProperties,
    | 'margin'
    | 'padding'
    | 'paddingTop'
    | 'paddingBottom'
    | 'minWidth'
    | 'minHeight'
  >
  /**
   * Fri plass (px) over lenka før noe annet ligger der. Settes når lenka står helt øverst på
   * siden: den usynlige utvidelsen oppover havner ellers under den sticky TopHeader-en
   * (zIndex 30), som da stjeler det øverste treffpunktet (#700). Resten av utvidelsen
   * flyttes nedover, så totalhøyden fortsatt er 44 px.
   */
  plassOver?: number
}

/**
 * Frittstående tekstlenke («Se alle (3) →») med usynlig 44 px treffflate (#700 PR 3): padding oppe og nede
 * som kanselleres av lik negativ margin, så teksten står nøyaktig der den stod før.
 * Bredde: minWidth 44, teksten står venstrejustert, utvidelsen havner til høyre.
 */
export default function TekstLenke({ href, children, style, plassOver }: Props) {
  const tall = (v: unknown) => (typeof v === 'number' ? v : 0)
  const opp = plassOver === undefined ? TREFF.utvidY : Math.min(TREFF.utvidY, plassOver)
  const ned = TREFF.utvidY * 2 - opp
  return (
    <Link
      href={href}
      style={{
        display: 'inline-block',
        textDecoration: 'none',
        // Egen stabling over nabo-blokker: den usynlige utvidelsen overlapper naboene (negativ
        // margin), og en senere blokk i flyten (tittelen under lenka) vinner ellers hit-testen
        // i overlappen og stjeler trykket (#700).
        position: 'relative',
        zIndex: 1,
        ...style,
        minWidth: MIN_TREFFMAAL_PX,
        paddingTop: opp,
        paddingBottom: ned,
        marginTop: tall(style?.marginTop) - opp,
        marginBottom: tall(style?.marginBottom) - ned,
      }}
    >
      {children}
    </Link>
  )
}

