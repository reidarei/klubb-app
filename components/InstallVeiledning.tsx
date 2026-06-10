'use client'

import { useEffect, useState } from 'react'
import Icon from '@/components/ui/Icon'
import { KLUBB_KORTNAVN } from '@/lib/klubb-config'

const AVVIST_NOKKEL = 'install-veiledning-avvist'

// beforeinstallprompt-eventet er en Chrome/Edge/Samsung Browser-ting (ikke
// i typingen for window-events ennå). Vi typer det inline.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Hvilken iOS-nettleser brukeren er på. Hver av disse har ulik plassering
// og betegnelse for «Legg til på Hjem-skjerm»-flyten:
//   - safari: Del-knapp midt i nederste verktøylinje, deretter Legg til på Hjem-skjerm
//   - chrome: Del-knapp i adresselinjen (... → Del), deretter Legg til på Hjem-skjerm
//   - edge: tilsvarende Chrome — del-meny via meny-knappen
//   - firefox: PWA-install er ikke støttet på iOS Firefox per nå
type IosNettleser = 'safari' | 'chrome' | 'edge' | 'firefox' | null

function detekterIosNettleser(ua: string): IosNettleser {
  const erIos = /iPhone|iPad|iPod/.test(ua)
  if (!erIos) return null
  if (/CriOS/.test(ua)) return 'chrome'
  if (/EdgiOS/.test(ua)) return 'edge'
  if (/FxiOS/.test(ua)) return 'firefox'
  return 'safari'
}

