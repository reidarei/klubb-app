// Kjører den ekte teksten i public/sw.js i en vm-sandbox (#626). Formålet er
// IKKE bare å teste at koden kjører — sandboxen dobler som syntakssjekk på en
// fil vi ellers aldri type-sjekker — men å pinne selve overleverings-
// kontrakten: at push-klikk-URL-en overlever et SW-versjonsbytte via Cache
// Storage, ikke via en variabel i SW-minnet.
//
// «Fersk SW-instans» simuleres ved å kjøre sw.js-teksten på nytt i en HELT NY
// vm-context (nye i-minne-variabler), men med samme Cache Storage-mock delt
// inn — akkurat som ekte Cache Storage overlever at self.skipWaiting() +
// clients.claim() bytter ut SW-instansen ved en deploy.

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { PUSH_KLIKK_VINDU_MS } from '@/lib/konstanter'

const SW_KILDE = readFileSync(path.resolve(__dirname, '../public/sw.js'), 'utf-8')

// Speiler navnene i public/sw.js — duplisert bevisst (ikke lest ut av kilden
// som STATIC_CACHE under): en literal her asserterer den FORVENTEDE verdien,
// mens et uttrekk ville fulgt etter en feil i sw.js uten å si fra. Drift mot
// sw.js og klienten fanges av «navnesynk»-pinningen nederst i fila.
const NAV_CACHE = 'pwa-nav'
const NAV_NOKKEL = 'https://pwa-nav.invalid/pending'
// Vilkårlig test-origin. Skal IKKE være prod-domenet: fila deles med det
// offentlige nedstrøms-repoet, og lekkasjevakten i sync-skriptet greper etter
// klubbidentitet der.
const ORIGIN = 'https://klubb.example.com'

// STATIC_CACHE leses ut av kilden i stedet for å dupliseres — navnet er
// klubbspesifikt og hører ikke hjemme som literal her (se ORIGIN over).
const STATIC_CACHE = SW_KILDE.match(/const STATIC_CACHE = '([^']+)'/)![1]

class FakeResponse {
  constructor(private readonly body: string) {}
  async json() {
    return JSON.parse(this.body)
  }
  async text() {
    return this.body
  }
}

type FakeCache = {
  match(key: string): Promise<FakeResponse | undefined>
  put(key: string, val: FakeResponse): Promise<void>
  delete(key: string): Promise<boolean>
  keys(): Promise<string[]>
  addAll(): Promise<void>
}

function lagFakeCacheStorage() {
  const store = new Map<string, Map<string, FakeResponse>>()
  return {
    async open(navn: string): Promise<FakeCache> {
      if (!store.has(navn)) store.set(navn, new Map())
      const m = store.get(navn)!
      return {
        async match(key: string) {
          return m.get(key)
        },
        async put(key: string, val: FakeResponse) {
          m.set(key, val)
        },
        async delete(key: string) {
          return m.delete(key)
        },
        async keys() {
          return Array.from(m.keys())
        },
        async addAll() {},
      }
    },
    async keys() {
      return Array.from(store.keys())
    },
    async delete(navn: string) {
      return store.delete(navn)
    },
  }
}

function medWaitUntil<T extends Record<string, unknown>>(
  event: T,
): T & { waitUntil: (p: unknown) => void; _waitUntil?: unknown } {
  const e = event as T & { waitUntil: (p: unknown) => void; _waitUntil?: unknown }
  e.waitUntil = (p: unknown) => {
    e._waitUntil = p
  }
  return e
}

function lagKlient(url = `${ORIGIN}/agenda`) {
  return {
    url,
    postMessage: vi.fn(),
    focus: vi.fn(async () => {}),
  }
}

function lagPushEvent(payload: unknown) {
  return medWaitUntil({ data: { json: () => payload } })
}

function lagNotificationClickEvent(url?: string) {
  return medWaitUntil({ notification: { close: vi.fn(), data: { url } } })
}

