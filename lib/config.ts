// Sentral applikasjons-konfigurasjon. All env-var-lesing og miljø-defaults
// samles her (se CLAUDE.md § Policy: Konfig).
//
// server-only er ikke pynt: VERCEL_ENV/VERCEL_URL mangler NEXT_PUBLIC_-prefiks
// og er `undefined` i en klient-bundle, så en klientimport ville stille falt
// til feil gren i getBaseUrl() i stedet for å feile synlig (#687).
import 'server-only'

import { KLUBB_DOMENE } from './klubb-config'

// Bygges fra KLUBB_DOMENE så domenet kun er hardkodet ett sted.
const PROD_URL = `https://${KLUBB_DOMENE}`
const DEV_URL = 'http://localhost:3000'

// Base for absolutte URL-er i varsler, ICS-filer o.l. Trailing slash strippes,
// siden kallestedene skriver `${BASE_URL}/sti` (#507).
//
// Grenene er ordnet etter hvor mye tillit kilden fortjener (#687):
//  1. NEXT_PUBLIC_BASE_URL vinner alltid — eneste kilde som kjenner den
//     kanoniske verten (inkl. «www.»). VERCEL_URL er alltid *.vercel.app.
//  2. Preview → VERCEL_URL, som ER previewens kanoniske vert. Mangler den,
//     KASTER vi: preview bygges med NODE_ENV=production, så gren 4 ville
//     latt preview-varsler peke inn i produksjon.
//  3. Production uten override → KAST. PROD_URL er en gjetning (apex vs. www);
//     feil gjetning gir push-lenker service workeren avviser som kryss-origin.
//  4. NODE_ENV=production uten VERCEL_ENV (lokalt prod-bygg) → PROD_URL.
//  5. Ellers → DEV_URL.
//
// Kastet i (3) gates på VERCEL_ENV, ikke NODE_ENV: CI (pr-check.yml) bygger med
// NODE_ENV=production uten VERCEL_ENV og skal ikke trippe vakten.
export function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_BASE_URL)
    return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '')
  if (process.env.VERCEL_ENV === 'preview') {
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
    // Faller bevisst ikke videre — se gren 2 over.
    throw new Error(
      'VERCEL_ENV=preview, men verken NEXT_PUBLIC_BASE_URL eller VERCEL_URL ' +
        'er satt. Da finnes ingen kilde til preview-deployets egen vert, og ' +
        'det eneste alternativet ville vært produksjons-URL-en — altså ' +
        'preview-varsler som peker inn i produksjon. Sett NEXT_PUBLIC_BASE_URL ' +
        'eksplisitt for dette bygget.',
    )
  }
  if (process.env.VERCEL_ENV === 'production') {
    throw new Error(
      'NEXT_PUBLIC_BASE_URL må settes eksplisitt når VERCEL_ENV=production. ' +
        'Uten den har appen ingen pålitelig kilde til verten den faktisk ' +
        'serveres fra: eneste alternativ er domenet utledet fra ' +
        'NEXT_PUBLIC_KLUBB_DOMENE, som bare er en gjetning (den kan f.eks. ' +
        'mangle et www-subdomene). Peker den på feil vert, avviser service ' +
        'workeren push-lenkene som kryss-origin, og hvert varseltrykk lander ' +
        'på forsiden. Bygget stoppes her fremfor å deploye til feil origin.',
    )
  }
  if (process.env.NODE_ENV === 'production') return PROD_URL
  return DEV_URL
}

export const BASE_URL = getBaseUrl()

// Gjør en relativ sti absolutt med BASE_URL — e-postklienter har ingen base
// å resolve mot (#507). Absolutte URL-er (case-insensitivt) slipper uendret
// gjennom; protokoll-relative («//host») får https-prefiks. Annet returneres
// uendret i stedet for å kaste — et varsel skal aldri feile på dette.
export function absoluttUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith('//')) return `https:${url}`
  if (url.startsWith('/')) return `${BASE_URL}${url}`
  return url
}

// Gjør en (typisk lagret, absolutt) URL relativ til appens origin, for push:
// Service Workeren sammenligner origin strengt, og BASE_URL kan peke på en
// annen vert enn appen serveres fra (#687).
//
// Godtatt origin er BASE_URL sin PLUSS www-søskenet. Bevisst tolerant der
// sw.js er streng — streng likhet her ville gjenskapt #687 på serversiden.
export type RelativUrlUtfall = 'ok' | 'fremmed' | 'ugyldig'

function wwwSoeskenpar(hostname: string): [string, string] {
  return hostname.startsWith('www.')
    ? [hostname, hostname.slice(4)]
    : [hostname, `www.${hostname}`]
}

export function relativUrl(url: string): { sti: string; utfall: RelativUrlUtfall } {
  let u: URL
  try {
    u = new URL(url, BASE_URL)
  } catch {
    return { sti: '/', utfall: 'ugyldig' }
  }

  const base = new URL(BASE_URL)
  const [egen, soesken] = wwwSoeskenpar(base.hostname)
  const godkjentOrigin =
    u.protocol === base.protocol &&
    u.port === base.port &&
    (u.hostname === egen || u.hostname === soesken)

  // Aldri pathname fra en fremmed URL — den kan peke helt utenom appen.
  if (!godkjentOrigin) return { sti: '/', utfall: 'fremmed' }

  // search og hash MÅ med, f.eks. «/album/x?bilde=y» og «…#kommentarer».
  return { sti: u.pathname + u.search + u.hash, utfall: 'ok' }
}

