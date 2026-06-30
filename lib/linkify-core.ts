// Pure helper — ingen React-avhengighet. Importeres fra lib/linkify.tsx og
// fra tester uten å dra inn JSX. se #350

// Trailing tegnsetting som skal kuttes fra slutten av et URL-treff.
// Inkluderer norske «»-anførselstegn og typografiske “”‘’ slik at
// f.eks. «https://vg.no» ikke får »-tegnet med i URLen. se #350
const TRAILING_TEGNSETTING = /[.,)!\]?;:»"'“”‘’]+$/

// Regex som treffer http(s)-URLer og www.-prefiks URLer.
const URL_REGEX = /(https?:\/\/[^\s<>"]+|www\.[^\s<>"]+)/g

export type LinkDel =
  | { type: 'tekst'; verdi: string }
  | { type: 'url'; verdi: string; href: string }

/**
 * Splitter en tekst i alternerende tekst- og URL-biter.
 * Pure helper — ingen React-avhengighet, enkel å teste.
 */
export function splittPaaUrler(tekst: string): LinkDel[] {
  if (!tekst) return []

  const deler: LinkDel[] = []
  let sist = 0

  for (const treff of tekst.matchAll(URL_REGEX)) {
    const start = treff.index!
    let raaUrl = treff[0]

    // Kapp trailing tegnsetting (men behold den som separat tekst-del)
    const kuttMatch = raaUrl.match(TRAILING_TEGNSETTING)
    const kuttTekst = kuttMatch ? kuttMatch[0] : ''
    if (kuttTekst) {
      raaUrl = raaUrl.slice(0, raaUrl.length - kuttTekst.length)
    }

    // Prepend https:// for www.-form slik at URL-objektet kan validere
    const href = raaUrl.startsWith('http') ? raaUrl : `https://${raaUrl}`

    // Sanering: kun http(s) slippes gjennom — stenger javascript: og lignende
    let gyldig = false
    try {
      const u = new URL(href)
      gyldig = u.protocol === 'http:' || u.protocol === 'https:'
    } catch {
      // URL-parsing feilet — behandle hele treffet som tekst
    }

    if (!gyldig) {
      const raaFull = treff[0]
      if (start > sist) deler.push({ type: 'tekst', verdi: tekst.slice(sist, start) })
      deler.push({ type: 'tekst', verdi: raaFull })
      sist = start + raaFull.length
      continue
    }

    // Tekst før URL-treffet
    if (start > sist) {
      deler.push({ type: 'tekst', verdi: tekst.slice(sist, start) })
    }

    deler.push({ type: 'url', verdi: raaUrl, href })

    // Trailing tegnsetting som ble kappet → egen tekst-del
    if (kuttTekst) {
      deler.push({ type: 'tekst', verdi: kuttTekst })
    }

    sist = start + treff[0].length
  }

  // Eventuell tekst etter siste URL
  if (sist < tekst.length) {
    deler.push({ type: 'tekst', verdi: tekst.slice(sist) })
  }

  return deler
}
