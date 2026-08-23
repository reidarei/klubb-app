// Sanitering av klient-innsendt feilkontekst på vei inn i feil_logg.
//
// Lå tidligere inline i app/api/logg-feil/route.ts. Flyttet ut fordi Next
// begrenser hva en route-fil kan eksportere — saniteringen var dermed umulig å
// pinne i test, og det var nettopp der blob:-bugen under fikk ligge i fred.
// Route-handleren er eneste kaller; modulen er server-side (bruker Buffer).

import { LOGG_KONTEKST_MAKS_KB } from '@/lib/konstanter'

// Felter vi tillater fra klienten. Alt annet strippes stille.
// Speiler KONTEKST_WHITELIST i lib/logg.ts, med klient-spesifikke tillegg.
const KONTEKST_WHITELIST = new Set([
  'profil_id',
  'arrangement_id',
  'event',
  'code',
  'nivaa',
  'count',
  'tabell',
  'fingerprint',
  'sample',
  'status',
  // Klient-spesifikke feltere som er OK å lagre (sanitiseres nedenfor)
  'message',
  'stack',
  'digest',
  'url',
  // Diagnosefelter fra lib/klient-logg.ts (#575). Ingen av dem er
  // bruker-identifiserende: de beskriver klienten og feilen, ikke personen.
  // Legger du til et felt der, må det inn her — ellers strippes det stille.
  'name', // Error-klassenavn: TypeError / ChunkLoadError / Error
  'cause', // underliggende feil når en wrapper har kastet på nytt
  'appversjon', // hvilken bundle klienten faktisk kjørte
  'online', // navigator.onLine — skiller nettverksfeil fra kodefeil
  'standalone', // PWA eller vanlig nettleserfane
  'nettverk', // effectiveType (4g/3g/…), mangler i Safari
  'ressurs', // URL-en til en <script>/<link>/<img> som ikke lastet
])

// Grenser for klient-strengfelter. Rå error-messages/stacks kan inneholde
// PII (variabelverdier med navn, e-poster i URL-parametre osv.) — vi trunker
// aggressivt og fjerner query-strings fra URL. Se #366 review-runde.
const MESSAGE_MAKS_TEGN = 200
const STACK_MAKS_BYTES = 2048

// Sentinel-origin for relative URL-er. `new URL()` krever en base, og treffer
// vi den igjen i resultatet vet vi at inputen ikke hadde egen origin.
const RELATIV_BASE = 'https://x.invalid'

function trunker(verdi: string): string {
  return verdi.length > MESSAGE_MAKS_TEGN
    ? verdi.slice(0, MESSAGE_MAKS_TEGN) + '…'
    : verdi
}

/**
 * Saniter en ressurs-URL: en asset som ikke lastet.
 *
 * Origin beholdes (i motsetning til `url`) fordi assetene kan ligge på et annet
 * domene enn appen — R2 — og «hvilken host svarte ikke» er halve svaret. Query
 * strippes fortsatt: signerte URL-er kan bære token. (#575)
 */
function saniterRessurs(verdi: string): string {
  let u: URL
  try {
    u = new URL(verdi, RELATIV_BASE)
  } catch {
    return trunker(verdi)
  }

  // data: bærer selve filen i URL-en. Payloaden er både enorm og potensielt et
  // bilde av et medlem — behold kun mediatypen, aldri innholdet etter kommaet.
  if (u.protocol === 'data:') return `data:${u.pathname.split(',')[0]}`

  // blob: og andre ikke-hierarkiske skjemaer har ingen egen host: `origin`
  // arves fra den INDRE URL-en, og hele den indre URL-en ligger også i
  // `pathname`. `origin + pathname` limte dem derfor sammen til
  // «https://hosthttps://host/uuid» — en streng som ser ut som en korrupt URL
  // fra appen, men som var loggens egen feil. Behold protokollen i stedet.
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return trunker(`${u.protocol}${u.pathname}`)
  }

  return trunker(u.origin === RELATIV_BASE ? u.pathname : u.origin + u.pathname)
}

export function saniterVerdi(nokkel: string, verdi: unknown): unknown {
  if (typeof verdi !== 'string') return verdi
  // `cause` og `name` trunkeres som message: de er korte i praksis, men er
  // fritekst fra et error-objekt og skal ikke kunne blåse opp raden (#575).
  if (
    nokkel === 'message' ||
    nokkel === 'digest' ||
    nokkel === 'cause' ||
    nokkel === 'name'
  ) {
    return trunker(verdi)
  }
  if (nokkel === 'stack') {
    // Trunker på reell byte-lengde (UTF-8) — .length teller kodepunkter og
    // undervurderer størrelsen for norske tegn og emoji (opp til 4× feil).
    const bytes = Buffer.byteLength(verdi, 'utf8')
    if (bytes <= STACK_MAKS_BYTES) return verdi
    // Kutt på tegn til byte-grensen holder — enkel loop dropper bakerste
    // tegn til vi er under grensen. Sjelden hot path (kun ved storrestacks).
    let kuttet = verdi
    while (Buffer.byteLength(kuttet, 'utf8') > STACK_MAKS_BYTES) {
      kuttet = kuttet.slice(0, -Math.max(1, Math.floor(kuttet.length / 20)))
    }
    return kuttet + '…'
  }
  if (nokkel === 'url') {
    // Behold kun pathname — query-params kan inneholde e-post, token, navn.
    try {
      return new URL(verdi, RELATIV_BASE).pathname
    } catch {
      return trunker(verdi)
    }
  }
  if (nokkel === 'ressurs') return saniterRessurs(verdi)
  return verdi
}

export function scrubKontekst(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') return {}
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (KONTEKST_WHITELIST.has(k)) result[k] = saniterVerdi(k, v)
  }
  return result
}

/**
 * True hvis den scrubbede konteksten er større enn taket. Buffer.byteLength for
 * reell UTF-8-størrelse — .length undervurderer multibyte-tegn (norsk, emoji)
 * og kan slippe gjennom for stor payload.
 */
export function kontekstForStor(kontekstStr: string): boolean {
  return Buffer.byteLength(kontekstStr, 'utf8') > LOGG_KONTEKST_MAKS_KB * 1024
}
