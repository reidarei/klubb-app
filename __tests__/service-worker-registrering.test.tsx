// Pinner klient-halvparten av #626-fiksen: sjekkPendingNav() skal lese
// push-klikk-URL-en direkte fra Cache Storage FØR den i det hele tatt rører
// navigator.serviceWorker.ready. Det er nøyaktig det som gjør stien uavhengig
// av om SW-instansen som skrev overleveringen fortsatt lever, er byttet ut
// ved en versjonsoppdatering, eller aldri kontrollerer siden.
//
// «reg.active === null / ready som aldri resolver» er den kritiske testen:
// mot koden FØR denne fiksen ville sjekkPendingNav() hengt for alltid på
// `await navigator.serviceWorker.ready`, og navigasjonen ville aldri skjedd.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import ServiceWorkerRegistrering from '@/components/ServiceWorkerRegistrering'
import { PUSH_KLIKK_VINDU_MS } from '@/lib/konstanter'

// feilNavn beholdes ekte (importActual) — den er en ren klassifiserer, og en
// stubbet variant ville gjort assertion på `name` verdiløs.
vi.mock('@/lib/klient-logg', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/klient-logg')>()),
  sendFeilBeacon: vi.fn(),
  meldKlientfeil: vi.fn(),
}))

import { sendFeilBeacon, meldKlientfeil } from '@/lib/klient-logg'

// Speiler navnene i public/sw.js — duplisert bevisst, se kommentaren i
// komponenten. Drifter denne fra komponentens verdi, feiler testene under av
// seg selv: cache-mocken svarer kun på nøkkelen den kjenner.
const NAV_NOKKEL = 'https://pwa-nav.invalid/pending'

class FakeResponse {
  constructor(private readonly body: string) {}
  async json() {
    return JSON.parse(this.body)
  }
}

function lagFakeCache(entry?: { url: string; ts: number }) {
  let lagret = entry ? new FakeResponse(JSON.stringify(entry)) : undefined
  return {
    match: vi.fn(async (key: string) => (key === NAV_NOKKEL ? lagret : undefined)),
    delete: vi.fn(async (key: string) => {
      if (key === NAV_NOKKEL) lagret = undefined
      return true
    }),
    put: vi.fn(async () => {}),
  }
}

function lagCachesMock(cache: ReturnType<typeof lagFakeCache>) {
  return { open: vi.fn(async () => cache) }
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

// Aldri-resolverende ready — simulerer at reg.active er utilgjengelig eller
// at kallet henger. Cache-stien skal navigere UANSETT.
function lagHengendeSwMock() {
  return {
    register: vi.fn(async () => ({})),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    ready: new Promise(() => {}),
  }
}

const OPPRINNELIG_LOCATION = window.location

// jsdom sin window.location.assign er ikke konfigurerbar — vi.spyOn feiler
// med «Cannot redefine property». Erstatter hele location-objektet i stedet.
function stubLocation() {
  const assign = vi.fn()
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

describe('ServiceWorkerRegistrering — push-klikk-navigasjon (#626)', () => {
  it('naviger til url fra en fersk cache-entry, og sletter entryen', async () => {
    const assign = stubLocation()
    const cache = lagFakeCache({ url: `${window.location.origin}/chat`, ts: Date.now() })
    vi.stubGlobal('caches', lagCachesMock(cache))
    vi.stubGlobal('navigator', { ...window.navigator, serviceWorker: lagHengendeSwMock() })

    render(<ServiceWorkerRegistrering />)
    await vi.advanceTimersByTimeAsync(2000)

    expect(assign).toHaveBeenCalledWith(`${window.location.origin}/chat`)
    expect(cache.delete).toHaveBeenCalledWith(NAV_NOKKEL)
  })

  it('KRITISK: navigerer likevel selv om navigator.serviceWorker.ready aldri resolver (reg.active utilgjengelig)', async () => {
    const assign = stubLocation()
    const cache = lagFakeCache({ url: `${window.location.origin}/samtaler/1`, ts: Date.now() })
    vi.stubGlobal('caches', lagCachesMock(cache))
    // ready resolver ALDRI — mot koden før #626-fiksen ville dette hengt
    // sjekkPendingNav() for alltid, og assign ville aldri blitt kalt.
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

  // Identitets-vakten (#626-review): broadcast-stien navigerer allerede, og
  // slettingen av entryen er best-effort (ikke awaitet, siden location.assign
  // river ned realmet). Uten vakten laster mount-pollen samme URL en gang til.
  it('URL-en er siden vi allerede står på: ingen ny navigasjon, entry konsumert', async () => {
    const assign = stubLocation()
    const cache = lagFakeCache({ url: window.location.href, ts: Date.now() })
    vi.stubGlobal('caches', lagCachesMock(cache))
    vi.stubGlobal('navigator', { ...window.navigator, serviceWorker: lagHengendeSwMock() })

    render(<ServiceWorkerRegistrering />)
    await vi.advanceTimersByTimeAsync(2000)

    expect(assign).not.toHaveBeenCalled()
    expect(cache.delete).toHaveBeenCalledWith(NAV_NOKKEL)
  })

  it('kryss-origin url i cache-entryen ignoreres — ingen navigasjon', async () => {
    const assign = stubLocation()
    const cache = lagFakeCache({ url: 'https://evil.example/x', ts: Date.now() })
    vi.stubGlobal('caches', lagCachesMock(cache))
    vi.stubGlobal('navigator', { ...window.navigator, serviceWorker: lagHengendeSwMock() })

    render(<ServiceWorkerRegistrering />)
    await vi.advanceTimersByTimeAsync(2000)

    expect(assign).not.toHaveBeenCalled()
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
})

// Feilstiene i denne komponenten er stumme av natur: en avvist promise i en
// event-handler eller et setTimeout gir ingen synlig effekt i UI-et. Blir de
// svelget, svikter push-overleveringen uten spor — nøyaktig blindsonen #626
// handler om. Testene under pinner at begge går til klientfeil-loggen.
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

  it('avvist fallback-sti (serviceWorker.ready rejecter) logges som warn i stedet for å bli en unhandled rejection', async () => {
    stubLocation()
    vi.stubGlobal('caches', lagCachesMock(lagFakeCache(undefined)))
    const avvistReady = Promise.reject(new Error('ready avvist'))
    // Fixture-side no-op-catch: uten den flagger Node selve mock-promisen som
    // unhandled i tiden før komponenten rekker å awaite den. Komponenten får
    // rejection-en uansett — dette skjuler ikke det testen måler.
    avvistReady.catch(() => {})
    vi.stubGlobal('navigator', {
      ...window.navigator,
      serviceWorker: {
        register: vi.fn(async () => ({})),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        // Cachen er tom, så sjekkPendingNav faller til MessageChannel-stien —
        // og DEN awaiter ready. Den interne try/catch i lesPendingNav dekker
        // kun cache-lesingen, så uten wrapperen bobler denne ut som en
        // unhandledrejection.
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
