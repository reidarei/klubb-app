import { describe, it, expect } from 'vitest'
import { avstandM, formaterAvstand } from '@/lib/geo-avstand'

// avstandM() er flyttet ordrett ut av lib/actions/posisjon.ts (#728) — testen
// dekker at flyttingen ikke endret regnestykket, pluss den norske
// formateringen som er ny.
describe('geo-avstand (#728)', () => {
  it('avstand mellom to identiske punkter er 0', () => {
    expect(avstandM(59.9139, 10.7522, 59.9139, 10.7522)).toBe(0)
  })

  it('avstand mellom to kjente punkter er riktig størrelsesorden', () => {
    // Oslo S til Grünerløkka er ca. 2 km i luftlinje.
    const meter = avstandM(59.9111, 10.7528, 59.9226, 10.7565)
    expect(meter).toBeGreaterThan(1000)
    expect(meter).toBeLessThan(1600)
  })

  it('formaterAvstand runder til nærmeste 10 meter under 1000 m', () => {
    expect(formaterAvstand(123)).toBe('120 m')
    expect(formaterAvstand(125)).toBe('130 m')
    expect(formaterAvstand(0)).toBe('0 m')
  })

  it('formaterAvstand viser km med norsk komma fra 1000 m', () => {
    expect(formaterAvstand(1000)).toBe('1,0 km')
    expect(formaterAvstand(1420)).toBe('1,4 km')
    expect(formaterAvstand(12340)).toBe('12,3 km')
  })
})
