import { describe, it, expect } from 'vitest'
import { normaliserFritekst } from '@/lib/fritekst'

describe('normaliserFritekst', () => {
  it('gir null for tom streng', () => {
    expect(normaliserFritekst('', 200)).toBeNull()
  })

  it('gir null for null/undefined', () => {
    expect(normaliserFritekst(null, 200)).toBeNull()
    expect(normaliserFritekst(undefined, 200)).toBeNull()
  })

  it('gir null for whitespace-only streng', () => {
    expect(normaliserFritekst('   \n\t  ', 200)).toBeNull()
  })

  it('trimmer ledende og etterfølgende whitespace', () => {
    expect(normaliserFritekst('  grillmester  ', 200)).toBe('grillmester')
  })

  it('kollapser indre whitespace, inkludert linjeskift, til ett mellomrom', () => {
    expect(normaliserFritekst('alltid   sist\n\nhjem', 200)).toBe('alltid sist hjem')
  })

  it('kapper til maks tegn', () => {
    const langt = 'a'.repeat(210)
    expect(normaliserFritekst(langt, 200)).toBe('a'.repeat(200))
  })

  // Postgres teller tegn (kodepunkter) i check-constrainten, ikke UTF-16-
  // enheter. Kutter vi på enheter, kan et emoji på grensen deles i to.
  it('kutter på kodepunkter, ikke UTF-16-enheter', () => {
    const medEmoji = '🎉'.repeat(205)
    const ut = normaliserFritekst(medEmoji, 200)
    expect(ut).not.toBeNull()
    expect([...ut!]).toHaveLength(200)
    // Hele emojier, ingen halvert surrogatpar: kutt på UTF-16-enheter ville
    // gitt 200 enheter = 100 emoji pluss et enslig surrogat.
    expect(ut).toBe('🎉'.repeat(200))
  })
})
