import { describe, it, expect } from 'vitest'
import { vertexVert } from '@/lib/vertex'

// Vertex har tre ulike vertsnavn-former, og multiregionen bruker et eget
// domene (.rep.googleapis.com) i stedet for lokasjons-prefikset. Å bygge
// verten som `${lokasjon}-aiplatform.googleapis.com` for ALLE lokasjoner ga
// «400 Invalid hostname» i prod — en feilmelding som peker mot request-formen
// i stedet for mot adressen. Denne testen pinner de tre formene fra hverandre.
describe('vertexVert', () => {
  it('enkeltregion får lokasjons-prefiks', () => {
    expect(vertexVert('europe-west4')).toBe('europe-west4-aiplatform.googleapis.com')
    expect(vertexVert('europe-west1')).toBe('europe-west1-aiplatform.googleapis.com')
  })

  it('multiregion får eget .rep-domene, ikke prefiks', () => {
    expect(vertexVert('eu')).toBe('aiplatform.eu.rep.googleapis.com')
    expect(vertexVert('us')).toBe('aiplatform.us.rep.googleapis.com')
    expect(vertexVert('eu')).not.toContain('eu-aiplatform')
  })

  it('global har verken prefiks eller .rep', () => {
    expect(vertexVert('global')).toBe('aiplatform.googleapis.com')
  })
})
