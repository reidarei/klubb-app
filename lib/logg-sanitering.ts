// Sanitering av klient-innsendt feilkontekst på vei inn i feil_logg.
// Egen modul (ikke i route-fila) så den kan testes — Next begrenser hva en
// route-fil kan eksportere. Server-side (Buffer). Formvakten nederst deles
// med lib/logg.ts: samme lekkasjeflate, to inngangsdører (#711).

import { LOGG_KONTEKST_MAKS_KB, LOGG_NOEKKEL_MAKS_TEGN } from '@/lib/konstanter'

// Felter vi tillater fra klienten; alt annet strippes STILLE. Speiler
// KONTEKST_WHITELIST i lib/logg.ts + klient-tillegg. Eksportert for
// __tests__/logg-kontekst-dekning.test.ts, som sjekker at alt klienten sender står her (#681).
export const KONTEKST_WHITELIST = new Set([
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
  // Klient-spesifikke, saniteres i saniterVerdi()
  'message',
  'stack',
  'digest',
  'url',
  // Diagnosefelter fra lib/klient-logg.ts (#575) — beskriver klienten, ikke personen.
  'name', // Error-klassenavn: TypeError / ChunkLoadError / Error
  'cause', // underliggende feil når en wrapper har kastet på nytt
  'appversjon', // hvilken bundle klienten faktisk kjørte
  'online', // navigator.onLine — skiller nettverksfeil fra kodefeil
  'standalone', // PWA eller vanlig nettleserfane
  'nettverk', // effectiveType (4g/3g/…), mangler i Safari
  'ressurs', // URL-en til en <script>/<link>/<img> som ikke lastet
  // Push-klikk-diagnose fra sw.js og ServiceWorkerRegistrering.tsx (#676/#681).
  'maal', // pathname til varselets mål (sanitiseres nedenfor, samme gren som `url`)
  'hadde_maal', // boolean: hadde notifikasjonen en gyldig same-origin-URL
  'maal_grunn', // 'mangler' | 'ugyldig' | 'kryss_origin' | 'gyldig' — HVORFOR target ble null (#687)
  'antall_klienter', // antall same-origin vinduer (tall)
  'synlig_klient', // boolean: var minst ett vindu synlig da SW-en klikket
  'handling', // 'focus' | 'openWindow': hva notificationclick faktisk gjorde
  'kilde', // 'broadcast' | 'cache' | 'kanal' | 'login' (#688): hvilken sti som leverte navigasjonen
  'allerede_paa_maal', // boolean: klienten sto allerede på målet
  'synlighet', // document.visibilityState på klient-siden
  'klikk_id', // tilfeldig per klikk (sw.js), binder push.klikk til .navigert/.innlogging (#688)
  'forsok', // navigasjonsforsøk nr.; PUSH_KLIKK_MAKS_FORSOK er loop-bryteren (#688)
])

// Rå messages/stacks kan bære PII — trunker aggressivt (#366).
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
 * Saniter URL-en til en asset som ikke lastet. Origin beholdes (motsatt av
 * `url`): assets kan ligge på R2, og «hvilken host» er halve svaret. Query
 * strippes: signerte URL-er kan bære token (#575).
 */
function saniterRessurs(verdi: string): string {
  let u: URL
  try {
    u = new URL(verdi, RELATIV_BASE)
  } catch {
    return trunker(verdi)
  }

  // data: bærer selve filen (kanskje et bilde av et medlem) — kun mediatypen.
  if (u.protocol === 'data:') return `data:${u.pathname.split(',')[0]}`

  // blob: o.l.: `origin` arves fra den indre URL-en, som også ligger i
  // `pathname` — origin + pathname ville gitt «https://hosthttps://host/uuid».
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return trunker(`${u.protocol}${u.pathname}`)
  }

  return trunker(u.origin === RELATIV_BASE ? u.pathname : u.origin + u.pathname)
}

export function saniterVerdi(nokkel: string, verdi: unknown): unknown {
  if (typeof verdi !== 'string') return verdi
  // Korte felt i praksis (enums, UUID-er), men klient-kontrollert fritekst —
  // en buggy klient skal ikke kunne blåse opp raden (#575, #681, #688).
  if (
    nokkel === 'message' ||
    nokkel === 'digest' ||
    nokkel === 'cause' ||
    nokkel === 'name' ||
    nokkel === 'kilde' ||
    nokkel === 'handling' ||
    nokkel === 'synlighet' ||
    nokkel === 'maal_grunn' ||
    nokkel === 'klikk_id'
  ) {
    return trunker(verdi)
  }
  if (nokkel === 'stack') {
    // Byte-lengde, ikke .length: æøå og emoji er flere byte (opptil 4×).
    const bytes = Buffer.byteLength(verdi, 'utf8')
    if (bytes <= STACK_MAKS_BYTES) return verdi
    let kuttet = verdi
    while (Buffer.byteLength(kuttet, 'utf8') > STACK_MAKS_BYTES) {
      kuttet = kuttet.slice(0, -Math.max(1, Math.floor(kuttet.length / 20)))
    }
    return kuttet + '…'
  }
  if (nokkel === 'url' || nokkel === 'maal') {
    // Kun pathname — query kan bære e-post/token. `maal` og `url` saniteres
    // likt så de er direkte sammenlignbare («traff push-klikket målet?», #681).
    // Hash faller bort; akseptert.
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

/** True hvis konteksten overstiger taket, målt i UTF-8-byte (ikke .length). */
export function kontekstForStor(kontekstStr: string): boolean {
  return Buffer.byteLength(kontekstStr, 'utf8') > LOGG_KONTEKST_MAKS_KB * 1024
}

// ─── FORMVAKT PÅ RÅ NØKKELNAVN ───────────────────────────────────────────────

/**
 * Nøkkelnavn vi gjengir ordrett i logg (#681, #711). Kapping begrenser volum,
 * ikke PII: et nøkkelNAVN kan være en e-post eller URL. Våre feltnavn er alltid
 * JS-identifikatorer, de andre aldri — derfor er formen kriteriet. (En allowlist
 * passer ikke: feltet finnes for å fange strukturer vi ikke kjenner.)
 * Lengdegrensen hentes fra LOGG_NOEKKEL_MAKS_TEGN.
 */
export const NOEKKELNAVN_FORM = new RegExp(
  '^[a-zA-Z][a-zA-Z0-9_]{0,' + (LOGG_NOEKKEL_MAKS_TEGN - 1) + '}$',
)

export type NoekkelUtdrag = {
  /** Form-godkjente navn, kappet i antall og i lengde. */
  lesbare: string[]
  /** Navn som ikke besto formvakten — telles, gjengis aldri. */
  ugyldige: number
  /** Form-godkjente navn som falt utenfor maksAntall. */
  utelatt: number
}

/**
 * Formvaliderer og kapper rå nøkkelnavn før logging. Tellerne returneres så
 * kalleren kan skrive noe diagnostisk («+3_ukjent_form») i stedet for et tomt
 * felt — stille filtrering var blindsonen i #676/#711.
 */
export function utdragNoekkelnavn(
  noekler: string[],
  maksAntall: number,
): NoekkelUtdrag {
  const gyldige = noekler.filter((k) => NOEKKELNAVN_FORM.test(k))
  return {
    // Redundant med regexen med vilje: endres formen, står volumgrensen.
    lesbare: gyldige
      .slice(0, maksAntall)
      .map((k) => k.slice(0, LOGG_NOEKKEL_MAKS_TEGN)),
    ugyldige: noekler.length - gyldige.length,
    utelatt: Math.max(0, gyldige.length - maksAntall),
  }
}
