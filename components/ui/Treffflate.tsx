// Ingen 'use client' (#700): treffflateRundt() brukes også fra server-komponenten
// FilterChip, og <Treffflate> har verken hooks eller browser-API-er.
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import { MIN_TREFFMAAL_PX } from '@/lib/konstanter'

// Usynlig 44 px tap-mål rundt en liten kontroll uten å endre hvordan den ser ut (#700).
// Passer IKKE — løs lokalt i stedet:
//   (a) Rader med senteravstand < 44 px (ReaksjonPicker): sett width/height direkte, ellers overlapper naboene.
//   (b) Leaflet-markører: Leaflet måler egen DOM — bruk iconSize, eller interactive:false.
//   (c) Inni overflow:hidden/auto: det utvidede treffområdet klippes bort.
//   (d) Oppå andre interaktive flater: styr med pointer-events (.chat-slett-knapp i globals.css).
//   (e) Sentrert med translate(-50%, -50%): negativ margin + transform regner feil — bruk width/height.

type Maal = { hoyde: number; bredde?: number }

// Utvidelse per akse opp til MIN_TREFFMAAL_PX (uten `bredde`: kun vertikalt). `stil` har
// kun longhands, så den ikke overskriver en kant kalleren allerede har satt.
export function treffflateRundt({ hoyde, bredde }: Maal) {
  const utvidY = Math.max(0, Math.ceil((MIN_TREFFMAAL_PX - hoyde) / 2))
  const utvidX = bredde === undefined ? 0 : Math.max(0, Math.ceil((MIN_TREFFMAAL_PX - bredde) / 2))

  const stil: CSSProperties = {
    paddingTop: utvidY,
    paddingBottom: utvidY,
    marginTop: -utvidY,
    marginBottom: -utvidY,
    ...(bredde === undefined
      ? {}
      : {
          paddingLeft: utvidX,
          paddingRight: utvidX,
          marginLeft: -utvidX,
          marginRight: -utvidX,
        }),
  }

  return {
    stil,
    utvidY,
    utvidX,
    // CHIP_RAD_GAP-fella (#508): to naboer som begge vokser inn i samme
    // mellomrom overlapper med mindre gapet dekker summen.
    minsteRadGap: utvidY * 2,
    minsteKolonneGap: utvidX * 2,
  }
}

type Synlig = number | { bredde: number; hoyde: number }

type Props = {
  /** Størrelsen på det SYNLIGE elementet (px). Ett tall = kvadrat. */
  synlig: Synlig
  children?: ReactNode
  /** Geometri (bredde/høyde/margin/padding) styres av primitiven og kan ikke overstyres herfra. */
  style?: Omit<
    CSSProperties,
    | 'width'
    | 'height'
    | 'margin'
    | 'marginTop'
    | 'marginBottom'
    | 'marginLeft'
    | 'marginRight'
    | 'padding'
    | 'paddingTop'
    | 'paddingBottom'
    | 'paddingLeft'
    | 'paddingRight'
  >
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style' | 'children' | 'type'>

/**
 * Usynlig 44×44 (minimum) tap-treffområde rundt en liten visuell kontroll.
 * Se filhodet for når denne IKKE er riktig verktøy.
 */
export default function Treffflate({ synlig, style, children, ...buttonProps }: Props) {
  const hoyde = typeof synlig === 'number' ? synlig : synlig.hoyde
  const bredde = typeof synlig === 'number' ? synlig : synlig.bredde
  const { utvidX, utvidY } = treffflateRundt({ hoyde, bredde })

  return (
    <button
      type="button"
      {...buttonProps}
      style={{
        // Kallerens style først, geometrien etter — kan ikke overstyres ved
        // runtime heller (typen hindrer det allerede).
        ...style,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: bredde + 2 * utvidX,
        height: hoyde + 2 * utvidY,
        padding: 0,
        background: 'transparent',
        border: 'none',
        // Symmetrisk negativ margin: kallerens top/right peker fortsatt på
        // samme visuelle plassering, også for absolutt posisjonerte knapper.
        marginTop: -utvidY,
        marginBottom: -utvidY,
        marginLeft: -utvidX,
        marginRight: -utvidX,
        touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {children}
    </button>
  )
}
