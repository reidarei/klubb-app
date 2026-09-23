// Pure helper — ingen React-avhengighet. Importeres fra lib/linkify.tsx og
// fra tester uten å dra inn JSX. se #350

// Trailing tegnsetting som skal kuttes fra slutten av et URL-treff.
// Inkluderer norske «»-anførselstegn og typografiske “”‘’ slik at
// f.eks. «https://vg.no» ikke får »-tegnet med i URLen. se #350
const TRAILING_TEGNSETTING = /[.,)!\]?;:»"'“”‘’]+$/

// Regex som treffer http(s)-URLer, www.-prefiks URLer og naken-domeneform m/kuratert TLD-liste.
// TLD-lista er nødvendig fordi new URL() ikke filtrerer ut falske positiver som «min.side»;
// «f.eks.no» uten mellomrom er akseptert lav-skade tradeoff. se #426
// Akseptert lav-skade: rene tall-labels (2.no) og e-post-domener (foo@bar.com → bar.com)
// linkifiseres også — å kreve bokstav i label ville tynget regexen for marginal gevinst.
// Naken form tar også valgfri port (:8080) og sti/query/fragment, så
// «example.com?x=1» linkifiseres helt — ikke bare domenedelen. se #427-review
const URL_REGEX = /(https?:\/\/[^\s<>"]+|www\.[^\s<>"]+|(?:[a-z0-9-]+\.)+(?:no|com|org|net|io|dev|app|me|co|eu|info|biz|tv|gg|xyz)\b(?::\d+)?(?:[/?#][^\s<>"]*)?)/gi

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

    // Prepend https:// for prefiks-løse former (www. og nakne domener) slik
    // at URL-objektet kan validere.
    // Case-insensitiv sjekk: i-flagget i URL_REGEX gjør at uppercase-protokoll
    // (Https://, HTTPS://) også matcher — startsWith('http') var case-sensitiv og
    // ville da prependet https:// → «https://Https://vg.no» med feil vert. se #426-review
    const href = /^https?:\/\//i.test(raaUrl) ? raaUrl : `https://${raaUrl}`

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
