import { describe, it, expect } from 'vitest'
import { normaliserStikkord, formaterStikkord } from '@/lib/stikkord'
import { STIKKORD_MAKS_ANTALL, STIKKORD_MAKS_LENGDE } from '@/lib/konstanter'

describe('normaliserStikkord', () => {
  it('gir tom liste for tom streng', () => {
    expect(normaliserStikkord('')).toEqual([])
  })

  it('splitter på komma og trimmer hvert element', () => {
    expect(normaliserStikkord('grillmester,  gitarist ,alltid sist hjem')).toEqual([
      'grillmester',
      'gitarist',
      'alltid sist hjem',
    ])
  })

  it('splitter også på linjeskift', () => {
    expect(normaliserStikkord('grillmester\ngitarist\r\nalltid sist hjem')).toEqual([
      'grillmester',
      'gitarist',
      'alltid sist hjem',
    ])
  })

  it('dropper tomme elementer', () => {
    expect(normaliserStikkord('grillmester,,  ,gitarist')).toEqual(['grillmester', 'gitarist'])
  })

  it('kollapser indre whitespace', () => {
    expect(normaliserStikkord('alltid   sist    hjem')).toEqual(['alltid sist hjem'])
  })

  it('dedupliserer case-insensitivt og beholder første skrivemåte', () => {
    expect(normaliserStikkord('Grillmester, grillmester, GRILLMESTER')).toEqual(['Grillmester'])
  })

  it('kutter lista til STIKKORD_MAKS_ANTALL', () => {
    const mange = Array.from({ length: STIKKORD_MAKS_ANTALL + 5 }, (_, i) => `stikkord${i}`)
    const resultat = normaliserStikkord(mange.join(','))
    expect(resultat).toHaveLength(STIKKORD_MAKS_ANTALL)
    expect(resultat[0]).toBe('stikkord0')
  })

  it('kutter hvert element til STIKKORD_MAKS_LENGDE tegn', () => {
    const langt = 'a'.repeat(STIKKORD_MAKS_LENGDE + 10)
    expect(normaliserStikkord(langt)).toEqual([langt.slice(0, STIKKORD_MAKS_LENGDE)])
  })

  it('tar imot en array direkte (ingen splitting)', () => {
    expect(normaliserStikkord(['grillmester', 'gitarist'])).toEqual(['grillmester', 'gitarist'])
  })

  // Kuttingen må skje FØR dedup-nøkkelen bygges. Gjøres det motsatt vei,
  // passerer to ulike lange stikkord dedup og blir to like chips.
  it('dedupliserer stikkord som blir like etter kutting', () => {
    const felles = 'a'.repeat(STIKKORD_MAKS_LENGDE)
    expect(normaliserStikkord([`${felles}X`, `${felles}Y`])).toEqual([felles])
  })

  // Postgres teller tegn (kodepunkter) i check-constrainten, ikke UTF-16-
  // enheter. Kutter vi på enheter, kan et emoji på grensen deles i to.
  it('kutter på kodepunkter, ikke UTF-16-enheter', () => {
    const medEmoji = '🎉'.repeat(STIKKORD_MAKS_LENGDE + 5)
    const [ut] = normaliserStikkord([medEmoji])
    expect([...ut]).toHaveLength(STIKKORD_MAKS_LENGDE)
    // Hele emojier, ingen halvert surrogatpar: kutt på UTF-16-enheter ville
    // gitt 30 enheter = 15 emoji pluss et enslig surrogat.
    expect(ut).toBe('🎉'.repeat(STIKKORD_MAKS_LENGDE))
  })
})

describe('formaterStikkord / normaliserStikkord round-trip', () => {
  it('formaterStikkord → normaliserStikkord gir samme liste tilbake', () => {
    const liste = ['grillmester', 'gitarist', 'alltid sist hjem']
    expect(normaliserStikkord(formaterStikkord(liste))).toEqual(liste)
  })

  it('tom liste formateres til tom streng, som normaliserer til tom liste', () => {
    expect(formaterStikkord([])).toBe('')
    expect(normaliserStikkord(formaterStikkord([]))).toEqual([])
  })
})
