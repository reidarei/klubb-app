'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { KART_BREDDE as W, KART_HOEYDE as H, LAND_BANER } from '@/lib/europa-kart-data'

// Bildealbum koblet til en tur (via album.arrangement_id). Vises som lenke i
// detaljkortet så gutta kan hoppe rett fra stedet til bildene.
export type AlbumKort = { id: string; antall: number; thumb: string | null }

export type Sted = {
  by: string
  x: number
  y: number
  turer: { aar: number; tittel: string; album: AlbumKort | null }[]
}

type Props = {
  steder: Sted[]
}

// Prosent-posisjon i containeren (som har nøyaktig samme aspekt som viewBox).
const pctX = (x: number) => `${(x / W) * 100}%`
const pctY = (y: number) => `${(y / H) * 100}%`

// Usynlig tap-treffområde rundt hver markør. Prikkene er små (7–15 px), men
// en finger dekker ~44 px — uten et større treffområde tolkes et vanlig
// (litt bevegelig) trykk som scroll, og klikket avlyses. 44 px følger Apples
// minste anbefalte tap-mål.
const TREFF = 44

export default function EuropaKart({ steder }: Props) {
  const [valgt, setValgt] = useState<string | null>(null)
  const valgtSted = steder.find(s => s.by === valgt) ?? null

  // Escape lukker det valgte stedet — samme mønster som AlbumLightbox.
  useEffect(() => {
    if (valgt === null) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setValgt(null)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [valgt])

  return (
    <div>
      <div
        onClick={() => setValgt(null)}
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: `${W} / ${H}`,
          // Lar etiketter nær kanten få litt luft uten å tvinge horisontal scroll.
          overflow: 'visible',
        }}
      >
        {/* Landmasse + reiselinjer i SVG (samme koordinatrom som markørene) */}
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
          aria-hidden="true"
        >
          {LAND_BANER.map((d, i) => (
            <path
              key={i}
              d={d}
              fill="var(--bg-elevated-2)"
              stroke="var(--border-subtle)"
              strokeWidth={0.8}
              strokeLinejoin="round"
            />
          ))}
        </svg>

        {/* Sted-markører */}
        {steder.map(s => {
          const erValgt = valgt === s.by
          const dempet = valgt !== null && !erValgt
          // Radius vokser litt med antall turer (München = 3 → størst)
          const r = 7 + Math.min(s.turer.length - 1, 3) * 2
          return (
            <Punkt key={s.by} x={s.x} y={s.y}>
              {/* Transparent 44 px-knapp = treffområde. Prikken tegnes inni. */}
              <button
                type="button"
                onClick={e => {
                  // Uten stopPropagation lukker klikket det vi nettopp valgte igjen,
                  // fordi containerens onClick (trykk-utenfor-lukker) fyrer etterpå.
                  e.stopPropagation()
                  setValgt(erValgt ? null : s.by)
                }}
                aria-label={`${s.by}, ${s.turer.length} tur${s.turer.length > 1 ? 'er' : ''}`}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  transform: 'translate(-50%, -50%)',
                  width: TREFF,
                  height: TREFF,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  margin: 0,
                  cursor: 'pointer',
                  touchAction: 'manipulation',
                  WebkitTapHighlightColor: 'transparent',
                  // 44 px-treffområdene overlapper for flere bypar på smale skjermer
                  // (München/Berlin, København/Berlin, m.fl.) — uten dette vinner
                  // alltid den senere byen i DOM-rekkefølge, uansett hvem man trykker
                  // på nytt på (#508).
                  zIndex: erValgt ? 2 : 1,
                }}
              >
                <span
                  style={{
                    display: 'block',
                    width: r,
                    height: r,
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    border: erValgt ? '2px solid var(--bg)' : 'none',
                    boxShadow: erValgt ? '0 0 0 2px var(--accent)' : '0 0 0 3px var(--accent-soft)',
                    opacity: dempet ? 0.35 : 1,
                    transition: 'opacity 120ms, box-shadow 120ms',
                  }}
                />
              </button>
              <Etikett
                x={s.x}
                r={r}
                tekst={s.by}
                antall={s.turer.length}
                fremhevet={erValgt}
                dempet={dempet}
              />
            </Punkt>
          )
        })}
      </div>

      {/* Detaljkort: valgt sted, eller hint */}
      <div
        style={{
          marginTop: 18,
          minHeight: 64,
          padding: '14px 16px',
          border: '0.5px solid var(--border-subtle)',
          borderRadius: 10,
          background: 'var(--bg-elevated)',
        }}
      >
        {valgtSted ? (
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  flex: 1,
                  fontFamily: 'var(--font-display)',
                  fontSize: 22,
                  fontWeight: 500,
                  letterSpacing: '-0.4px',
                  color: 'var(--text-primary)',
                }}
              >
                {valgtSted.by}
              </div>
              {/* Eksplisitt lukk-knapp — trykk-utenfor og Escape lukker også,
                  men touch-brukere kjenner ikke alltid disse gestene (#508) */}
              <button
                type="button"
                onClick={() => setValgt(null)}
                aria-label="Lukk"
                style={{
                  flexShrink: 0,
                  // Samme 44 px-mål som markørene (se TREFF): dette er den eneste
                  // oppdagbare utveien for touch. Negativ margin nøytraliserer
                  // veksten så tittelraden ikke blir høyere enn før.
                  width: TREFF,
                  height: TREFF,
                  margin: -8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  padding: 0,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path
                    d="M4 4l10 10M14 4L4 14"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            {valgtSted.turer
              .slice()
              .sort((a, b) => a.aar - b.aar)
              .map(t => (
                <div
                  key={t.aar}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '5px 0',
                    fontSize: 14,
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--accent)',
                      minWidth: 38,
                    }}
                  >
                    {t.aar}
                  </span>
                  <span>{t.tittel}</span>
                  {/* Lenke til turens bildealbum (kun turer som faktisk har ett) */}
                  {t.album && (
                    <Link
                      href={`/album/${t.album.id}`}
                      style={{
                        marginLeft: 'auto',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 7,
                        textDecoration: 'none',
                        flexShrink: 0,
                      }}
                    >
                      {t.album.thumb && (
                        <span
                          style={{
                            position: 'relative',
                            width: 28,
                            height: 28,
                            borderRadius: 5,
                            overflow: 'hidden',
                            flexShrink: 0,
                            background: 'var(--bg-elevated-2)',
                          }}
                        >
                          <Image
                            src={t.album.thumb}
                            alt=""
                            fill
                            sizes="28px"
                            style={{ objectFit: 'cover' }}
                          />
                        </span>
                      )}
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                          color: 'var(--accent)',
                          letterSpacing: '1px',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Bilder{t.album.antall > 0 ? ` (${t.album.antall})` : ''}
                      </span>
                    </Link>
                  )}
                </div>
              ))}
          </div>
        ) : (
          <div
            style={{
              fontSize: 13,
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-body)',
              lineHeight: 1.5,
            }}
          >
            Trykk på en by for å se hvilke år gutta var der.
          </div>
        )}
      </div>
    </div>
  )
}

