'use client'

import { TEMA_STORAGE_KEY, TEMA_VALG, type TemaValg } from './konstanter'

export function lesTemaFraStorage(): TemaValg | null {
  if (typeof window === 'undefined') return null
  try {
    const v = window.localStorage.getItem(TEMA_STORAGE_KEY)
    if (v && (TEMA_VALG as readonly string[]).includes(v)) return v as TemaValg
  } catch { /* localStorage utilgjengelig i sandboxet kontekst */ }
  return null
}

export function skrivTemaTilStorage(valg: TemaValg) {
  try { window.localStorage.setItem(TEMA_STORAGE_KEY, valg) } catch {}
}

export function resolveSystemTema(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function resolveTema(valg: TemaValg): 'dark' | 'light' {
  return valg === 'system' ? resolveSystemTema() : valg
}

export function settDataTheme(resolved: 'dark' | 'light') {
  document.documentElement.dataset.theme = resolved
  // Oppdater <meta theme-color> til faktisk --bg via getComputedStyle
  const bg = window.getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
  if (bg) {
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', bg)
  }
}

export function lyttPaaSystemEndring(onChange: (mode: 'dark' | 'light') => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const mq = window.matchMedia('(prefers-color-scheme: light)')
  const handler = (e: MediaQueryListEvent) => onChange(e.matches ? 'light' : 'dark')
  mq.addEventListener('change', handler)
  return () => mq.removeEventListener('change', handler)
}
