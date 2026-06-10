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
    function send(metric: Metric) {
      const payload = JSON.stringify({
        rute: rutRef.current,
        metric: metric.name,
        verdi: metric.value,
        rating: metric.rating,
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
