import { describe, it, expect } from 'vitest'
import { splittPaaUrler } from '@/lib/linkify-core'

describe('splittPaaUrler', () => {
  it('returnerer tom array for tom streng', () => {
    expect(splittPaaUrler('')).toEqual([])
  })

  it('returnerer én tekst-del når ingen URL finnes', () => {
    const result = splittPaaUrler('bare vanlig tekst')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ type: 'tekst', verdi: 'bare vanlig tekst' })
  })

  it('splitter vanlig URL midt i tekst i 3 deler', () => {
    const result = splittPaaUrler('sjekk https://vg.no test')
    expect(result).toHaveLength(3)
    expect(result[0]).toMatchObject({ type: 'tekst', verdi: 'sjekk ' })
    expect(result[1]).toMatchObject({ type: 'url', verdi: 'https://vg.no', href: 'https://vg.no' })
    expect(result[2]).toMatchObject({ type: 'tekst', verdi: ' test' })
  })

  it('trimmer trailing komma fra URL og beholder det som tekst', () => {
    const result = splittPaaUrler('https://vg.no, og mer')
    // Forventer: url-del (uten komma), tekst-del ", og mer"
    expect(result[0]).toMatchObject({ type: 'url', verdi: 'https://vg.no' })
    expect(result[1]).toMatchObject({ type: 'tekst', verdi: ',' })
    expect(result[2]).toMatchObject({ type: 'tekst', verdi: ' og mer' })
  })

  it('håndterer flere URLer i samme tekst', () => {
    const result = splittPaaUrler('se https://vg.no og https://nrk.no')
    const urls = result.filter(d => d.type === 'url')
    expect(urls).toHaveLength(2)
    expect(urls[0]).toMatchObject({ href: 'https://vg.no' })
    expect(urls[1]).toMatchObject({ href: 'https://nrk.no' })
  })

  it('prepender https:// på www.-form og bruker det som href', () => {
    const result = splittPaaUrler('www.example.com')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      type: 'url',
      verdi: 'www.example.com',
      href: 'https://www.example.com',
    })
  })

  it('lar javascript:alert(1) forbli tekst — ingen lenke', () => {
    // URL_REGEX treffer kun http(s):// og www. — javascript: matcher ikke regex
    const result = splittPaaUrler('javascript:alert(1)')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ type: 'tekst' })
  })

  it('trimmer trailing punktum fra URL', () => {
    const result = splittPaaUrler('se https://vg.no.')
    // result[0] = tekst 'se ', result[1] = url, result[2] = tekst '.'
    expect(result[1]).toMatchObject({ type: 'url', verdi: 'https://vg.no' })
    expect(result[2]).toMatchObject({ type: 'tekst', verdi: '.' })
  })

  it('beholder query og fragment i URL', () => {
    const result = splittPaaUrler('https://example.com/sti?a=1#foo')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      type: 'url',
      verdi: 'https://example.com/sti?a=1#foo',
      href: 'https://example.com/sti?a=1#foo',
    })
  })

  it('trimmer trailing parentes uten å spise åpningsparentes', () => {
    const result = splittPaaUrler('(https://vg.no)')
    // result: tekst '(', url 'https://vg.no', tekst ')'
    const url = result.find(d => d.type === 'url')
    expect(url).toMatchObject({ type: 'url', verdi: 'https://vg.no' })
    // siste tekst-del skal inneholde ) (kan være sammen med annet)
    const sisteTekst = result[result.length - 1]
    expect(sisteTekst.type).toBe('tekst')
    expect((sisteTekst as { verdi: string }).verdi).toContain(')')
  })

  it('trimmer norske anførselstegn fra slutten av URL', () => {
    const result = splittPaaUrler('«https://vg.no»')
    const url = result.find(d => d.type === 'url')
    expect(url).toMatchObject({ type: 'url', verdi: 'https://vg.no' })
    // » skal ligge som tekst, ikke være med i URL
    const sisteTekst = result[result.length - 1]
    expect(sisteTekst.type).toBe('tekst')
    expect((sisteTekst as { verdi: string }).verdi).toContain('»')
  })

  // --- Naken-domeneform (#426) ---

  it('naken domene med sti → url med https:// href', () => {
    const result = splittPaaUrler('vg.no/sport')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ type: 'url', verdi: 'vg.no/sport', href: 'https://vg.no/sport' })
  })

  it('naken domene uten sti → url med https:// href', () => {
    const result = splittPaaUrler('example.com')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ type: 'url', verdi: 'example.com', href: 'https://example.com' })
  })

  it('subdomain.naken-domene → url', () => {
    const result = splittPaaUrler('blog.example.com')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ type: 'url', verdi: 'blog.example.com', href: 'https://blog.example.com' })
  })

  it('naken domene midt i tekst → 3 deler', () => {
    const result = splittPaaUrler('sjekk vg.no her')
    expect(result).toHaveLength(3)
    expect(result[0]).toMatchObject({ type: 'tekst', verdi: 'sjekk ' })
    expect(result[1]).toMatchObject({ type: 'url', verdi: 'vg.no', href: 'https://vg.no' })
    expect(result[2]).toMatchObject({ type: 'tekst', verdi: ' her' })
  })

  it('trailing punktum på naken domene kuttes og beholdes som tekst', () => {
    const result = splittPaaUrler('besøk vg.no.')
    const url = result.find(d => d.type === 'url')
    expect(url).toMatchObject({ type: 'url', verdi: 'vg.no', href: 'https://vg.no' })
    const sisteTekst = result[result.length - 1]
    expect(sisteTekst.type).toBe('tekst')
    expect((sisteTekst as { verdi: string }).verdi).toContain('.')
  })

  it('naken domene er case-insensitivt (i-flagg)', () => {
    const result = splittPaaUrler('VG.NO')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ type: 'url', href: 'https://VG.NO' })
  })

  it('uppercase-protokoll (Https://) gir korrekt href — regresjon #426-review', () => {
    // iOS autokapitaliserer første bokstav i en setning → «Https://vg.no».
    // Case-sensitiv startsWith('http') prependet før https:// → «https://Https://vg.no»,
    // som new URL() tolker med host «https» (feil vert). Etter fiksen bevares casingen
    // og verten blir korrekt vg.no. Vi asserter på parsed host, ikke eksakt streng,
    // fordi fiksen bevisst ikke lowercaser protokollen (browseren gjør det uansett).
    const result = splittPaaUrler('Https://vg.no')
    const urls = result.filter(d => d.type === 'url')
    expect(urls).toHaveLength(1)
    expect(urls[0]).toMatchObject({ type: 'url', href: 'Https://vg.no' })
    expect(new URL((urls[0] as { href: string }).href).host).toBe('vg.no')
  })

  it('to lenker i samme tekst — én hel http-lenke, én naken', () => {
    const result = splittPaaUrler('besøk https://vg.no og db.no her')
    const urls = result.filter(d => d.type === 'url')
    expect(urls).toHaveLength(2)
    expect(urls[0]).toMatchObject({ type: 'url', verdi: 'https://vg.no', href: 'https://vg.no' })
    expect(urls[1]).toMatchObject({ type: 'url', verdi: 'db.no', href: 'https://db.no' })
  })

  // --- Falsk-positiv-vern (#426) ---

  it('min.side (ukjent TLD) → kun tekst', () => {
    const result = splittPaaUrler('min.side')
    expect(result.every(d => d.type === 'tekst')).toBe(true)
  })

  it('f.eks (ikke domene) → kun tekst', () => {
    const result = splittPaaUrler('f.eks')
    expect(result.every(d => d.type === 'tekst')).toBe(true)
  })

  it('kl.18 (tall-«TLD») → kun tekst', () => {
    const result = splittPaaUrler('kl.18')
    expect(result.every(d => d.type === 'tekst')).toBe(true)
  })

  it('3.5 (desimaltall) → kun tekst', () => {
    const result = splittPaaUrler('3.5')
    expect(result.every(d => d.type === 'tekst')).toBe(true)
  })

  it('hel setning med kl.18 og f.eks → ingen url-del', () => {
    const result = splittPaaUrler('vi drar kl.18 til f.eks byen')
    expect(result.some(d => d.type === 'url')).toBe(false)
  })

  // --- Naken form med port/query/fragment (#427-review) ---

  it('naken form med query beholdes hel', () => {
    const result = splittPaaUrler('example.com?x=1')
    expect(result).toEqual([
      { type: 'url', verdi: 'example.com?x=1', href: 'https://example.com?x=1' },
    ])
  })

  it('naken form med port og sti beholdes hel', () => {
    const result = splittPaaUrler('example.com:8080/side')
    expect(result).toEqual([
      { type: 'url', verdi: 'example.com:8080/side', href: 'https://example.com:8080/side' },
    ])
  })

  it('norsk spørsmålstegn rett etter domene kappes som tegnsetting', () => {
    // «vg.no?» uten query-innhold — spørsmålstegnet er tegnsetting, ikke query
    const result = splittPaaUrler('skal vi dra til vg.no? Ja')
    const urls = result.filter(d => d.type === 'url')
    expect(urls).toHaveLength(1)
    expect(urls[0]).toMatchObject({ verdi: 'vg.no', href: 'https://vg.no' })
  })
})
