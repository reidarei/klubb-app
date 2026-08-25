'use client'

import { useEffect } from 'react'
import { PUSH_KLIKK_VINDU_MS } from '@/lib/konstanter'
import { sendFeilBeacon, meldKlientfeil, feilNavn } from '@/lib/klient-logg'

// Speiler navnene i public/sw.js — sw.js er en statisk fil og kan ikke
// importere fra lib/, så navnene må holdes i synk manuelt ved endring.
const NAV_CACHE = 'pwa-nav'
// Bevisst syntetisk (.invalid), ikke en ekte path — fetch-handleren i sw.js
// søker på tvers av alle cacher med caches.match(request), så en ekte path
// kunne blitt servert som sideinnhold. Full begrunnelse i public/sw.js.
const NAV_NOKKEL = 'https://pwa-nav.invalid/pending'

export default function ServiceWorkerRegistrering() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    // Hele push-klikk-flyten under avhenger av at denne registreringen går
    // gjennom. En console.error fanges verken av FeilFangst (den ser bare
    // window.error og unhandledrejection) eller av noe annet — feilen ville
    // forsvunnet sporløst, og push kunne vært dødt i månedsvis uten at vi
    // visste det (#626-review).
    navigator.serviceWorker
      .register('/sw.js')
      .catch((err: unknown) => meldKlientfeil('klient.sw.registrering.feilet', err))

    // Push-klikk-navigasjon: SW kan ikke navigere appen selv (openWindow er
    // no-op når PWA-en allerede er åpen, client.navigate er upålitelig på
    // iOS — #233, #262). I stedet lagrer SW-en URL-en i Cache Storage
    // (NAV_CACHE), og vi leser den direkte herfra ved mount og hver
    // visibility-change (#626).
    //
    // Cache Storage fremfor SW-melding/i-minne-tilstand er selve fiksen: en
    // i-minne-variabel i SW-en river bort med den SW-instansen — en push-
    // trigget SW-oppdatering (install kaller skipWaiting(), activate kaller
    // clients.claim()) forkaster den gamle instansen med overleveringen FØR
    // klienten rekker å lese den. Cache Storage er per-origin og upåvirket av
    // hvilken SW-instans som lever, er byttet ut, eller kontrollerer siden.
    function handterMelding(event: MessageEvent) {
      const data = event.data
      if (!data || data.type !== 'navigate' || typeof data.url !== 'string') return
      navigerTil(data.url)
    }

    function navigerTil(raw: string) {
      try {
        const url = new URL(raw, window.location.origin)
        if (url.origin !== window.location.origin) return
        // Konsumer entryen før navigasjon, slik at broadcast-stien (som også
        // kan trigge navigerTil via handterMelding) ikke etterlater den til
        // neste poll. BEST-EFFORT: slettingen er ikke awaitet, fordi
        // location.assign river ned realmet uten å vente på den.
        slettPendingNavCache()
        // Identitets-vakt (#626-review): vi står allerede på målet. Uten den
        // laster vi samme URL to ganger — broadcast-stien navigerer, og
        // mount-pollen etter reload kan finne entryen som slettingen over
        // ikke rakk å fjerne. Dekker også cold-start, der openWindow allerede
        // har landet oss riktig sted.
        if (url.href === window.location.href) return
        window.location.assign(url.href)
      } catch {
        // Ugyldig URL — ignorer.
      }
    }

    function slettPendingNavCache() {
      try {
        caches.open(NAV_CACHE).then((cache) => cache.delete(NAV_NOKKEL)).catch(() => {})
      } catch {
        // Cache Storage utilgjengelig — ingen entry å slette uansett.
      }
    }

    // Leser overleveringen direkte fra Cache Storage — samme lager SW-en
    // skriver til i notificationclick. Returnerer null hvis cachen er tom
    // ELLER utilgjengelig, slik at kalleren vet å falle tilbake til
    // MessageChannel-stien.
    async function lesPendingNav(): Promise<{ url: string; ts: number } | null> {
      try {
        const cache = await caches.open(NAV_CACHE)
        const cached = await cache.match(NAV_NOKKEL)
        if (!cached) return null
        // Les og parse bodyen FØR delete (#626-review): en implementasjon står
        // fritt til å frigjøre lagringen ved delete, og da kaster .json() på en
        // ulest stream — og vi ville stått igjen uten navigasjon og uten spor.
        // Slettingen ligger i finally fordi lesingen er konsumerende uansett
        // utfall: en malformert entry skal ikke bli lest på nytt hver runde.
        let data: { url?: unknown; ts?: unknown } | null = null
        try {
          data = await cached.json()
        } finally {
          await cache.delete(NAV_NOKKEL)
        }
        if (typeof data?.url !== 'string' || typeof data?.ts !== 'number') return null
        return { url: data.url, ts: data.ts }
      } catch {
        return null
      }
    }

    // Fallback for en enhet med ny SW men gammel cachet klient-bundle
    // (#264): SW-en svarer på check-pending-nav ved å lese samme Cache
    // Storage internt, så protokollen fungerer uendret selv om denne
    // funksjonen aldri kalles av en gammel bundle. Bruker MessageChannel
    // fordi navigator.serviceWorker.controller er null ved cold-start (siden
    // lastet før SW tok kontroll) — registration.active fungerer uavhengig
    // av kontroll-status, og MessageChannel garanterer at SW kan svare.
    async function sjekkViaMessageChannel() {
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

    // Cache-stien prøves FØRST og er uavhengig av navigator.serviceWorker.
    // ready — det er kjernen i fiksen: er reg.active null, eller henger
    // ready-promiset, skal en fersk cache-entry likevel navigere.
    async function sjekkPendingNav() {
      const entry = await lesPendingNav()
      if (entry) {
        if (Date.now() - entry.ts < PUSH_KLIKK_VINDU_MS) {
          navigerTil(entry.url)
        } else {
          // Eldre enn vinduet — allerede slettet av lesPendingNav over.
          // Ikke en programfeil (klienten kan ha vært lukket lenge), men
          // verdt å se i observability hvis det skjer ofte.
          sendFeilBeacon(
            'klient.pushklikk.foreldet',
            `push-klikk-URL var ${Date.now() - entry.ts} ms gammel (grense ${PUSH_KLIKK_VINDU_MS} ms)`,
            undefined,
            undefined,
            'warn',
          )
        }
        return
      }
      // Cachen var tom (eller Cache Storage utilgjengelig) — fall tilbake
      // til dagens MessageChannel-vei mot SW-en.
      await sjekkViaMessageChannel()
    }

    // sjekkPendingNav er async, men kalles fra en event-handler og fra
    // setTimeout — ingen av dem håndterer en avvist promise. Den interne
    // try/catch i lesPendingNav dekker bare cache-lesingen; fallback-stien
    // (await navigator.serviceWorker.ready) er udekket, og en reject der ville
    // blitt en unhandledrejection. Vi svelger den ikke: en stille catch her
    // ville reintrodusert nøyaktig blindsonen #626 handler om — at
    // overleveringen svikter uten spor. Warn-nivå fordi en avvist ready som
    // regel er miljøet (privat modus, SW avregistrert), ikke en programfeil.
    function sjekkPendingNavTrygt() {
      sjekkPendingNav().catch((err: unknown) => {
        sendFeilBeacon(
          'klient.sw.pendingnav.feilet',
          err instanceof Error ? err.message : String(err),
          err instanceof Error ? err.stack : undefined,
          { name: feilNavn(err) },
          'warn',
        )
      })
    }

    function handterVisibility() {
      if (document.visibilityState === 'visible') sjekkPendingNavTrygt()
    }

    navigator.serviceWorker.addEventListener('message', handterMelding)
    document.addEventListener('visibilitychange', handterVisibility)

    // Race: ved cold-start (PWA åpnes fra lukket via notifikasjon) kan
    // klienten mounte FØR SW har rukket å behandle notificationclick og
    // skrive cache-entryen. Polle flere ganger med stigende delay dekker
    // dette uten å spamme unødvendig hvis vi finner svaret tidlig.
    // navigerTil kalles av handteren ovenfor; den vil avslutte siden
    // umiddelbart, så ekstra poller blir aldri synlige etter første treff.
    const forsoek = [0, 200, 800, 2000]
    const timers = forsoek.map(ms => window.setTimeout(sjekkPendingNavTrygt, ms))

    return () => {
      navigator.serviceWorker.removeEventListener('message', handterMelding)
      document.removeEventListener('visibilitychange', handterVisibility)
      timers.forEach(t => window.clearTimeout(t))
    }
  }, [])
  return null
}
