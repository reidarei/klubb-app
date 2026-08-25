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

// NAV_CACHE bærer push-klikk-URL-en over et SW-versjonsbytte (#626). Bevisst
// UTEN CACHE_VERSION i navnet — motsatt av PAGE_CACHE: install kaller
// skipWaiting() og activate kaller clients.claim(), så en cold-start fra en
// push kan trigge en SW-oppdatering FØR klienten rekker å lese overleveringen.
// En variabel i SW-minnet (tidligere `pendingNav`) forsvinner med den gamle
// instansen; et uversjonert cache-navn overlever fordi Cache Storage ikke er
// del av noen spesifikk SW-instans sin heap. Se også keep-listen i activate
// under — den er den andre halvparten av denne fiksen.
//
// Navnet er bevisst klubbnøytralt (ikke prefikset med klubbnavn som de to
// over): Cache Storage er per origin, så et prefiks kjøper ingenting — og
// navnet speiles i klient-koden og i test, som begge deles med nedstrøms-repo.
const NAV_CACHE = 'pwa-nav'
// Syntetisk nøkkel på et RFC 2606-reservert .invalid-hostnavn — IKKE en ekte
// path som '/__pending-nav', og ikke «rydd» den til å bli pen igjen. Grunnen:
// fetch-handleren under bruker caches.match(request) UTEN cacheName, og den
// formen søker på tvers av ALLE cacher — også denne. Med en same-origin path
// som nøkkel ville en navigasjon til den pathen kunne få overleverings-JSON-en
// servert tilbake som sidens innhold. Et .invalid-vertsnavn kan per definisjon
// aldri resolve, så ingen request.url kan noensinne matche nøkkelen. Cache API
// tillater cross-origin nøkler når vi selv konstruerer Responsen.
const NAV_NOKKEL = 'https://pwa-nav.invalid/pending'

// Maks tid vi lar cache-skrivingen i notificationclick ta før vi går videre til
// broadcast/focus/openWindow. En *avvist* caches.open/put fanges av try/catch,
// men en som aldri resolver ville hengt hele handleren — og da gjør trykket på
// varselet ingenting i det hele tatt. Fail-open: heller miste overleveringen
// enn å miste både den og vinduet.
const NAV_SKRIV_TIMEOUT_MS = 1000

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
            // NAV_CACHE må ALDRI rydda her — se kommentaren ved definisjonen.
            // Sletter vi den, gjeninnfører vi #626: en ny SW-instans river
            // bort overleveringen den selv skal svare på, rett før klienten
            // rekker å lese den.
            .filter((key) => key !== STATIC_CACHE && key !== PAGE_CACHE && key !== NAV_CACHE)
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
  const { tittel, melding, url, tag } = data

  event.waitUntil(
    // SW kan ikke importere TS-moduler; serveren setter alltid tittel i praksis.
    // tag + renotify: false (#612): uten tag ble hver melding i en chat-burst
    // sin egen rad på låseskjermen (20 meldinger = 20 rader). Med samme tag
    // (utledet server-side i sendVarsel, f.eks. «chat:klubb») erstatter siste
    // melding forrige i stedet — én rad per tråd.
    //
    // Feltene SPREDES kun når tag er en ikke-tom streng, i stedet for å sende
    // `tag: undefined`. Per WebIDL er en undefined dictionary-member det samme
    // som fraværende, så de to er ekvivalente i en spec-tro nettleser — men vi
    // sender ikke feltet i det hele tatt til de varseltypene som ikke skal
    // kollapse (påminnelser, mention), så oppførselen deres ikke avhenger av at
    // hver nettleser tolker undefined riktig. Gjelder også eldre payloads
    // rullet ut før #612.
    self.registration.showNotification(tittel ?? 'Varsel', {
      body: melding,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: url ?? '/' },
      ...(typeof tag === 'string' && tag ? { tag, renotify: false } : {}),
    })
  )
})

