// @vitest-environment jsdom
// Klient-halvparten av push-klikk-overleveringen (#626): sjekkPendingNav() leser
// Cache Storage FØR den rører navigator.serviceWorker.ready, så stien virker
// selv om SW-instansen er død, byttet ut eller ikke kontrollerer siden.
// Konsumering skjer når navigasjonen har LYKTES, ikke ved lesing (#688).
// Se CLAUDE.md § Policy: Navigasjon.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import ServiceWorkerRegistrering from '@/components/ServiceWorkerRegistrering'
import { PUSH_KLIKK_VINDU_MS, PUSH_KLIKK_MAKS_FORSOK } from '@/lib/konstanter'

// feilNavn beholdes ekte — en stubbet variant ville gjort assertion på `name` verdiløs.
vi.mock('@/lib/klient-logg', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/klient-logg')>()),
  sendFeilBeacon: vi.fn(),
  meldKlientfeil: vi.fn(),
}))

import { sendFeilBeacon, meldKlientfeil } from '@/lib/klient-logg'

// Bevisst duplisert fra lib/pending-nav.ts: drifter den, feiler testene av seg
// selv fordi cache-mocken kun svarer på denne nøkkelen.
const NAV_NOKKEL = 'https://pwa-nav.invalid/pending'

type LagretEntry = {
  url: string
  ts: number
  klikk_id?: string
  forsok?: number
  navigert?: boolean
}

class FakeResponse {
  constructor(private readonly body: string) {}
  async json() {
    return JSON.parse(this.body)
  }
}

// put() persisterer, så testene kan lese HVA som ble skrevet (forsok/klikk_id/
// navigert), ikke bare AT put ble kalt.
// `treghetMs` gjør cache-operasjonene trege (fake timers); uten den blir kilde
// nr. 1 alltid ferdig før nr. 2 starter, og race-testene reproduserer ingenting.
function lagFakeCache(entry?: LagretEntry, treghetMs = 0) {
  let lagret: { json(): Promise<unknown> } | undefined = entry
    ? new FakeResponse(JSON.stringify(entry))
    : undefined
  const treghet = () =>
    treghetMs > 0 ? new Promise<void>(r => setTimeout(r, treghetMs)) : Promise.resolve()
  return {
    match: vi.fn(async (key: string) => {
      await treghet()
      return key === NAV_NOKKEL ? lagret : undefined
    }),
    delete: vi.fn(async (key: string) => {
      await treghet()
      if (key === NAV_NOKKEL) lagret = undefined
      return true
    }),
    put: vi.fn(async (key: string, val: { json(): Promise<unknown> }) => {
      if (key !== NAV_NOKKEL) return
      // Ekte Cache Storage gir en fersk Response per match(); en lagret
      // instans kan bare leses én gang («Body is unusable»). Materialiser her.
      const data = await val.json()
      lagret = new FakeResponse(JSON.stringify(data))
    }),
  }
}

function lagCachesMock(cache: ReturnType<typeof lagFakeCache>) {
  return { open: vi.fn(async () => cache) }
}

async function sistLagret(cache: ReturnType<typeof lagFakeCache>): Promise<LagretEntry | null> {
  const lagret = await cache.match(NAV_NOKKEL)
  if (!lagret) return null
  return (await lagret.json()) as LagretEntry
}

function lagSwMock(opts: { onCheckPendingNav?: (port2: MessagePort) => void } = {}) {
  return {
    register: vi.fn(async () => ({})),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    ready: Promise.resolve({
      active: {
        postMessage: vi.fn((msg: { type?: string }, transfer?: MessagePort[]) => {
          if (msg?.type === 'check-pending-nav' && opts.onCheckPendingNav) {
            const port2 = transfer?.[0]
            if (port2) opts.onCheckPendingNav(port2)
          }
        }),
      },
    }),
  }
}

// Fanger 'message'-lytteren, så broadcast-stien (uten entryHint) kan trigges direkte.
function lagSwMockMedLytter() {
  const lyttere: Record<string, ((e: MessageEvent) => void)[]> = {}
  return {
    sw: {
      register: vi.fn(async () => ({})),
      addEventListener: vi.fn((type: string, fn: (e: MessageEvent) => void) => {
        ;(lyttere[type] ??= []).push(fn)
      }),
      removeEventListener: vi.fn(),
      ready: new Promise(() => {}),
    },
    send(data: unknown) {
      for (const fn of lyttere['message'] ?? []) fn({ data } as MessageEvent)
    },
  }
}

