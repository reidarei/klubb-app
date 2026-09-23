// Pinner KOBLINGEN mellom ankomst-beslutningen (lib/kart-ankomst.ts) og det
// virkelige kartet (#753) — at konstanten faktisk når frem til Leaflet, ikke
// bare beslutningslogikken isolert (dekket av kart-ankomst.test.ts).
//
// Begge ankomstveiene dekkes: init-veien (lenken trykket fra /chat, kartet
// remountes) og post-mount-veien (lenken trykket i chat-PANELET på kartet, kun
// søkeparametrene endres). Sistnevnte inkluderer kappløpsvinduet der lenken
// kommer FØR Leaflet er ferdig importert — der lå bugen ingen test så.
//
// Ventetiden før innzoomingen (KART_DELT_STED_FLY_VENT_MS) mockes via en
// getter, slik at hver test velger sin egen: jsdom laster aldri de faktiske
// flisbildene (ingen nettverk), så 'load'-eventet på flislaget fyrer ikke av
// seg selv her. Default er 5 ms — da går testen via fail-open-timeouten,
// akkurat som en telefon med dødt nett ville gjort, og hver test slipper å ta
// 1,2 sekund for ingenting.
//
// Men i en ekte nettleser er 'load' HOVEDveien og timeouten bare nødutgangen,
// så en suite som kun kjører fail-open beviser ikke at hovedveien virker.
// Ryker koblingen, fanger timeouten det og alt ser normalt ut — bare 1,2
// sekunder tregere. Derfor fyrer siste describe 'load' manuelt med ventetiden
// satt absurd høyt: flyr kartet da, kan det umulig ha vært timeren.
//
// Leaflet mockes IKKE bort — den ekte modulen brukes (samme som i
// kart-oppdatering.test.tsx), kun L.map() og L.tileLayer() pakkes inn for å
// fange kart-instansen, flislaget og kallene testen selv ikke har noen ref til.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act, waitFor } from '@testing-library/react'
import type { Map as LeafletMap, TileLayer } from 'leaflet'
import {
  KART_DELT_STED_ZOOM,
  KART_DELT_STED_START_ZOOM,
  KART_DELT_STED_FLY_SEK,
} from '@/lib/konstanter'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/lib/actions/posisjon', () => ({
  delPosisjon: vi.fn(async () => ({ ok: true })),
  stoppDeling: vi.fn(async () => ({ ok: true })),
  plingEtterPosisjon: vi.fn(async () => ({ ok: true })),
}))

vi.mock('@/lib/actions/kart-markering', () => ({
  settMarkering: vi.fn(async () => ({ ok: true })),
  slettMarkering: vi.fn(async () => ({ ok: true })),
}))

vi.mock('@/lib/klient-logg', () => ({ sendFeilBeacon: vi.fn() }))

const ventMs = vi.hoisted(() => ({ verdi: 5 }))

vi.mock('@/lib/konstanter', async importOriginal => {
  const faktisk = await importOriginal<typeof import('@/lib/konstanter')>()
  return {
    ...faktisk,
    get KART_DELT_STED_FLY_VENT_MS() {
      return ventMs.verdi
    },
  }
})

let sisteKart: LeafletMap | null = null
// Flislaget er den ANDRE utløseren for ankomstflyvningen ('load'). jsdom
// henter aldri fliser, så testen må fyre eventet selv — da trengs referansen.
let sisteFlisLag: TileLayer | null = null
// Opsjonene kartet ble FØDT med — startzoom er halve påstanden i #753 («flyr
// inn»), og den forsvinner i det flyvningen er ferdig.
let kartOpsjoner: { zoom?: number } | null = null
type FlyKall = { lat: number; lng: number; zoom: number; varighet: number | undefined }
// Spionen ligger på kart-INSTANSEN, ikke på modulen: i jsdom er L.Browser.any3d
// false, så flyTo degenererer til et synkront setView og sluttzoomen blir den
// samme enten koden flyr eller hopper rett dit. Selve kallet — mål, zoom og
// varighet — er derfor det eneste beviset på animasjon som finnes her.
const flyKall: FlyKall[] = []

