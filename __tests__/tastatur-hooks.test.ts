import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useKeyboardOffset, useTastaturHoyde } from '@/components/chat/hooks/useKeyboardOffset'

// Pinner FORMELEN i de to hookene, ikke plattformadferd — verken jsdom eller
// noen annen testkjøring reproduserer Safari/Chromium sin faktiske
// visualViewport-oppførsel. Se e2e/viewport-meta.spec.ts for vakten som
// faktisk dekker plattform-signalet (#731), og CLAUDE.md
// § Policy: Skrivefelt og iOS-tastatur for hvorfor de to hookene finnes.

type StubbetViewport = {
  height: number
  offsetTop: number
  listeners: Record<string, Array<() => void>>
  addEventListener: (type: string, cb: () => void) => void
  removeEventListener: (type: string, cb: () => void) => void
}

function stubbVisualViewport(height: number, offsetTop = 0): StubbetViewport {
  const listeners: Record<string, Array<() => void>> = { resize: [], scroll: [] }
  const vv: StubbetViewport = {
    height,
    offsetTop,
    listeners,
    addEventListener: (type, cb) => {
      listeners[type] ??= []
      listeners[type].push(cb)
    },
    removeEventListener: (type, cb) => {
      listeners[type] = (listeners[type] ?? []).filter((f) => f !== cb)
    },
  }
  // @ts-expect-error — stub dekker kun det hookene faktisk bruker
  window.visualViewport = vv
  return vv
}

function fyr(vv: StubbetViewport, type: string) {
  act(() => {
    vv.listeners[type]?.forEach((cb) => cb())
  })
}

const ORIGINAL_INNER_HEIGHT = window.innerHeight

afterEach(() => {
  // @ts-expect-error — rydder stubben mellom tester
  delete window.visualViewport
  Object.defineProperty(window, 'innerHeight', { value: ORIGINAL_INNER_HEIGHT, configurable: true })
})

function settInnerHeight(px: number) {
  Object.defineProperty(window, 'innerHeight', { value: px, configurable: true })
}

describe('useTastaturHoyde — innerHeight - vv.height, ignorerer offsetTop', () => {
  it('returnerer differansen mellom innerHeight og vv.height', () => {
    settInnerHeight(800)
    const vv = stubbVisualViewport(500)
    const { result } = renderHook(() => useTastaturHoyde())
    fyr(vv, 'resize')
    expect(result.current).toBe(300)
  })

  it('ignorerer offsetTop — kun vv.resize påvirker verdien', () => {
    settInnerHeight(800)
    const vv = stubbVisualViewport(500, 120)
    const { result } = renderHook(() => useTastaturHoyde())
    fyr(vv, 'resize')
    expect(result.current).toBe(300)

    // Endrer kun offsetTop og fyrer scroll — ingen resize-lytter er
    // registrert av denne hooken, så verdien skal stå urørt.
    vv.offsetTop = 999
    fyr(vv, 'scroll')
    expect(result.current).toBe(300)
  })

  it('klamper til 0 når vv.height overstiger innerHeight', () => {
    settInnerHeight(800)
    const vv = stubbVisualViewport(850)
    const { result } = renderHook(() => useTastaturHoyde())
    fyr(vv, 'resize')
    expect(result.current).toBe(0)
  })
})

describe('useKeyboardOffset — innerHeight - vv.height - offsetTop, klampet', () => {
  it('trekker fra offsetTop i tillegg til vv.height', () => {
    settInnerHeight(800)
    const vv = stubbVisualViewport(500, 50)
    const { result } = renderHook(() => useKeyboardOffset())
    fyr(vv, 'resize')
    expect(result.current).toBe(250)
  })

  it('reagerer også på vv.scroll (offsetTop endres uten resize)', () => {
    settInnerHeight(800)
    const vv = stubbVisualViewport(500, 0)
    const { result } = renderHook(() => useKeyboardOffset())
    fyr(vv, 'resize')
    expect(result.current).toBe(300)

    vv.offsetTop = 40
    fyr(vv, 'scroll')
    expect(result.current).toBe(260)
  })

  it('klamper til 0 og blir aldri negativ', () => {
    settInnerHeight(800)
    const vv = stubbVisualViewport(900, 50)
    const { result } = renderHook(() => useKeyboardOffset())
    fyr(vv, 'resize')
    expect(result.current).toBe(0)
  })
})