// Flusher mikrotasks UTEN faketimere: isolerer broadcast-stien, siden
// advanceTimersByTime også ville fyrt cache-pollen mot samme nøkkel.
async function flushMikrotasks(runder = 30) {
  for (let i = 0; i < runder; i++) await Promise.resolve()
}

// Negative assertions går via denne: expect.anything() matcher ikke undefined,
// som beacon-kallene sender som 3./4. argument — en slik not-assert passerer alltid.
function loggedeEventer(): string[] {
  return vi.mocked(sendFeilBeacon).mock.calls.map(kall => kall[0])
}

// Aldri-resolverende ready: reg.active utilgjengelig. Cache-stien skal navigere uansett.
function lagHengendeSwMock() {
  return {
    register: vi.fn(async () => ({})),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    ready: new Promise(() => {}),
  }
}

const OPPRINNELIG_LOCATION = window.location

// jsdom sin location.assign er ikke konfigurerbar (vi.spyOn: «Cannot redefine
// property»), så hele location-objektet erstattes.
function stubLocation(impl?: () => void) {
  const assign = impl ? vi.fn(impl) : vi.fn()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...OPPRINNELIG_LOCATION, assign },
  })
  return assign
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.mocked(sendFeilBeacon).mockClear()
  vi.mocked(meldKlientfeil).mockClear()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: OPPRINNELIG_LOCATION,
  })
})

