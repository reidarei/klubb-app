import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { lesTemaFraStorage, resolveSystemTema, resolveTema } from '@/lib/tema-klient'
import { TEMA_STORAGE_KEY } from '@/lib/konstanter'

// Map-basert localStorage-mock — jsdom har én innebygd, men vi vil ha full
// kontroll så vi kan resette mellom tester og simulere kast.
function lagStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => { store.clear() },
    key: () => null,
    length: 0,
  }
}

function settMatchMedia(prefersLight: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('light') ? prefersLight : !prefersLight,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

describe('lesTemaFraStorage', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      writable: true,
      configurable: true,
      value: lagStorage(),
    })
  })

  it('returnerer null når storage er tom', () => {
    expect(lesTemaFraStorage()).toBeNull()
  })

  it('returnerer gyldig valg når satt', () => {
    window.localStorage.setItem(TEMA_STORAGE_KEY, 'light')
    expect(lesTemaFraStorage()).toBe('light')
    window.localStorage.setItem(TEMA_STORAGE_KEY, 'dark')
    expect(lesTemaFraStorage()).toBe('dark')
    window.localStorage.setItem(TEMA_STORAGE_KEY, 'system')
    expect(lesTemaFraStorage()).toBe('system')
  })

  it('returnerer null ved ugyldig verdi', () => {
    window.localStorage.setItem(TEMA_STORAGE_KEY, 'blue')
    expect(lesTemaFraStorage()).toBeNull()
  })

  it('returnerer null hvis localStorage.getItem kaster (sandboxet kontekst)', () => {
    Object.defineProperty(window, 'localStorage', {
      writable: true,
      configurable: true,
      value: {
        getItem: () => { throw new Error('blocked') },
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
        key: () => null,
        length: 0,
      },
    })
    expect(lesTemaFraStorage()).toBeNull()
  })
})

describe('resolveSystemTema', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('returnerer light når OS foretrekker light', () => {
    settMatchMedia(true)
    expect(resolveSystemTema()).toBe('light')
  })

  it('returnerer dark når OS foretrekker dark', () => {
    settMatchMedia(false)
    expect(resolveSystemTema()).toBe('dark')
  })
})

describe('resolveTema', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('returnerer light for dark eller light uten å se på system', () => {
    settMatchMedia(true) // OS = light, men eksplisitt valg vinner
    expect(resolveTema('dark')).toBe('dark')
    expect(resolveTema('light')).toBe('light')
  })

  it('resolver system mot matchMedia — light', () => {
    settMatchMedia(true)
    expect(resolveTema('system')).toBe('light')
  })

  it('resolver system mot matchMedia — dark', () => {
    settMatchMedia(false)
    expect(resolveTema('system')).toBe('dark')
  })
})
