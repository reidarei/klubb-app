'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Avatar from '@/components/ui/Avatar'
import ReisemodusToggle from '@/components/reisemodus/ReisemodusToggle'
import { treffflateRundt } from '@/components/ui/Treffflate'
import { harGulGloed, kanAdministrere } from '@/lib/roller'
import { KLUBB_KORTNAVN } from '@/lib/klubb-config'

type Tab = {
  href: string
  label: string
  nokkel: 'agenda' | 'chat' | 'fond' | 'klubb'
  /** Path-prefikser som markerer denne tab-en som aktiv. */
  prefikser: string[]
  /** Kun synlig for admin, med mindre et eget flagg åpner den (#443). */
  kunAdmin?: boolean
}

const TABS: Tab[] = [
  { href: '/', label: 'Agenda', nokkel: 'agenda', prefikser: ['/poll', '/arrangementer', '/meldinger'] },
  // /samtaler aktiverer IKKE chat-tabben — privatmeldinger åpnes fra profilen (#256).
  // CHAT_TAB_PREFIKSER i lib/navigasjon.ts er noe annet (pull-to-refresh).
  { href: '/chat', label: 'Chat', nokkel: 'chat', prefikser: ['/chat'] },
  { href: '/klubbinfo', label: 'Klubb', nokkel: 'klubb', prefikser: ['/klubbinfo', '/kaaringer', '/album'] },
  // Bevisst lengst til høyre. For vanlige medlemmer styres den av bryteren i /innstillinger (#447).
  { href: '/fond', label: 'Fond', nokkel: 'fond', prefikser: ['/fond'], kunAdmin: true },
]

// «Har sett Fond-fanen» — ny-prikken vises til første besøk. Per enhet, bevisst.
const FOND_SETT_KEY = 'fond_fane_sett'

function erAktiv(tab: Tab, pathname: string): boolean {
  if (tab.href === '/') {
    if (pathname === '/') return true
    return tab.prefikser.some(p => pathname.startsWith(p))
  }
  return tab.prefikser.some(p => pathname.startsWith(p))
}

type Props = {
  brukerNavn?: string | null
  bildeUrl?: string | null
  rolle?: string | null
  /** True hvis det finnes uleste klubb-chat-meldinger fra andre. */
  ulestChat?: boolean
  /** True hvis det finnes uleste varsler i varsel_logg for denne brukeren. */
  ulestVarsler?: boolean
  /** True hvis Fond-fanen er skrudd på for vanlige medlemmer (app_innstillinger.fond_fane). */
  visFond?: boolean
  /** False hvis Chat-fanen er skrudd av for vanlige medlemmer (app_innstillinger.chat_fane).
      Default true — chat skal aldri forsvinne pga. manglende prop (f.eks. SSR-fallback). */
  visChat?: boolean
  /** Tur/møte pågår OG riktig klubb-flagg er på (#723/#780) — styrer om toggelen vises. */
  reisemodusTilgjengelig?: boolean
  /** Kartmodus er faktisk PÅ for denne brukeren — headeren skjuler seg da på /kart. */
  reisemodusPaa?: boolean
  /** Sendes videre til ReisemodusToggle; null når ingen modus er tilgjengelig. */
  kartmodus?: 'reise' | 'moete' | null
}

/**
 * Sticky topp-header med faner og profil-snarvei til høyre. Aktiv fane markeres
 * med en pill-bakgrunn som glir via transform; path-prefikser avgjør aktiv fane
 * på undersider. Ingen bottom-nav — se CLAUDE.md § Policy: Navigasjon.
 */
