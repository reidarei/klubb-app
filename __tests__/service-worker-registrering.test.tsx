// Pinner klient-halvparten av #626-fiksen: sjekkPendingNav() skal lese
// push-klikk-URL-en direkte fra Cache Storage FØR den i det hele tatt rører
// navigator.serviceWorker.ready. Det er nøyaktig det som gjør stien uavhengig
// av om SW-instansen som skrev overleveringen fortsatt lever, er byttet ut
// ved en versjonsoppdatering, eller aldri kontrollerer siden.
//
// «reg.active === null / ready som aldri resolver» er den kritiske testen:
// mot koden FØR denne fiksen ville sjekkPendingNav() hengt for alltid på
// `await navigator.serviceWorker.ready`, og navigasjonen ville aldri skjedd.
//
// #688 flyttet konsumeringen fra LESING til NAVIGASJON LYKTES: entryen
// slettes ikke lenger idet den navigerer bort, den skrives tilbake med en
// oppdatert forsøksteller og `navigert: true`. Den gamle testen under
// («naviger til url … og sletter entryen») pinnet nettopp den feilen #688
// beskriver — leser og sletter FØR auth får omdirigert, og målet er borte
// for godt — og er derfor skrevet om.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import ServiceWorkerRegistrering from '@/components/ServiceWorkerRegistrering'
import { PUSH_KLIKK_VINDU_MS, PUSH_KLIKK_MAKS_FORSOK } from '@/lib/konstanter'

// feilNavn beholdes ekte (importActual) — den er en ren klassifiserer, og en
// stubbet variant ville gjort assertion på `name` verdiløs.
vi.mock('@/lib/klient-logg', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/klient-logg')>()),
  sendFeilBeacon: vi.fn(),
  meldKlientfeil: vi.fn(),
}))

import { sendFeilBeacon, meldKlientfeil } from '@/lib/klient-logg'

// Speiler navnene i lib/pending-nav.ts — duplisert bevisst (samme mønster som
// i sw.js/den vm-baserte testen). Drifter denne fra den faktiske verdien,
// feiler testene under av seg selv: cache-mocken svarer kun på nøkkelen den
// kjenner.
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

// put() persisterer nå faktisk (#688) — komponenten skriver tilbake en
// oppdatert entry før den navigerer, og flere av testene under må kunne lese
// HVA som ble skrevet (forsok/klikk_id/navigert), ikke bare AT put ble kalt.
// Komponenten skriver et ekte `Response`-objekt (fra lib/pending-nav.ts) —
// mocken lagrer det uendret; ekte Response har samme async .json()-form som
// FakeResponse, så begge kan leses tilbake likt.
// `treghetMs` gjør hver cache-operasjon målbart treg (via fake timers).
// Uten den er alle promisene her løst umiddelbart, og da rekker kilde nr. 1
// alltid å bli helt ferdig før nr. 2 i det hele tatt starter — altså kan
// race-testene under ikke reprodusere racet de skal pinne (review av PR #690).
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
      // Ekte Cache Storage gir en FERSK Response ved hvert match(); en lagret
      // Response-INSTANS kan bare leses én gang («Body is unusable»).
      // Materialiser bodyen her, ellers ville race-testene under målt en
      // fixture-begrensning i stedet for produktkoden.
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

// Fanger 'message'-lytteren komponenten registrerer, slik at broadcast-stien
// (SW postMessage -> handterMelding) kan trigges direkte i test. Den stien har
// ingen entryHint og må derfor lese NAV-raden selv — se testen nederst.
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

// Flusher mikrotasks UTEN å kjøre noen faketimer. Poenget er å isolere
// broadcast-stien: advanceTimersByTime ville i tillegg fyrt cache-pollen
// (t=0), som ville konsumert den samme entryen og gjort assertion-en
// tvetydig — nettopp fordi de to stiene deler én singel-nøkkel.
async function flushMikrotasks(runder = 30) {
  for (let i = 0; i < runder; i++) await Promise.resolve()
}

