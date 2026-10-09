/**
 * Leaflet-målene i JS og kart.css må være like (#851). Leaflet leser ikke CSS-en:
 * iconSize/iconAnchor plasserer markøren, og HALE_FRA_VENSTRE forskyver bobla
 * så halens spiss lander på stedet. Et avvik gir ingen feil, bare en markør
 * eller boble som sitter litt skjevt — derfor leses tallene rett ut av CSS-en.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { HALE_FRA_VENSTRE, MARKOER_PX, SPOR_PRIKK_PX } from '@/components/kart/kart-maal'

const CSS = readFileSync(join(process.cwd(), 'components/kart/kart.css'), 'utf8')

/** Egenskapene i den ENESTE blokken for selektoren — to blokker er en feil i seg selv. */
function blokk(selektor: string): Record<string, string> {
  // Kommentarer ut først, så er hver «selektor { kropp }» en regel (også de
  // inni @media — kart.css har ingen av disse selektorene der).
  const utenKommentarer = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
  const treff = [...utenKommentarer.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(
    m => m[1].trim() === selektor,
  )
  expect(treff, `${selektor} skal ha nøyaktig én blokk i kart.css`).toHaveLength(1)
  const kropp = treff[0][2]
  return Object.fromEntries(
    kropp
      .split(';')
      .map(d => d.split(':'))
      .filter(d => d.length >= 2)
      .map(([k, ...v]) => [k.trim(), v.join(':').trim()]),
  )
}

describe('kart-maal (#851) — JS-målene matcher kart.css', () => {
  it('.kart-boble-hale left = HALE_FRA_VENSTRE', () => {
    expect(blokk('.kart-boble-hale').left).toBe(`${HALE_FRA_VENSTRE}px`)
  })

  it('.kart-markoer er MARKOER_PX × MARKOER_PX', () => {
    const b = blokk('.kart-markoer')
    expect([b.width, b.height]).toEqual([`${MARKOER_PX}px`, `${MARKOER_PX}px`])
  })

  it('.kart-spor-prikk er SPOR_PRIKK_PX × SPOR_PRIKK_PX', () => {
    const b = blokk('.kart-spor-prikk')
    expect([b.width, b.height]).toEqual([`${SPOR_PRIKK_PX}px`, `${SPOR_PRIKK_PX}px`])
  })
})