export default function TopHeader({ brukerNavn, bildeUrl, rolle, ulestChat = false, ulestVarsler = false, visFond = false, visChat = true, reisemodusTilgjengelig = false, reisemodusPaa = false, kartmodus = null }: Props) {
  const pathname = usePathname()

  // Fond: av som default, kan skrus på for medlemmer (#447). Chat: på som
  // default, kan skrus av. Admin ser begge alltid.
  const synligeTabs = TABS.filter(t => {
    if (t.nokkel === 'chat') return visChat || kanAdministrere(rolle)
    return !t.kunAdmin || kanAdministrere(rolle) || (t.nokkel === 'fond' && visFond)
  })
  const fondSynlig = synligeTabs.some(t => t.nokkel === 'fond')

  // ── Mobilgeometri (#723) ──────────────────────────────────────────────────
  // Innerbredde 358 px (390 px iPhone − 2×16 padding). Fire faner + avatar
  // tar ~344 px; med «Reise»-pillen i tillegg sprenger raden viewporten.
  // Terskelen teller ELEMENTER, ikke skjermbredde: målplattformen er én bredde
  // (CLAUDE.md § Målplattform), så en media query ville svart på feil spørsmål.
  const kompakt = synligeTabs.length + (reisemodusTilgjengelig ? 1 : 0) >= 5

  const MAAL = kompakt
    ? { ytrePadding: 10, ytreGap: 6, faneGap: 2, faneXPadding: 9, faneSkrift: 15, hoeyreGap: 6 }
    : { ytrePadding: 16, ytreGap: 8, faneGap: 6, faneXPadding: 14, faneSkrift: 17, hoeyreGap: 8 }

  // Synlig fanehøyde = tekstlinjen (lineHeight: 1) + 2 × 8 px padding = 31/33 px;
  // TREFF vokser tap-flaten usynlig til 44 px (#700).
  const faneSynligHoyde = MAAL.faneSkrift + 16
  const TREFF = treffflateRundt({ hoyde: faneSynligHoyde })
  // Avatar (38 px) skal IKKE få nye props (Policy: Avatar) — treffflaten
  // vokser på Link-omslaget rundt i stedet (#700).
  const AVATAR_TREFF = treffflateRundt({ hoyde: 38, bredde: 38 })

  // Settes i effect: localStorage finnes ikke under SSR (unngår hydration-mismatch).
  const [nyFondPrikk, setNyFondPrikk] = useState(false)
  useEffect(() => {
    if (!fondSynlig) return
    try {
      if (pathname.startsWith('/fond')) {
        localStorage.setItem(FOND_SETT_KEY, '1')
        setNyFondPrikk(false)
      } else if (!localStorage.getItem(FOND_SETT_KEY)) {
        setNyFondPrikk(true)
      }
    } catch { /* localStorage utilgjengelig (privat modus e.l.) — da vises ingen prikk */ }
  }, [pathname, fondSynlig])

  const tabsRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Map<string, HTMLAnchorElement | null>>(new Map())

  // null = ingen aktiv tab, ingen pill.
  const [pillRect, setPillRect] = useState<{ left: number; width: number } | null>(null)
  const [reduserBevegelse, setReduserBevegelse] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduserBevegelse(mq.matches)
    const handler = (e: MediaQueryListEvent) => setReduserBevegelse(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const maalPill = () => {
    const container = tabsRef.current
    if (!container) return
    const aktivTab = synligeTabs.find(t => erAktiv(t, pathname))
    if (!aktivTab) {
      setPillRect(null)
      return
    }
    const tabEl = tabRefs.current.get(aktivTab.nokkel)
    if (!tabEl) return
    // Relativt til tabs-containeren (ikke viewport) — det er pillens translateX.
    const cRect = container.getBoundingClientRect()
    const tRect = tabEl.getBoundingClientRect()
    setPillRect({ left: tRect.left - cRect.left, width: tRect.width })
  }

  // useLayoutEffect: måles før paint, så pillen ikke hopper ved navigasjon. På
  // første SSR-render finnes ingen pill; den popper inn etter hydrering —
  // akseptert for å slippe å duplisere aktiv-logikken (#200).
  // synligeTabs.length og kompakt i deps: begge endrer fanebredder uten
  // navigasjon (#447, #723).
  useLayoutEffect(() => {
    maalPill()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, synligeTabs.length, kompakt])

  // Re-mål ved resize/rotasjon, rAF-throttlet til én måling per frame.
  useEffect(() => {
    let raf = 0
    const onResize = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(maalPill)
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  const headerStyle: CSSProperties = {
    position: 'sticky',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    // --header-topp = safe-area + litt luft i installert app, se globals.css (#787)
    paddingTop: 'var(--header-topp)',
    borderBottom: '0.5px solid var(--border-subtle)',
  }

  const innerStyle: CSSProperties = {
    // Høyden speiles av --top-header-h i globals.css så andre sticky-elementer
    // (f.eks. VinnerBanner) kan stikke seg under headeren.
    height: 'var(--top-header-h, 60px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `0 ${MAAL.ytrePadding}px`,
    gap: MAAL.ytreGap,
  }

  const profilAktiv = pathname === '/profil'
  // Generalsekretærens gule glød + outline ville gitt to overlappende ringer.
  const visAktivOutline = profilAktiv && !harGulGloed(rolle ?? null)
  const visProfilPrikk = ulestVarsler && !profilAktiv

  // Kartmodus (#723): /kart er fullskjerm uten header; ReisemodusBar overtar.
  // Må stå ETTER alle hooks (rules of hooks).
  if (reisemodusPaa && pathname.startsWith('/kart')) return null

  return (
    <nav style={headerStyle} aria-label="Hovednavigasjon">
      {/* Bakgrunn + blur på eget lag bak innholdet. <nav> er sticky og danner
          egen stablingskontekst, så zIndex: -1 holder laget bak fanene. */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: -1,
          pointerEvents: 'none',
          background: 'var(--bg-header)',
          backdropFilter: 'var(--blur-nav)',
          WebkitBackdropFilter: 'var(--blur-nav)',
        }}
      />
      <div style={innerStyle}>
        {/* Tabs */}
        <div
          ref={tabsRef}
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: MAAL.faneGap,
            // Siste skanse: holder overflod inne i raden i stedet for å dytte
            // avataren ut av viewporten (flex-items har min-width: auto).
            minWidth: 0,
          }}
        >
          {/* Delt pill-bakgrunn som glir mellom tabs i stedet for crossfade per tab. */}
          {pillRect && (
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 0,
                width: pillRect.width,
                transform: `translateX(${pillRect.left}px)`,
                borderRadius: 999,
                background: 'var(--accent-soft)',
                pointerEvents: 'none',
                transition: reduserBevegelse
                  ? 'none'
                  : 'transform 220ms cubic-bezier(0.32, 0.72, 0, 1), width 220ms cubic-bezier(0.32, 0.72, 0, 1)',
                zIndex: 0,
              }}
            />
          )}

          {synligeTabs.map(tab => {
            const aktiv = erAktiv(tab, pathname)
            // Chat: uleste meldinger. Fond: ny fane ikke besøkt ennå.
            const visPrikk =
              (tab.nokkel === 'chat' && ulestChat && !aktiv) ||
              (tab.nokkel === 'fond' && nyFondPrikk && !aktiv)
            const tabStil: CSSProperties = {
              position: 'relative',
              zIndex: 1, // over pill-bakgrunnen
              paddingTop: 8 + TREFF.utvidY,
              paddingBottom: 8 + TREFF.utvidY,
              paddingLeft: MAAL.faneXPadding,
              paddingRight: MAAL.faneXPadding,
              // Nøytraliserer ekstra padding: kun tap-flaten vokser (#700).
              marginTop: -TREFF.utvidY,
              marginBottom: -TREFF.utvidY,
              borderRadius: 999,
              fontFamily: 'var(--font-body)',
              fontSize: MAAL.faneSkrift,
              whiteSpace: 'nowrap',
              fontWeight: aktiv ? 600 : 400,
              color: aktiv ? 'var(--accent)' : 'var(--text-tertiary)',
              opacity: aktiv ? 1 : 0.6,
              textDecoration: 'none',
              letterSpacing: '-0.3px',
              lineHeight: 1,
              transition: 'color 180ms ease, opacity 180ms ease',
            }
            return (
              <Link
                key={tab.href}
                href={tab.href}
                ref={(el) => { tabRefs.current.set(tab.nokkel, el) }}
                aria-current={aktiv ? 'page' : undefined}
                style={tabStil}
                prefetch
              >
                {tab.label}
                {visPrikk && (
                  <>
                    {/* Visuell prikk */}
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        // Ved det synlige fanehjørnet, ikke i den usynlige tap-flaten (#700).
                        top: 4 + TREFF.utvidY,
                        right: 6,
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: 'var(--accent)',
                        boxShadow: '0 0 0 2px var(--bg-header)',
                      }}
                    />
                    {/* Sr-only tillegg — overstyrer ikke tab-navnet som accessible name. */}
                    <span
                      style={{
                        position: 'absolute',
                        width: 1,
                        height: 1,
                        overflow: 'hidden',
                        clip: 'rect(0 0 0 0)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {tab.nokkel === 'fond' ? '(ny)' : '(ulest)'}
                    </span>
                  </>
                )}
              </Link>
            )
          })}
        </div>

        {/* Wrapperen holder toggle + avatar samlet til høyre; ellers ville
            space-between spredt tre barn over bredden (#723). */}
        <div style={{ display: 'flex', alignItems: 'center', gap: MAAL.hoeyreGap, flexShrink: 0 }}>
          {/* Fullskjerm-varianten på /kart er ReisemodusBar (#780). */}
          {reisemodusTilgjengelig && kartmodus && (
            <ReisemodusToggle paa={reisemodusPaa} variant="header" modus={kartmodus} />
          )}

          {/* Profil-snarvei */}
          <Link
            href="/profil"
            aria-label="Min profil"
            aria-current={profilAktiv ? 'page' : undefined}
            style={{
              position: 'relative',
              display: 'block',
              borderRadius: '50%',
              outline: visAktivOutline ? '1.5px solid var(--accent)' : 'none',
              // Minus utvidX (#700): outline tegnes rundt den utvidede flaten — ringen skal sitte som før.
              outlineOffset: 2 - AVATAR_TREFF.utvidX,
              flexShrink: 0,
              paddingTop: AVATAR_TREFF.utvidY,
              paddingBottom: AVATAR_TREFF.utvidY,
              paddingLeft: AVATAR_TREFF.utvidX,
              paddingRight: AVATAR_TREFF.utvidX,
              marginTop: -AVATAR_TREFF.utvidY,
              marginBottom: -AVATAR_TREFF.utvidY,
              marginLeft: -AVATAR_TREFF.utvidX,
              marginRight: -AVATAR_TREFF.utvidX,
            }}
          >
            <Avatar
              name={brukerNavn ?? KLUBB_KORTNAVN}
              src={bildeUrl ?? null}
              rolle={rolle ?? null}
              size={38}
            />
            {visProfilPrikk && (
              <>
                {/* Større enn fane-prikken: må konkurrere mot bildeinnholdet (#205). */}
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    // Ved det synlige avatar-hjørnet (#700).
                    top: -2 + AVATAR_TREFF.utvidY,
                    right: -2 + AVATAR_TREFF.utvidX,
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    boxShadow: '0 0 0 2.5px var(--bg-header)',
                  }}
                />
                {/* Sr-only — «Min profil» forblir accessible name. */}
                <span
                  style={{
                    position: 'absolute',
                    width: 1,
                    height: 1,
                    overflow: 'hidden',
                    clip: 'rect(0 0 0 0)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  (ulest)
                </span>
              </>
            )}
          </Link>
        </div>
      </div>
    </nav>
  )
}