// Bygger en «fersk SW-instans»: en ny vm-context der sw.js kjøres helt på
// nytt. Cache Storage kan deles inn via deltCacheStorage for å simulere at
// den overlever på tvers av instanser — alt annet (inkl. eventuelle
// i-minne-variabler i skriptet) starter blankt, akkurat som en instans som
// nettopp har blitt byttet ut.
function lastSwInstans(
  opts: {
    deltCacheStorage?: ReturnType<typeof lagFakeCacheStorage>
    klienter?: ReturnType<typeof lagKlient>[]
  } = {},
) {
  const listeners: Record<string, Array<(event: unknown) => unknown>> = {}
  const cachesMock = opts.deltCacheStorage ?? lagFakeCacheStorage()
  const clientsMock = {
    matchAll: vi.fn(async () => opts.klienter ?? []),
    openWindow: vi.fn(async () => undefined),
    claim: vi.fn(async () => undefined),
  }
  const selfMock = {
    addEventListener(type: string, fn: (event: unknown) => unknown) {
      listeners[type] = listeners[type] ?? []
      listeners[type].push(fn)
    },
    skipWaiting: vi.fn(),
    registration: { showNotification: vi.fn() },
    location: { origin: ORIGIN },
    clients: clientsMock,
  }

  const sandbox = {
    self: selfMock,
    caches: cachesMock,
    clients: clientsMock,
    Response: FakeResponse,
    URL,
    console,
    // notificationclick racer cache-skrivingen mot en timeout — uten timer-
    // globalene i sandboxen ville sw.js kastet ReferenceError her.
    setTimeout,
    clearTimeout,
  }
  vm.createContext(sandbox)
  vm.runInContext(SW_KILDE, sandbox, { filename: 'sw.js' })

  async function dispatch(type: string, event: Record<string, unknown>) {
    const fns = listeners[type] ?? []
    for (const fn of fns) fn(event)
    if (event._waitUntil) await event._waitUntil
  }

  return { dispatch, cachesMock, clientsMock, selfMock }
}

describe('push-event', () => {
  it('viser notifikasjon med url og tag når tag er en ikke-tom streng (#612)', async () => {
    const { dispatch, selfMock } = lastSwInstans()
    await dispatch(
      'push',
      lagPushEvent({ tittel: 'Ny melding', melding: 'Hei gutta', url: '/chat', tag: 'chat:klubb' }),
    )
    expect(selfMock.registration.showNotification).toHaveBeenCalledWith(
      'Ny melding',
      expect.objectContaining({
        body: 'Hei gutta',
        data: { url: '/chat' },
        tag: 'chat:klubb',
        renotify: false,
      }),
    )
  })

  it('utelater tag/renotify når tag mangler', async () => {
    const { dispatch, selfMock } = lastSwInstans()
    await dispatch('push', lagPushEvent({ tittel: 'Påminnelse', melding: 'I morgen', url: '/arrangementer/1' }))
    const [, opts] = selfMock.registration.showNotification.mock.calls[0]
    expect(opts).not.toHaveProperty('tag')
    expect(opts).not.toHaveProperty('renotify')
  })
})

