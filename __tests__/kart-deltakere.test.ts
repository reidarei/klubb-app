import { describe, it, expect } from 'vitest'
import { beregnPingKandidater } from '@/lib/kart-deltakere'

// #725: «Ping en herre»-lista under menn-lista i kart-panelet.
describe('kart-deltakere (#725)', () => {
  const alleAktive = [
    { id: 'a', navn: 'Andreas', bilde_url: null, rolle: 'medlem' },
    { id: 'b', navn: 'Benco', visningsnavn: 'Kristoffer', bilde_url: null, rolle: 'medlem' },
    { id: 'c', navn: 'Reidar', bilde_url: null, rolle: 'admin' },
  ]

  it('uten pågående arrangement: alle aktive minus dem som allerede deler', () => {
    const kandidater = beregnPingKandidater(alleAktive, [], null, new Set(['a']))
    expect(kandidater.map(k => k.profilId).sort()).toEqual(['b', 'c'])
  })

  it('med pågående arrangement: kun påmeldte (status "ja")', () => {
    const paameldinger = [
      { profil_id: 'a', status: 'ja' },
      { profil_id: 'b', status: 'nei' },
      { profil_id: 'c', status: 'ja' },
    ]
    const kandidater = beregnPingKandidater(alleAktive, paameldinger, 'arr-1', new Set())
    expect(kandidater.map(k => k.profilId).sort()).toEqual(['a', 'c'])
  })

  it('med pågående arrangement: påmeldte som allerede deler faller fortsatt bort', () => {
    const paameldinger = [
      { profil_id: 'a', status: 'ja' },
      { profil_id: 'c', status: 'ja' },
    ]
    const kandidater = beregnPingKandidater(alleAktive, paameldinger, 'arr-1', new Set(['a']))
    expect(kandidater.map(k => k.profilId)).toEqual(['c'])
  })

  it('kandidat-navn foretrekker visningsnavn over navn', () => {
    const kandidater = beregnPingKandidater(alleAktive, [], null, new Set(['a', 'c']))
    expect(kandidater).toEqual([{ profilId: 'b', navn: 'Kristoffer', bildeUrl: null, rolle: 'medlem' }])
  })

  it('status "kanskje" eller "nei" teller ikke som påmeldt', () => {
    const paameldinger = [
      { profil_id: 'a', status: 'kanskje' },
      { profil_id: 'b', status: 'nei' },
    ]
    const kandidater = beregnPingKandidater(alleAktive, paameldinger, 'arr-1', new Set())
    expect(kandidater).toEqual([])
  })
})
