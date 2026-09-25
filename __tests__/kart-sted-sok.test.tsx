// Interaktivt stedssøk på kartet (#757).
//
// Samme oppsett som __tests__/kart-langtrykk.test.tsx og
// __tests__/kart-delt-sted.test.tsx: EKTE Leaflet, kun L.map() pakket inn
// for å spionere på flyTo-kall og fange kart-instansen.
//
// sokSted() (server-actionen) mockes — dette er en komponenttest av
// StedSok/PosisjonsKart-samspillet, ikke av Nominatim-integrasjonen (dekket
// av __tests__/geokoding-sok.test.ts og __tests__/actions-sted-sok.test.ts).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, screen, act, waitFor, fireEvent } from '@testing-library/react'
import type { Map as LeafletMap } from 'leaflet'
import { POSISJON_KART_ZOOM } from '@/lib/konstanter'

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

const mockMeldKlientfeil = vi.fn()
vi.mock('@/lib/klient-logg', () => ({
  sendFeilBeacon: vi.fn(),
  meldKlientfeil: (...args: unknown[]) => mockMeldKlientfeil(...args),
}))

const mockSokSted = vi.fn()
vi.mock('@/lib/actions/sted-sok', () => ({
  sokSted: (...args: unknown[]) => mockSokSted(...args),
}))

let sisteKart: LeafletMap | null = null
type FlyKall = { lat: number; lng: number; zoom: number }
const flyKall: FlyKall[] = []

// `any` med vilje: @types/leaflet bruker `export =`, se samme begrunnelse i
// kart-langtrykk.test.tsx/kart-delt-sted.test.tsx.
vi.mock('leaflet', async importOriginal => {
  const mod: any = await importOriginal()
  const L = mod.default
  return {
    ...mod,
    default: {
      ...L,
      map: (...args: any[]) => {
        const kart = L.map(...args)
        const ekteFlyTo = kart.flyTo.bind(kart)
        kart.flyTo = (latlng: any, zoom: number, opts: any) => {
          flyKall.push({ lat: latlng[0], lng: latlng[1], zoom })
          return ekteFlyTo(latlng, zoom, opts)
        }
        sisteKart = kart
        return kart
      },
    },
  }
})

import PosisjonsKart from '@/components/kart/PosisjonsKart'

const TREFF_A = {
  id: '1',
  navn: 'Lorry',
  beskrivelse: 'Lorry, Parkveien 12, Oslo, Norge',
  lat: 59.9234,
  lng: 10.7267,
}

function kartProps(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  }
}

function monter(overrides: Record<string, unknown> = {}) {
  return render(<PosisjonsKart {...(kartProps(overrides) as any)} />)
}

async function ventTilKlar() {
  await waitFor(() => expect(sisteKart).not.toBeNull())
  await act(async () => {
    await new Promise(r => setTimeout(r, 0))
  })
}

async function apneSok() {
  act(() => screen.getByTestId('sted-sok-start').click())
  expect(screen.getByTestId('sted-sok-felt')).toBeInTheDocument()
}

async function sokOgVelg(navn = 'lorry') {
  fireEvent.change(screen.getByTestId('sted-sok-felt'), { target: { value: navn } })
  const form = screen.getByTestId('sted-sok-felt').closest('form')!
  await act(async () => {
    fireEvent.submit(form)
  })
  await waitFor(() => expect(screen.getByTestId('sted-sok-kandidat')).toBeInTheDocument())
  await act(async () => {
    screen.getByTestId('sted-sok-kandidat').click()
  })
}