// Kontakt-epost i VAPID-metadata, så push-tjenestene kan nå oss ved misbruk.
// Må være reell. Ingen default — lib/push.ts feiler tydelig uten.
export const VAPID_CONTACT_EMAIL = process.env.VAPID_CONTACT_EMAIL ?? ''

// Offentlig CDN-URL for R2. Access keys og bucket leses i lib/r2.ts.
export const R2_PUBLIC_URL = (
  process.env.NEXT_PUBLIC_R2_PUBLIC_URL ??
  process.env.R2_PUBLIC_URL ??
  ''
).replace(/\/$/, '')

// Vakt i init-admin-scriptet, som nekter å kjøre mot prod. Ikke hemmelig.
export const KJENT_PROD_SUPABASE_URL = 'https://tdlfswmxezjdnxcbbiwn.supabase.co'

// Sentry DSN — uten NEXT_PUBLIC_, så den ikke lekker til klient-bundlen.
export const SENTRY_DSN = process.env.SENTRY_DSN ?? ''

// Anthropic-nøkkel. Server-only. Tom = feature no-op (kallClaude() returnerer
// null, og bygget lykkes uten secret).
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? ''
export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5'

// Avledet av nøkkelen, ikke en egen bryter, så de ikke kan komme i utakt.
// Boolsk og trygg å sende til klienten. Betinger AI-teksten på /om-appen, så
// en instans uten nøkkel ikke lover en utsending som ikke skjer.
// Se CLAUDE.md § Policy: AI-funksjoner.
export const AI_PAA = ANTHROPIC_API_KEY !== ''

// Vertex AI for bursdagsbilde (#641). Server-only. Service account-JSON er
// base64-enkodet fordi rå JSON er upraktisk i .env og Vercels env-UI.
export const GOOGLE_VERTEX_SA_JSON_B64 = process.env.GOOGLE_VERTEX_SA_JSON_B64 ?? ''
export const GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? ''
export const GOOGLE_CLOUD_LOCATION = process.env.GOOGLE_CLOUD_LOCATION ?? ''
// Nano Banana 2 (Gemini 3.1 Flash Image). Pro-modellen serveres ikke i EU, og
// EU-løftet på /om-appen vant over modellkvaliteten. Samme familie og
// SynthID-vannmerke som Pro, men person-policyen er ikke manuelt verifisert
// for denne (docs/ai-act-vurdering.md § 8).
// Bytte av modellfamilie krever ny request-form i lib/vertex.ts; modellbytte
// kan flytte jurisdiksjon — se CLAUDE.md § Policy: AI-funksjoner.
export const GOOGLE_VERTEX_MODELL =
  process.env.GOOGLE_VERTEX_MODELL ?? 'gemini-3.1-flash-image'

// Hvilke Google-datasentre ansiktsbildet kan prosesseres i. EU-only med vilje:
// regionen er et juridisk premiss, ikke en ytelsesdetalj. (Ikke det samme som
// R2_JURISDICTION.)
//
// 'eu' er EU-multiregionen og i praksis eneste brukbare verdi i dag —
// standardmodellen gir 404 i enkeltregionene. Multiregionen har eget
// vertsnavn (vertexVert() i lib/vertex.ts). Enkeltregionene står igjen for
// nedstrøms-instanser med en annen modell.
export const VERTEX_LOKASJONER = [
  'eu',
  'europe-west1',
  'europe-west3',
  'europe-west4',
  'europe-west9',
] as const

// Eget flagg, aldri slått sammen med AI_PAA: ulik leverandør, ulik
// databehandling, skal kunne skrus av uavhengig. Se CLAUDE.md § Policy:
// AI-funksjoner.
export const BURSDAGSBILDE_PAA =
  GOOGLE_VERTEX_SA_JSON_B64 !== '' && GOOGLE_CLOUD_PROJECT !== ''

// Allowlist-vakten er betinget av BURSDAGSBILDE_PAA: fila lastes i hver
// instans (også uten Google-credentials), og et ubetinget kast ville tatt dem
// ned. Fortsatt fail-closed — er funksjonen på, kaster vi før noe Vertex-kall.
if (BURSDAGSBILDE_PAA) {
  const gyldig = (VERTEX_LOKASJONER as readonly string[]).includes(GOOGLE_CLOUD_LOCATION)
  if (!gyldig) {
    throw new Error(
      `GOOGLE_CLOUD_LOCATION ("${GOOGLE_CLOUD_LOCATION}") er ikke i EU-allowlisten ` +
        `(${VERTEX_LOKASJONER.join(', ')}) — se lib/config.ts § VERTEX_LOKASJONER`,
    )
  }
}

// Base-URL for oppgjørs-API-et. Tom = hent-oppgjør er av. Server-only.
export const FOND_OPPGJOR_URL = process.env.FOND_OPPGJOR_URL ?? ''

// Bearer-nøkkel for oppgjørs-API-et. Server-only, og bevisst ingen fallback
// til GITHUB_TOKEN.
export const FOND_OPPGJOR_API_NOKKEL = process.env.FOND_OPPGJOR_API_NOKKEL ?? ''

// Repoet bak «innspill»; issues med GITHUB_ONSKE_LABEL er brukerønsker.
export const GITHUB_REPO =
  process.env.NEXT_PUBLIC_GITHUB_REPO ?? 'reidarei/klubb-app'
export const GITHUB_ONSKE_LABEL =
  process.env.NEXT_PUBLIC_GITHUB_ONSKE_LABEL ?? 'ønske'

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