// `any` med vilje: @types/leaflet bruker `export =`, og typen `typeof
// import('leaflet')` eksponerer ikke synteseten `.default` en `vi.mock`-
// factory faktisk får ved kjøretid (esModuleInterop). Kjøretidsformen er
// identisk med den ekte importen i PosisjonsKart.tsx selv.
vi.mock('leaflet', async importOriginal => {
  const mod: any = await importOriginal()
  const L = mod.default
  return {
    ...mod,
    default: {
      ...L,
      map: (...args: any[]) => {
        const kart = L.map(...args)
        kartOpsjoner = args[1] ?? null
        const ekteFlyTo = kart.flyTo.bind(kart)
        kart.flyTo = (latlng: any, zoom: number, opts: any) => {
          flyKall.push({ lat: latlng[0], lng: latlng[1], zoom, varighet: opts?.duration })
          return ekteFlyTo(latlng, zoom, opts)
        }
        sisteKart = kart
        return kart
      },
      tileLayer: (...args: any[]) => {
        const lag = L.tileLayer(...args)
        sisteFlisLag = lag
        return lag
      },
    },
  }
})

import PosisjonsKart from '@/components/kart/PosisjonsKart'

function settGeolocation(verdi: unknown) {
  Object.defineProperty(window.navigator, 'geolocation', { value: verdi, configurable: true })
}

type DeltSted = { lat: number; lng: number; tekst: string | null } | null

function kartProps(deltSted: DeltSted) {
  return {
    menn: [],
    markeringer: [],
    megId: 'meg-1',
    underArrangement: false,
    erAdmin: false,
    fallbackSenter: { lat: 59.9, lng: 10.8 },
    visChat: false,
    chatMeldinger: [],
    chatProfiler: [],
    timeplanArrangement: null,
    timeplanPoster: [],
    timeplanFeil: false,
    deltSted,
    pingKandidater: [],
    reisemodus: false,
  }
}

function monter(deltSted: DeltSted) {
  return render(<PosisjonsKart {...kartProps(deltSted)} />)
}

const DELT_STED = { lat: 59.91387, lng: 10.75225, tekst: 'Vi sitter her' }
// Et tydelig annet sted (Bergen), slik at «hvilket av de to endte vi på?»
// aldri kan besvares med avrundingsslingring.
const ANNET_STED = { lat: 60.39299, lng: 5.32415, tekst: 'Nei, her' }