// Veileder for å installere PWA-en på telefonen.
//
//   - **Android** (Chrome/Edge/Samsung Browser): triggrer
//     `beforeinstallprompt`. Vi fanger eventet og viser en faktisk
//     Installer-knapp som installerer med ett trykk.
//   - **iOS Safari**: ingen programmatisk install-API. Vi viser steg-
//     instruksjoner med konkrete plasseringer av knapper.
//   - **iOS Chrome / Edge**: tilsvarende, men menyene ligger andre steder
//     enn i Safari. Egne instrukser per nettleser.
//   - **iOS Firefox**: støtter ikke PWA-install per i dag — vi viser
//     ingen banner.
//   - **Andre nettlesere** (desktop, Firefox Android osv.): vi viser
//     ikke banner; PWA-en er fortsatt fullt brukbar i nettleser.
//
// Skjules permanent etter avvisning eller vellykket installasjon
// (localStorage-flagg).
export default function InstallVeiledning() {
  const [iosNettleser, setIosNettleser] = useState<IosNettleser>(null)
  const [androidEvent, setAndroidEvent] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Nullstilling via URL-parameter ?vis-install — for testing og for
    // brukere som har avvist banneret men ombestemt seg.
    if (window.location.search.includes('vis-install')) {
      window.localStorage.removeItem(AVVIST_NOKKEL)
      const url = new URL(window.location.href)
      url.searchParams.delete('vis-install')
      window.history.replaceState({}, '', url.pathname + url.search + url.hash)
    }

    if (window.localStorage.getItem(AVVIST_NOKKEL) === '1') return

    // navigator.standalone er en iOS Safari-spesifikk prop som er true når
    // siden er åpnet fra hjem-skjerm. matchMedia-fallback dekker Android
    // og fremtidige iOS-endringer.
    const navAny = window.navigator as Navigator & { standalone?: boolean }
    const erStandalone =
      navAny.standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches
    if (erStandalone) return

    const nettleser = detekterIosNettleser(window.navigator.userAgent)
    let iosTimer: ReturnType<typeof setTimeout> | null = null
    // Firefox iOS støtter ikke install — vis ikke noe der
    if (nettleser && nettleser !== 'firefox') {
      iosTimer = setTimeout(() => setIosNettleser(nettleser), 600)
    }

    // Android (og Chrome desktop) — fang beforeinstallprompt og lagre eventet
    function handler(e: Event) {
      e.preventDefault()
      setAndroidEvent(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // Hvis appen blir installert mens vi er åpen, fjern banneret og marker
    // som avvist så det ikke dukker opp igjen.
    function installerHandler() {
      window.localStorage.setItem(AVVIST_NOKKEL, '1')
      setIosNettleser(null)
      setAndroidEvent(null)
    }
    window.addEventListener('appinstalled', installerHandler)

    return () => {
      if (iosTimer) clearTimeout(iosTimer)
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', installerHandler)
    }
  }, [])

  function avvis() {
    window.localStorage.setItem(AVVIST_NOKKEL, '1')
    setIosNettleser(null)
    setAndroidEvent(null)
  }

  async function installerAndroid() {
    if (!androidEvent) return
    await androidEvent.prompt()
    const valg = await androidEvent.userChoice
    if (valg.outcome === 'accepted') {
      window.localStorage.setItem(AVVIST_NOKKEL, '1')
      setAndroidEvent(null)
    }
  }

  const synlig = iosNettleser !== null || !!androidEvent
  if (!synlig) return null

  return (
    <div
      role="dialog"
      aria-label="Installer på telefonen"
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 'max(20px, calc(env(safe-area-inset-bottom) + 16px))',
        zIndex: 9998,
        maxWidth: 456,
        margin: '0 auto',
        padding: '14px 14px 14px 16px',
        borderRadius: 'var(--radius)',
        background: 'var(--bg-elevated-2)',
        border: '0.5px solid var(--border-strong)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        backdropFilter: 'var(--blur-card)',
        animation: 'install-veiledning-inn 280ms cubic-bezier(0.25, 0.46, 0.45, 0.94) both',
      }}
    >
      <style>{`
        @keyframes install-veiledning-inn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--accent)',
              letterSpacing: '1.6px',
              fontWeight: 600,
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            Tips
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 17,
              color: 'var(--text-primary)',
              fontWeight: 500,
              lineHeight: 1.25,
              marginBottom: 8,
              letterSpacing: '-0.2px',
            }}
          >
            Installer {KLUBB_KORTNAVN} på telefonen
          </div>

          {iosNettleser === 'safari' && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              <ol style={{ margin: 0, paddingLeft: 22 }}>
                <li>
                  Trykk{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>Del</strong>-knappen
                  midt i den nederste verktøylinjen (kvadratisk ikon med pil opp)
                </li>
                <li>
                  Bla ned og velg{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>
                    Legg til på Hjem-skjerm
                  </strong>
                </li>
              </ol>
            </div>
          )}

          {iosNettleser === 'chrome' && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              <ol style={{ margin: 0, paddingLeft: 22 }}>
                <li>
                  Trykk meny-knappen <strong style={{ color: 'var(--text-primary)' }}>⋯</strong>{' '}
                  nederst til høyre i Chrome
                </li>
                <li>
                  Velg{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>Legg til på Hjem-skjerm</strong>
                </li>
              </ol>
            </div>
          )}

          {iosNettleser === 'edge' && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              <ol style={{ margin: 0, paddingLeft: 22 }}>
                <li>
                  Trykk meny-knappen <strong style={{ color: 'var(--text-primary)' }}>⋯</strong>{' '}
                  nederst i Edge
                </li>
                <li>Velg <strong style={{ color: 'var(--text-primary)' }}>Del</strong></li>
                <li>
                  Bla ned og velg{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>
                    Legg til på Hjem-skjerm
                  </strong>
                </li>
              </ol>
            </div>
          )}

          {androidEvent && (
            <>
              <div
                style={{
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                  lineHeight: 1.4,
                  marginBottom: 12,
                }}
              >
                Få eget app-ikon og slipp nettleser-rammen rundt.
              </div>
              <button
                type="button"
                onClick={installerAndroid}
                style={{
                  padding: '8px 16px',
                  borderRadius: 999,
                  border: 'none',
                  background: 'var(--accent)',
                  color: '#0a0a0a',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Installer
              </button>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={avvis}
          aria-label="Lukk"
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--text-tertiary)',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon name="x" size={18} color="currentColor" strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}
