// Langtrykk på kartflaten starter en markering (#762).
//
// Bakgrunn: gesten skal LANDE i den eksisterende sikte-flyten fra #700, ikke
// erstatte den — se kommentaren over bekreftSted() i PosisjonsKart.tsx.
// Kollisjonen med boble-langtrykket (#719, kopier lenke) løses med en
// eksplisitt target-sil i pointerdown, ikke ved å stole på at boblas egen
// stopPropagation() i pointerup rekker først — test 4 er nettopp vakten mot
// at noen senere fjerner silen.
//
// Samme oppsett som __tests__/kart-delt-sted.test.tsx: EKTE Leaflet, kun
// L.map() pakket inn for å spionere på kart-instansen. pointer()-hjelperen er
// kopiert fra __tests__/album-lightbox-gest.test.tsx.
//
// PointerEvent-init i jsdom setter isPrimary: false som default — gesten
// vokter derfor IKKE på isPrimary (se pointerDown i komponenten), og testene
// her verifiserer det via pinch-testen (6): en isPrimary-vakt ville gjort
// suiten grønn av feil grunn.
//
// Koordinater regnes IKKE mot hardkodede lat/lng: jsdom gir en nullstilt
// getBoundingClientRect() på kart-containeren, så Leaflets egen
// mouseEventToContainerPoint(e) degenererer til (e.clientX, e.clientY)
// direkte (DomEvent.getMousePosition: offset.left/top = 0, scale.x/y = 1 når
// rect.width/offsetWidth er 0/0 → NaN → faller til 1). Forventet latlng
// regnes derfor ut med kart.containerPointToLatLng([x, y]) i testen selv.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, screen, act, waitFor, fireEvent } from '@testing-library/react'
import type { Map as LeafletMap } from 'leaflet'
import { LONG_PRESS_MS, LONG_PRESS_BEVEGELSE_PX } from '@/lib/konstanter'

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

let sisteKart: LeafletMap | null = null
type PanToKall = { lat: number; lng: number; opts: unknown }
const panToKall: PanToKall[] = []

// `any` med vilje: @types/leaflet bruker `export =`, og typen `typeof
// import('leaflet')` eksponerer ikke synteseten `.default` en `vi.mock`-
// factory faktisk får ved kjøretid (esModuleInterop) — samme begrunnelse som
// i kart-delt-sted.test.tsx.
vi.mock('leaflet', async importOriginal => {
  const mod: any = await importOriginal()
  const L = mod.default
  return {
    ...mod,
    default: {
      ...L,
      map: (...args: any[]) => {
        const kart = L.map(...args)
        const ektePanTo = kart.panTo.bind(kart)
        kart.panTo = (latlng: any, opts: any) => {
          panToKall.push({ lat: latlng.lat, lng: latlng.lng, opts })
          return ektePanTo(latlng, opts)
        }
        sisteKart = kart
        return kart
      },
    },
  }
})

import { settMarkering } from '@/lib/actions/kart-markering'
import PosisjonsKart from '@/components/kart/PosisjonsKart'

function kartProps() {
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
    deltSted: null,
    pingKandidater: [],
    reisemodus: false,
  }
}

function monter() {
  return render(<PosisjonsKart {...kartProps()} />)
}

async function ventTilKlar() {
  await waitFor(() => expect(sisteKart).not.toBeNull())
  // Kartklar-effekten (som fester langtrykk-lytterne) trigges av en
  // React-state-oppdatering som skjer inne i samme then()-kjede som
  // sisteKart settes, men effekten er IKKE nødvendigvis flushet når waitFor()
  // over resolver — et ekstra ekte tick her lar React fullføre commit +
  // passive effects for oppdatert kartKlar FØR vi (ev.) bytter til falske
  // timere.
  await act(async () => {
    await new Promise(r => setTimeout(r, 0))
  })
  return screen.getByTestId('posisjonskart')
}

// Kopiert fra __tests__/album-lightbox-gest.test.tsx. `pointerType` default
// 'touch' — gesten skal virke på touch, IKKE på mouse (test 5).
function pointer(
  type: 'pointerdown' | 'pointerup' | 'pointermove' | 'pointercancel',
  maal: HTMLElement,
  {
    id = 1,
    x = 0,
    y = 0,
    pointerType = 'touch',
  }: { id?: number; x?: number; y?: number; pointerType?: string } = {},
) {
  const ev = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: id,
    clientX: x,
    clientY: y,
    pointerType,
  })
  act(() => {
    maal.dispatchEvent(ev)
  })
  return ev
}