beforeEach(() => {
  sisteKart = null
  sisteFlisLag = null
  kartOpsjoner = null
  flyKall.length = 0
  ventMs.verdi = 5
  settGeolocation(undefined)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// Venter forbi fail-open-timeouten (5 ms her) slik at en flyvning som ville
// kommet «litt senere» rekker å vise seg før vi slår fast at den ikke kom.
async function ventForbiFailOpen() {
  await act(async () => {
    await new Promise(r => setTimeout(r, 30))
  })
}

describe('ankomst på et delt sted (#753) — init-veien (lenke trykket fra /chat, kartet remountes)', () => {
  it('flyr inn og ender på KART_DELT_STED_ZOOM, ikke på POSISJON_KART_ZOOM', async () => {
    monter(DELT_STED)

    await waitFor(() => {
      expect(sisteKart).not.toBeNull()
      // 14 (POSISJON_KART_ZOOM) var nettopp klagen i #753 — regresjonsvakt.
      expect(sisteKart!.getZoom()).toBe(KART_DELT_STED_ZOOM)
    })

    const senter = sisteKart!.getCenter()
    expect(senter.lat).toBeCloseTo(DELT_STED.lat, 3)
    expect(senter.lng).toBeCloseTo(DELT_STED.lng, 3)
  })

  it('fødes VIDT og flyr: startzoom, så ett flyTo til sluttzoom med varighet', async () => {
    monter(DELT_STED)

    await waitFor(() => expect(flyKall).toHaveLength(1))
    // Kartet skal ikke stå ferdig innzoomet fra fødselen av — da hadde det
    // ikke vært noen synlig innflyvning, som var hele bestillingen i #753.
    expect(kartOpsjoner?.zoom).toBe(KART_DELT_STED_START_ZOOM)
    expect(flyKall[0].zoom).toBe(KART_DELT_STED_ZOOM)
    expect(flyKall[0].varighet).toBe(KART_DELT_STED_FLY_SEK)
    expect(flyKall[0].lat).toBeCloseTo(DELT_STED.lat, 3)
    expect(flyKall[0].lng).toBeCloseTo(DELT_STED.lng, 3)
  })

  it('uten delt sted: uendret oppførsel, ingen flyvning skjer', async () => {
    monter(null)

    await waitFor(() => expect(sisteKart).not.toBeNull())
    // Vent utover fail-open-timeouten for å bevise at INGENTING trigges når
    // det ikke finnes noe delt sted å fly til.
    await ventForbiFailOpen()
    expect(sisteKart!.getZoom()).not.toBe(KART_DELT_STED_ZOOM)
    expect(flyKall).toHaveLength(0)
  })

  it('redusert bevegelse: lander direkte på sluttzoom, ingen animasjon å vente på', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    monter(DELT_STED)

    await waitFor(() => {
      expect(sisteKart).not.toBeNull()
      expect(sisteKart!.getZoom()).toBe(KART_DELT_STED_ZOOM)
    })
    // Født på sluttzoom, og ingen flyTo i det hele tatt — det er nettopp
    // BEVEGELSEN som skal være borte, ikke funksjonen.
    expect(kartOpsjoner?.zoom).toBe(KART_DELT_STED_ZOOM)
    await ventForbiFailOpen()
    expect(flyKall).toHaveLength(0)
  })
})

describe('ankomst på et delt sted (#753) — post-mount-veien (lenke trykket i chat-panelet på kartet)', () => {
  it('ny lenke etter at kartet er klart: flyr til det nye stedet', async () => {
    const { rerender } = monter(null)
    await waitFor(() => expect(sisteKart).not.toBeNull())
    expect(flyKall).toHaveLength(0)

    rerender(<PosisjonsKart {...kartProps(DELT_STED)} />)

    await waitFor(() => expect(flyKall).toHaveLength(1))
    expect(flyKall[0].zoom).toBe(KART_DELT_STED_ZOOM)
    expect(flyKall[0].varighet).toBe(KART_DELT_STED_FLY_SEK)
    expect(flyKall[0].lat).toBeCloseTo(DELT_STED.lat, 3)
    expect(sisteKart!.getCenter().lat).toBeCloseTo(DELT_STED.lat, 3)
  })

  it('lenke trykket MENS Leaflet fortsatt importeres: flyvningen skjer når kartet blir klart', async () => {
    const { rerender } = monter(null)
    // Bevisst INGEN await: den dynamiske Leaflet-importen er ikke resolvet
    // ennå, så kartKlar er fortsatt false. Kappløpsvinduet er nettopp her, og
    // at kartet ikke finnes er beviset på at vi står i det.
    expect(sisteKart).toBeNull()

    rerender(<PosisjonsKart {...kartProps(DELT_STED)} />)

    // Nøkkelen må IKKE regnes som behandlet mens kartet ennå bygges — gjør
    // den det, kommer flyvningen aldri, og mannen blir stående i feil utsnitt
    // uten noe spor av hvorfor.
    await waitFor(() => expect(flyKall).toHaveLength(1))
    expect(flyKall[0].zoom).toBe(KART_DELT_STED_ZOOM)
    expect(flyKall[0].varighet).toBe(KART_DELT_STED_FLY_SEK)
    expect(flyKall[0].lat).toBeCloseTo(DELT_STED.lat, 3)
    expect(sisteKart!.getCenter().lat).toBeCloseTo(DELT_STED.lat, 3)
  })

  it('nytt sted midt i den pågående init-ankomsten: det NYE stedet vinner', async () => {
    const { rerender } = monter(DELT_STED)
    expect(sisteKart).toBeNull()

    rerender(<PosisjonsKart {...kartProps(ANNET_STED)} />)

    await waitFor(() =>
      expect(flyKall.some(k => Math.abs(k.lat - ANNET_STED.lat) < 0.001)).toBe(true),
    )
    // Den planlagte init-flyvningen mot det FØRSTE stedet skal ikke få dra
    // kartet tilbake etter at han har trykket en ny lenke.
    await ventForbiFailOpen()
    expect(flyKall[flyKall.length - 1].lat).toBeCloseTo(ANNET_STED.lat, 3)
    expect(sisteKart!.getCenter().lat).toBeCloseTo(ANNET_STED.lat, 3)
    expect(sisteKart!.getZoom()).toBe(KART_DELT_STED_ZOOM)
  })

  it('lenken fjernes og deles på nytt: samme sted teller fortsatt som en ekte endring', async () => {
    const { rerender } = monter(null)
    await waitFor(() => expect(sisteKart).not.toBeNull())

    rerender(<PosisjonsKart {...kartProps(DELT_STED)} />)
    await waitFor(() => expect(flyKall).toHaveLength(1))

    // Lenken fjernes (lat/lng ute av URL-en) — ingen flyvning, men tilstanden
    // er terminal og nøkkelen skal stemples.
    rerender(<PosisjonsKart {...kartProps(null)} />)
    await ventForbiFailOpen()
    expect(flyKall).toHaveLength(1)

    // Samme sted deles på nytt: skal fly igjen, ikke bli slukt som «kjent».
    rerender(<PosisjonsKart {...kartProps(DELT_STED)} />)
    await waitFor(() => expect(flyKall).toHaveLength(2))
    expect(flyKall[1].lat).toBeCloseTo(DELT_STED.lat, 3)
  })
})

describe("ankomst på et delt sted (#753) — hovedveien: flislaget melder 'load'", () => {
  it("flyvningen starter på 'load', ikke på fail-open-timeouten", async () => {
    // Ventetiden settes 100 sekunder unna. Kommer det en flyvning i denne
    // testen, finnes det bare én mulig utløser igjen — 'load'.
    ventMs.verdi = 100_000
    monter(DELT_STED)

    await waitFor(() => expect(sisteFlisLag).not.toBeNull())
    // Ingenting har flydd ennå: timeouten ligger langt unna, og jsdom fyrer
    // aldri 'load' av seg selv. Uten denne kunne assertionen under blitt
    // «grønn» av en flyvning som alt hadde skjedd.
    await ventForbiFailOpen()
    expect(flyKall).toHaveLength(0)

    await act(async () => {
      sisteFlisLag!.fire('load')
    })

    // Synkront etter eventet — ingen waitFor, ingen ny venting: ryker
    // flisLag.once('load', start), er dette rødt med en gang i stedet for
    // bare 1,2 sekunder tregere ute i virkeligheten.
    expect(flyKall).toHaveLength(1)
    expect(flyKall[0].zoom).toBe(KART_DELT_STED_ZOOM)
    expect(flyKall[0].varighet).toBe(KART_DELT_STED_FLY_SEK)
    expect(flyKall[0].lat).toBeCloseTo(DELT_STED.lat, 3)
    expect(flyKall[0].lng).toBeCloseTo(DELT_STED.lng, 3)
  })

  it('begge utløserne fyrer: bare én flyvning slipper gjennom', async () => {
    // Den ekte rekkefølgen guarden finnes for: nettet henger, fail-open flyr,
    // og flisene lander FØRST etterpå. 'load'-lytteren står fortsatt påkoblet
    // (once er ikke forbrukt), så uten harFlydd ville han fått en rykkvis
    // andre flyvning til samme sted.
    monter(DELT_STED)
    await waitFor(() => expect(flyKall).toHaveLength(1))

    await act(async () => {
      sisteFlisLag!.fire('load')
    })

    expect(flyKall).toHaveLength(1)
  })
})
