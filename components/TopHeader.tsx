'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Avatar from '@/components/ui/Avatar'
import { harGulGloed, kanAdministrere } from '@/lib/roller'
import { KLUBB_KORTNAVN } from '@/lib/klubb-config'

type Tab = {
  href: string
  label: string
  nokkel: 'agenda' | 'chat' | 'fond' | 'klubb'
  /** Path-prefikser som markerer denne tab-en som aktiv. */
  prefikser: string[]
  /** Kun synlig for admin-brukere (brukes i testfase-gating per #443). */
  kunAdmin?: boolean
}

const TABS: Tab[] = [
  { href: '/', label: 'Agenda', nokkel: 'agenda', prefikser: ['/poll', '/arrangementer', '/meldinger'] },
  // /samtaler aktiverer IKKE chat-tabben visuelt. Privatmeldinger åpnes fra profil-siden (#256). CHAT_TAB_PREFIKSER i lib/navigasjon.ts beholdes for pull-to-refresh-deaktivering.
  { href: '/chat', label: 'Chat', nokkel: 'chat', prefikser: ['/chat'] },
  { href: '/klubbinfo', label: 'Klubb', nokkel: 'klubb', prefikser: ['/klubbinfo', '/kaaringer', '/album'] },
  // Fond ligger bevisst lengst til høyre (Reidars ønske). Alltid synlig for admin;
  // for vanlige medlemmer styres synligheten av bryteren i /innstillinger (#447).
  { href: '/fond', label: 'Fond', nokkel: 'fond', prefikser: ['/fond'], kunAdmin: true },
]

// localStorage-nøkkel for «har sett Fond-fanen» — ny-prikken vises til første besøk.
// Per enhet (som tema-valget); prikken kan dukke opp igjen på en annen enhet, det er greit.
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
}

/**
 * Sticky topp-header med tre alltid-synlige tabs (Agenda / Chat / Klubb) og
 * profil-snarvei høyre. Aktiv tab markert med en animert pill-bakgrunn som
 * glir mellom tabene via CSS transform (FLIP-teknikk). Path-prefikser
 * styrer hvilken tab som er aktiv på undersider (f.eks. `/arrangementer/123`
 * → Agenda aktiv).
 *
 * Erstattet bottom-nav for å eliminere bug-klassen vi traff i #99, #104, #147,
 * #151, #153 hvor iOS-tastatur kolliderte med fixed bottom-elementer. Se
 * Policy: Navigasjon i CLAUDE.md.
 */
