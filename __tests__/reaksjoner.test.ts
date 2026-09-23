import { describe, it, expect } from 'vitest'
import { harBrukerReagert, toggleReaksjonGrupper, type ReaksjonGruppe } from '@/lib/reaksjoner'

describe('harBrukerReagert', () => {
  it('returnerer false når gruppen ikke finnes', () => {
    expect(harBrukerReagert([], 'a', '👍')).toBe(false)
  })

  it('returnerer false når gruppen finnes men brukeren ikke er med', () => {
    const grupper: ReaksjonGruppe[] = [{ emoji: '👍', profilIder: ['b'] }]
    expect(harBrukerReagert(grupper, 'a', '👍')).toBe(false)
  })

  it('returnerer true når brukeren er med i gruppen', () => {
    const grupper: ReaksjonGruppe[] = [{ emoji: '👍', profilIder: ['a', 'b'] }]
    expect(harBrukerReagert(grupper, 'a', '👍')).toBe(true)
  })
})

describe('toggleReaksjonGrupper', () => {
  it('legger til ny gruppe når ingen finnes fra før', () => {
    const result = toggleReaksjonGrupper([], 'a', '👍')
    expect(result).toEqual([{ emoji: '👍', profilIder: ['a'] }])
  })

  it('legger brukeren til i eksisterende gruppe', () => {
    const grupper: ReaksjonGruppe[] = [{ emoji: '👍', profilIder: ['b'] }]
    const result = toggleReaksjonGrupper(grupper, 'a', '👍')
    expect(result).toEqual([{ emoji: '👍', profilIder: ['b', 'a'] }])
  })

  it('fjerner brukeren og rydder tom gruppe når brukeren allerede har reagert', () => {
    const grupper: ReaksjonGruppe[] = [{ emoji: '👍', profilIder: ['a'] }]
    const result = toggleReaksjonGrupper(grupper, 'a', '👍')
    expect(result).toEqual([])
  })

  it('fjerner brukeren fra gruppen, men beholder gruppen hvis andre fortsatt er med', () => {
    const grupper: ReaksjonGruppe[] = [{ emoji: '👍', profilIder: ['a', 'b'] }]
    const result = toggleReaksjonGrupper(grupper, 'a', '👍')
    expect(result).toEqual([{ emoji: '👍', profilIder: ['b'] }])
  })

  it('én reaksjon per bruker: bytte til ny emoji fjerner den gamle', () => {
    const grupper: ReaksjonGruppe[] = [
      { emoji: '👍', profilIder: ['a'] },
      { emoji: '❤️', profilIder: ['b'] },
    ]
    const result = toggleReaksjonGrupper(grupper, 'a', '❤️')
    expect(result).toEqual([{ emoji: '❤️', profilIder: ['b', 'a'] }])
  })

  it('bytte til ny emoji fjerner brukeren fra gammel gruppe og rydder den hvis tom', () => {
    const grupper: ReaksjonGruppe[] = [{ emoji: '👍', profilIder: ['a'] }]
    const result = toggleReaksjonGrupper(grupper, 'a', '❤️')
    expect(result).toEqual([{ emoji: '❤️', profilIder: ['a'] }])
  })

  it('muterer ikke input-arrayet — optimistisk state deles og må behandles immutabelt', () => {
    const grupper: ReaksjonGruppe[] = [
      { emoji: '👍', profilIder: ['a', 'b'] },
      { emoji: '❤️', profilIder: ['c'] },
    ]
    // Frys dypt: både ytre array, gruppe-objektene og profilIder-arrayene.
    // En fremtidig .push/.splice i transformen ville kastet TypeError her.
    Object.freeze(grupper)
    grupper.forEach(g => { Object.freeze(g); Object.freeze(g.profilIder) })

    const result = toggleReaksjonGrupper(grupper, 'a', '❤️')

    expect(result).toEqual([
      { emoji: '👍', profilIder: ['b'] },
      { emoji: '❤️', profilIder: ['c', 'a'] },
    ])
    expect(grupper).toEqual([
      { emoji: '👍', profilIder: ['a', 'b'] },
      { emoji: '❤️', profilIder: ['c'] },
    ])
  })
})
