// Sentral applikasjons-konfigurasjon. All env-var-lesing og miljø-defaults
// skal samles her, ikke spres ut i actions/route handlers.
//
// server-only kaster hvis denne modulen havner i en klient-bundle. Det er
// ikke pynt: VERCEL_ENV og VERCEL_URL under mangler NEXT_PUBLIC_-prefiks og
// er derfor `undefined` i en klientkomponent — en klientimport ville stille
// falt gjennom til feil gren i getBaseUrl() i stedet for å feile synlig.
// Alle importører er per i dag server-side; dette håndhever det maskinelt
// i stedet for å stole på gjennomgang (#687).
import 'server-only'

import { KLUBB_DOMENE } from './klubb-config'

// PROD_URL bygges fra KLUBB_DOMENE slik at domenet kun er hardkodet ett sted.
const PROD_URL = `https://${KLUBB_DOMENE}`
const DEV_URL = 'http://localhost:3000'

// Brukes i absolutte URL-er i varsler (push/epost), ICS-filer og lignende.
// Server-koden kan ikke lese window.location, så vi støtter en eksplisitt
// override via NEXT_PUBLIC_BASE_URL. Trailing slash strippes: alle
// kallesteder skriver `${BASE_URL}/sti`, så en env satt til «https://klubben.no/»
// ville gitt dobbel skråstrek. Samme normalisering som R2_PUBLIC_URL under.
// Særlig relevant for klubb-app-instanser der env-en settes av andre enn
// oss (#507-review).
//
// Rekkefølgen under (#687) er IKKE «prøv det som er satt» i vilkårlig
// rekkefølge — den er ordnet etter hvor mye tillit hver kilde fortjener:
//
//  1. Eksplisitt NEXT_PUBLIC_BASE_URL vinner alltid. Den er den eneste
//     kilden som kan kjenne den KANONISKE verten (inkl. evt. «www.») appen
//     faktisk serveres fra — VERCEL_URL peker alltid på selve deployment-
//     hostnavnet (*.vercel.app), aldri på et custom domene.
//  2. VERCEL_ENV === 'preview' → preview-deployets egen host fra VERCEL_URL.
//     Riktig for preview: der finnes intet stabilt custom domene å falle
//     tilbake på, og *.vercel.app ER preview sin kanoniske vert. Mangler
//     VERCEL_URL likevel, KASTER vi — grenen faller aldri videre til (4),
//     for Vercel bygger preview med NODE_ENV=production og preview-varsler
//     ville da pekt rett inn i produksjon (review-funn #687).
//  3. VERCEL_ENV === 'production' uten eksplisitt override → KAST. En prod-
//     deploy uten NEXT_PUBLIC_BASE_URL ville ellers falt til PROD_URL under,
//     som er en gjetning på domenet appen serveres fra. Er den gjetningen
//     feil (f.eks. fordi appen serveres fra et www-subdomene mens PROD_URL
//     er apex), sender varsler til en origin service workeren avviser som
//     kryss-origin — nøyaktig #687. Bygget skal stoppe med en forståelig
//     melding fremfor å deploye stille til feil origin.
//  4. NODE_ENV === 'production' (lokalt prod-bygg UTEN Vercel, ingen
//     VERCEL_ENV satt i det hele tatt) → PROD_URL. Dette er IKKE samme gren
//     som (3): Vercel setter VERCEL_ENV på både preview og production-bygg,
//     så NODE_ENV alene kan aldri skille dem (én sikker ting vi vet er at
//     et lokalt bygg ikke kjører på Vercel). Uten denne grenen ville et
//     lokalt `next build && next start` krevd samme miljøvariabel som prod.
//  5. Ellers → DEV_URL (localhost, dev-server).
//
// Kastet i (3) er bevisst gatet på VERCEL_ENV, ikke NODE_ENV: pr-check.yml
// (CI) setter NODE_ENV=production for et prod-aktig bygg uten å sette
// VERCEL_ENV, og skal ikke trippe denne vakten.
export function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_BASE_URL)
    return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '')
  if (process.env.VERCEL_ENV === 'preview') {
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
    // Preview UTEN VERCEL_URL faller bevisst IKKE videre til grenene under
    // (review-funn #687): Vercel bygger preview med NODE_ENV=production, så
    // neste gren som ville truffet er PROD_URL — og da hadde preview-varsler
    // pekt rett inn i produksjon. Det er samme feilklasse som hele #687:
    // en URL som stille peker på feil vert. Bedre å stoppe bygget.
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

// Gjør en (typisk lagret, absolutt) URL relativ til appens egen origin — det
// speilvendte problemet av absoluttUrl over. Push skal ALDRI bære en absolutt
// URL: Service Workeren sammenligner origin strengt (public/sw.js), og
// BASE_URL kan i prod peke på et annet vertsnavn enn appen faktisk serveres
// fra (apex vs. www) — nøyaktig det som gjorde at hvert push-trykk landet på
// «/» i #687.
//
// Godtatt origin er BASE_URL sin egen origin PLUSS www-søskenet (samme
// protokoll+port, hostname med/uten ledende «www.»). Dette er bevisst
// TOLERANT der Service Workeren i sw.js er STRENG: BASE_URL er konfigurert
// til apex mens appen faktisk serveres fra www (eller omvendt), og en streng
// origin-likhet her ville bare gjenskapt #687 på serversiden — enhver
// varsel-URL bygget fra en annen del av koden enn BASE_URL selv ville blitt
// avvist som «fremmed».
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

  // Ta ALDRI blindt pathname fra en fremmed URL — den kan peke helt utenom
  // appen (en ekstern lenke limt inn i en meldingstekst). Fallback er en
  // trygg intern sti, ikke et forsøk på å gjenbruke deler av inputen.
  if (!godkjentOrigin) return { sti: '/', utfall: 'fremmed' }

  // search og hash MÅ med — reelle mål i dag er f.eks. «/album/x?bilde=y»
  // og «/arrangementer/y#kommentarer» (chat-varsler lenker til kommentarfeltet).
  return { sti: u.pathname + u.search + u.hash, utfall: 'ok' }
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
// Nano Banana 2 (Gemini 3.1 Flash Image). #641 valgte Nano Banana Pro
// (`gemini-3-pro-image`), men first light avdekket at den ikke serveres i EU
// i det hele tatt — verken i en europe-west*-enkeltregion eller på
// EU-multiregionen. Valget sto da mellom modellen og EU-premisset, og
// premisset vant: `/om-appen` lover medlemmene at bildet behandles i EU, og
// vi skriver ikke om det løftet for å beholde en bedre modell.
//
// Nano Banana 2 er samme modellfamilie (Gemini image), altså samme
// request-form i lib/vertex.ts, og bærer samme SynthID-vannmerke som
// art. 50(2)-argumentet i docs/ai-act-vurdering.md hviler på. Det som IKKE
// er overført fra Pro er den manuelle verifiseringen av person-policyen —
// se § 8 der.
//
// MERK: et bytte til en annen modellFAMILIE (f.eks. en Imagen-modell) krever
// også en ny request-form i lib/vertex.ts, og et modellbytte generelt kan
// flytte databehandlingen til en annen jurisdiksjon — se CLAUDE.md § Policy:
// AI-funksjoner.
export const GOOGLE_VERTEX_MODELL =
  process.env.GOOGLE_VERTEX_MODELL ?? 'gemini-3.1-flash-image'

// R2 har egne, S3-lignende regionkoder; Vertex AI (Google Cloud) har sine
// egne. Denne allowlisten er IKKE R2_JURISDICTION — den styrer hvilket
// Google Cloud-datasenter ansiktsbildet og prompten prosesseres i.
// EU-only-utvalg med vilje: regionstrengen er et JURIDISK premiss (hvor
// persondata forlater instansen til), ikke en ytelsesdetalj — 'global' eller
// en US-region ville sendt medlemsbilder utenfor EU uten at noen la merke
// til det i en env-fil.
//
// 'eu' er EU-MULTIREGIONEN, ikke en enkeltregion — og den er i praksis den
// eneste brukbare verdien for bursdagsbilde i dag: standardmodellen serveres
// ikke i noen av europe-west*-enkeltregionene, og et kall dit svarer
// 404 NOT_FOUND på hvert forsøk. Merk at multiregionen også har sitt eget
// vertsnavn — se vertexVert() i lib/vertex.ts. Enkeltregionene står likevel
// igjen i lista: de er gyldige for andre bildemodeller, og en nedstrøms-
// instans som velger en annen modell skal fortsatt kunne pinne seg til ett
// land.
// Multiregionen holder databehandlingen innenfor EU, så det juridiske
// premisset under er uendret — den sprer den bare over flere EU-land.
export const VERTEX_LOKASJONER = [
  'eu',
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
