// ─── Caching ────────────────────────────────────────────────────────────────
// CACHE_VERSION skrives av scripts/stamp-versjon.mjs.
// STATIC_CACHE er uversjonert: /_next/static/ er innholdshashet, så uendrede
// filer gjenbrukes på tvers av deploys (#180). PAGE_CACHE er versjonert
// fordi HTML ikke er innholdshashet.
const CACHE_VERSION = 'V3.2.26'
const STATIC_CACHE = 'klubb-static'
const PAGE_CACHE = `klubb-pages-${CACHE_VERSION}`

// NAV_CACHE bærer push-klikk-URL-en over et SW-versjonsbytte, derfor
// UVERSJONERT: skipWaiting() + clients.claim() kan bytte instans før klienten
// har lest overleveringen (#626). Må stå i keep-listen i activate.
// Klubbnøytralt navn: speiles i klient-kode og test som deles med klubb-app.
// Se CLAUDE.md § Policy: Navigasjon.
const NAV_CACHE = 'pwa-nav'
// .invalid-vert med vilje, IKKE en same-origin path: fetch-handleren bruker
// caches.match(request) på tvers av alle cacher, og en ekte path kunne fått
// overleverings-JSON-en servert som side. .invalid kan aldri matche en request.
const NAV_NOKKEL = 'https://pwa-nav.invalid/pending'

// Tak på cache-skrivingen i notificationclick: en caches.put som aldri
// resolver ville hengt handleren, og trykket på varselet gjorde ingenting.
// Fail-open: heller miste overleveringen enn vinduet. Lik klientens kopi i
// ServiceWorkerRegistrering.tsx (vakt: __tests__/sw-pushklikk.test.ts, #851).
const NAV_SKRIV_TIMEOUT_MS = 1000

// Cache API har ingen LRU — trimCache() rydder eldste over grensen.
const MAX_PAGE_CACHE_ENTRIES = 30

const PRECACHE_ASSETS = [
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-192.png',
  '/icon-maskable-512.png',
  '/icon-180.png',
  '/favicon-32.png',
]

// Kun ikoner/favicon — andre bilder kan komme fra dynamiske ruter.
function erIkonAsset(pathname) {
  return pathname.startsWith('/icon-') || pathname.startsWith('/favicon')
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            // NAV_CACHE må ALDRI ryddes her — da river ny SW bort
            // overleveringen før klienten har lest den (#626).
            .filter((key) => key !== STATIC_CACHE && key !== PAGE_CACHE && key !== NAV_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

// FIFO via keys()-rekkefølgen.
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

  if (request.method !== 'GET') return

  if (url.origin !== self.location.origin) return

  if (url.pathname.startsWith('/api/')) return
  if (url.pathname === '/login' || url.pathname === '/oppdater-passord') return

  // Cache-first: innholdshashet, uforanderlig
  if (url.pathname.startsWith('/_next/static/')) {
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

  // Network-first for HTML: datorelativt innhold («i dag», frister) blir feil
  // fra cache (#319). Cache kun som fallback ved feil/offline.
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
          // 4xx/5xx: cachet side er bedre enn feilmelding; uten cache vises
          // originalresponsen, ikke en generisk Response.error().
          return caches.match(request).then((cached) => cached || response)
        })
        .catch(async () =>
          // respondWith må aldri få undefined.
          (await caches.match(request)) ?? Response.error()
        )
    )
    return
  }
})

// ─── Push-varsler ────────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  const { tittel, melding, url, tag } = data

  event.waitUntil(
    // Samme tag + renotify: false kollapser en chat-burst til én rad på
    // låseskjermen (#612). Spres kun ved ikke-tom tag, så varsler uten gruppe
    // ikke avhenger av at nettleseren tolker `tag: undefined` som fravær.
    self.registration.showNotification(tittel ?? 'Varsel', {
      body: melding,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: url ?? '/' },
      ...(typeof tag === 'string' && tag ? { tag, renotify: false } : {}),
    })
  )
})

// Teller KLIKK her og NAVIGASJON i klienten; differansen er tapet (#676).
// fetch (sendBeacon finnes ikke i SW), fire-and-forget: loggingen skal aldri
// kunne forsinke eller felle notificationclick.
// Send ALDRI `url` = navigasjonsmålet: feil_logg.url betyr «siden feilen
// skjedde på», og skal ikke få to betydninger.
function loggPushKlikk(kontekst) {
  try {
    fetch('/api/logg-feil', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // Overlever at SW-en termineres rett etterpå.
      keepalive: true,
      body: JSON.stringify({
        event: 'push.klikk',
        nivaa: 'warn',
        kontekst,
      }),
    }).catch(() => {})
  } catch {
    // Loggingen er aldri verdt å kaste for.
  }
}

async function skrivPendingNav(url, klikkId) {
  const cache = await caches.open(NAV_CACHE)
  await cache.put(NAV_NOKKEL, new Response(JSON.stringify({ url, ts: Date.now(), klikk_id: klikkId })))
}

