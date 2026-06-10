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
export const VAPID_CONTACT_EMAIL =
  process.env.VAPID_CONTACT_EMAIL ?? 'reidar.haavik@gmail.com'

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

// GitHub-repo som backer «innspill»-funksjonen. Issues med label
// GITHUB_ONSKE_LABEL behandles som brukerønsker.
export const GITHUB_REPO =
  process.env.NEXT_PUBLIC_GITHUB_REPO ?? 'reidarei/Herreklubben'
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
