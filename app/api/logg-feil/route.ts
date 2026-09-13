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
import { scrubKontekst, kontekstForStor } from '@/lib/logg-sanitering'
import { logg } from '@/lib/logg'
import {
  LOGG_FEIL_RATE_LIMIT_PER_MIN,
  LOGG_EVENT_MAKS_LENGDE,
  PUSH_TELEMETRI_RATE_LIMIT_PER_MIN,
  PUSH_TELEMETRI_EVENTS,
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

// Push-telemetri-events får et EGET nøkkel-navnerom («push:…»), ikke bare en
// annen grense — samme rateBuckets-Map (RATE_MAP_MAKS/prunRateBuckets dekker
// begge navnerom), men uten prefikset ville en vanlig klientfeil og en
// push.klikk-rad fra samme IP+profil delt bøtte og dermed grensen med den
// laveste av de to (#688).
function sjekkRateLimit(ip: string, profilId: string | null, event: string): boolean {
  const erPushTelemetri = (PUSH_TELEMETRI_EVENTS as readonly string[]).includes(event)
  const noekkel = erPushTelemetri
    ? `push:${ip}:${profilId ?? 'anon'}`
    : `${ip}:${profilId ?? 'anon'}`
  const grense = erPushTelemetri ? PUSH_TELEMETRI_RATE_LIMIT_PER_MIN : LOGG_FEIL_RATE_LIMIT_PER_MIN
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
  if (bucket.count >= grense) return false
  bucket.count += 1
  return true
}

// Kontekst-whitelist og feltsanitering ligger i lib/logg-sanitering.ts —
// flyttet ut for å kunne pinnes i test (Next begrenser hva en route-fil kan
// eksportere).

// ─── Route handler ───────────────────────────────────────────────────────────

const GYLDIGE_NIVAA = ['warn', 'error', 'fatal'] as const

// Hvor mye av en strippet kontekst logg-varselet gjengir. Begge grensene
// gjelder klientkontrollert tekst — se kallstedet lenger ned.
const STRIPPET_SAMPLE_MAKS = 5
const STRIPPET_NOEKKEL_MAKS_TEGN = 40

// Formvakt på nøkkelnavnene vi gjengir i loggen (#681-reviewen). Kapping
// begrenser VOLUM, ikke PII: en klient kan sende «{"ola@example.com": 1}» og
// få adressen inn i Vercel-loggen. Et feltnavn fra VÅR kildekode er alltid en
// JS-identifikator, mens en epostadresse, en setning eller en URL aldri er
// det — så denne regexen beholder hele diagnoseverdien (utvikleren skal kunne
// lese HVILKET felt som ble strippet) og lukker PII-flaten. Digest eller
// allowlist ble vurdert og forkastet: en digest er uleselig, og en allowlist
// er selvmotsigende når eventet finnes nettopp for å fange ukjente felter.
// Lengden (40) er med vilje den samme som kappet over — regexen erstatter den
// ikke, den kommer i tillegg.
const STRIPPET_NOEKKEL_FORM = /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/

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
  if (kontekstForStor(JSON.stringify(kontekstRenset))) {
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

  if (!sjekkRateLimit(ip, profilId, event)) {
    return new NextResponse(null, { status: 429 })
  }

  // Belte ved siden av selen (#681): __tests__/logg-kontekst-dekning.test.ts
  // dekker felt i VÅR kildekode statisk, men fanger ikke en gammel cachet
  // klient-bundle som fortsatt sender et felt vi har fjernet fra whitelisten,
  // eller en tredjeparts-feilkilde. Denne varselen er den ENESTE deteksjonen
  // av det tilfellet — uten den er en strippet nøkkel like taus som #676 var.
  //
  // Står ETTER rate-limiten med vilje: nøkkelnavnene kommer rått fra klienten,
  // og en storm ville ellers skrevet én stdout-linje per request selv når
  // requesten uansett svares med 429.
  if (kontekst && typeof kontekst === 'object') {
    // Object.keys, ikke `k in kontekstRenset`: `'constructor' in {}` er true,
    // så en prototype-nøkkel ville blitt strippet uten at vi meldte fra.
    const beholdt = new Set(Object.keys(kontekstRenset))
    const strippet = Object.keys(kontekst as Record<string, unknown>).filter(
      (k) => !beholdt.has(k),
    )
    if (strippet.length > 0) {
      // Kun navn som SER UT som felter fra vår egen kode gjengis; resten
      // telles. Se STRIPPET_NOEKKEL_FORM for hvorfor formen, ikke innholdet,
      // er kriteriet.
      const lesbare = strippet.filter((k) => STRIPPET_NOEKKEL_FORM.test(k))
      logg.warn('logg-feil.kontekst.strippet', {
        // `fingerprint` og ikke `event`: logg.warn() spreder konteksten OVER
        // sine egne felter, så en `event`-nøkkel her ville overskrevet selve
        // event-navnet i stdout-linja. Verdien er hvilket klient-event som
        // mistet felter — uten den kan ikke «gammel cachet bundle» skilles
        // fra «ny regresjon» når flere klienter støyer samtidig.
        fingerprint: event,
        count: strippet.length,
        // Klientkontrollert tekst: formvaktet over, og antall/lengde kappet
        // her, ellers kan hvem som helst skrive vilkårlig lang tekst inn i
        // Vercel-loggen.
        sample: lesbare
          .slice(0, STRIPPET_SAMPLE_MAKS)
          .map((k) => k.slice(0, STRIPPET_NOEKKEL_MAKS_TEGN))
          .join(','),
        // Antall strippede nøkler som IKKE er identifikator-formede. Et tall
        // > 0 her betyr «noen sender oss noe som ikke ligner våre felter» —
        // like nyttig et signal som navnene selv, og uten PII-flaten.
        ugyldige: strippet.length - lesbare.length,
      })
    }
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
