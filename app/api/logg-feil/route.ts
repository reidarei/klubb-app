// POST /api/logg-feil — mottar klient-side feil via navigator.sendBeacon
// eller fetch. Skriver til feil_logg-tabellen via service_role (ingen RLS-sjekk).
//
// Rate-limit: in-memory Map per Vercel-instans. Deles ikke på tvers av
// instanser — det er OK, vi vil stoppe utilsiktede stormer (f.eks. en render-
// loop som kaller beaconen 1000 ganger), ikke koordinere globalt.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/supabase/database.types'
import {
  LOGG_FEIL_RATE_LIMIT_PER_MIN,
  LOGG_KONTEKST_MAKS_KB,
  LOGG_EVENT_MAKS_LENGDE,
} from '@/lib/konstanter'

// ─── Rate-limit ─────────────────────────────────────────────────────────────

type RateBucket = { count: number; resetAt: number }
const rateBuckets = new Map<string, RateBucket>()

// Hard cap på Map-en for å unngå memory-lekkasje på lang-levde Vercel-instanser
// (kan leve i timer, mange unike IP+profil-kombinasjoner over tid). Ved
// overskridelse: prunér alle utløpte buckets først, evict eldste hvis fortsatt
// over.
const RATE_MAP_MAKS = 10_000

function prunRateBuckets(naa: number): void {
  for (const [noekkel, bucket] of rateBuckets) {
    if (bucket.resetAt < naa) rateBuckets.delete(noekkel)
  }
  // Hvis fortsatt over cap etter pruning — drop eldste (Map-iterasjon er
  // insertion-order, så første nøkkel er eldst).
  while (rateBuckets.size > RATE_MAP_MAKS) {
    const foerste = rateBuckets.keys().next().value
    if (!foerste) break
    rateBuckets.delete(foerste)
  }
}

function sjekkRateLimit(ip: string, profilId: string | null): boolean {
  const noekkel = `${ip}:${profilId ?? 'anon'}`
  const naa = Date.now()

  // Amortisert opprydding: kjør pruning når Map-en når cap.
  if (rateBuckets.size >= RATE_MAP_MAKS) prunRateBuckets(naa)

  const bucket = rateBuckets.get(noekkel)

  if (!bucket || bucket.resetAt < naa) {
    // Nytt vindu
    rateBuckets.set(noekkel, { count: 1, resetAt: naa + 60_000 })
    return true
  }

  // Sjekk før inkrement slik at counteren ikke fortsetter å vokse mot uendelig
  // dersom klienten spammer i vei etter overskridelse.
  if (bucket.count >= LOGG_FEIL_RATE_LIMIT_PER_MIN) return false
  bucket.count += 1
  return true
}

// ─── Kontekst-whitelist (speiler lib/logg.ts) ────────────────────────────────

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
])

// Grenser for klient-strengfelter. Rå error-messages/stacks kan inneholde
// PII (variabelverdier med navn, e-poster i URL-parametre osv.) — vi trunker
// aggressivt og fjerner query-strings fra URL. Se #366 review-runde.
const MESSAGE_MAKS_TEGN = 200
const STACK_MAKS_BYTES = 2048

function saniterVerdi(nokkel: string, verdi: unknown): unknown {
  if (typeof verdi !== 'string') return verdi
  if (nokkel === 'message' || nokkel === 'digest') {
    return verdi.length > MESSAGE_MAKS_TEGN
      ? verdi.slice(0, MESSAGE_MAKS_TEGN) + '…'
      : verdi
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
      const u = new URL(verdi, 'https://x.invalid')
      return u.pathname
    } catch {
      return verdi.slice(0, MESSAGE_MAKS_TEGN)
    }
  }
  return verdi
}

function scrubKontekst(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') return {}
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (KONTEKST_WHITELIST.has(k)) result[k] = saniterVerdi(k, v)
  }
  return result
}

// ─── Route handler ───────────────────────────────────────────────────────────

const GYLDIGE_NIVAA = ['warn', 'error', 'fatal'] as const

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'

  // Parse body — sendBeacon sender application/json (Blob med type-header)
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new NextResponse(null, { status: 400 })
  }

  if (!body || typeof body !== 'object') {
    return new NextResponse(null, { status: 400 })
  }

  const {
    event,
    nivaa,
    kontekst,
  } = body as Record<string, unknown>

  // ── Validering ──────────────────────────────────────────────────────────────

  if (
    typeof event !== 'string' ||
    event.length === 0 ||
    event.length > LOGG_EVENT_MAKS_LENGDE
  ) {
    return new NextResponse(null, { status: 400 })
  }

  if (!GYLDIGE_NIVAA.includes(nivaa as (typeof GYLDIGE_NIVAA)[number])) {
    return new NextResponse(null, { status: 400 })
  }

  const kontekstRenset = scrubKontekst(kontekst)
  const kontekstStr = JSON.stringify(kontekstRenset)
  // Buffer.byteLength for reell UTF-8-størrelse — .length undervurderer
  // multibyte-tegn (norsk, emoji) og kan slippe gjennom for stor payload.
  if (Buffer.byteLength(kontekstStr, 'utf8') > LOGG_KONTEKST_MAKS_KB * 1024) {
    return new NextResponse(null, { status: 413 })
  }

  // ── Hent profil_id fra session (valgfritt — anon-feil er også gyldige) ─────

  let profilId: string | null = null
  try {
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    profilId = user?.id ?? null
  } catch {
    // Auth-feil er ikke kritisk her — vi logger uansett (bare uten profil_id)
  }

  // ── Rate-limit ──────────────────────────────────────────────────────────────

  if (!sjekkRateLimit(ip, profilId)) {
    return new NextResponse(null, { status: 429 })
  }

  // ── Insert ──────────────────────────────────────────────────────────────────

  const admin = createAdminClient()
  // Cast til Json-typen fra database.types — Record<string, unknown> er semantisk
  // ekvivalent med { [key: string]: Json | undefined } men TypeScript krever
  // eksplisitt cast fordi unknown er bredere enn Json-treet.
  const kontekstJson = kontekstRenset as Json
  const { error } = await admin.from('feil_logg').insert({
    event,
    nivaa: nivaa as 'warn' | 'error' | 'fatal',
    kontekst: kontekstJson,
    profil_id: profilId,
    url: typeof kontekstRenset.url === 'string' ? kontekstRenset.url : null,
    user_agent: req.headers.get('user-agent'),
  })

  if (error) {
    // Burst-dedup: unique-constraint-brudd betyr at nøyaktig samme feil
    // allerede er logget dette minuttet (fra denne profilen). 204 = stille.
    // PostgreSQL-kode 23505 = unique_violation.
    if (error.code === '23505') {
      return new NextResponse(null, { status: 204 })
    }
    // Andre feil logges til stdout — men vi returnerer 204 for å unngå
    // at klient-sida prøver igjen og skaper ny storm.
    console.log(JSON.stringify({ nivaa: 'warn', event: 'logg-feil.insert.feilet', code: error.code }))
    return new NextResponse(null, { status: 204 })
  }

  return new NextResponse(null, { status: 204 })
}