// Null-stort anker plassert nøyaktig på (x,y). Barna posisjoneres absolutt
// relativt til dette punktet, slik at markør og etikett henger sammen.
function Punkt({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  return (
    <div style={{ position: 'absolute', left: pctX(x), top: pctY(y), width: 0, height: 0 }}>
      {children}
    </div>
  )
}

// Bynavn like ved markøren. Byer langt øst får etiketten til venstre for å
// ikke skli ut av kartkanten. `r` = prikkens diameter, brukes til å plassere
// teksten rett under prikken uansett markørstørrelse.
function Etikett({
  x,
  r,
  tekst,
  antall,
  fremhevet,
  dempet,
}: {
  x: number
  r: number
  tekst: string
  antall?: number
  fremhevet?: boolean
  dempet?: boolean
}) {
  const venstre = x > W * 0.66
  return (
    <span
      style={{
        position: 'absolute',
        top: r / 2 + 4,
        ...(venstre ? { right: 6 } : { left: 6 }),
        whiteSpace: 'nowrap',
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        letterSpacing: '0.3px',
        color: fremhevet ? 'var(--accent)' : dempet ? 'var(--text-tertiary)' : 'var(--text-secondary)',
        fontWeight: fremhevet ? 600 : 400,
        opacity: dempet ? 0.5 : 1,
        pointerEvents: 'none',
      }}
    >
      {tekst}
      {/* Bruker ASCII-x, ikke midtprikk (·) eller ekte multiplikasjonstegn (×):
          prikken ble lest som skitt på skjermen, ikke som et antall (#508) */}
      {antall && antall > 1 ? <span style={{ opacity: 0.6 }}> x{antall}</span> : null}
    </span>
  )
}
