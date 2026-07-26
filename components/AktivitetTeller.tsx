'use client'

import { useEffect } from 'react'
import { iDagOslo, osloUkestart } from '@/lib/dato'
import { AKTIVITET_TREFF_THROTTLE_MIN } from '@/lib/konstanter'

/**
 * Anonym aktivitetsmåling (#484). Teller "har vi sett denne enheten i dag/
 * denne uken/nylig" via localStorage-flagg — ingen profil_id, ingen
 * bruker-kobling sendes noe sted. Serveren (se app/api/aktivitet/route.ts)
 * vet aldri hvem som traff endepunktet, kun at NOEN gjorde det.
 *
 * localStorage skrives FØR beacon sendes, ikke etter — hvis vi skrev etter
 * ville en rask reload/dobbel-mount (StrictMode i dev, eller to faner åpnet
 * samtidig) kunne rekke å sende to beacons før flagget rekker å bli lest.
 */
export default function AktivitetTeller() {
  useEffect(() => {
    function sjekkOgTell() {
      const iDag = iDagOslo()
      const mandag = osloUkestart()

      const sistTaltDag = localStorage.getItem('hk_talt_dag')
      const sistTaltUke = localStorage.getItem('hk_talt_uke')
      const sistTreff = localStorage.getItem('hk_sist_treff')

      const unik = iDag !== sistTaltDag
      const uke = mandag !== sistTaltUke
      // Date.now() er OK her — dette er en elapsed-time-sjekk (throttle),
      // ikke "hvilken dag er det", så lib/dato.ts sin Oslo-logikk trengs ikke.
      const treff = Date.now() - Number(sistTreff || 0) > AKTIVITET_TREFF_THROTTLE_MIN * 60_000

      // Kort-slutt — også en StrictMode-guard: andre kjøring (dev-dobbel-
      // mount) leser localStorage etter at første kjøring alt har skrevet
      // til den, så alle tre flaggene er false og vi returnerer her.
      if (!unik && !uke && !treff) return

      // Skriv FØR beacon sendes — se kommentar over komponenten.
      if (unik) localStorage.setItem('hk_talt_dag', iDag)
      if (uke) localStorage.setItem('hk_talt_uke', mandag)
      if (treff) localStorage.setItem('hk_sist_treff', String(Date.now()))

      const url = '/api/aktivitet'
      const payload = JSON.stringify({ treff, unik, uke })
      try {
        if (navigator.sendBeacon) {
          const blob = new Blob([payload], { type: 'text/plain' })
          navigator.sendBeacon(url, blob)
        } else {
          fetch(url, { method: 'POST', body: payload, keepalive: true }).catch(() => {})
        }
      } catch {
        // Ignorer — aktivitetsmåling skal aldri krasje appen
      }
    }

    sjekkOgTell()

    function handleVisibility() {
      if (document.visibilityState === 'visible') sjekkOgTell()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  return null
}