beforeEach(() => {
  sisteKart = null
  flyKall.length = 0
  mockSokSted.mockReset()
  mockMeldKlientfeil.mockClear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('stedssøk på kartet (#757)', () => {
  it('søk skjer KUN ved innsending (Enter/knapp) — onChange kaller aldri actionen', async () => {
    mockSokSted.mockResolvedValue({ utfall: 'treff', treff: [TREFF_A] })
    monter()
    await ventTilKlar()
    await apneSok()

    fireEvent.change(screen.getByTestId('sted-sok-felt'), { target: { value: 'lorry' } })
    // Endring alene skal IKKE ha kalt actionen.
    expect(mockSokSted).not.toHaveBeenCalled()

    const form = screen.getByTestId('sted-sok-felt').closest('form')!
    await act(async () => {
      fireEvent.submit(form)
    })

    expect(mockSokSted).toHaveBeenCalledTimes(1)
    expect(mockSokSted).toHaveBeenCalledWith('lorry', expect.anything())
  })

  it('valgt treff: kartet flyr dit og treffnåla tegnes', async () => {
    mockSokSted.mockResolvedValue({ utfall: 'treff', treff: [TREFF_A] })
    monter()
    await ventTilKlar()
    await apneSok()
    await sokOgVelg()

    expect(flyKall).toHaveLength(1)
    expect(flyKall[0].lat).toBeCloseTo(TREFF_A.lat, 6)
    expect(flyKall[0].lng).toBeCloseTo(TREFF_A.lng, 6)
    expect(flyKall[0].zoom).toBe(POSISJON_KART_ZOOM)
    expect(document.querySelector('[data-testid="sted-sok-naal"]')).not.toBeNull()
  })

  it('«Sett markering her»: går til steg «sted», kartsenteret er treffets koordinat', async () => {
    mockSokSted.mockResolvedValue({ utfall: 'treff', treff: [TREFF_A] })
    monter()
    await ventTilKlar()
    await apneSok()
    await sokOgVelg()

    act(() => screen.getByTestId('sted-sok-marker').click())
    // Treffnål-effekten rydder laget async (samme import('leaflet').then()-
    // mønster som de andre markør-effektene) — ett tick til før vi sjekker
    // at nåla er borte.
    await act(async () => {
      await new Promise(r => setTimeout(r, 0))
    })

    expect(screen.getByTestId('markering-sikte')).toBeInTheDocument()
    expect(screen.getByTestId('markering-bekreft-sted')).toBeInTheDocument()
    const senter = sisteKart!.getCenter()
    // getCenter() etter panTo er rundet til hele piksler — 6 desimaler (~10 cm) ga sporadisk rødt; 4 (~10 m) beviser det samme.
    expect(senter.lat).toBeCloseTo(TREFF_A.lat, 4)
    expect(senter.lng).toBeCloseTo(TREFF_A.lng, 4)
    // Treffnåla er PRIVAT og midlertidig — forsvinner når man går videre.
    expect(document.querySelector('[data-testid="sted-sok-naal"]')).toBeNull()
  })

  it('«Legg i timeplanen»: punktet settes og panelet åpnes; knappen er fraværende uten arrangement eller ved blåtur', async () => {
    mockSokSted.mockResolvedValue({ utfall: 'treff', treff: [TREFF_A] })

    // Uten et aktuelt arrangement: ingen knapp.
    monter({ timeplanArrangement: null })
    await ventTilKlar()
    await apneSok()
    await sokOgVelg()
    expect(screen.queryByTestId('sted-sok-timeplan')).toBeNull()
    cleanup()

    // Blåtur: knappen skal fortsatt være fraværende.
    mockSokSted.mockResolvedValue({ utfall: 'treff', treff: [TREFF_A] })
    monter({
      timeplanArrangement: {
        id: 'arr-1',
        tittel: 'Lisboa-turen',
        startTidspunkt: new Date(Date.now() + 86_400_000).toISOString(),
        sluttTidspunkt: null,
        blaatur: true,
      },
    })
    await ventTilKlar()
    await apneSok()
    await sokOgVelg()
    expect(screen.queryByTestId('sted-sok-timeplan')).toBeNull()
    cleanup()

    // Vanlig arrangement (ikke blåtur): knappen finnes, og trykk fyller
    // punktet + åpner panelet.
    mockSokSted.mockResolvedValue({ utfall: 'treff', treff: [TREFF_A] })
    monter({
      timeplanArrangement: {
        id: 'arr-2',
        tittel: 'Lisboa-turen',
        startTidspunkt: new Date(Date.now() + 86_400_000).toISOString(),
        sluttTidspunkt: null,
        blaatur: false,
      },
    })
    await ventTilKlar()
    await apneSok()
    await sokOgVelg()

    act(() => screen.getByTestId('sted-sok-timeplan').click())

    expect(screen.getByTestId('timeplan-panel')).toHaveAttribute('aria-hidden', 'false')
    expect(screen.getByTestId('timeplan-punkt-fjern')).toBeInTheDocument()
  })

  it('«ingen» og «feil»/«tidsavbrudd» vises som tekst, ikke stille', async () => {
    mockSokSted.mockResolvedValueOnce({ utfall: 'ingen' })
    monter()
    await ventTilKlar()
    await apneSok()

    fireEvent.change(screen.getByTestId('sted-sok-felt'), { target: { value: 'finnesikke' } })
    const form = screen.getByTestId('sted-sok-felt').closest('form')!
    await act(async () => {
      fireEvent.submit(form)
    })
    await waitFor(() => expect(screen.getByTestId('sted-sok-ingen')).toBeInTheDocument())
    expect(screen.getByTestId('sted-sok-ingen').textContent).toContain('finnesikke')

    mockSokSted.mockResolvedValueOnce({ utfall: 'feil' })
    await act(async () => {
      fireEvent.submit(form)
    })
    await waitFor(() => expect(screen.getByTestId('sted-sok-feil')).toBeInTheDocument())

    mockSokSted.mockResolvedValueOnce({ utfall: 'tidsavbrudd' })
    await act(async () => {
      fireEvent.submit(form)
    })
    await waitFor(() => expect(screen.getByTestId('sted-sok-feil')).toBeInTheDocument())
  })
  it('avvist action (auth-/nettverksfeil): synlig feil, og knappen låses opp igjen', async () => {
    mockSokSted.mockRejectedValueOnce(new Error('Ikke innlogget'))
    monter()
    await ventTilKlar()
    await apneSok()

    fireEvent.change(screen.getByTestId('sted-sok-felt'), { target: { value: 'lorry' } })
    const form = screen.getByTestId('sted-sok-felt').closest('form')!
    await act(async () => {
      fireEvent.submit(form)
    })

    await waitFor(() => expect(screen.getByTestId('sted-sok-feil')).toBeInTheDocument())
    expect(screen.getByTestId('sted-sok-feil').textContent).toContain('Søket svarer ikke akkurat nå. Prøv igjen.')
    const knapp = screen.getByTestId('sted-sok-knapp')
    expect(knapp).not.toBeDisabled()
    expect(knapp.textContent).toBe('Søk')
    expect(mockMeldKlientfeil).toHaveBeenCalledWith('klient.kart.sok.feilet', expect.any(Error))

    // Nytt forsøk går faktisk gjennom — ikke fastlåst i 'soker'.
    mockSokSted.mockResolvedValueOnce({ utfall: 'treff', treff: [TREFF_A] })
    await act(async () => {
      fireEvent.submit(form)
    })
    await waitFor(() => expect(screen.getByTestId('sted-sok-kandidat')).toBeInTheDocument())
    expect(mockSokSted).toHaveBeenCalledTimes(2)
  })

  // #757-review: Avbryt fantes bare etter at et treff var valgt.
  it('Avbryt finnes i den ordinære søkevisningen — også mens søket pågår', async () => {
    mockSokSted.mockReturnValueOnce(new Promise(() => {}))
    monter()
    await ventTilKlar()
    await apneSok()

    expect(screen.getByTestId('sted-sok-avbryt')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('sted-sok-felt'), { target: { value: 'lorry' } })
    await act(async () => {
      fireEvent.submit(screen.getByTestId('sted-sok-felt').closest('form')!)
    })
    expect(screen.getByTestId('sted-sok-knapp')).toBeDisabled()

    act(() => screen.getByTestId('sted-sok-avbryt').click())
    expect(screen.queryByTestId('sted-sok-felt')).toBeNull()
  })

  // #757-review: «Nytt søk» nullstilte bare StedSoks egen state — nåla ble stående.
  it('«Nytt søk» fjerner den gamle treffnåla', async () => {
    mockSokSted.mockResolvedValue({ utfall: 'treff', treff: [TREFF_A] })
    monter()
    await ventTilKlar()
    await apneSok()
    await sokOgVelg()
    await act(async () => {
      await new Promise(r => setTimeout(r, 0))
    })
    expect(document.querySelector('[data-testid="sted-sok-naal"]')).not.toBeNull()

    act(() => screen.getByTestId('sted-sok-nytt').click())
    await act(async () => {
      await new Promise(r => setTimeout(r, 0))
    })
    expect(screen.getByTestId('sted-sok-felt')).toBeInTheDocument()
    expect(document.querySelector('[data-testid="sted-sok-naal"]')).toBeNull()
  })

  // #757-review: adresse vinner over punkt ved navigering, så en gammel
  // adresse i utkastet ville overstyrt søketreffet.
  it('«Legg i timeplanen» nullstiller en adresse som sto i utkastet fra før', async () => {
    mockSokSted.mockResolvedValue({ utfall: 'treff', treff: [TREFF_A] })
    monter({
      timeplanArrangement: {
        id: 'arr-3',
        tittel: 'Lisboa-turen',
        startTidspunkt: new Date(Date.now() + 86_400_000).toISOString(),
        sluttTidspunkt: null,
        blaatur: false,
      },
    })
    await ventTilKlar()

    act(() => screen.getByTestId('timeplan-pille').click())
    fireEvent.change(screen.getByTestId('timeplan-adresse'), { target: { value: 'Gammelgata 1' } })
    expect(screen.getByTestId('timeplan-adresse')).toHaveValue('Gammelgata 1')

    await apneSok()
    await sokOgVelg()
    act(() => screen.getByTestId('sted-sok-timeplan').click())

    expect(screen.getByTestId('timeplan-punkt-fjern')).toBeInTheDocument()
    expect(screen.getByTestId('timeplan-adresse')).toHaveValue('')
  })
})
