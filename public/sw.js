// ─── Caching ────────────────────────────────────────────────────────────────
// CACHE_VERSION speiler app-versjonen fra lib/versjon.json og oppdateres
// automatisk av scripts/stamp-versjon.mjs ved hver deploy.
//
// STATIC_CACHE er bevisst UTEN versjon: Next.js innholds-hasher alle
// /_next/static/-filer, så URL-en garanterer innhold. Filer som ikke har
// endret seg mellom builds har samme hash og kan trygt gjenbrukes — det
// sparer brukeren fra å re-laste 80-90% av JS-bundlen ved hver deploy.
// Se #180.
//
// PAGE_CACHE er versjonert fordi HTML ikke er innholdshashet — nye builds
// kan ha samme URL men forskjellig output.
const CACHE_VERSION = 'V3.2.26'
const STATIC_CACHE = 'klubb-static'
const PAGE_CACHE = `klubb-pages-${CACHE_VERSION}`

// Begrens hvor mange HTML-sider som caches — Cache API har ingen LRU,
// så vi rydder eksplisitt fra eldste når vi går over grensen.
const MAX_PAGE_CACHE_ENTRIES = 30

// App-shell assets som forhåndslagres ved installasjon. Disse er også
// "whitelist" for cache-first av bilder — vi cacher kun ikoner som vi
// kjenner og som ligger på faste paths, ikke vilkårlige png/jpg-treff.
const PRECACHE_ASSETS = [
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-192.png',
  '/icon-maskable-512.png',
  '/icon-180.png',
  '/favicon-32.png',
]

// Cache-first gjelder kun ikoner/favicon — andre png/jpg/webp kan komme
// fra dynamiske ruter, ikke trygt å cache blankt.
function erIkonAsset(pathname) {
  return pathname.startsWith('/icon-') || pathname.startsWith('/favicon')
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_ASSETS))
  )
  // Aktiver ny SW umiddelbart — ikke vent på at alle faner lukkes
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== PAGE_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

// Trim cache til MAX entries — sletter eldste (FIFO via keys()-rekkefølge).
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length <= maxEntries) return
  const toDelete = keys.slice(0, keys.length - maxEntries)
  await Promise.all(toDelete.map((k) => cache.delete(k)))
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Kun GET-forespørsler
  if (request.method !== 'GET') return

  // Kun same-origin (ikke Supabase-storage, CDN, osv.)
  if (url.origin !== self.location.origin) return

  // API-ruter og auth-sider caches aldri — de er alltid ferske
  if (url.pathname.startsWith('/api/')) return
  if (url.pathname === '/login' || url.pathname === '/oppdater-passord') return

  // Cache-first: Next.js statiske assets er innholds-hashet og uforanderlige
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone()
            // Bruk event.waitUntil så SW lever til caching er ferdig
            event.waitUntil(
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone))
            )
          }
          return response
        })
      })
    )
    return
  }

  // Cache-first: kjente ikoner og favicon. Andre bilde-extensions hopper
  // forbi for å unngå at dynamiske ruter (f.eks. /api/avatar/x.png) caches
  // ved et uhell.
  if (erIkonAsset(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone()
            event.waitUntil(
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone))
            )
          }
          return response
        })
      })
    )
    return
  }

  // Network-first: HTML-sider hentes alltid fra nett først. HTML inneholder
  // datorelativt innhold («i dag», «om 2 dager», påmeldingsfrister) som blir
  // feil hvis en cachet versjon vises. Network-first koster én tur-retur ved
  // cold load, men garanterer korrekt innhold. Se #319.
  //
  // Vi reverserer trade-offen fra #180 (stale-while-revalidate) for navigate-
  // requests: cold-start-forsinkelsen var akseptabel for statisk innhold, men
  // ikke for side-HTML med relativt tidsinnhold.
  //
  // Fallback til cache hvis fetch feiler (offline) eller returnerer !ok.
  // Hvis heller ikke cache finnes ved nettverksfeil, returnerer vi
  // Response.error() (tydeligere nettverksfeil-semantikk enn undefined).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone()
            event.waitUntil(
              caches.open(PAGE_CACHE).then(async (cache) => {
                await cache.put(request, clone)
                await trimCache(PAGE_CACHE, MAX_PAGE_CACHE_ENTRIES)
              })
            )
            return response
          }
          // Ikke-ok respons (4xx/5xx) — prøv cache som fallback. Cache er
          // offline-fallback generelt, ikke 5xx-spesifikk: om brukeren har en
          // gyldig cachet side er den bedre enn en feilmelding. Hvis cache
          // mangler returnerer vi originalresponsen heller enn å skjule
          // feilen bak en generisk Response.error().
          return caches.match(request).then((cached) => cached || response)
        })
        .catch(async () =>
          // Offline eller nettverksfeil — prøv cache, ellers en
          // network-error-response så respondWith aldri får undefined.
          (await caches.match(request)) ?? Response.error()
        )
    )
    return
  }
})