function ring(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-testid="kart-presse-ring"]')
}

function sikte(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-testid="markering-sikte"]')
}

beforeEach(() => {
  sisteKart = null
  panToKall.length = 0
  vi.mocked(settMarkering).mockClear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('langtrykk på kartflaten (#762) — commit', () => {
  it('hold ≥ LONG_PRESS_MS + slipp: panTo kalles med trykkpunktets latlng, siktet kommer opp', async () => {
    monter()
    const node = await ventTilKlar()
    // waitFor() over bruker EKTE setTimeout internt — fake timers skrus derfor
    // på FØRST etter at kartet er klart, ikke i beforeEach.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const forventet = sisteKart!.containerPointToLatLng([120, 240])

    pointer('pointerdown', node, { x: 120, y: 240 })
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS)
    })
    expect(ring()).not.toBeNull()

    pointer('pointerup', node, { x: 120, y: 240 })

    expect(panToKall).toHaveLength(1)
    expect(panToKall[0].lat).toBeCloseTo(forventet.lat, 6)
    expect(panToKall[0].lng).toBeCloseTo(forventet.lng, 6)
    expect(sikte()).not.toBeNull()
    // Ringen er borte igjen etter commit.
    expect(ring()).toBeNull()
  })

  // Vakten mot at bekreftelsen låser et MELLOMLIGGENDE kartsenter. Hele
  // poenget med gesten er presisjon, og bekreftSted() leser getCenter():
  // er forflytningen animert, ligger senteret et sted mellom gammelt senter
  // og punktet fingeren sto på i det «Her er det» blir trykkbar — et raskt
  // trykk lagrer da et koordinat brukeren aldri pekte på. Testen går hele
  // veien til settMarkering, så det er koordinatet som FAKTISK sendes
  // videre som kontrolleres, ikke argumentet til forflytningen.
  it('bekreft umiddelbart etter slipp: koordinatet som lagres er punktet man holdt på', async () => {
    monter()
    const node = await ventTilKlar()
    // waitFor() over bruker EKTE setTimeout internt — fake timers skrus derfor
    // på FØRST etter at kartet er klart, ikke i beforeEach.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const forventet = sisteKart!.containerPointToLatLng([120, 240])

    pointer('pointerdown', node, { x: 120, y: 240 })
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS)
    })
    pointer('pointerup', node, { x: 120, y: 240 })

    // Ingen ventetid, ingen moveend avventes: trykk i det knappen kommer opp.
    act(() => {
      screen.getByTestId('markering-bekreft-sted').click()
    })
    fireEvent.change(screen.getByTestId('markering-tekst'), {
      target: { value: 'Vi sitter her' },
    })
    await act(async () => {
      screen.getByTestId('markering-lagre').click()
    })

    expect(settMarkering).toHaveBeenCalledTimes(1)
    const [lat, lng] = vi.mocked(settMarkering).mock.calls[0]
    expect(lat).toBeCloseTo(forventet.lat, 6)
    expect(lng).toBeCloseTo(forventet.lng, 6)
  })
  it('hold < LONG_PRESS_MS: ingen panTo, intet sikte', async () => {
    monter()
    const node = await ventTilKlar()
    // waitFor() over bruker EKTE setTimeout internt — fake timers skrus derfor
    // på FØRST etter at kartet er klart, ikke i beforeEach.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    pointer('pointerdown', node, { x: 50, y: 50 })
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS - 50)
    })
    expect(ring()).toBeNull()
    pointer('pointerup', node, { x: 50, y: 50 })

    expect(panToKall).toHaveLength(0)
    expect(sikte()).toBeNull()
  })

  it('bevegelse > LONG_PRESS_BEVEGELSE_PX før terskel: avbrutt', async () => {
    monter()
    const node = await ventTilKlar()
    // waitFor() over bruker EKTE setTimeout internt — fake timers skrus derfor
    // på FØRST etter at kartet er klart, ikke i beforeEach.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    pointer('pointerdown', node, { x: 100, y: 100 })
    pointer('pointermove', node, { x: 100 + LONG_PRESS_BEVEGELSE_PX + 1, y: 100 })
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS)
    })
    expect(ring()).toBeNull()
    pointer('pointerup', node, { x: 100 + LONG_PRESS_BEVEGELSE_PX + 1, y: 100 })

    expect(panToKall).toHaveLength(0)
    expect(sikte()).toBeNull()
  })

  it('kollisjonsvakten (#719): pointerdown på en .leaflet-tooltip gir ingen markeringsflyt', async () => {
    monter()
    const node = await ventTilKlar()
    // waitFor() over bruker EKTE setTimeout internt — fake timers skrus derfor
    // på FØRST etter at kartet er klart, ikke i beforeEach.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const boble = document.createElement('div')
    boble.className = 'leaflet-tooltip kart-markering-etikett'
    node.appendChild(boble)

    pointer('pointerdown', boble, { x: 70, y: 70 })
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS)
    })
    expect(ring()).toBeNull()
    pointer('pointerup', boble, { x: 70, y: 70 })

    expect(panToKall).toHaveLength(0)
    expect(sikte()).toBeNull()
  })

  it("pointerType 'mouse': ingen gest", async () => {
    monter()
    const node = await ventTilKlar()
    // waitFor() over bruker EKTE setTimeout internt — fake timers skrus derfor
    // på FØRST etter at kartet er klart, ikke i beforeEach.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    pointer('pointerdown', node, { x: 90, y: 90, pointerType: 'mouse' })
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS)
    })
    expect(ring()).toBeNull()
    pointer('pointerup', node, { x: 90, y: 90, pointerType: 'mouse' })

    expect(panToKall).toHaveLength(0)
  })

  it('andre peker ned mens første holder (pinch): avbrutt', async () => {
    monter()
    const node = await ventTilKlar()
    // waitFor() over bruker EKTE setTimeout internt — fake timers skrus derfor
    // på FØRST etter at kartet er klart, ikke i beforeEach.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    pointer('pointerdown', node, { id: 1, x: 10, y: 10 })
    // Før terskel: en ny finger ned skal kansellere den første.
    pointer('pointerdown', node, { id: 2, x: 200, y: 200 })
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS)
    })
    expect(ring()).toBeNull()

    pointer('pointerup', node, { id: 1, x: 10, y: 10 })
    pointer('pointerup', node, { id: 2, x: 200, y: 200 })

    expect(panToKall).toHaveLength(0)
    expect(sikte()).toBeNull()
  })

  it("steg === 'tekst': langtrykk gjør ingenting, koordinatet står", async () => {
    monter()
    const node = await ventTilKlar()
    // waitFor() over bruker EKTE setTimeout internt — fake timers skrus derfor
    // på FØRST etter at kartet er klart, ikke i beforeEach.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    // Inn i steg 'tekst': «Sett markering» → «Her er det».
    act(() => screen.getByTestId('markering-start').click())
    act(() => screen.getByTestId('markering-bekreft-sted').click())
    expect(screen.getByTestId('markering-tekst')).toBeInTheDocument()

    pointer('pointerdown', node, { x: 30, y: 30 })
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS)
    })
    expect(ring()).toBeNull()
    pointer('pointerup', node, { x: 30, y: 30 })

    expect(panToKall).toHaveLength(0)
    // Fortsatt i steg 'tekst' — tekstfeltet står, koordinatet er ikke rørt.
    expect(screen.getByTestId('markering-tekst')).toBeInTheDocument()
  })

  it('ringen: vises ved terskel, borte etter commit', async () => {
    monter()
    const node = await ventTilKlar()
    // waitFor() over bruker EKTE setTimeout internt — fake timers skrus derfor
    // på FØRST etter at kartet er klart, ikke i beforeEach.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    expect(ring()).toBeNull()
    pointer('pointerdown', node, { x: 44, y: 88 })
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS)
    })
    const synlig = ring()
    expect(synlig).not.toBeNull()
    expect(synlig!.style.left).toBe('44px')
    expect(synlig!.style.top).toBe('88px')

    pointer('pointerup', node, { x: 44, y: 88 })
    expect(ring()).toBeNull()
  })

  it('unmount midt i et hold: ingen timer fyrer etterpå', async () => {
    const feilspion = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { unmount } = monter()
    const node = await ventTilKlar()
    // waitFor() over bruker EKTE setTimeout internt — fake timers skrus derfor
    // på FØRST etter at kartet er klart, ikke i beforeEach.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    pointer('pointerdown', node, { x: 10, y: 10 })
    unmount()

    expect(() => {
      act(() => {
        vi.advanceTimersByTime(LONG_PRESS_MS + 100)
      })
    }).not.toThrow()
    // Ingen «kan ikke oppdatere en avmontert komponent»-advarsel — cleanup
    // ryddet timeren, den fyrte aldri.
    expect(feilspion).not.toHaveBeenCalled()
    feilspion.mockRestore()
  })
})