export default function TopHeader({ brukerNavn, bildeUrl, rolle, ulestChat = false, ulestVarsler = false, visFond = false }: Props) {
  const pathname = usePathname()

  // Filtrer bort tabs med kunAdmin=true for ikke-admin-brukere,
  // men vis Fond-taben for alle hvis visFond-flagget er skrudd på (#447).
  const synligeTabs = TABS.filter(t => !t.kunAdmin || kanAdministrere(rolle) || (t.nokkel === 'fond' && visFond))
  const fondSynlig = synligeTabs.some(t => t.nokkel === 'fond')

  // «Ny fane»-prikk på Fond: vises til brukeren har besøkt /fond første gang,
  // deretter aldri igjen (per enhet). Settes i effect — localStorage finnes ikke
  // under SSR, og prikken skal ikke gi hydration-mismatch.
  const [nyFondPrikk, setNyFondPrikk] = useState(false)
  useEffect(() => {
    if (!fondSynlig) return
    try {
      if (pathname.startsWith('/fond')) {
        // Første besøk registrert — prikken er gjort jobben sin og forsvinner for godt
        localStorage.setItem(FOND_SETT_KEY, '1')
        setNyFondPrikk(false)
      } else if (!localStorage.getItem(FOND_SETT_KEY)) {
        setNyFondPrikk(true)
      }
    } catch { /* localStorage utilgjengelig (privat modus e.l.) — da vises ingen prikk */ }
  }, [pathname, fondSynlig])

  // Referanser for å måle pill-posisjon relativt til tabs-containeren
  const tabsRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Map<string, HTMLAnchorElement | null>>(new Map())

  // pillRect = null betyr "ingen aktiv tab" (og vi viser ikke pill-en)
  const [pillRect, setPillRect] = useState<{ left: number; width: number } | null>(null)
  const [reduserBevegelse, setReduserBevegelse] = useState(false)

  // Lytt på prefers-reduced-motion — skrur av transition for brukere som ønsker det
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduserBevegelse(mq.matches)
    const handler = (e: MediaQueryListEvent) => setReduserBevegelse(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Trekk ut måling til en lokal funksjon — brukes av både useLayoutEffect og resize-handleren
  const maalPill = () => {
    const container = tabsRef.current
    if (!container) return
    // Bruk synligeTabs — pill skal måles mot faktisk rendret tab-element
    const aktivTab = synligeTabs.find(t => erAktiv(t, pathname))
    if (!aktivTab) {
      setPillRect(null)
      return
    }
    const tabEl = tabRefs.current.get(aktivTab.nokkel)
    if (!tabEl) return
    // Mål posisjon relativt til tabs-containeren (ikke viewport) — dette er
    // translateX-verdien vi sender til pill-elementet
    const cRect = container.getBoundingClientRect()
    const tRect = tabEl.getBoundingClientRect()
    setPillRect({ left: tRect.left - cRect.left, width: tRect.width })
  }

  // useLayoutEffect = kjører synkront etter DOM-oppdatering, men før paint —
  // gir riktig posisjon uten visuelt hopp ved navigasjon. Tradeoff: på første
  // SSR-render finnes ikke pill (pillRect er null) — den popper inn umiddelbart
  // etter hydrering. Knapt synlig og vurdert akseptabelt for å unngå at vi må
  // duplisere aktiv-logikken i en SSR-fallback. Se #200-review.
  // synligeTabs.length i deps: når Fond-taben dukker opp/forsvinner (visFond
  // endres uten navigasjon) skifter tab-bredden, så pill må re-måles selv om
  // pathname er uendret. #447-review.
  useLayoutEffect(() => {
    maalPill()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, synligeTabs.length])

  // Re-mål ved resize (f.eks. rotering av telefon). rAF-throttles så vi ikke
  // gjør getBoundingClientRect 60+ ganger i sekundet under desktop-window-drag.
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
    paddingTop: 'env(safe-area-inset-top)',
    background: 'var(--bg-header)',
    backdropFilter: 'var(--blur-nav)',
    WebkitBackdropFilter: 'var(--blur-nav)',
    borderBottom: '0.5px solid var(--border-subtle)',
  }

  const innerStyle: CSSProperties = {
    // Høyden speiles av --top-header-h i globals.css så andre sticky-elementer
    // (f.eks. VinnerBanner) kan stikke seg under headeren.
    height: 'var(--top-header-h, 60px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px',
    gap: 8,
  }

  const profilAktiv = pathname === '/profil'
  // Generalsekretær har allerede gul ring rundt avataren — å legge på en
  // outline i tillegg gir to overlappende gule ringer. Drop outline her,
  // gloeden alene markerer at /profil er aktiv siden for ham.
  const visAktivOutline = profilAktiv && !harGulGloed(rolle ?? null)
  // Prikken vises kun når profil-siden ikke er aktiv (samme logikk som chat-prikken)
  const visProfilPrikk = ulestVarsler && !profilAktiv

  return (
    <nav style={headerStyle} aria-label="Hovednavigasjon">
      <div style={innerStyle}>
        {/* Tabs */}
        <div
          ref={tabsRef}
          style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {/* Delt pill-bakgrunn — glir mellom tabs via translateX i stedet for
              at hver tab crossfader sin egen bakgrunn. aria-hidden fordi det
              kun er et visuelt dekorasjonselement uten semantisk innhold. */}
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
            // Prikk på Chat = uleste meldinger; prikk på Fond = ny fane brukeren
            // ikke har besøkt ennå. Aldri når taben er aktiv.
            const visPrikk =
              (tab.nokkel === 'chat' && ulestChat && !aktiv) ||
              (tab.nokkel === 'fond' && nyFondPrikk && !aktiv)
            const tabStil: CSSProperties = {
              position: 'relative', // nødvendig for absolutt-posisjonert ulest-prikk og z-index over pill
              zIndex: 1, // løft tekst over pill-bakgrunnen
              padding: '8px 14px',
              borderRadius: 999,
              fontFamily: 'var(--font-body)',
              fontSize: 17,
              fontWeight: aktiv ? 600 : 400,
              color: aktiv ? 'var(--accent)' : 'var(--text-tertiary)',
              opacity: aktiv ? 1 : 0.6,
              // Ingen background her — pill-elementet over håndterer bakgrunnen
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
                        top: 4,
                        right: 6,
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: 'var(--accent)',
                        // Skygge i header-bg-fargen løfter prikken visuelt fra pill-bakgrunnen
                        boxShadow: '0 0 0 2px var(--bg-header)',
                      }}
                    />
                    {/* Sr-only — behold tab-navnet som accessible name, legg tilleggsinfo
                        som ekstra tekst for skjermlesere uten å overstyre. */}
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

        {/* Profil-snarvei */}
        <Link
          href="/profil"
          aria-label="Min profil"
          aria-current={profilAktiv ? 'page' : undefined}
          style={{
            position: 'relative', // nødvendig for absolutt-posisjonert ulest-prikk
            display: 'block',
            borderRadius: '50%',
            outline: visAktivOutline ? '1.5px solid var(--accent)' : 'none',
            outlineOffset: 2,
            flexShrink: 0,
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
              {/* Visuell prikk — større og mer "stikker ut" enn chat-tab-prikken
                  fordi avataren er rundt og prikken må konkurrere mot bilde-innholdet.
                  Se #205 — bevisst gjort mer tydelig etter brukertilbakemelding. */}
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: -2,
                  right: -2,
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  // 0.95 i original — marginalt mørkere enn 0.85 i tab-prikken,
                  // men avatar-plassering trenger ikke skille seg; bruker samme token.
                  boxShadow: '0 0 0 2.5px var(--bg-header)',
                }}
              />
              {/* Sr-only — behold "Min profil" som accessible name */}
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
    </nav>
  )
}
