// Sentral applikasjons-konfigurasjon. All env-var-lesing og miljø-defaults
// skal samles her, ikke spres ut i actions/route handlers.

import { KLUBB_DOMENE } from './klubb-config'

// PROD_URL bygges fra KLUBB_DOMENE slik at domenet kun er hardkodet ett sted.
const PROD_URL = `https://${KLUBB_DOMENE}`
const DEV_URL = 'http://localhost:3000'

// Brukes i absolutte URL-er i varsler (push/epost), ICS-filer og lignende.
// Server-koden kan ikke lese window.location, så vi støtter en eksplisitt
// override via NEXT_PUBLIC_BASE_URL. Vercel setter automatisk VERCEL_URL
// for preview-deploys (uten protokoll), så vi prefikser den med https.
export function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  if (process.env.NODE_ENV === 'production') return PROD_URL
  return DEV_URL
}

export const BASE_URL = getBaseUrl()

// Kontakt-epost for VAPID push-tjenestene (Apple/Google). Brukes ikke til
// å sende epost — kun metadata slik at push-tjenester kan kontakte oss
// ved misbruk eller tekniske problemer. Må være reell og nåbar.
// Ingen default — settes per instans (lib/push.ts feiler tydelig uten).
export const VAPID_CONTACT_EMAIL = process.env.VAPID_CONTACT_EMAIL ?? ''

// Cloudflare R2 public URL — hvor bilder kan hentes via CDN. Kun
// public-delen eksponeres her; access keys og bucket-navn leses i lib/r2.ts.
// NEXT_PUBLIC_-prefiks slik at klient-koden kan referere URL-en direkte.
export const R2_PUBLIC_URL = (
  process.env.NEXT_PUBLIC_R2_PUBLIC_URL ??
  process.env.R2_PUBLIC_URL ??
  ''
).replace(/\/$/, '')

// Kjent prod-URL for Supabase-prosjektet. Brukes som vakt i init-admin-scriptet
// slik at scriptet nekter å kjøre mot prod (selv om .env.local peker dit).
// Konstanten er trygg å eksponere — det er ikke en hemmelighet hvilken Supabase-
// instans appen bruker; access keys er det hemmelige.
export const KJENT_PROD_SUPABASE_URL = 'https://tdlfswmxezjdnxcbbiwn.supabase.co'

// DSN for Sentry feil-rapportering. Kun tilgjengelig server-side (ingen NEXT_PUBLIC_-prefiks)
// slik at DSN-en ikke lekker til klient-bundlen. Brukes av lib/logg.ts og sentry.server.config.ts.
export const SENTRY_DSN = process.env.SENTRY_DSN ?? ''

// Anthropic API-nøkkel for LLM-funksjoner (dato-forslag m.fl.). Server-only —
// ALDRI NEXT_PUBLIC_-prefiks. Tom nøkkel = feature no-op: kallClaude() returnerer
// null uten å sende noe, og build lykkes uten secret satt.
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? ''
// Modell brukt av dato-forslag og andre LLM-kall. Kan overstyres per instans.
export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5'

// Base-URL for RESTful oppgjørs-API (f.eks. https://oppgjor.example.com).
// Tom streng = hent-oppgjør-funksjonen er av (feature-flag-mønster fra #420).
// Server-only — ALDRI NEXT_PUBLIC_-prefiks.
export const FOND_OPPGJOR_URL = process.env.FOND_OPPGJOR_URL ?? ''

// Lesenøkkel (Bearer) for oppgjørs-API-et. Server-only — ALDRI NEXT_PUBLIC_-prefiks.
// INGEN fallback til GITHUB_TOKEN (dette er et separat API, ikke GitHub).
export const FOND_OPPGJOR_API_NOKKEL = process.env.FOND_OPPGJOR_API_NOKKEL ?? ''

// GitHub-repo som backer «innspill»-funksjonen. Issues med label
// GITHUB_ONSKE_LABEL behandles som brukerønsker.
export const GITHUB_REPO =
  process.env.NEXT_PUBLIC_GITHUB_REPO ?? 'reidarei/klubb-app'
export const GITHUB_ONSKE_LABEL =
  process.env.NEXT_PUBLIC_GITHUB_ONSKE_LABEL ?? 'ønske'

// Bygg GitHub Issues-list URL med ønske-label og gitt state.
export function githubIssuesUrl(params: {
  state: 'open' | 'closed' | 'all'
  perPage?: number
  page?: number
}): string {
  const sp = new URLSearchParams({
    labels: GITHUB_ONSKE_LABEL,
    state: params.state,
    sort: 'created',
    direction: 'desc',
    per_page: String(params.perPage ?? 100),
    page: String(params.page ?? 1),
  })
  return `https://api.github.com/repos/${GITHUB_REPO}/issues?${sp}`
}
