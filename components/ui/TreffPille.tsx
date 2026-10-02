// Ingen 'use client' (#700 PR 3): kun presentasjon, brukes fra både server- og klientkomponenter.
import Link from 'next/link'
import type { ComponentProps, CSSProperties, ReactNode } from 'react'
import { treffflateRundt } from '@/components/ui/Treffflate'
import { MIN_TREFFMAAL_PX } from '@/lib/konstanter'

// Pille-knapper og -lenker MED synlig bakgrunn/kant: utvidelsen kan ikke legges som padding på selve
// elementet (da vokser bakgrunnen med). Derfor to lag, jf. CLAUDE.md § Policy: Trykkflater:
// det YTRE elementet (lenke/knapp) er usynlig og bærer treffflaten via padding + lik negativ margin,
// det INDRE <span>-et bærer bakgrunn, kant, padding og typografi — nøyaktig som pillen så ut før.

// Konservativt LAVERE enn en typisk 12–13 px pille (~33–36 px): litt mer usynlig utvidelse enn
// strengt nødvendig, så en finjustering av skrift/padding ikke sender den under 44 px.
const STANDARD_SYNLIG_HOYDE = 30

// Kun layout-egenskaper kallestedet får styre på det ytre elementet. Vertikale marger legges
// SAMMEN med den negative treffflate-marginen (ikke overskrevet av den).
type YtreStil = Pick<
  CSSProperties,
  'marginTop' | 'marginBottom' | 'marginLeft' | 'marginRight' | 'alignSelf' | 'flex' | 'flexShrink' | 'width' | 'display' | 'position' | 'zIndex' | 'pointerEvents'
>

type Felles = {
  /** Bakgrunn, kant, padding, typografi — alt som gjør pillen synlig. */
  pilleStil: CSSProperties
  /** Anslått synlig høyde (px). Bruk lavere enn reell høyde om du er usikker. */
  synligHoyde?: number
  /** Layout på det ytre elementet (marger, flex, bredde). */
  style?: YtreStil
  children: ReactNode
}

function ytreGeometri(synligHoyde: number, style: YtreStil = {}): CSSProperties {
  const { stil, utvidY } = treffflateRundt({ hoyde: synligHoyde })
  const tall = (v: unknown) => (typeof v === 'number' ? v : 0)
  return {
    display: 'inline-block',
    textDecoration: 'none',
    background: 'none',
    border: 'none',
    color: 'inherit',
    font: 'inherit',
    // Egen stabling over nabo-blokker, samme begrunnelse som TekstLenke (#700):
    // den usynlige utvidelsen overlapper naboene og ellers vinner de hit-testen der.
    position: 'relative',
    zIndex: 1,
    ...style,
    // En smal tekstknapp («Avbryt», 9 px) er under 44 px bred også; utvidelsen havner på høyre side.
    minWidth: MIN_TREFFMAAL_PX,
    paddingTop: stil.paddingTop,
    paddingBottom: stil.paddingBottom,
    paddingLeft: 0,
    paddingRight: 0,
    marginTop: tall(style.marginTop) - utvidY,
    marginBottom: tall(style.marginBottom) - utvidY,
  }
}

export function PilleLenke({
  pilleStil,
  synligHoyde = STANDARD_SYNLIG_HOYDE,
  style,
  children,
  ...lenkeProps
}: Felles & Omit<ComponentProps<typeof Link>, 'style' | 'children'>) {
  return (
    <Link {...lenkeProps} style={ytreGeometri(synligHoyde, style)}>
      <span style={{ display: 'block', ...pilleStil }}>{children}</span>
    </Link>
  )
}

export function PilleKnapp({
  pilleStil,
  synligHoyde = STANDARD_SYNLIG_HOYDE,
  style,
  children,
  ...knappProps
}: Felles & Omit<ComponentProps<'button'>, 'style' | 'children'>) {
  return (
    <button
      type="button"
      {...knappProps}
      style={{ ...ytreGeometri(synligHoyde, style), cursor: knappProps.disabled ? 'default' : 'pointer', touchAction: 'manipulation' }}
    >
      <span style={{ display: 'block', ...pilleStil }}>{children}</span>
    </button>
  )
}

// Vanlig <a> (ikke next/link) for mål som ikke er sider: filnedlasting, API-ruter (ICS).
// next/link ville prefetchet og klient-navigert til en rute som ikke rendrer en side.
export function PilleAnker({
  pilleStil,
  synligHoyde = STANDARD_SYNLIG_HOYDE,
  style,
  children,
  ...ankerProps
}: Felles & Omit<ComponentProps<'a'>, 'style' | 'children'>) {
  return (
    <a {...ankerProps} style={ytreGeometri(synligHoyde, style)}>
      <span style={{ display: 'block', ...pilleStil }}>{children}</span>
    </a>
  )
}