// Event-navnene sendFeilBeacon faktisk ble kalt med. Negative assertions går
// via denne, ikke via en argument-for-argument-matcher med expect.anything():
// expect.anything() matcher IKKE undefined, og beacon-kallene sender undefined
// som 3. (og av og til 4.) argument — en slik negativ assertion ville derfor
// passert uansett, altså vært død kode (review av #688).
function loggedeEventer(): string[] {
  return vi.mocked(sendFeilBeacon).mock.calls.map(kall => kall[0])
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
    // KUN første poll (t=0): i en ekte nettleser river window.location.assign()
    // ned siden med det samme, så de senere polltimerne (200/800/2000ms)
    // rekker aldri å kjøre. assign() er her en vi.fn()-stub som IKKE faktisk
    // navigerer jsdom bort — advanserer vi klokken videre, ville komponenten
    // (fortsatt montert på samme "side") lese den samme entryen om igjen og
    // telle forsok videre, noe en ekte navigasjon aldri ville gitt rom for.
    await vi.advanceTimersByTimeAsync(0)

    expect(assign).toHaveBeenCalledWith(`${window.location.origin}/chat`)
    // Kjernen i #688: entryen skal IKKE slettes idet den navigerer bort —
    // leser og sletter FØR auth kan omdirigere til /login er nøyaktig
    // bugen dette lukker.
    expect(cache.delete).not.toHaveBeenCalled()
    const lagret = await sistLagret(cache)
    expect(lagret).toMatchObject({
      url: `${window.location.origin}/chat`,
      klikk_id: 'klikk-abc',
      forsok: 1,
      navigert: true,
    })
    // Eksplisitt kontroll av HELE kontekst-objektet (#681/#688) — nøkkelnavnene
    // må matche KONTEKST_WHITELIST i lib/logg-sanitering.ts, ellers strippes
    // de stille som #676-feltene.
    expect(sendFeilBeacon).toHaveBeenCalledWith(
      'push.klikk.navigert',
      'push-klikk levert via cache',
      undefined,
      { kilde: 'cache', allerede_paa_maal: false, synlighet: document.visibilityState, klikk_id: 'klikk-abc', forsok: 1 },
      'warn',
    )
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

  // Landing (item 5 i #688-planen): vi står allerede på målet — typisk etter
  // at en TIDLIGERE sidevisning navigerte oss hit. Entryen konsumeres nå.
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
      { kilde: 'cache', allerede_paa_maal: true, synlighet: document.visibilityState, klikk_id: 'klikk-xyz', forsok: undefined },
      'warn',
    )
  })

  // navigert: true hindrer dobbel-logging (#688): raden ble alt skrevet av
  // den FORRIGE sidens navigerTil() rett før assign — en ny logging her ville
  // kollidert med varsel_logg sin dedup-indeks og dobbelttalt samme klikk.
  it('landing: navigert:true på entryen hindrer en ny push.klikk.navigert-logging, men entry konsumeres fortsatt', async () => {
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
  })

  // Loop-bryter (item 6): et mål forsøkt PUSH_KLIKK_MAKS_FORSOK ganger uten
  // landing skal forkastes i stedet for å bli prøvd i det uendelige.
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

  // Broadcast-grenen var HELT utestet, og det er derfor bugen slapp gjennom
  // (review av #688): navigerTil slettet entryen FØR den leste den, og siden
  // broadcast/kanal ikke sender entryHint ble lesningen alltid null —
  // klikk_id og forsok forsvant fra raden, og oppføringen ble revet bort
  // under føttene på cache-pollen som faktisk hadde dem.
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
      },
      'warn',
    )
  })

  // Samme sti, men entryen er alt logget som navigert fra forrige side.
  // Dobbel-logging-guarden må fortsatt gjelde når kilden er broadcast — mot
  // den gamle koden var den død kode her (entry var alltid null).
  it('landing via BROADCAST med navigert:true: ingen ny logging, entry konsumeres', async () => {
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
  })

  // Ferskhetssjekken skal IKKE komme før identitetssjekken (review av #688):
  // en innlogging som tar lengre tid enn vinduet lander riktig, og å logge
  // «foreldet» for den ville invertert signalet på selve flyten issuet innfører.
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
      },
      'warn',
    )
    expect(loggedeEventer()).not.toContain('klient.pushklikk.foreldet')
  })

  // Race-guarden (review av PR #690). SW-en skriver cache-entryen og
  // broadcaster rett etterpå, så cache-pollen på t=0 og 'message'-lytteren
  // kommer normalt inn samtidig — ikke som et kanttilfelle. Uten
  // serialisering leste begge samme `forsok`, regnet seg begge fram til 1,
  // og kalte begge assign + loggPushNavigasjon: ett klikk ga to navigasjoner
  // og to telemetri-rader.
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
    // Begge kildene slippes løs før noen av dem har rukket å fullføre sin
    // lese/øke/skrive-runde — det er nøyaktig vinduet bugen levde i.
    send({ type: 'navigate', url: `${window.location.origin}/chat` })
    await vi.advanceTimersByTimeAsync(0)
    await flushMikrotasks()

    expect(assign).toHaveBeenCalledTimes(1)
    expect(assign).toHaveBeenCalledWith(`${window.location.origin}/chat`)
    expect(loggedeEventer().filter(e => e === 'push.klikk.navigert')).toHaveLength(1)
    // Forsøkstelleren skal stå på 1, ikke 2: den andre kilden skal ikke ha
    // rukket å telle sitt eget forsøk på samme klikk.
    expect(await sistLagret(cache)).toMatchObject({ klikk_id: 'klikk-race', forsok: 1 })
  })

  // Samme race på landings-grenen: der konsumeres entryen, så kall nr. 2 kan
  // sitte på en entryHint lest FØR nr. 1 slettet raden — og ville logget
  // landingen en gang til.
  it('RACE: cache-poll og broadcast lander samtidig — kun ÉN push.klikk.navigert', async () => {
    stubLocation()
    // Treg cache: broadcasten står og venter på sin lesning mens cache-pollen
    // starter sin egen. Begge leser altså entryen FØR noen av dem har rukket
    // å slette den — det er kun i det vinduet dobbel-loggingen oppstår.
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

  // Den interne try/catch-en i navigerTil gjorde .catch()-ene på kallstedene
  // til død kode: promiset kunne aldri avvises, så en uventet feil forsvant
  // sporløst (review av PR #690). Feilen bobler nå til kallstedet, som
  // logger den.
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
        // og DEN awaiter ready. Den interne try/catch i lib/pending-nav.ts
        // dekker kun cache-lesingen, så uten wrapperen bobler denne ut som en
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