describe('ServiceWorkerRegistrering — push-klikk-navigasjon (#626, utsatt konsumering #688)', () => {
  it('naviger til url fra en fersk cache-entry: IKKE slettet, men skrevet tilbake med forsok:1/navigert:true/klikk_id bevart', async () => {
    const assign = stubLocation()
    const cache = lagFakeCache({
      url: `${window.location.origin}/chat`,
      ts: Date.now(),
      klikk_id: 'klikk-abc',
    })
    vi.stubGlobal('caches', lagCachesMock(cache))
    vi.stubGlobal('navigator', { ...window.navigator, serviceWorker: lagHengendeSwMock() })

    render(<ServiceWorkerRegistrering />)
    // KUN første poll (t=0): en ekte assign() river ned siden, men stubben gjør
    // det ikke — senere polls ville lest entryen igjen og talt forsok videre.
    await vi.advanceTimersByTimeAsync(0)

    expect(assign).toHaveBeenCalledWith(`${window.location.origin}/chat`)
    // Kjernen i #688: ikke slett før auth kan ha omdirigert til /login.
    expect(cache.delete).not.toHaveBeenCalled()
    const lagret = await sistLagret(cache)
    expect(lagret).toMatchObject({
      url: `${window.location.origin}/chat`,
      klikk_id: 'klikk-abc',
      forsok: 1,
      navigert: true,
    })
    // Hele kontekst-objektet: nøklene må matche KONTEKST_WHITELIST i
    // lib/logg-sanitering.ts, ellers strippes de stille (#676, #681).
    expect(sendFeilBeacon).toHaveBeenCalledWith(
      'push.klikk.navigert',
      'push-klikk levert via cache',
      undefined,
      {
        kilde: 'cache',
        allerede_paa_maal: false,
        synlighet: document.visibilityState,
        klikk_id: 'klikk-abc',
        forsok: 1,
        maal: '/chat',
      },
      'warn',
    )
    // `maal` er stien vi navigerer TIL, ikke avreisesiden — radens `url`-felt
    // er avreisesiden, og forvekslingen ga feiltolket telemetri (#626).
    const [, , , kontekst] = vi.mocked(sendFeilBeacon).mock.calls[0]
    expect(kontekst).toMatchObject({ maal: '/chat' })
    expect((kontekst as { maal?: string })?.maal).not.toBe(window.location.pathname)
  })

  it('KRITISK: navigerer likevel selv om navigator.serviceWorker.ready aldri resolver (reg.active utilgjengelig)', async () => {
    const assign = stubLocation()
    const cache = lagFakeCache({ url: `${window.location.origin}/samtaler/1`, ts: Date.now() })
    vi.stubGlobal('caches', lagCachesMock(cache))
    // ready resolver aldri — cache-stien må ikke vente på den.
    vi.stubGlobal('navigator', { ...window.navigator, serviceWorker: lagHengendeSwMock() })

    render(<ServiceWorkerRegistrering />)
    await vi.advanceTimersByTimeAsync(2000)

    expect(assign).toHaveBeenCalledWith(`${window.location.origin}/samtaler/1`)
  })

  it('foreldet entry (eldre enn PUSH_KLIKK_VINDU_MS): ingen navigasjon, entry slettet, beacon sendt', async () => {
    const assign = stubLocation()
    const gammelTs = Date.now() - PUSH_KLIKK_VINDU_MS - 1000
    const cache = lagFakeCache({ url: `${window.location.origin}/chat`, ts: gammelTs })
    vi.stubGlobal('caches', lagCachesMock(cache))
    vi.stubGlobal('navigator', { ...window.navigator, serviceWorker: lagHengendeSwMock() })

    render(<ServiceWorkerRegistrering />)
    await vi.advanceTimersByTimeAsync(2000)

    expect(assign).not.toHaveBeenCalled()
    expect(cache.delete).toHaveBeenCalledWith(NAV_NOKKEL)
    expect(sendFeilBeacon).toHaveBeenCalledWith(
      'klient.pushklikk.foreldet',
      expect.any(String),
      undefined,
      undefined,
      'warn',
    )
  })

  // Landing: vi står allerede på målet (en tidligere sidevisning navigerte hit).
  // Entryen konsumeres nå.
  it('landing: vi står allerede på målet — entry konsumert, navigert logget (entry.navigert var ikke satt)', async () => {
    const assign = stubLocation()
    const cache = lagFakeCache({ url: window.location.href, ts: Date.now(), klikk_id: 'klikk-xyz' })
    vi.stubGlobal('caches', lagCachesMock(cache))
    vi.stubGlobal('navigator', { ...window.navigator, serviceWorker: lagHengendeSwMock() })

    render(<ServiceWorkerRegistrering />)
    await vi.advanceTimersByTimeAsync(2000)

    expect(assign).not.toHaveBeenCalled()
    expect(cache.delete).toHaveBeenCalledWith(NAV_NOKKEL)
    expect(sendFeilBeacon).toHaveBeenCalledWith(
      'push.klikk.navigert',
      'push-klikk levert via cache',
      undefined,
      {
        kilde: 'cache',
        allerede_paa_maal: true,
        synlighet: document.visibilityState,
        klikk_id: 'klikk-xyz',
        forsok: undefined,
        maal: '/',
      },
      'warn',
    )
  })

  // navigert: true = forrige side logget alt push.klikk.navigert. Landingen er
  // egen hendelse (push.klikk.landet, #626); en ny navigert-rad ville
  // dobbelttalt klikket.
  it('landing: navigert:true på entryen gir ÉN push.klikk.landet med riktig klikk_id/maal, og INGEN ny push.klikk.navigert', async () => {
    const assign = stubLocation()
    const cache = lagFakeCache({
      url: window.location.href,
      ts: Date.now(),
      klikk_id: 'klikk-xyz',
      forsok: 1,
      navigert: true,
    })
    vi.stubGlobal('caches', lagCachesMock(cache))
    vi.stubGlobal('navigator', { ...window.navigator, serviceWorker: lagHengendeSwMock() })

    render(<ServiceWorkerRegistrering />)
    await vi.advanceTimersByTimeAsync(2000)

    expect(assign).not.toHaveBeenCalled()
    expect(cache.delete).toHaveBeenCalledWith(NAV_NOKKEL)
    expect(loggedeEventer()).not.toContain('push.klikk.navigert')
    expect(loggedeEventer().filter(e => e === 'push.klikk.landet')).toHaveLength(1)
    expect(sendFeilBeacon).toHaveBeenCalledWith(
      'push.klikk.landet',
      expect.any(String),
      undefined,
      { kilde: 'cache', klikk_id: 'klikk-xyz', forsok: 1, maal: '/' },
      'warn',
    )
  })

  // Loop-bryter: et mål forsøkt PUSH_KLIKK_MAKS_FORSOK ganger uten landing forkastes.
  it(`forsok >= PUSH_KLIKK_MAKS_FORSOK (${PUSH_KLIKK_MAKS_FORSOK}): ingen navigasjon, entry slettet, klient.pushklikk.oppgitt logget`, async () => {
    const assign = stubLocation()
    const cache = lagFakeCache({
      url: `${window.location.origin}/chat`,
      ts: Date.now(),
      klikk_id: 'klikk-abc',
      forsok: PUSH_KLIKK_MAKS_FORSOK,
    })
    vi.stubGlobal('caches', lagCachesMock(cache))
    vi.stubGlobal('navigator', { ...window.navigator, serviceWorker: lagHengendeSwMock() })

    render(<ServiceWorkerRegistrering />)
    await vi.advanceTimersByTimeAsync(2000)

    expect(assign).not.toHaveBeenCalled()
    expect(cache.delete).toHaveBeenCalledWith(NAV_NOKKEL)
    expect(sendFeilBeacon).toHaveBeenCalledWith(
      'klient.pushklikk.oppgitt',
      expect.any(String),
      undefined,
      { klikk_id: 'klikk-abc', maal: '/chat', forsok: PUSH_KLIKK_MAKS_FORSOK },
      'warn',
    )
  })

  it('ugyldig/kryss-origin url i cache-entryen: ingen navigasjon, entry slettet (ny oppførsel, #688)', async () => {
    const assign = stubLocation()
    const cache = lagFakeCache({ url: 'https://evil.example/x', ts: Date.now() })
    vi.stubGlobal('caches', lagCachesMock(cache))
    vi.stubGlobal('navigator', { ...window.navigator, serviceWorker: lagHengendeSwMock() })

    render(<ServiceWorkerRegistrering />)
    await vi.advanceTimersByTimeAsync(2000)

    expect(assign).not.toHaveBeenCalled()
    expect(cache.delete).toHaveBeenCalledWith(NAV_NOKKEL)
  })

  // Broadcast/kanal sender ingen entryHint, så entryen må leses FØR sletting —
  // ellers forsvinner klikk_id/forsok, og cache-pollen mister oppføringen (#688).
  it('landing via BROADCAST (ingen entryHint): leser entryen FØR sletting, så klikk_id/forsok følger med', async () => {
    const assign = stubLocation()
    const cache = lagFakeCache({
      url: window.location.href,
      ts: Date.now(),
      klikk_id: 'klikk-bc',
      forsok: 2,
    })
    vi.stubGlobal('caches', lagCachesMock(cache))
    const { sw, send } = lagSwMockMedLytter()
    vi.stubGlobal('navigator', { ...window.navigator, serviceWorker: sw })

    render(<ServiceWorkerRegistrering />)
    send({ type: 'navigate', url: window.location.href })
    await flushMikrotasks()

    expect(assign).not.toHaveBeenCalled()
    expect(cache.delete).toHaveBeenCalledWith(NAV_NOKKEL)
    expect(sendFeilBeacon).toHaveBeenCalledWith(
      'push.klikk.navigert',
      'push-klikk levert via broadcast',
      undefined,
      {
        kilde: 'broadcast',
        allerede_paa_maal: true,
        synlighet: document.visibilityState,
        klikk_id: 'klikk-bc',
        forsok: 2,
        maal: '/',
      },
      'warn',
    )
  })

  // Dobbel-logging-guarden må også gjelde når kilden er broadcast.
  it('landing via BROADCAST med navigert:true: push.klikk.landet logget, ingen ny push.klikk.navigert', async () => {
    stubLocation()
    const cache = lagFakeCache({
      url: window.location.href,
      ts: Date.now(),
      klikk_id: 'klikk-bc',
      forsok: 1,
      navigert: true,
    })
    vi.stubGlobal('caches', lagCachesMock(cache))
    const { sw, send } = lagSwMockMedLytter()
    vi.stubGlobal('navigator', { ...window.navigator, serviceWorker: sw })

    render(<ServiceWorkerRegistrering />)
    send({ type: 'navigate', url: window.location.href })
    await flushMikrotasks()

    expect(cache.delete).toHaveBeenCalledWith(NAV_NOKKEL)
    expect(loggedeEventer()).not.toContain('push.klikk.navigert')
    expect(sendFeilBeacon).toHaveBeenCalledWith(
      'push.klikk.landet',
      expect.any(String),
      undefined,
      { kilde: 'broadcast', klikk_id: 'klikk-bc', forsok: 1, maal: '/' },
      'warn',
    )
  })

  // Ferskhetssjekken kommer ETTER identitetssjekken: en treg innlogging lander
  // riktig og skal ikke logges som «foreldet» (#688).
  it('vi står på målet med en entry eldre enn vinduet: logges som navigert, IKKE som foreldet', async () => {
    const assign = stubLocation()
    const cache = lagFakeCache({
      url: window.location.href,
      ts: Date.now() - PUSH_KLIKK_VINDU_MS - 60_000,
      klikk_id: 'klikk-sen',
    })
    vi.stubGlobal('caches', lagCachesMock(cache))
    vi.stubGlobal('navigator', { ...window.navigator, serviceWorker: lagHengendeSwMock() })

    render(<ServiceWorkerRegistrering />)
    await vi.advanceTimersByTimeAsync(2000)

    expect(assign).not.toHaveBeenCalled()
    expect(cache.delete).toHaveBeenCalledWith(NAV_NOKKEL)
    expect(sendFeilBeacon).toHaveBeenCalledWith(
      'push.klikk.navigert',
      'push-klikk levert via cache',
      undefined,
      {
        kilde: 'cache',
        allerede_paa_maal: true,
        synlighet: document.visibilityState,
        klikk_id: 'klikk-sen',
        forsok: undefined,
        maal: '/',
      },
      'warn',
    )
    expect(loggedeEventer()).not.toContain('klient.pushklikk.foreldet')
  })

  // Race-guarden (PR #690): SW-en skriver cachen og broadcaster rett etter, så
  // cache-poll og 'message' kommer normalt samtidig. Uten serialisering ga ett
  // klikk to navigasjoner og to telemetri-rader.
  it('RACE: cache-poll og broadcast samtidig gir ÉN navigasjon og ÉN push.klikk.navigert', async () => {
    const assign = stubLocation()
    const cache = lagFakeCache({
      url: `${window.location.origin}/chat`,
      ts: Date.now(),
      klikk_id: 'klikk-race',
    })
    vi.stubGlobal('caches', lagCachesMock(cache))
    const { sw, send } = lagSwMockMedLytter()
    vi.stubGlobal('navigator', { ...window.navigator, serviceWorker: sw })

    render(<ServiceWorkerRegistrering />)
    // Begge slippes løs før noen har fullført lese/øke/skrive-runden.
    send({ type: 'navigate', url: `${window.location.origin}/chat` })
    await vi.advanceTimersByTimeAsync(0)
    await flushMikrotasks()

    expect(assign).toHaveBeenCalledTimes(1)
    expect(assign).toHaveBeenCalledWith(`${window.location.origin}/chat`)
    expect(loggedeEventer().filter(e => e === 'push.klikk.navigert')).toHaveLength(1)
    // 1, ikke 2: den andre kilden skal ikke telle et eget forsøk på samme klikk.
    expect(await sistLagret(cache)).toMatchObject({ klikk_id: 'klikk-race', forsok: 1 })
  })

  // Samme race på landings-grenen: kall nr. 2 kan sitte på en entryHint lest
  // før nr. 1 slettet raden.
  it('RACE: cache-poll og broadcast lander samtidig — kun ÉN push.klikk.navigert', async () => {
    stubLocation()
    // Treg cache, så begge leser entryen før noen har slettet den.
    const cache = lagFakeCache(
      { url: window.location.href, ts: Date.now(), klikk_id: 'klikk-race-landing' },
      5,
    )
    vi.stubGlobal('caches', lagCachesMock(cache))
    const { sw, send } = lagSwMockMedLytter()
    vi.stubGlobal('navigator', { ...window.navigator, serviceWorker: sw })

    render(<ServiceWorkerRegistrering />)
    send({ type: 'navigate', url: window.location.href })
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(50)
    await flushMikrotasks()

    expect(cache.delete).toHaveBeenCalledWith(NAV_NOKKEL)
    expect(loggedeEventer().filter(e => e === 'push.klikk.navigert')).toHaveLength(1)
  })

  // Samme race med navigert:true: maks ÉN rad uansett gren (#626).
  it('RACE: cache-poll og broadcast lander samtidig på en navigert:true-entry — kun ÉN push.klikk.landet', async () => {
    stubLocation()
    const cache = lagFakeCache(
      { url: window.location.href, ts: Date.now(), klikk_id: 'klikk-race-landet', forsok: 1, navigert: true },
      5,
    )
    vi.stubGlobal('caches', lagCachesMock(cache))
    const { sw, send } = lagSwMockMedLytter()
    vi.stubGlobal('navigator', { ...window.navigator, serviceWorker: sw })

    render(<ServiceWorkerRegistrering />)
    send({ type: 'navigate', url: window.location.href })
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(50)
    await flushMikrotasks()

    expect(cache.delete).toHaveBeenCalledWith(NAV_NOKKEL)
    expect(loggedeEventer().filter(e => e === 'push.klikk.landet')).toHaveLength(1)
    expect(loggedeEventer()).not.toContain('push.klikk.navigert')
  })

  it('tom cache faller tilbake til MessageChannel-stien og navigerer på SW-svar', async () => {
    const assign = stubLocation()
    const cache = lagFakeCache(undefined)
    vi.stubGlobal('caches', lagCachesMock(cache))
    vi.stubGlobal('navigator', {
      ...window.navigator,
      serviceWorker: lagSwMock({
        onCheckPendingNav: (port2) => {
          port2.postMessage({ type: 'navigate', url: `${window.location.origin}/samtaler/1` })
        },
      }),
    })

    render(<ServiceWorkerRegistrering />)
    await vi.advanceTimersByTimeAsync(2000)

    expect(assign).toHaveBeenCalledWith(`${window.location.origin}/samtaler/1`)
  })

  // MessageChannel-grenen har per definisjon tom cache, så klikk_id må komme
  // med i SW-svaret (#626).
  it('MessageChannel-svar med klikk_id: navigasjonen er uendret, men klikk_id følger med i telemetrien', async () => {
    const assign = stubLocation()
    const cache = lagFakeCache(undefined)
    vi.stubGlobal('caches', lagCachesMock(cache))
    vi.stubGlobal('navigator', {
      ...window.navigator,
      serviceWorker: lagSwMock({
        onCheckPendingNav: (port2) => {
          port2.postMessage({
            type: 'navigate',
            url: `${window.location.origin}/samtaler/1`,
            klikk_id: 'klikk-kanal',
          })
        },
      }),
    })

    render(<ServiceWorkerRegistrering />)
    await vi.advanceTimersByTimeAsync(2000)

    expect(assign).toHaveBeenCalledWith(`${window.location.origin}/samtaler/1`)
    expect(sendFeilBeacon).toHaveBeenCalledWith(
      'push.klikk.navigert',
      'push-klikk levert via kanal',
      undefined,
      {
        kilde: 'kanal',
        allerede_paa_maal: false,
        synlighet: document.visibilityState,
        klikk_id: 'klikk-kanal',
        forsok: 1,
        maal: '/samtaler/1',
      },
      'warn',
    )
  })

  // Kanal-svaret må bære navigert/forsok, ellers logges landingen som ny
  // push.klikk.navigert (#626).
  it('MessageChannel-svar med navigert:true på målsiden logger push.klikk.landet med bevart forsok', async () => {
    const assign = stubLocation()
    const cache = lagFakeCache(undefined)
    vi.stubGlobal('caches', lagCachesMock(cache))
    vi.stubGlobal('navigator', {
      ...window.navigator,
      serviceWorker: lagSwMock({
        onCheckPendingNav: (port2) => {
          port2.postMessage({
            type: 'navigate',
            url: window.location.href,
            klikk_id: 'klikk-kanal',
            forsok: 2,
            navigert: true,
          })
        },
      }),
    })

    render(<ServiceWorkerRegistrering />)
    await vi.advanceTimersByTimeAsync(2000)

    expect(assign).not.toHaveBeenCalled()
    expect(loggedeEventer()).not.toContain('push.klikk.navigert')
    expect(sendFeilBeacon).toHaveBeenCalledWith(
      'push.klikk.landet',
      'push-klikk landet på mål via kanal',
      undefined,
      {
        kilde: 'kanal',
        klikk_id: 'klikk-kanal',
        forsok: 2,
        maal: new URL(window.location.href).pathname,
      },
      'warn',
    )
  })

  // Kanal-svarets forsok styrer IKKE loop-bryteren: cachen skrives med
  // forsok 1 og ferskt ts; kun telemetrien bærer det faktiske nummeret.
  it('MessageChannel-svar med eksisterende forsok utenfor målet: cache-skrivingen er uendret, telemetrien teller videre', async () => {
    vi.setSystemTime(new Date('2026-10-02T10:00:00Z'))
    const assign = stubLocation()
    const cache = lagFakeCache(undefined)
    vi.stubGlobal('caches', lagCachesMock(cache))
    vi.stubGlobal('navigator', {
      ...window.navigator,
      serviceWorker: lagSwMock({
        onCheckPendingNav: (port2) => {
          port2.postMessage({
            type: 'navigate',
            url: `${window.location.origin}/samtaler/1`,
            klikk_id: 'klikk-kanal',
            forsok: 2,
            navigert: true,
          })
        },
      }),
    })

    render(<ServiceWorkerRegistrering />)
    await vi.advanceTimersByTimeAsync(2000)

    expect(assign).toHaveBeenCalledWith(`${window.location.origin}/samtaler/1`)
    const lagret = await sistLagret(cache)
    expect(lagret).toMatchObject({ forsok: 1, navigert: true, klikk_id: 'klikk-kanal' })
    // ts settes ved skrivingen; SW-svaret sender den ikke.
    expect(lagret?.ts).toBeGreaterThanOrEqual(new Date('2026-10-02T10:00:00Z').getTime())
    expect(sendFeilBeacon).toHaveBeenCalledWith(
      'push.klikk.navigert',
      'push-klikk levert via kanal',
      undefined,
      expect.objectContaining({ kilde: 'kanal', klikk_id: 'klikk-kanal', forsok: 3, allerede_paa_maal: false }),
      'warn',
    )
  })
})

