// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { visDatoVerdi } from '@/components/ui/Skjema'

// Verdiene fra <input type="date|datetime-local|time"> er lokal tid uten sone.
// Visningen skal gi samme dag/klokkeslett uansett prosessens tidssone.
describe('visDatoVerdi', () => {
  it('dato', () => {
    expect(visDatoVerdi('date', '2007-11-24')).toBe('24. nov. 2007')
  })
  it('dato og tid', () => {
    expect(visDatoVerdi('datetime-local', '2026-12-05T18:30')).toBe('lør 5. des. kl. 18:30')
  })
  it('tid', () => {
    expect(visDatoVerdi('time', '07:05')).toBe('07:05')
  })
  it('tom verdi gir tom streng', () => {
    expect(visDatoVerdi('date', '')).toBe('')
  })
})