// ─── Push-varsler ────────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  const { tittel, melding, url } = data

  event.waitUntil(
    // SW kan ikke importere TS-moduler; serveren setter alltid tittel i praksis.
    self.registration.showNotification(tittel ?? 'Varsel', {
      body: melding,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: url ?? '/' },
    })
  )
})

// Husk siste klikkede URL i SW-minnet. Brukes som "pending nav" — klienten
// poller dette ved hver visibility-change og navigerer hvis det finnes en
// fersk (< 30 s) ventende URL. Mønsteret eksisterer fordi iOS PWA dropper
// postMessage som sendes mens vinduet fortsatt er frosset etter focus()
// (#264). Lagring + polling fjerner timing-racet helt.
let pendingNav = null

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  // Begrenser til same-origin så en ugyldig eller ekstern URL i payload aldri
  // kan åpne ekstern side eller krasje handleren.
  let target = '/'
  try {
    const url = new URL(event.notification.data?.url ?? '/', self.location.origin)
    if (url.origin === self.location.origin) target = url.href
  } catch {
    // Ugyldig URL — fall til '/'
  }

  // Lagre uansett — klienten plukker den opp ved neste visibility-event.
  pendingNav = { url: target, ts: Date.now() }

  event.waitUntil((async () => {
    const klienter = await clients.matchAll({ type: 'window', includeUncontrolled: true })
    const sameOrigin = klienter.filter(k => k.url.startsWith(self.location.origin))

    // Broadcast til ALLE same-origin-klienter — ikke bare den vi fokuserer.
    // Dekker tilfeller der flere vinduer finnes, og er "best effort" mot
    // iOS-drop. Pollingen i klienten er den robuste fallback'en.
    for (const klient of sameOrigin) {
      klient.postMessage({ type: 'navigate', url: target })
    }

    if (sameOrigin.length > 0) {
      const forste = sameOrigin[0]
      if ('focus' in forste) await forste.focus()
      return
    }
    // Ingen åpen klient — åpne nytt vindu (PWA cold-start).
    if (clients.openWindow) await clients.openWindow(target)
  })())
})

// Klienten spør om det finnes en ventende navigasjon (ved mount og hver
// gang vinduet blir synlig). Hvis ja, og den er fersk, send URL-en og
// nullstill. 30 s-vinduet hindrer at gamle klikk re-trigger ved en senere
// app-åpning.
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'check-pending-nav') return
  if (pendingNav && Date.now() - pendingNav.ts < 30_000) {
    // Foretrekk MessageChannel-port (fungerer selv når klienten ikke er
    // kontrollert av SW, f.eks. ved cold-start). Fallback til event.source
    // for nettlesere som ikke sender port med.
    const port = event.ports[0]
    if (port) {
      port.postMessage({ type: 'navigate', url: pendingNav.url })
    } else if (event.source) {
      event.source.postMessage({ type: 'navigate', url: pendingNav.url })
    }
    pendingNav = null
  }
})