// Korrelasjons-ID per KLIKK, ikke per notifikasjon eller sending — derfor
// generert her og ikke i push-payloaden. Kollapsede varsler (`tag`) kan gi
// flere klikk på samme notifikasjon (#688).
function lagKlikkId() {
  try {
    return crypto.randomUUID()
  } catch {
    // randomUUID kan mangle i eldre SW-miljøer; korrelasjon krever ikke krypto.
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const klikkId = lagKlikkId()
  // Kun same-origin: en ekstern/ugyldig URL i payload skal aldri åpnes.
  // maalGrunn skiller hvorfor target ble null (#687): 'mangler' = fraværende
  // (i praksis uoppnåelig, push-handleren defaulter til '/'), 'ugyldig' = feil
  // type eller malformert (bug hos avsender), 'kryss_origin'. Ikke slå sammen.
  let target = null
  let maalGrunn = 'mangler'
  try {
    const raw = event.notification.data?.url
    if (raw !== undefined && raw !== null && raw !== '') {
      if (typeof raw !== 'string') {
        maalGrunn = 'ugyldig'
      } else {
        const url = new URL(raw, self.location.origin)
        if (url.origin === self.location.origin) {
          target = url.href
          maalGrunn = 'gyldig'
        } else {
          maalGrunn = 'kryss_origin'
        }
      }
    }
  } catch {
    maalGrunn = 'ugyldig'
  }

  event.waitUntil((async () => {
    // Overleveringen skrives FØR broadcast/focus/openWindow — den må finnes
    // før klientens første poll. Aldri en tom entry (#626).
    if (target) {
      try {
        // Tidsbegrenset, se NAV_SKRIV_TIMEOUT_MS.
        let timer
        await Promise.race([
          skrivPendingNav(target, klikkId).finally(() => clearTimeout(timer)),
          new Promise((resolve) => {
            timer = setTimeout(resolve, NAV_SKRIV_TIMEOUT_MS)
          }),
        ])
      } catch {
        // Fail-open: broadcast/focus/openWindow under virker fortsatt.
      }
    }

    const navigasjonsmaal = target ?? '/'
    const klienter = await clients.matchAll({ type: 'window', includeUncontrolled: true })
    const sameOrigin = klienter.filter(k => k.url.startsWith(self.location.origin))

    // Best effort til alle vinduer; cache-lesingen i klienten er hovedsporet.
    for (const klient of sameOrigin) {
      klient.postMessage({ type: 'navigate', url: navigasjonsmaal })
    }

    // Logges FØR focus/openWindow, som kan avslutte handleren.
    // `synlig_klient` tester en hypotese: en allerede synlig app får ingen
    // visibilitychange av focus() og leser derfor ikke overleveringen (#676).
    // Feltnavnene MÅ stå i KONTEKST_WHITELIST i lib/logg-sanitering.ts, ellers
    // strippes de stille (#681). `handling`, ikke `sti` — `sti` betyr R2-sti
    // på serversiden (#641).
    loggPushKlikk({
      klikk_id: klikkId,
      maal: navigasjonsmaal,
      hadde_maal: Boolean(target),
      maal_grunn: maalGrunn,
      antall_klienter: sameOrigin.length,
      synlig_klient: sameOrigin.some(k => k.visibilityState === 'visible'),
      handling: sameOrigin.length > 0 ? 'focus' : 'openWindow',
    })

    if (sameOrigin.length > 0) {
      const forste = sameOrigin[0]
      if ('focus' in forste) await forste.focus()
      return
    }
    // Cold-start
    if (clients.openWindow) await clients.openWindow(navigasjonsmaal)
  })())
})

// Fallback for klient som ikke kan lese Cache Storage selv, f.eks. gammel
// cachet bundle (#264). Nås fortsatt i praksis. Ny logikk hører hjemme i
// lib/pending-nav.ts, ikke her. 30 s speiler PUSH_KLIKK_VINDU_MS (statisk
// fil, kan ikke importere TS). Konsumerer ved lesing — bevisst ikke #688
// sin utsatte konsumering. klikk_id/forsok/navigert sendes kun for telemetri.
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'check-pending-nav') return
  const port = event.ports[0]
  const jobb = (async () => {
    try {
      const cache = await caches.open(NAV_CACHE)
      const cached = await cache.match(NAV_NOKKEL)
      if (!cached) return
      // Parse FØR delete (delete kan frigjøre streamen). finally så en
      // malformert entry ikke blir liggende (#626).
      let data
      try {
        data = await cached.json()
      } finally {
        await cache.delete(NAV_NOKKEL)
      }
      const { url, ts, klikk_id: klikkId, forsok, navigert } = data ?? {}
      if (typeof url === 'string' && Date.now() - ts < 30_000) {
        // Port virker også når klienten ikke er SW-kontrollert (cold-start).
        const svar = { type: 'navigate', url, klikk_id: klikkId, forsok, navigert }
        if (port) {
          port.postMessage(svar)
        } else if (event.source) {
          event.source.postMessage(svar)
        }
      }
    } catch {
      // Ingen svar; klienten har egen ferskhetslogikk.
    }
  })()
  // Optional chaining: et kast her ligger utenfor try/catch-en. Manglende
  // waitUntil koster kun livstidsgarantien (#626).
  event.waitUntil?.(jobb)
})
