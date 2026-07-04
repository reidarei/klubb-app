'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { onLCP, onINP, onCLS, onFCP, onTTFB, type Metric } from 'web-vitals'

/**
 * Egen-rullet web-vitals-logger. Erstatter / komplementerer Vercel Speed
 * Insights som blokkeres av iOS Safari ITP på mobil. Vår endpoint
 * (/api/vitals) matcher ikke tracker-heuristikk og slipper gjennom.
 *
 * web-vitals-biblioteket fyrer hver metric som en egen hendelse når den
 * er ferdig («settled») — LCP når siden er malt, INP når bruker har
 * interaktet og siden skjules, CLS når siden skjules, osv. Vi sender
 * hver hendelse via navigator.sendBeacon (eller fetch som fallback)
 * med ruten den gjaldt. Ruten leses fra useRef-referansen ved fire-tid
 * slik at klient-navigasjoner gir riktig rute per metric.
 */
export default function VitalsLogger() {
  const pathname = usePathname()
  const rutRef = useRef(pathname)
  rutRef.current = pathname

  useEffect(() => {
    // Kaldstart-diagnostikk (#391): nav_type + transfer_size fra Navigation
    // Timing skiller cache-tom kaldstart (transfer_size > 0) fra cache-varm
    // (0 = dokumentet kom fra SW/HTTP-cache). Leses én gang — navigasjons-
    // entry-en gjelder hele sidelasten uansett hvilken metric som fyrer.
    let navType: string | null = null
    let transferSize: number | null = null
    try {
      const nav = performance.getEntriesByType('navigation')[0] as
        | PerformanceNavigationTiming
        | undefined
      if (nav) {
        navType = nav.type
        transferSize = nav.transferSize
      }
    } catch {
      // Eldre nettlesere uten Navigation Timing L2 — feltene forblir null
    }

    function send(metric: Metric) {
      const payload = JSON.stringify({
        rute: rutRef.current,
        metric: metric.name,
        verdi: metric.value,
        rating: metric.rating,
        nav_type: navType,
        transfer_size: transferSize,
      })

      // sendBeacon er best — garantert å fyres selv når siden unloades.
      // fetch med keepalive er fallback for browsere uten sendBeacon.
      const url = '/api/vitals'
      try {
        if (navigator.sendBeacon) {
          const blob = new Blob([payload], { type: 'application/json' })
          navigator.sendBeacon(url, blob)
        } else {
          fetch(url, { method: 'POST', body: payload, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(() => {})
        }
      } catch {
        // Ignorer — analytics skal aldri krasje appen
      }
    }

    onLCP(send)
    onINP(send)
    onCLS(send)
    onFCP(send)
    onTTFB(send)
  }, [])

  return null
}
