'use client'

// Dra-ned-for-oppdater for iOS PWA, hvor native pull-to-refresh er
// deaktivert i standalone-modus. Lytter på touch-events globalt og
// trigger router.refresh() når brukeren har dratt forbi terskelen.

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { erChatTab } from '@/lib/navigasjon'

const TERSKEL = 80
const MAX = 120

export default function DraNedForOppdater() {
  const [dra, setDra] = useState(0)
  const [laster, setLaster] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const startY = useRef(0)
  const tracking = useRef(false)
  const draRef = useRef(0)
  const aktivGest = useRef(false)
  const avbrutt = useRef(false)

  useEffect(() => {
    // Chat-sidene har egen visibilitychange-refetch og realtime-subscription
    // som holder meldingslisten ajour — pull-to-refresh trengs ikke der, og
    // en uventet router.refresh() forårsaket scroll-til-bunn-bug (#222).
    if (erChatTab(pathname)) return
    // Sjekker om brukeren skriver i et tekstfelt (chat-input, kommentar,
    // tittel-redigering osv). Da skal dra-ned ikke aktiveres — én gest
    // mindre som kan kollidere med tastatur og forskyve input-pillen
    // (jf. #216).
    function brukerSkriver() {
      const el = document.activeElement
      if (!el) return false
      const tag = el.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return true
      if ((el as HTMLElement).isContentEditable) return true
      return false
    }

    function start(e: TouchEvent) {
      // Multi-touch (pinch/zoom eller andre samtidige gester): ikke nullstill
      // pågående gest. Vi vil ikke at en ny finger midt i en dra-ned skal
      // resette startY og forvirre logikken.
      if (e.touches.length > 1) return
      if (window.scrollY > 0) return
      if (brukerSkriver()) return
      startY.current = e.touches[0].clientY
      tracking.current = false
      aktivGest.current = true
      avbrutt.current = false
      draRef.current = 0
    }
    function move(e: TouchEvent) {
      if (e.touches.length > 1) return
      if (!aktivGest.current || avbrutt.current) return
      if (window.scrollY > 0) {
        // Momentum-scroll eller manuell scroll bort fra toppen — avbryt
        // gesten permanent slik at vi ikke kan aktivere senere når
        // brukeren tilfeldigvis treffer toppen igjen.
        aktivGest.current = false
        tracking.current = false
        avbrutt.current = true
        setDra(0)
        return
      }
      const dy = e.touches[0].clientY - startY.current
      if (!tracking.current) {
        // Første dy negativ = bruker scroller fortsatt opp (momentum-rest).
        // Marker gesten som avbrutt slik at den ikke kan aktiveres senere.
        if (dy < 0) {
          avbrutt.current = true
          aktivGest.current = false
          return
        }
        // Krev en bevisst nedover-bevegelse før vi aktiverer tracking.
        if (dy < 8) return
        tracking.current = true
      }
      if (dy < 4) {
        // Bruker dro først ned (aktiverte tracking), så tilbake nær/forbi
        // startpunktet — i praksis en kansellert gest. Nullstill så end()
        // ikke trigger refresh på gammel draRef.
        tracking.current = false
        draRef.current = 0
        setDra(0)
        return
      }
      const v = Math.min(dy, MAX)
      draRef.current = v
      setDra(v)
    }
    function end(e: TouchEvent) {
      // touchend fyres også når én av flere fingre slippes. Hvis det fortsatt
      // er fingre nede, er gesten ikke avsluttet — vent på neste touchend.
      if (e.touches.length > 0) return
      aktivGest.current = false
      avbrutt.current = false
      if (!tracking.current) {
        draRef.current = 0
        return
      }
      tracking.current = false
      if (draRef.current >= TERSKEL) {
        setLaster(true)
        router.refresh()
        setTimeout(() => {
          setLaster(false)
          setDra(0)
        }, 900)
      } else {
        setDra(0)
      }
      draRef.current = 0
    }
    function cancel() {
      // iOS sender touchcancel ved system-interrupt (varsel, kontroll-senter,
      // gesture-konflikt). Da uteblir touchend — vi må nullstille flagg selv
      // uten å trigge router.refresh().
      aktivGest.current = false
      avbrutt.current = false
      tracking.current = false
      draRef.current = 0
      setDra(0)
    }

    window.addEventListener('touchstart', start, { passive: true })
    window.addEventListener('touchmove', move, { passive: true })
    window.addEventListener('touchend', end, { passive: true })
    window.addEventListener('touchcancel', cancel, { passive: true })
    return () => {
      window.removeEventListener('touchstart', start)
      window.removeEventListener('touchmove', move)
      window.removeEventListener('touchend', end)
      window.removeEventListener('touchcancel', cancel)
    }
  }, [router, pathname])

  const synlig = dra > 0 || laster
  const progress = Math.min(dra / TERSKEL, 1)
  const offset = Math.max(0, dra * 0.6 - 20)

  return (
    <>
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: 'env(safe-area-inset-top)',
          left: '50%',
          transform: `translateX(-50%) translateY(${offset}px)`,
          transition: laster || dra > 0 ? 'none' : 'transform 200ms, opacity 200ms',
          opacity: synlig ? 1 : 0,
          zIndex: 100,
          pointerEvents: 'none',
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: 'var(--bg-elevated)',
          border: '0.5px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            border: '1.5px solid transparent',
            borderTopColor: 'var(--accent)',
            borderRightColor: progress >= 1 || laster ? 'var(--accent)' : 'transparent',
            transform: laster ? undefined : `rotate(${progress * 270}deg)`,
            animation: laster ? 'dra-ned-spin 700ms linear infinite' : 'none',
          }}
        />
      </div>
      <style>{`@keyframes dra-ned-spin { to { transform: rotate(360deg) } }`}</style>
    </>
  )
}
