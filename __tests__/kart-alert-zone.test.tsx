// Alert zone-innrammingen rundt de varslende symbolene i kartets
// symbolvelger (#763). Vitest, ikke e2e: CI-budsjettet for september er
// tomt, og flyten trenger ingen ekte nettleser — samme begrunnelse som i
// __tests__/kart-langtrykk.test.tsx, hvorfra oppsettet under (leaflet-mock,
// kartProps(), ventTilKlar()) er kopiert. Partisjoneringen testes MOT
// REGISTERET (MARKERING_SYMBOLER sitt varsel-felt), aldri mot en hardkodet
// liste over enkeltsymboler — ellers er testen tautologisk med
// implementasjonen, som har vært gjennomgangstemaet i denne kodebasen.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, screen, act, waitFor } from '@testing-library/react'
import type { Map as LeafletMap } from 'leaflet'
import { MARKERING_SYMBOLER, SYMBOLER_VARSLER } from '@/lib/markering-symboler'

// Varslende symboler er en VALGFRI kategori i klubbens register
// (#767-review): en klubb kan velge at kartet ikke skal pinge noen, og da
// rendres sonen bevisst ikke. Prøvene som trenger selve rammen hopper over
// seg selv i stedet for å feile på en helt lovlig konfigurasjon.
const HAR_VARSLENDE = SYMBOLER_VARSLER.length > 0

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

// `any` med vilje: @types/leaflet bruker `export =`, og typen `typeof
// import('leaflet')` eksponerer ikke synteseten `.default` en `vi.mock`-
// factory faktisk får ved kjøretid (esModuleInterop) — se samme begrunnelse
// i kart-langtrykk.test.tsx.
vi.mock('leaflet', async importOriginal => {
  const mod: any = await importOriginal()
  const L = mod.default
  return {
    ...mod,
    default: {
      ...L,
      map: (...args: any[]) => {
        const kart = L.map(...args)
        sisteKart = kart
        return kart
      },
    },
  }
})

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
  // Samme ekstra tick som i kart-langtrykk.test.tsx: kartKlar-effekten
  // trigges av en state-oppdatering som ikke nødvendigvis er flushet når
  // waitFor() over resolver.
  await act(async () => {
    await new Promise(r => setTimeout(r, 0))
  })
  return screen.getByTestId('posisjonskart')
}

async function gaaTilStegTekst() {
  monter()
  await ventTilKlar()
  act(() => screen.getByTestId('markering-start').click())
  await waitFor(() => {
    expect(screen.getByTestId('markering-bekreft-sted')).not.toBeDisabled()
  })
  act(() => screen.getByTestId('markering-bekreft-sted').click())
  return screen.getByTestId('markering-tekst')
}

beforeEach(() => {
  sisteKart = null
})

afterEach(() => {
  cleanup()
})

describe('Alert zone i symbolvelgeren (#763)', () => {
  it('partisjonering utledet av varsel-feltet: hvert symbol havner i sonen hvis og bare hvis sym.varsel er satt', async () => {
    await gaaTilStegTekst()

    // queryByTestId og ikke getByTestId: sonen SKAL mangle når ingen symboler
    // varsler, og den retningen er like mye en del av kontrakten som
    // partisjoneringen er.
    const sone = screen.queryByTestId('alert-zone')
    expect(sone !== null).toBe(HAR_VARSLENDE)

    for (const sym of MARKERING_SYMBOLER) {
      const knapp = screen.getByTestId(`symbol-${sym.id}`)
      expect(sone?.contains(knapp) ?? false).toBe(sym.varsel !== null)
    }
  })

  it('ingen knapp forsvant eller ble duplisert', async () => {
    await gaaTilStegTekst()

    const knapper = document.querySelectorAll('[data-testid^="symbol-"]')
    expect(knapper).toHaveLength(MARKERING_SYMBOLER.length)
  })

  it.skipIf(!HAR_VARSLENDE)('merkelappen er nøyaktig "Alert zone" — ikke case-insensitiv, en omskrivning skal fange testen', async () => {
    await gaaTilStegTekst()

    const sone = screen.getByTestId('alert-zone')
    expect(sone.textContent).toContain('Alert zone')
  })

  it('konsekvensen er hørbar: varslende symboler har aria-label med "varsler alle", stille symboler har ingen', async () => {
    await gaaTilStegTekst()

    for (const sym of MARKERING_SYMBOLER) {
      const knapp = screen.getByTestId(`symbol-${sym.id}`)
      if (sym.varsel) {
        expect(knapp.getAttribute('aria-label')).toContain('varsler alle')
      } else {
        expect(knapp.hasAttribute('aria-label')).toBe(false)
      }
    }
  })
})
