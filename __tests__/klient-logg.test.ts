// Pinner klassifiseringen i lib/klient-logg.ts (#575). Poenget med filen er
// ikke å teste at koden kjører, men at grensen mellom «manglende kodebit» og
// «vanlig nettverksfeil» ligger der vi tror — den grensen avgjør om en bruker
// får en automatisk reload eller en feilside.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { feilNavn, erChunkFeil, proevChunkReload, bildeKilde } from '@/lib/klient-logg'
import { CHUNK_RELOAD_SPERRE_MS } from '@/lib/konstanter'

describe('feilNavn', () => {
  it('leser name fra ekte Error-objekter', () => {
    expect(feilNavn(new TypeError('Load failed'))).toBe('TypeError')
    expect(feilNavn(new Error('noe'))).toBe('Error')
  })

  it('leser name fra error-lignende objekter', () => {
    // Next serialiserer feil over RSC-grensen som vanlige objekter — de er
    // ikke instanceof Error, men bærer fortsatt navnet.
    expect(feilNavn({ name: 'ChunkLoadError', message: 'x' })).toBe('ChunkLoadError')
  })

  it('faller tilbake til typeof for alt annet', () => {
    expect(feilNavn('bare en streng')).toBe('string')
    expect(feilNavn(null)).toBe('object')
    expect(feilNavn(undefined)).toBe('undefined')
  })
})

describe('erChunkFeil', () => {
  it('kjenner igjen webpack/Chrome-formen', () => {
    expect(erChunkFeil({ name: 'ChunkLoadError', message: 'x' })).toBe(true)
    expect(erChunkFeil(new Error('Loading chunk 42 failed.'))).toBe(true)
    expect(erChunkFeil(new Error('Loading CSS chunk 7 failed'))).toBe(true)
  })

  it('kjenner igjen Safari-formene', () => {
    // Nøyaktig meldingen fra feilraden 7. august 2026 som startet #575.
    expect(erChunkFeil(new TypeError('Load failed'))).toBe(true)
    expect(erChunkFeil(new Error('Importing a module script failed.'))).toBe(true)
  })

  it('lar vanlige feil være i fred', () => {
    expect(erChunkFeil(new Error('Kunne ikke hente turene'))).toBe(false)
    expect(erChunkFeil(new Error('NetworkError when attempting to fetch'))).toBe(false)
    // «Load failed» må stå alene — en melding som bare inneholder ordene skal
    // ikke utløse reload. Ellers ville en hvilken som helst feiltekst med
    // «load failed» i seg sendt brukeren i en reload.
    expect(erChunkFeil(new Error('Image load failed for avatar'))).toBe(false)
  })
})

describe('proevChunkReload', () => {
  const reload = vi.fn()

  beforeEach(() => {
    const lager = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => lager.get(k) ?? null,
      setItem: (k: string, v: string) => void lager.set(k, v),
    })
    vi.stubGlobal('navigator', { onLine: true })
    vi.stubGlobal('window', { location: { reload } })
    reload.mockClear()
  })

  afterEach(() => vi.unstubAllGlobals())

  it('reloader én gang og sperrer neste forsøk i vinduet', () => {
    expect(proevChunkReload()).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)

    // Andre forsøk umiddelbart: sperret. Uten denne bremsen ville en fersk
    // HTML som OGSÅ feiler gitt en uendelig reload-løkke.
    expect(proevChunkReload()).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('slipper til igjen når sperrevinduet har gått ut', () => {
    proevChunkReload()
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + CHUNK_RELOAD_SPERRE_MS + 1)
    expect(proevChunkReload()).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
    vi.mocked(Date.now).mockRestore()
  })

  it('reloader ikke når enheten er offline', () => {
    // Safari gir samme «Load failed» for offline som for manglende kodebit.
    // Er vi offline er reload feil svar — da mangler nettet, ikke fila.
    vi.stubGlobal('navigator', { onLine: false })
    expect(proevChunkReload()).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('reloader ikke når sessionStorage er blokkert', () => {
    // Privat modus: uten guard har vi ingen bremse mot løkka, så vi avstår.
    vi.stubGlobal('sessionStorage', {
      getItem() { throw new Error('blokkert') },
      setItem() { throw new Error('blokkert') },
    })
    expect(proevChunkReload()).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('bildeKilde', () => {
  // Pinner sidefunnet i #603: /api/logg-feil stripper query fra `ressurs`
  // (signerte URL-er kan bære token), og da kollapser ALLE bilder på nettstedet
  // til strengen «/_next/image». Loggraden sa dermed at ett bilde feilet, men
  // ikke hvilket. Vi pakker ut kilde-URL-en før sending i stedet — samme
  // sanering, mer presis verdi.
  it('pakker ut kildebildet fra Next sin bildeoptimalisering', () => {
    const r2 = 'https://pub-abc.r2.dev/arrangementer/1780405885074-hea3na4yg1w.jpg'
    const optimalisert = `https://www.eksempel.no/_next/image?url=${encodeURIComponent(r2)}&w=640&q=75`

    expect(bildeKilde(optimalisert)).toBe(r2)
  })

  it('gjør relative kildebilder absolutte så origin overlever saneringen', () => {
    const optimalisert = 'https://www.eksempel.no/_next/image?url=%2Fikon.png&w=64&q=75'

    expect(bildeKilde(optimalisert)).toBe('https://www.eksempel.no/ikon.png')
  })

  it('lar vanlige bilde-URL-er passere urørt', () => {
    const rett = 'https://pub-abc.r2.dev/arrangementer/bilde.jpg'

    expect(bildeKilde(rett)).toBe(rett)
  })

  it('lar /_next/image uten url-parameter passere urørt', () => {
    const rart = 'https://www.eksempel.no/_next/image?w=64'

    expect(bildeKilde(rart)).toBe(rart)
  })

  it('kaster aldri på søppel-input — en logger skal ikke velte kallstedet', () => {
    expect(bildeKilde('::ikke en url::')).toBe('::ikke en url::')
    expect(bildeKilde('')).toBe('')
  })
})
