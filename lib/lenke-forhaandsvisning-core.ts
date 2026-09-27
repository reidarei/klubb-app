// Pure helpers for lenke-forhåndsvisning — ingen I/O, ingen server-only.
// Importeres av serveren (lib/lenke-forhaandsvisning.ts), av chat-komponentene
// og av tester. Selve hentingen bor i lib/lenke-forhaandsvisning.ts.

import { KLUBB_DOMENE } from '@/lib/klubb-config'
import type { LinkDel } from '@/lib/linkify-core'

export type Forhaandsvisning = {
  tittel: string
  bilde: string | null
  nettsted: string
}

const utenWww = (host: string) => host.replace(/^www\./i, '').toLowerCase()

/**
 * Stripper sporingsparametre (utm_*, fbclid, gclid …) slik at samme artikkel
 * delt fra push og fra forsiden gir samme cache-nøkkel og samme korte visning.
 */
export function normaliserLenke(href: string): string {
  try {
    const u = new URL(href)
    for (const k of [...u.searchParams.keys()]) {
      if (/^utm_/i.test(k) || /^(fbclid|gclid|mc_cid|mc_eid|igshid)$/i.test(k)) {
        u.searchParams.delete(k)
      }
    }
    return u.toString()
  } catch {
    return href
  }
}

/** Peker lenka til appen selv? Da er det ingen ekstern side å forhåndsvise. */
export function erAppLenke(href: string): boolean {
  try {
    return utenWww(new URL(href).host) === utenWww(KLUBB_DOMENE)
  } catch {
    return false
  }
}

/**
 * Kort, lesbar visning av en URL: «dn.no/marked/finansklagenemnda/dnb/l…».
 * Protokoll, www., sporingsparametre og avsluttende skråstrek tas bort.
 * Kun visning — href-en er alltid den fulle URL-en.
 */
export function kortUrl(href: string, maks = 32): string {
  let tekst: string
  try {
    const u = new URL(normaliserLenke(href))
    tekst = utenWww(u.host) + u.pathname.replace(/\/$/, '') + u.search
  } catch {
    tekst = href.replace(/^https?:\/\//i, '')
  }
  return tekst.length > maks ? tekst.slice(0, maks - 1) + '…' : tekst
}

/**
 * Hvilken lenke i meldingen skal få kort? Første eksterne lenke.
 * `erSist` = lenka står helt til slutt (kun blanke tegn/tegnsetting etter),
 * og kan da skjules i teksten fordi kortet viser den i stedet — slik
 * iMessage gjør. Midt i en setning blir den stående (forkortet).
 */
export function velgForhaandsvisningsLenke(
  deler: LinkDel[],
): { href: string; indeks: number; erSist: boolean } | null {
  const indeks = deler.findIndex(d => d.type === 'url' && !erAppLenke(d.href))
  if (indeks === -1) return null
  const resten = deler.slice(indeks + 1)
  const erSist = resten.every(d => d.type === 'tekst' && /^[\s.,!?)»"'”’]*$/.test(d.verdi))
  const del = deler[indeks] as Extract<LinkDel, { type: 'url' }>
  return { href: del.href, indeks, erSist }
}

// ─── SSRF-vakt ──────────────────────────────────────────────────────────────
// Serveren henter en URL et medlem har skrevet. Uten vakt kunne den brukes
// til å nå interne adresser (metadata-tjenester, localhost) fra Vercel.

/** Er dette en IP-adresse i et privat/internt/reservert område? */
export function erPrivatIp(ip: string): boolean {
  const v4 = ip.replace(/^::ffff:/i, '')
  const m = v4.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])]
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) ||           // link-local / sky-metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224                              // multicast + reservert
    )
  }
  const v6 = ip.toLowerCase()
  return (
    v6 === '::' || v6 === '::1' ||
    v6.startsWith('fc') || v6.startsWith('fd') || // unique local
    v6.startsWith('fe80')                          // link-local
  )
}

/** Vertsnavn som aldri skal hentes, uansett hva DNS svarer. */
export function erBlokkertVert(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  return (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    !h.includes('.') && !h.includes(':') // enkeltnavn uten domene (intranett)
  )
}

// ─── HTML-parsing ───────────────────────────────────────────────────────────

const ENTITETER: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  aring: 'å', Aring: 'Å', oslash: 'ø', Oslash: 'Ø', aelig: 'æ', AElig: 'Æ',
  ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
}

function dekodEntiteter(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (hel, kode: string) => {
    if (kode[0] === '#') {
      const n = kode[1].toLowerCase() === 'x' ? parseInt(kode.slice(2), 16) : parseInt(kode.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : hel
    }
    return ENTITETER[kode] ?? hel
  })
}

function rydd(s: string | undefined, maks: number): string | null {
  if (!s) return null
  const t = dekodEntiteter(s).replace(/\s+/g, ' ').trim()
  if (!t) return null
  return t.length > maks ? t.slice(0, maks - 1) + '…' : t
}

/**
 * Leser Open Graph / Twitter-card / <title> ut av en HTML-side.
 * Returnerer null når siden ikke har noen tittel — da er det ingenting
 * meningsfullt å vise, og kortet faller tilbake til den korte URL-en.
 */
export function parseForhaandsvisning(html: string, sideUrl: string): Forhaandsvisning | null {
  const meta = new Map<string, string>()
  for (const tagg of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attr: Record<string, string> = {}
    for (const a of tagg[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      attr[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? ''
    }
    const noekkel = (attr.property ?? attr.name ?? '').toLowerCase()
    // Første forekomst vinner — sider med flere og:image har hovedbildet først.
    if (noekkel && attr.content !== undefined && !meta.has(noekkel)) meta.set(noekkel, attr.content)
  }

  const tittel = rydd(
    meta.get('og:title') ?? meta.get('twitter:title') ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1],
    200,
  )
  if (!tittel) return null

  let bilde: string | null = null
  const raaBilde = meta.get('og:image') ?? meta.get('og:image:url') ?? meta.get('og:image:secure_url')
    ?? meta.get('twitter:image') ?? meta.get('twitter:image:src')
  if (raaBilde) {
    try {
      const u = new URL(dekodEntiteter(raaBilde.trim()), sideUrl)
      // Kun https: et http-bilde i en https-app blokkeres som blandet innhold.
      if (u.protocol === 'http:') u.protocol = 'https:'
      if (u.protocol === 'https:') bilde = u.toString()
    } catch {
      // ugyldig bilde-URL — kortet vises uten bilde
    }
  }

  let nettsted = rydd(meta.get('og:site_name'), 60)
  if (!nettsted) {
    try { nettsted = utenWww(new URL(sideUrl).host) } catch { nettsted = '' }
  }

  return { tittel, bilde, nettsted }
}
