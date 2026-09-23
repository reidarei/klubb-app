/**
 * Gest-maskinen i AlbumLightbox (#625).
 *
 * Bakgrunn: `lib/bilde-zoom.ts` dekker matematikken, men to alvorlige feil lå i
 * selve maskinen — wheel-lytteren som aldri ble registrert (effekt med `[]`-deps
 * kjørte kun i første commit, der portalen ennå ikke var montert og ref-en var
 * null), og en peker som ble sluppet utenfor zoom-laget og dermed lå igjen i
 * `pointereRef` resten av økten. Ingen av dem kunne enhetstestes gjennom
 * matematikken alene.
 *
 * Argumentet i filhodet til bilde-zoom.ts om at pinch ikke kan automatiseres
 * gjelder Playwright, ikke jsdom: komponenten monteres fint her, og syntetiske
 * pointer-events når React-handlerne gjennom portalen.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import AlbumLightbox from '@/components/album/AlbumLightbox'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))
vi.mock('@/lib/actions/album', () => ({
  settOmslagsbilde: vi.fn(),
  slettAlbumBilde: vi.fn(),
}))
// Begge drar med seg browser-supabase-klienten og chat-hooks; lightboxen
// rendrer dem uansett ikke i oppsettet under (verken brukerId eller profiler).
vi.mock('@/components/album/AlbumBildeReaksjoner', () => ({ default: () => null }))
vi.mock('@/components/album/BildeKommentarSheet', () => ({ default: () => null }))

afterEach(cleanup)

const BILDER = [{ id: 'b1', bilde_url: 'https://example.test/en.jpg' }]

function dialog(): HTMLElement {
  const el = document.body.querySelector('[role="dialog"]')
  expect(el, 'lightboxen skal være montert i portalen').not.toBeNull()
  return el as HTMLElement
}

// Zoom-laget er den eneste diven med touchAction:'none' — det er der alle
// pointer-handlerne og wheel-lytteren bor.
function zoomLag(): HTMLElement {
  const lag = Array.from(dialog().querySelectorAll('div')).find(
    d => d.style.touchAction === 'none',
  )
  expect(lag, 'fant ikke zoom-laget (touchAction:none)').toBeTruthy()
  return lag as HTMLElement
}

function pointer(
  type: 'pointerdown' | 'pointerup' | 'pointermove' | 'pointercancel',
  maal: HTMLElement,
  { id = 1, x = 0, y = 0 }: { id?: number; x?: number; y?: number } = {},
) {
  const ev = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: id,
    clientX: x,
    clientY: y,
  })
  act(() => {
    maal.dispatchEvent(ev)
  })
  return ev
}

describe('AlbumLightbox — wheel-lytteren er faktisk registrert', () => {
  it('ctrl+wheel over zoom-laget blir preventDefault-et (ellers zoomer hele siden)', () => {
    render(<AlbumLightbox bilder={BILDER} startIndex={0} onLukk={() => {}} />)

    const ev = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -120,
      clientX: 100,
      clientY: 100,
    })
    act(() => {
      zoomLag().dispatchEvent(ev)
    })

    expect(ev.defaultPrevented).toBe(true)
  })

  it('vanlig wheel (uten ctrl) røres ikke — sidescroll skal ikke fanges', () => {
    render(<AlbumLightbox bilder={BILDER} startIndex={0} onLukk={() => {}} />)

    const ev = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      ctrlKey: false,
      deltaY: -120,
    })
    act(() => {
      zoomLag().dispatchEvent(ev)
    })

    expect(ev.defaultPrevented).toBe(false)
  })
})

describe('AlbumLightbox — gest-maskinen låser seg ikke', () => {
  it('trykk lukker når lukkVedTrykk er satt (baseline)', () => {
    const onLukk = vi.fn()
    render(<AlbumLightbox bilder={BILDER} startIndex={0} onLukk={onLukk} lukkVedTrykk />)

    const lag = zoomLag()
    pointer('pointerdown', lag, { id: 1, x: 40, y: 40 })
    pointer('pointerup', lag, { id: 1, x: 42, y: 41 })

    expect(onLukk).toHaveBeenCalledTimes(1)
  })

  it('en peker som slippes UTENFOR zoom-laget låser ikke maskinen for resten av økten', () => {
    const onLukk = vi.fn()
    render(<AlbumLightbox bilder={BILDER} startIndex={0} onLukk={onLukk} lukkVedTrykk />)

    const lag = zoomLag()
    // Sveip som ender over en søsken-knapp (X-en): laget ser pointerdown,
    // men aldri pointerup. På desktop finnes ingen implisitt pointer capture.
    const lukkKnapp = dialog().querySelector('button[aria-label="Lukk"]') as HTMLElement
    expect(lukkKnapp).toBeTruthy()
    pointer('pointerdown', lag, { id: 1, x: 40, y: 300 })
    pointer('pointerup', lukkKnapp, { id: 1, x: 300, y: 300 })
    expect(onLukk).not.toHaveBeenCalled()

    // Neste trykk skal fortsatt virke. Uten opprydding ville pointereRef nå
    // hatt 1 peker liggende → size===2 → tolket som pinch → aldri lukket.
    pointer('pointerdown', lag, { id: 2, x: 40, y: 40 })
    pointer('pointerup', lag, { id: 2, x: 41, y: 40 })

    expect(onLukk).toHaveBeenCalledTimes(1)
  })

  it('pointercancel utenfor laget rydder på samme måte', () => {
    const onLukk = vi.fn()
    render(<AlbumLightbox bilder={BILDER} startIndex={0} onLukk={onLukk} lukkVedTrykk />)

    const lag = zoomLag()
    pointer('pointerdown', lag, { id: 7, x: 10, y: 10 })
    pointer('pointercancel', document.body, { id: 7, x: 10, y: 10 })

    pointer('pointerdown', lag, { id: 8, x: 60, y: 60 })
    pointer('pointerup', lag, { id: 8, x: 60, y: 62 })

    expect(onLukk).toHaveBeenCalledTimes(1)
  })
})

// Gest-tilstanden på <img> styrte tidligere på pointereRef.current.size — en
// ref, som ikke trigger re-render. Endte en gest uten at skala/pos faktisk
// endret seg (snapp til samme verdi), kom det aldri en ny render i hviletilstand,
// og willChange:'transform' + transition:'none' ble hengende: et unødvendig
// kompositor-lag, og ingen myk overgang ved neste snapp. Copilot-funn på #628.
describe('AlbumLightbox — willChange/transition følger faktisk gesten', () => {
  function bildeStil(): CSSStyleDeclaration {
    const img = dialog().querySelector('img')
    expect(img, 'fant ikke bildet i lightboxen').toBeTruthy()
    return (img as HTMLImageElement).style
  }

  it('i hvile: ingen willChange, transition på', () => {
    render(<AlbumLightbox bilder={BILDER} startIndex={0} onLukk={() => {}} />)
    expect(bildeStil().willChange).toBe('')
    expect(bildeStil().transition).toContain('transform')
  })

  it('mens pekeren er nede: willChange satt, transition av', () => {
    render(<AlbumLightbox bilder={BILDER} startIndex={0} onLukk={() => {}} />)
    pointer('pointerdown', zoomLag(), { id: 1, x: 40, y: 40 })
    expect(bildeStil().willChange).toBe('transform')
    expect(bildeStil().transition).toBe('none')
  })

  // Pinch til skala 2 og slipp: snapp(2) === 2, så setSkala får samme verdi og
  // setPos kalles ikke i det hele tatt (den grenen er kun for MIN_SKALA). Ingen
  // state endrer seg på siste pointerup — nøyaktig tilfellet der en ref-basert
  // avledning aldri fikk en render til å rydde opp etter seg.
  function pinchTilSkala2(lag: HTMLElement) {
    pointer('pointerdown', lag, { id: 1, x: 0, y: 0 })
    pointer('pointerdown', lag, { id: 2, x: 100, y: 0 })
    pointer('pointermove', lag, { id: 2, x: 200, y: 0 })
  }

  it('etter fullført pinch faller willChange bort og transition kommer tilbake', () => {
    render(<AlbumLightbox bilder={BILDER} startIndex={0} onLukk={() => {}} />)

    const lag = zoomLag()
    pinchTilSkala2(lag)
    // Renderet midt i gesten er det som «låser» stilen på gammel kode.
    expect(bildeStil().willChange).toBe('transform')

    pointer('pointerup', lag, { id: 2, x: 200, y: 0 })
    pointer('pointerup', lag, { id: 1, x: 0, y: 0 })

    expect(bildeStil().willChange).toBe('')
    expect(bildeStil().transition).toContain('transform')
  })

  it('også når siste pointerup lander utenfor laget (window-oppryddingen)', () => {
    render(<AlbumLightbox bilder={BILDER} startIndex={0} onLukk={() => {}} />)

    const lag = zoomLag()
    const lukkKnapp = dialog().querySelector('button[aria-label="Lukk"]') as HTMLElement
    pinchTilSkala2(lag)

    pointer('pointerup', lag, { id: 2, x: 200, y: 0 })
    // Siste finger slippes over X-knappen: zoom-lagets egen onPointerUp fyrer
    // aldri, kun window-lytteren. Nullstiller bare den ene stien, henger stilen
    // igjen på nytt i en annen form.
    pointer('pointerup', lukkKnapp, { id: 1, x: 300, y: 300 })

    expect(bildeStil().willChange).toBe('')
    expect(bildeStil().transition).toContain('transform')
  })
})