// Feilstiene er stumme av natur (avvist promise i handler/setTimeout) — blir
// de svelget, svikter push-overleveringen uten spor. Pinner at de logges.
describe('ServiceWorkerRegistrering — observability på feilstiene (#626-review)', () => {
  it('feilet SW-registrering meldes til klientfeil-loggen (ikke console.error)', async () => {
    stubLocation()
    const feil = new Error('SecurityError: registration failed')
    vi.stubGlobal('caches', lagCachesMock(lagFakeCache(undefined)))
    vi.stubGlobal('navigator', {
      ...window.navigator,
      serviceWorker: {
        ...lagHengendeSwMock(),
        register: vi.fn(async () => {
          throw feil
        }),
      },
    })

    render(<ServiceWorkerRegistrering />)
    await vi.advanceTimersByTimeAsync(2000)

    expect(meldKlientfeil).toHaveBeenCalledWith('klient.sw.registrering.feilet', feil)
  })

  // navigerTil skal ikke svelge feil internt — da blir kallstedenes .catch()
  // død kode og feilen forsvinner (PR #690).
  it('uventet feil i navigerTil bobler til kallstedet og logges som klient.sw.pendingnav.feilet', async () => {
    stubLocation(() => {
      throw new Error('assign eksploderte')
    })
    const cache = lagFakeCache({ url: `${window.location.origin}/chat`, ts: Date.now() })
    vi.stubGlobal('caches', lagCachesMock(cache))
    vi.stubGlobal('navigator', { ...window.navigator, serviceWorker: lagHengendeSwMock() })

    render(<ServiceWorkerRegistrering />)
    await vi.advanceTimersByTimeAsync(0)
    await flushMikrotasks()

    expect(sendFeilBeacon).toHaveBeenCalledWith(
      'klient.sw.pendingnav.feilet',
      'assign eksploderte',
      expect.any(String),
      { name: 'Error' },
      'warn',
    )
  })

  it('avvist fallback-sti (serviceWorker.ready rejecter) logges som warn i stedet for å bli en unhandled rejection', async () => {
    stubLocation()
    vi.stubGlobal('caches', lagCachesMock(lagFakeCache(undefined)))
    const avvistReady = Promise.reject(new Error('ready avvist'))
    // Ellers flagger Node mock-promisen som unhandled før komponenten awaiter
    // den. Komponenten får rejection-en uansett.
    avvistReady.catch(() => {})
    vi.stubGlobal('navigator', {
      ...window.navigator,
      serviceWorker: {
        register: vi.fn(async () => ({})),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        // Tom cache → MessageChannel-stien, som awaiter ready. try/catch i
        // lib/pending-nav.ts dekker kun cache-lesingen.
        ready: avvistReady,
      },
    })

    render(<ServiceWorkerRegistrering />)
    await vi.advanceTimersByTimeAsync(2000)

    expect(sendFeilBeacon).toHaveBeenCalledWith(
      'klient.sw.pendingnav.feilet',
      'ready avvist',
      expect.any(String),
      { name: 'Error' },
      'warn',
    )
  })
})
