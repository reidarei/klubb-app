'use client'

import { useEffect } from 'react'

export default function ServiceWorkerRegistrering() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(console.error)

    // Push-klikk-navigasjon: SW kan ikke navigere appen selv (openWindow er
    // no-op når PWA-en allerede er åpen, client.navigate er upålitelig på
    // iOS — #233, #262). I stedet lagrer SW siste klikkede URL som
    // "pendingNav", og vi spør om den her ved mount og hver visibility-
    // change. iOS dropper postMessage som ankommer mens vinduet er frosset,
    // så pollingen er det robuste sporet — postMessage fra SW håndteres
    // også som "best effort". Se #264.
    function handterMelding(event: MessageEvent) {
      const data = event.data
      if (!data || data.type !== 'navigate' || typeof data.url !== 'string') return
      navigerTil(data.url)
    }

    function navigerTil(raw: string) {
      try {
        const url = new URL(raw, window.location.origin)
        if (url.origin !== window.location.origin) return
        window.location.assign(url.href)
      } catch {
        // Ugyldig URL — ignorer.
      }
    }

    // Bruker MessageChannel for direkte to-veis kommunikasjon. Grunnen:
    // ved cold-start er navigator.serviceWorker.controller null (siden ble
    // lastet før SW tok kontroll), så vanlig postMessage til controller
    // går i tomgang. registration.active fungerer uavhengig av kontroll-
    // status, og MessageChannel garanterer at SW kan svare tilbake.
    async function sjekkPendingNav() {
      const reg = await navigator.serviceWorker.ready
      if (!reg.active) return
      const channel = new MessageChannel()
      channel.port1.onmessage = (event) => {
        const data = event.data
        if (!data || data.type !== 'navigate' || typeof data.url !== 'string') return
        navigerTil(data.url)
      }
      reg.active.postMessage({ type: 'check-pending-nav' }, [channel.port2])
    }

    function handterVisibility() {
      if (document.visibilityState === 'visible') sjekkPendingNav()
    }

    navigator.serviceWorker.addEventListener('message', handterMelding)
    document.addEventListener('visibilitychange', handterVisibility)

    // Race: ved cold-start (PWA åpnes fra lukket via notifikasjon) kan
    // klienten mounte FØR SW har rukket å behandle notificationclick og
    // lagre pendingNav. Polle flere ganger med stigende delay dekker
    // dette uten å spamme SW unødvendig hvis vi finner svaret tidlig.
    // navigerTil kalles av handteren ovenfor; den vil avslutte siden
    // umiddelbart, så ekstra poller blir aldri synlige etter første treff.
    const forsoek = [0, 200, 800, 2000]
    const timers = forsoek.map(ms => window.setTimeout(sjekkPendingNav, ms))

    return () => {
      navigator.serviceWorker.removeEventListener('message', handterMelding)
      document.removeEventListener('visibilitychange', handterVisibility)
      timers.forEach(t => window.clearTimeout(t))
    }
  }, [])
  return null
}
