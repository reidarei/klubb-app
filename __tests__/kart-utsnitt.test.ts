import { describe, it, expect } from 'vitest'
import { trengerNyttUtsnitt, type KartBounds } from '@/lib/kart-utsnitt'

// #726: kartet skal stå musestille når den nye posisjonen fortsatt er
// innenfor det utsnittet mannen ser på. Rene tall, ingen Leaflet — se
// begrunnelsen i lib/kart-utsnitt.ts.
describe('kart-utsnitt (#726)', () => {
  const bounds: KartBounds = { nord: 60.0, syd: 59.8, ost: 10.9, vest: 10.6 }

  it('punkt midt i utsnittet trenger ikke nytt utsnitt', () => {
    expect(trengerNyttUtsnitt(bounds, { lat: 59.91, lng: 10.75 })).toBe(false)
  })

  it('punkt på kanten regnes som innenfor (inklusive grenser)', () => {
    expect(trengerNyttUtsnitt(bounds, { lat: 60.0, lng: 10.75 })).toBe(false)
    expect(trengerNyttUtsnitt(bounds, { lat: 59.8, lng: 10.6 })).toBe(false)
  })

  it('punkt utenfor mot nord/sør/øst/vest trenger nytt utsnitt', () => {
    expect(trengerNyttUtsnitt(bounds, { lat: 60.1, lng: 10.75 })).toBe(true)
    expect(trengerNyttUtsnitt(bounds, { lat: 59.7, lng: 10.75 })).toBe(true)
    expect(trengerNyttUtsnitt(bounds, { lat: 59.9, lng: 11.0 })).toBe(true)
    expect(trengerNyttUtsnitt(bounds, { lat: 59.9, lng: 10.5 })).toBe(true)
  })
})