describe('notificationclick', () => {
  it('skriver overleveringen til NAV_CACHE FØR broadcast/openWindow ved cold-start (ingen åpne vinduer)', async () => {
    const rekkefolge: string[] = []
    const cs = lagFakeCacheStorage()
    const originalOpen = cs.open.bind(cs)
    cs.open = (async (navn: string) => {
      const cache = await originalOpen(navn)
      const originalPut = cache.put.bind(cache)
      cache.put = (async (key: string, val: FakeResponse) => {
        rekkefolge.push('cache-write')
        return originalPut(key, val)
      }) as typeof cache.put
      return cache
    }) as typeof cs.open

    const { dispatch, clientsMock } = lastSwInstans({ deltCacheStorage: cs, klienter: [] })
    clientsMock.openWindow.mockImplementation(async () => {
      rekkefolge.push('open-window')
    })

    await dispatch('notificationclick', lagNotificationClickEvent('/chat'))

    expect(rekkefolge).toEqual(['cache-write', 'open-window'])
    expect(clientsMock.openWindow).toHaveBeenCalledWith(`${ORIGIN}/chat`)

    const cache = await cs.open(NAV_CACHE)
    const lagret = await cache.match(NAV_NOKKEL)
    expect(lagret).toBeDefined()
    const parsert = await lagret!.json()
    expect(parsert.url).toBe(`${ORIGIN}/chat`)
    expect(typeof parsert.ts).toBe('number')
  })

  // Grenen med appen i BAKGRUNNEN — det var denne som faktisk feilet i #626.
  // Rekkefølgen er like kritisk her som ved cold-start: entryen må være skrevet
  // før klienten vekkes av focus() og begynner å polle.
  it('skriver overleveringen FØR broadcast og focus når et vindu allerede er åpent', async () => {
    const rekkefolge: string[] = []
    const cs = lagFakeCacheStorage()
    const originalOpen = cs.open.bind(cs)
    cs.open = (async (navn: string) => {
      const cache = await originalOpen(navn)
      const originalPut = cache.put.bind(cache)
      cache.put = (async (key: string, val: FakeResponse) => {
        rekkefolge.push('cache-write')
        return originalPut(key, val)
      }) as typeof cache.put
      return cache
    }) as typeof cs.open

    const klient = lagKlient()
    klient.postMessage.mockImplementation(() => {
      rekkefolge.push('broadcast')
    })
    klient.focus.mockImplementation(async () => {
      rekkefolge.push('focus')
    })

    const { dispatch, clientsMock } = lastSwInstans({ deltCacheStorage: cs, klienter: [klient] })

    await dispatch('notificationclick', lagNotificationClickEvent('/arrangementer/9'))

    expect(rekkefolge).toEqual(['cache-write', 'broadcast', 'focus'])
    expect(klient.postMessage).toHaveBeenCalledWith({ type: 'navigate', url: `${ORIGIN}/arrangementer/9` })
    expect(clientsMock.openWindow).not.toHaveBeenCalled()

    const cache = await cs.open(NAV_CACHE)
    expect(await cache.match(NAV_NOKKEL)).toBeDefined()
  })

  it('manglende eller kryss-origin URL: ingen cache-entry, men vinduet åpnes fortsatt på "/"', async () => {
    const cs = lagFakeCacheStorage()
    const { dispatch, clientsMock } = lastSwInstans({ deltCacheStorage: cs, klienter: [] })

    await dispatch('notificationclick', lagNotificationClickEvent(undefined))
    expect(clientsMock.openWindow).toHaveBeenCalledWith('/')
    let cache = await cs.open(NAV_CACHE)
    expect(await cache.match(NAV_NOKKEL)).toBeUndefined()

    clientsMock.openWindow.mockClear()
    await dispatch('notificationclick', lagNotificationClickEvent('https://evil.example/x'))
    expect(clientsMock.openWindow).toHaveBeenCalledWith('/')
    cache = await cs.open(NAV_CACHE)
    expect(await cache.match(NAV_NOKKEL)).toBeUndefined()
  })
})

describe('activate', () => {
  it('rydder ukjente cacher, men beholder NAV_CACHE (regresjonspinne mot #626)', async () => {
    const cs = lagFakeCacheStorage()
    await cs.open(STATIC_CACHE)
    await cs.open(NAV_CACHE)
    await cs.open('en-foreldet-cache-fra-forrige-versjon')

    const { dispatch } = lastSwInstans({ deltCacheStorage: cs })
    await dispatch('activate', medWaitUntil({}))

    const gjenvaerende = await cs.keys()
    expect(gjenvaerende).toContain(NAV_CACHE)
    expect(gjenvaerende).not.toContain('en-foreldet-cache-fra-forrige-versjon')
  })
})