// Skriver overleveringen. Egen funksjon fordi kallstedet racer den mot en
// timeout og da blir uttrykket for langt til å lese.
async function skrivPendingNav(url) {
  const cache = await caches.open(NAV_CACHE)
  await cache.put(NAV_NOKKEL, new Response(JSON.stringify({ url, ts: Date.now() })))
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  // Begrenser til same-origin så en ugyldig eller ekstern URL i payload aldri
  // kan åpne ekstern side eller krasje handleren. target forblir null kun for
  // malformerte eller kryss-origin URL-er — push-handleren over setter alltid
  // `data.url` (til '/' når varselet ikke har noen lenke), så et varsel som
  // legitimt peker på agenda kommer hit som en gyldig '/'-URL, ikke som null.
  let target = null
  try {
    const raw = event.notification.data?.url
    if (typeof raw === 'string' && raw) {
      const url = new URL(raw, self.location.origin)
      if (url.origin === self.location.origin) target = url.href
    }
  } catch {
    // Ugyldig URL — target forblir null.
  }

  event.waitUntil((async () => {
    // Skriv overleveringen til Cache Storage FØR broadcast/focus/openWindow
    // under — rekkefølgen er ikke pynt, entryen må finnes før klientens
    // første poll. Kun når target finnes: en manglende/ugyldig URL skal
    // aldri skrive en tom entry. Cache Storage overlever et SW-versjons-
    // bytte i motsetning til en variabel i SW-minnet (#626) — se
    // NAV_CACHE-kommentaren lenger opp.
    if (target) {
      try {
        // Bounded (#626-review): et hengende Cache Storage-lag skal koste maks
        // NAV_SKRIV_TIMEOUT_MS, ikke hele notificationclick. Timeren ryddes så
        // snart skrivingen er ferdig, så normaltilfellet ikke etterlater den.
        let timer
        await Promise.race([
          skrivPendingNav(target).finally(() => clearTimeout(timer)),
          new Promise((resolve) => {
            timer = setTimeout(resolve, NAV_SKRIV_TIMEOUT_MS)
          }),
        ])
      } catch {
        // Fail-open: verste utfall er dagens oppførsel via broadcast/focus/
        // openWindow under, eller at klienten lander på '/' ved neste poll.
      }
    }

    const navigasjonsmaal = target ?? '/'
    const klienter = await clients.matchAll({ type: 'window', includeUncontrolled: true })
    const sameOrigin = klienter.filter(k => k.url.startsWith(self.location.origin))

    // Broadcast til ALLE same-origin-klienter — ikke bare den vi fokuserer.
    // Dekker tilfeller der flere vinduer finnes, og er "best effort" mot
    // iOS-drop. Cache-lesingen i klienten er den robuste fallback'en.
    for (const klient of sameOrigin) {
      klient.postMessage({ type: 'navigate', url: navigasjonsmaal })
    }

    if (sameOrigin.length > 0) {
      const forste = sameOrigin[0]
      if ('focus' in forste) await forste.focus()
      return
    }
    // Ingen åpen klient — åpne nytt vindu (PWA cold-start).
    if (clients.openWindow) await clients.openWindow(navigasjonsmaal)
  })())
})

// Fallback-protokoll for en enhet med ny SW men gammel cachet klient-bundle
// (#264): klienten spør her når den ikke selv kan lese Cache Storage direkte
// (se ServiceWorkerRegistrering.tsx). 30 s-vinduet hindrer at et gammelt
// klikk re-trigger ved en senere app-åpning — speiler PUSH_KLIKK_VINDU_MS i
// lib/konstanter.ts (denne fila er statisk og kan ikke importere TS).
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'check-pending-nav') return
  const port = event.ports[0]
  const jobb = (async () => {
    try {
      const cache = await caches.open(NAV_CACHE)
      const cached = await cache.match(NAV_NOKKEL)
      if (!cached) return
      // Les og parse bodyen FØR delete (#626-review): en implementasjon står
      // fritt til å frigjøre lagringen ved delete, og da kaster .json() på en
      // ulest stream. Slettingen ligger i finally fordi lesingen er
      // konsumerende uansett utfall — en malformert entry skal ikke bli
      // liggende og bli lest på nytt ved hver runde.
      let data
      try {
        data = await cached.json()
      } finally {
        await cache.delete(NAV_NOKKEL)
      }
      const { url, ts } = data ?? {}
      if (typeof url === 'string' && Date.now() - ts < 30_000) {
        // Foretrekk MessageChannel-port (fungerer selv når klienten ikke er
        // kontrollert av SW, f.eks. ved cold-start). Fallback til
        // event.source for nettlesere som ikke sender port med.
        if (port) {
          port.postMessage({ type: 'navigate', url })
        } else if (event.source) {
          event.source.postMessage({ type: 'navigate', url })
        }
      }
    } catch {
      // Cache-oppslag feilet — ingen svar. Klienten faller uansett tilbake
      // til sin egen ferskhetslogikk.
    }
  })()
  // Valgfritt kall (#626-review): waitUntil finnes på ExtendableMessageEvent,
  // men et kast her ville ligget utenfor try/catch-en over og tatt ned hele
  // fallback-protokollen. jobb kaster aldri selv, så en manglende waitUntil
  // koster kun livstidsgarantien.
  event.waitUntil?.(jobb)
})
