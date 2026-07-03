// Sentral observability-modul. All server-side logging skal gå gjennom
// logg.warn() / logg.feil() — ikke console.error/warn direkte.
//
// Event-taksonomi (dot-separert navnerom):
//   varsel.send.feilet          — sendPush/sendEpost-feil i lib/varsler.ts
//   varsel.epost.feilet         — Resend API-feil i lib/epost.ts
//   varsel.push.feilet          — web-push-feil i lib/push.ts
//   bilde.opplast.feilet        — R2-opplasting feiler
//   video.opplast.feilet        — video-upload feiler
//   tema.ugyldig                — ukjent tema-verdi
//   chat.varsler.feilet         — mention-varsler etter chat-post feiler
//   kaaringspoll.varsler.feilet — varsler etter kåringspoll-hendelse feiler
//   cron.paaminne.feilet        — enkelt-oppgave i påminnelses-cron feiler
//   bursdagsgratulasjon.feilet  — insert-feil eller uventet exception
//   vitals.insert.feilet        — web-vitals-rad feiler i DB
//   github.webhook.feilet       — webhook-konfigurasjons- eller varselfeil
//   bli-utvikler.issue.feilet   — GitHub Issue-oppretting feiler

import { naa } from '@/lib/dato'
import { SENTRY_DSN } from '@/lib/config'

// ─── PII-SCRUBBING ──────────────────────────────────────────────────────────

// Felter vi tillater i kontekst sendt til Sentry og feil_logg.
// Alt som ikke er på listen strippes ut. Formålet er å unngå at navn,
// epostadresser, telefonnummer e.l. havner i Sentry-kvotaen.
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
])

function scrubbet(data?: Record<string, unknown>): Record<string, unknown> {
  if (!data) return {}
  // Tillat også felter som er nestet under «ctx» — planleggeren la ctx-støtte
  // til for cron-aggregering (f.eks. ctx: { count: 3 }).
  const ctx = data.ctx && typeof data.ctx === 'object' ? (data.ctx as Record<string, unknown>) : {}
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries({ ...data, ...ctx })) {
    if (k !== 'ctx' && KONTEKST_WHITELIST.has(k)) result[k] = v
  }
  return result
}

// ─── POSTGREST-NORMALISERING ─────────────────────────────────────────────────

// Supabase-klienten pakker DB-feil inn som { code, message, details, hint }.
// For Sentry er det nyttigere å gruppere etter feil-kode (f.eks. «23505»)
// enn etter den lange meldingsstrengen. Normalisering gir bedre fingerprinting.
function normaliserFeil(err: unknown): { code?: string; tabell?: string; melding: string } {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>
    if (typeof e.code === 'string' && typeof e.message === 'string') {
      // Forsøk å ekstrahere en identifikator (tabell eller constraint) fra
      // PostgREST-meldingen. Typisk format:
      //   «duplicate key value violates unique constraint "tabell_col_key"»
      // Regex-en grupperer konsistent på snake_case-identifikatorer, men den
      // kan like gjerne treffe constraint-navn som selve tabell-navnet —
      // derfor navngir vi feltet «identifikator» videre.
      const identMatch = String(e.message).match(/"([^"]+?_[^"]+?)"/)
      return {
        code: e.code,
        tabell: identMatch?.[1],
        melding: e.message,
      }
    }
  }
  return { melding: String(err) }
}

// ─── SENTRY LAZY IMPORT ──────────────────────────────────────────────────────

// Dynamisk import for å unngå hard avhengighet til @sentry/nextjs i dev
// (appen kjøres uten DSN lokalt, og lib/logg.ts skal fungere uten Sentry).
// Importeres kun i logg.feil() slik at Sentry aldri initialiseres i warn-sti.
async function getSentry() {
  if (!SENTRY_DSN) return null
  try {
    const Sentry = await import('@sentry/nextjs')
    return Sentry
  } catch {
    return null
  }
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

export const logg = {
  /**
   * Logg en forventet, ikke-kritisk hendelse til stdout. Ikke Sentry.
   * Bruk for: validerings-avvisning, blokkert utsending, manglende konfig.
   */
  warn(event: string, data?: Record<string, unknown>) {
    const ts = naa()
    console.log(
      JSON.stringify({ ts, nivaa: 'warn', event, ...scrubbet(data) })
    )
  },

  /**
   * Logg en uventet feil til stdout og Sentry.
   *
   * RLS-feil (42501 / PGRST301) sendes KUN til warn — de trigges av
   * lovlig brukeradferd (f.eks. tilgang avvist av policy) og spiser
   * Sentry-kvoten hvis de havner der. Se CLAUDE.md-policy.
   *
   * PostgREST-feil normaliseres til {code, tabell} for å gi Sentry
   * bedre fingerprint-gruppering på tvers av instanser.
   */
  async feil(
    event: string,
    error: unknown,
    opts?: {
      fingerprint?: string
      sample?: unknown   // eksempel på payload som forårsaket feilen
      ctx?: Record<string, unknown>
    },
  ) {
    const { code, tabell, melding } = normaliserFeil(error)

    // RLS-avvisning er ikke en programfeil — logg som warn og returner tidlig.
    // 42501 = PostgreSQL permission denied, PGRST301 = PostgREST row-level security.
    if (code === '42501' || code === 'PGRST301') {
      logg.warn(event, { code, ...opts?.ctx })
      return
    }

    const ts = naa()
    // stdout-logg leses av Vercel Log Drain / GitHub Actions
    console.log(
      JSON.stringify({
        ts,
        nivaa: 'error',
        event,
        code,
        tabell,
        melding,
        fingerprint: opts?.fingerprint,
        ...scrubbet(opts?.ctx),
      })
    )

    const Sentry = await getSentry()
    if (!Sentry) return

    Sentry.withScope((scope) => {
      if (opts?.fingerprint) {
        // Egendefinert fingerprint grupperer alle instanser av denne feil-typen
        // under én Sentry-issue, uavhengig av meldingstekst.
        scope.setFingerprint([opts.fingerprint])
      }
      if (code) scope.setTag('pg.code', code)
      // Kan være tabell- eller constraint-navn — se normaliserFeil() over.
      if (tabell) scope.setTag('pg.identifikator', tabell)
      scope.setExtra('event', event)
      // setContext (ikke setExtra) — kontekst-API-en går ikke gjennom
      // beforeSend-extra-whitelisten, så cron-aggregerings-count o.l.
      // overlever helt fram til Sentry-UI-et. Se #366 review.
      scope.setContext('ctx', scrubbet(opts?.ctx) as Record<string, unknown>)
      Sentry.captureException(error instanceof Error ? error : new Error(melding))
    })
  },
}