describe('ferskhetsvindu', () => {
  // public/sw.js kan ikke importere lib/konstanter.ts (statisk fil, ingen
  // bundling), så literalen der må holdes i synk manuelt. Denne pinner
  // kontrakten i stedet for å la den leve som en kommentar. Understrek-
  // separatoren (30_000) normaliseres bort før sammenligning.
  it('literalen i sw.js speiler PUSH_KLIKK_VINDU_MS', () => {
    expect(SW_KILDE.replace(/(\d)_(?=\d)/g, '$1')).toContain(String(PUSH_KLIKK_VINDU_MS))
  })
})

describe('navnesynk mellom sw.js og klienten', () => {
  // NAV_CACHE og NAV_NOKKEL finnes i tre kopier (sw.js, komponenten, denne
  // fila) fordi public/sw.js er en statisk fil uten bundling og ikke kan
  // importere fra lib/. Skriveren og leseren må treffe samme cache og samme
  // nøkkel — drifter én kopi, blir overleveringen stille borte uten at noen
  // funksjonell test fanger det (begge sider ville lest sin egen tomme cache).
  const KLIENT_KILDE = readFileSync(
    path.resolve(__dirname, '../components/ServiceWorkerRegistrering.tsx'),
    'utf-8',
  )

  function lesKonstant(kilde: string, navn: string) {
    return kilde.match(new RegExp(`const ${navn} = '([^']+)'`))?.[1]
  }

  it.each([
    ['NAV_CACHE', NAV_CACHE],
    ['NAV_NOKKEL', NAV_NOKKEL],
  ])('%s er identisk i sw.js, klienten og denne testen', (navn, forventet) => {
    expect(lesKonstant(SW_KILDE, navn)).toBe(forventet)
    expect(lesKonstant(KLIENT_KILDE, navn)).toBe(forventet)
  })

  // Selve Copilot-funnet, pinnet: en same-origin path som nøkkel kan serveres
  // som sideinnhold, fordi fetch-handleren bruker caches.match(request) uten
  // cacheName og dermed søker i alle cacher — inkludert NAV_CACHE. Nøkkelen må
  // være syntetisk. Et bytte til et annet .invalid-vertsnavn er greit; en
  // «opprydding» tilbake til en ekte path skal feile her.
  it('NAV_NOKKEL er en syntetisk URL som ingen request kan matche', () => {
    expect(NAV_NOKKEL.startsWith('/')).toBe(false)
    expect(new URL(NAV_NOKKEL).hostname.endsWith('.invalid')).toBe(true)
  })
})

describe('check-pending-nav (kjernen i #626)', () => {
  it('en fersk SW-instans svarer riktig etter at FORRIGE instans skrev overleveringen', async () => {
    const deltCacheStorage = lagFakeCacheStorage()

    // Instans A: mottar klikket og lagrer overleveringen.
    const instansA = lastSwInstans({ deltCacheStorage, klienter: [] })
    await instansA.dispatch('notificationclick', lagNotificationClickEvent('/chat'))

    // Instans B: en HELT NY vm-context (= ny SW-instans etter versjonsbytte),
    // deler kun Cache Storage med instans A — akkurat som skipWaiting() +
    // clients.claim() bytter ut den kjørende SW-en uten å bevare dens minne.
    const instansB = lastSwInstans({ deltCacheStorage })

    const port = { postMessage: vi.fn() }
    await instansB.dispatch(
      'message',
      medWaitUntil({ data: { type: 'check-pending-nav' }, ports: [port] }),
    )

    expect(port.postMessage).toHaveBeenCalledWith({ type: 'navigate', url: `${ORIGIN}/chat` })
  })

  it('svarer ikke på en foreldet entry (eldre enn 30 s)', async () => {
    const deltCacheStorage = lagFakeCacheStorage()
    const cache = await deltCacheStorage.open(NAV_CACHE)
    await cache.put(NAV_NOKKEL, new FakeResponse(JSON.stringify({ url: `${ORIGIN}/chat`, ts: Date.now() - 60_000 })))

    const { dispatch } = lastSwInstans({ deltCacheStorage })
    const port = { postMessage: vi.fn() }
    await dispatch('message', medWaitUntil({ data: { type: 'check-pending-nav' }, ports: [port] }))

    expect(port.postMessage).not.toHaveBeenCalled()
  })
})
