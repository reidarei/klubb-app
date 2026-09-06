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
// Trailing slash strippes: alle kallesteder skriver `${BASE_URL}/sti`, så en
// env satt til «https://klubben.no/» ville gitt dobbel skråstrek. Samme
// normalisering som R2_PUBLIC_URL under. Særlig relevant for klubb-app-
// instanser der env-en settes av andre enn oss (#507-review).
export function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_BASE_URL)
    return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  if (process.env.NODE_ENV === 'production') return PROD_URL
  return DEV_URL
}

export const BASE_URL = getBaseUrl()

// Gjør en URL absolutt ved å prefikse BASE_URL. Push tåler relative URL-er
// (Service Worker resolver mot origin, se public/sw.js), men e-postklienter
// har ingen base-URL å resolve mot — en relativ href blir en ødelagt lenke
// i innboksen (#507). Allerede absolutte URL-er sendes uendret (case-
// insensitiv match — «HTTPS://» er like gyldig). Protokoll-relative URL-er
// («//host/sti») er like ubrukelige i e-post som en ren sti, så de får
// https-prefiks. Verdier som verken er absolutte eller starter med «/»
// returneres uendret i stedet for å kaste — et varsel skal aldri feile på
// dette; kallestedet logges i stedet (se lib/varsler.ts).
export function absoluttUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith('//')) return `https:${url}`
  if (url.startsWith('/')) return `${BASE_URL}${url}`
  return url
}

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

// Er KI-funksjonene i det hele tatt på? Avledet av nøkkelen, ikke en egen
// bryter — da kan de to ikke komme i utakt. Boolsk, så den er trygg å sende
// videre til en klientkomponent; selve nøkkelen skal aldri dit.
// Brukes til å (1) betinge AI-avsnittet på /om-appen og mikroteksten ved
// datofeltet, slik at en instans uten nøkkel ikke forteller medlemmene om en
// utsending som ikke skjer, og (2) spare et nytteløst server-kall.
// Se docs/ai-act-vurdering.md og «Policy: AI-funksjoner» i CLAUDE.md.
export const AI_PAA = ANTHROPIC_API_KEY !== ''

// Google Cloud / Vertex AI — bursdagsbilde-generering (#641). Server-only —
// ALDRI NEXT_PUBLIC_-prefiks, service account-nøkkelen er like sensitiv som
// R2- eller Supabase-nøklene. Base64-enkodet fordi en rå JSON-service-
// account-fil inneholder linjeskift og anførselstegn som er upraktiske i
// .env-filer og Vercel sitt env-UI.
export const GOOGLE_VERTEX_SA_JSON_B64 = process.env.GOOGLE_VERTEX_SA_JSON_B64 ?? ''
export const GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? ''
export const GOOGLE_CLOUD_LOCATION = process.env.GOOGLE_CLOUD_LOCATION ?? ''
// Nano Banana Pro (Gemini 3 Pro Image) — modellen besluttet i #641. Ikke et
// fritt valg: person-policyen er verifisert manuelt mot denne modellen, og
// art. 50(2)-etterlevelsen (SynthID-vannmerket i pikseldataen) er dens
// egenskap, ikke Vertex' generelt.
//
// Selve ID-strengen er dokumentasjonskunnskap, ikke verifisert mot en ekte
// konto i denne leveransen — env-overridable nettopp derfor (er den feil ved
// first light, er «-preview»-suffikset det første å prøve). MERK: et bytte
// til en annen modellFAMILIE (f.eks. en Imagen-modell) krever også en ny
// request-form i lib/vertex.ts, og et modellbytte generelt kan flytte
// databehandlingen til en annen jurisdiksjon — se CLAUDE.md § Policy:
// AI-funksjoner.
export const GOOGLE_VERTEX_MODELL =
  process.env.GOOGLE_VERTEX_MODELL ?? 'gemini-3-pro-image'

// R2 har egne, S3-lignende regionkoder; Vertex AI (Google Cloud) har sine
// egne. Denne allowlisten er IKKE R2_JURISDICTION — den styrer hvilket
// Google Cloud-datasenter ansiktsbildet og prompten prosesseres i.
// EU-only-utvalg med vilje: regionstrengen er et JURIDISK premiss (hvor
// persondata forlater instansen til), ikke en ytelsesdetalj — 'global' eller
// en US-region ville sendt medlemsbilder utenfor EU uten at noen la merke
// til det i en env-fil.
export const VERTEX_LOKASJONER = [
  'europe-west1',
  'europe-west3',
  'europe-west4',
  'europe-west9',
] as const

// Er bursdagsbilde-funksjonen i det hele tatt på? Eget flagg — IKKE slått
// sammen med AI_PAA. De to KI-flatene har ulike leverandører (Anthropic vs.
// Google), ulik databehandling (tekst vs. ansiktsbilde) og kan skrus av
// uavhengig av hverandre; en instans skal kunne ha dato-uttrekk på og
// bursdagsbilder av (eller omvendt) uten at flaggene griper inn i
// hverandre. Se CLAUDE.md § Policy: AI-funksjoner.
export const BURSDAGSBILDE_PAA =
  GOOGLE_VERTEX_SA_JSON_B64 !== '' && GOOGLE_CLOUD_PROJECT !== ''

// Allowlist-vakten kjører ved modul-load, men BETINGET av BURSDAGSBILDE_PAA
// — ikke ubetinget. Denne fila er MÅ-MATCHE mot klubb-app og lastes i hver
// instans (også dev-maskiner uten Google-credentials); et ubetinget kast her
// ville tatt ned enhver instans som ikke har skrudd på funksjonen ennå.
// Fail-closed-egenskapen er likevel intakt: ER funksjonen på med en ugyldig
// location, kaster vi før noe kall mot Vertex i det hele tatt kan skje.
if (BURSDAGSBILDE_PAA) {
  const gyldig = (VERTEX_LOKASJONER as readonly string[]).includes(GOOGLE_CLOUD_LOCATION)
  if (!gyldig) {
    throw new Error(
      `GOOGLE_CLOUD_LOCATION ("${GOOGLE_CLOUD_LOCATION}") er ikke i EU-allowlisten ` +
        `(${VERTEX_LOKASJONER.join(', ')}) — se lib/config.ts § VERTEX_LOKASJONER`,
    )
  }
}

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
