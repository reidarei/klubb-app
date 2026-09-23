// Tynn transport-modul mot Vertex AI (Google Cloud) for bursdagsbilde-
// generering (#641). Egen modul — ikke lib/anthropic.ts: annen leverandør,
// annen auth-modell (RS256-signert JWT mot Googles token-endepunkt, ikke en
// statisk API-nøkkel), og annen respons-form (bilde, ikke tekst).
//
// PII-fri logging: denne modulen logger ALDRI prompt-innhold eller
// bildebytes — kun feilklasse/status/en trunkert feilkropp (se VertexFeil).
// Domene-logging hører i lib/bursdagsbilde-generering.ts.

import { createSign } from 'node:crypto'
import {
  GOOGLE_VERTEX_SA_JSON_B64,
  GOOGLE_CLOUD_PROJECT,
  GOOGLE_CLOUD_LOCATION,
  GOOGLE_VERTEX_MODELL,
} from '@/lib/config'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform'

// Maks lengde på VertexFeil.kropp — nok til å se error.status/error.message,
// ikke nok til å bære en hel HTML-feilside videre inn i siste_feil-kolonnen.
const MAKS_FEILKROPP_TEGN = 500

type ServiceAccount = { client_email: string; private_key: string }

function lesServiceAccount(): ServiceAccount {
  let json: unknown
  try {
    json = JSON.parse(Buffer.from(GOOGLE_VERTEX_SA_JSON_B64, 'base64').toString('utf8'))
  } catch (e) {
    throw new Error('GOOGLE_VERTEX_SA_JSON_B64 er ikke gyldig base64/JSON', { cause: e })
  }
  const sa = json as Partial<ServiceAccount>
  if (!sa.client_email || !sa.private_key) {
    throw new Error('Service account-JSON mangler client_email eller private_key')
  }
  return { client_email: sa.client_email, private_key: sa.private_key }
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Bygg og signer en RS256-JWT for Googles «JWT Bearer»-token-utveksling
// (service-account-til-service-account, ingen bruker involvert).
//
// Ingen token-cache, ingen modul-nivå-state (se feedback_webpush_init):
// et cachet token i modul-scope på en langlevd serverless-instans kan
// overleve til det er utløpt, og en "smart" cache som sjekker exp selv
// er nøyaktig den kompleksiteten vi unngikk i lib/push.ts. Et JWT-mint +
// token-bytte koster noen titalls ms — neglisjerbart mot budsjettet i
// BURSDAGSBILDE_BUDSJETT_MODELL_MS.
function signertJwt(sa: ServiceAccount): string {
  const naa = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: sa.client_email,
    sub: sa.client_email,
    aud: TOKEN_URL,
    scope: SCOPE,
    iat: naa - 30,
    exp: naa + 3600,
  }
  const usignert = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`
  const signatur = createSign('RSA-SHA256').update(usignert).sign(sa.private_key)
  return `${usignert}.${base64Url(signatur)}`
}

async function hentVertexAuthHeader(signal?: AbortSignal): Promise<string> {
  const sa = lesServiceAccount()
  const jwt = signertJwt(sa)
  // `signal` er samme budsjett-signal som selve modellkallet (se
  // BURSDAGSBILDE_BUDSJETT_MODELL_MS i lib/konstanter.ts). Uten det var
  // budsjett-invarianten «modellsteget bruker maks 30 s» bare en påstand:
  // et hengende token-endepunkt kunne spise hele maxDuration alene, og
  // invokasjonen ville blitt drept før noen rad rakk å bli oppdatert.
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
    signal,
  })
  if (!res.ok) {
    const kropp = await res.text().catch(() => '')
    throw lagTokenFeil(res.status, kropp)
  }
  const data = (await res.json()) as { access_token?: string }
  if (!data.access_token) throw new Error('Google token-endepunkt svarte uten access_token')
  return `Bearer ${data.access_token}`
}

export type VertexFeilKlasse = 'auth' | 'kvote' | 'ugyldig' | 'blokkert' | 'transient'

export class VertexFeil extends Error {
  readonly klasse: VertexFeilKlasse
  readonly status: number
  readonly kropp: string
  constructor(klasse: VertexFeilKlasse, status: number, kropp: string) {
    super(`Vertex ${klasse} (${status})`)
    this.name = 'VertexFeil'
    this.klasse = klasse
    this.status = status
    this.kropp = kropp
  }
}

// Klassifiser på Googles kanoniske `error.status`-felt i JSON-bodyen der det
// finnes — HTTP-status alene skiller ikke f.eks. SERVICE_DISABLED (auth, API
// ikke aktivert i prosjektet) fra et vanlig kvote-avslag som også kan komme
// som 403 hos enkelte Google-API-er.
function lagVertexFeil(httpStatus: number, kropp: string): VertexFeil {
  const trunkert = kropp.slice(0, MAKS_FEILKROPP_TEGN)
  let googleStatus: string | undefined
  try {
    googleStatus = JSON.parse(kropp)?.error?.status as string | undefined
  } catch {
    // Ikke JSON — vanlig for 5xx fra infrastruktur foran Google selv.
    // googleStatus forblir undefined; vi faller tilbake på HTTP-status.
  }

  if (
    httpStatus === 401 ||
    httpStatus === 403 ||
    googleStatus === 'UNAUTHENTICATED' ||
    googleStatus === 'PERMISSION_DENIED' ||
    googleStatus === 'SERVICE_DISABLED'
  ) {
    return new VertexFeil('auth', httpStatus, trunkert)
  }
  if (httpStatus === 429 || googleStatus === 'RESOURCE_EXHAUSTED') {
    return new VertexFeil('kvote', httpStatus, trunkert)
  }
  if (httpStatus === 400 || googleStatus === 'INVALID_ARGUMENT') {
    return new VertexFeil('ugyldig', httpStatus, trunkert)
  }
  if (
    httpStatus >= 500 ||
    googleStatus === 'UNAVAILABLE' ||
    googleStatus === 'INTERNAL' ||
    googleStatus === 'DEADLINE_EXCEEDED'
  ) {
    return new VertexFeil('transient', httpStatus, trunkert)
  }
  // Ukjent kombinasjon: tolk konservativt som transient (reclaimable neste
  // slot) fremfor 'ugyldig' (terminal) — en uforutsett feilform skal kunne
  // forsøkes på nytt, ikke stille avvises for godt.
  return new VertexFeil('transient', httpStatus, trunkert)
}

// Token-utvekslingen har sitt EGET feilvokabular — den svarer ikke i
// Googles kanoniske `error.status`-form, men med OAuth-formen
// `{ "error": "invalid_grant", "error_description": ... }`. De vanligste
// service-account-feilene (rotert/slettet nøkkel, klokkeavvik på mer enn
// fem minutter, feil client_email) kommer alle som **400 invalid_grant**.
// Gjennom lagVertexFeil() ville de blitt klassifisert som 'ugyldig' på HTTP
// 400 alene — altså som «vår request-form er feil», som er terminal og
// ikke reclaimable. Det er feil diagnose og verst tenkelige utfall: en
// rotert nøkkel er nettopp noe som fikses utenfor koden og skal kunne
// forsøkes på nytt neste slot. Alt 4xx fra token-mint er derfor 'auth'.
function lagTokenFeil(httpStatus: number, kropp: string): VertexFeil {
  const trunkert = kropp.slice(0, MAKS_FEILKROPP_TEGN)
  if (httpStatus >= 400 && httpStatus < 500) {
    return new VertexFeil('auth', httpStatus, `token-mint: ${trunkert}`)
  }
  // 5xx (og alt annet) fra Googles token-endepunkt er infrastruktur hos dem.
  return new VertexFeil('transient', httpStatus, `token-mint: ${trunkert}`)
}

// Vertex har TRE ulike vertsnavn-former, ikke én med innsatt lokasjon:
//
//   enkeltregion   europe-west4  ->  europe-west4-aiplatform.googleapis.com
//   multiregion    eu | us       ->  aiplatform.eu.rep.googleapis.com
//   global         global        ->  aiplatform.googleapis.com
//
// Multiregionen er den som feller folk: den ser ut som en lokasjonsstreng
// som alle andre, men bruker et helt eget domene (`.rep.googleapis.com`).
// Bygger man verten ved å prefikse lokasjonen, blir det
// eu-aiplatform.googleapis.com, som Google svarer «400 Invalid hostname» på
// — ikke 404, så feilen ser ut som en feil i request-formen vår i stedet for
// i adressen. Samme bug er rapportert i litellm, vercel/ai og Roo-Code;
// prefiks-antakelsen er en kjent felle, ikke noe vi fant på selv.
//
// Eksportert kun for test — kallere skal bruke genererBildeVertex().
export function vertexVert(lokasjon: string): string {
  if (lokasjon === 'global') return 'aiplatform.googleapis.com'
  if (lokasjon === 'eu' || lokasjon === 'us') return `aiplatform.${lokasjon}.rep.googleapis.com`
  return `${lokasjon}-aiplatform.googleapis.com`
}

export type VertexReferansebilde = {
  base64: string
  mimeType: string
}

export type VertexBilde = {
  bytes: Uint8Array
  mimeType: string
  modell: string
}

// Generer ett bursdagsbilde. `bilder` er referansebildene (base64 uten
// data:-prefiks), sendt inline i den rekkefølgen kallstedet oppgir dem —
// første er bursdagsbarnet, resten er medgjester. Bestiller 4:3 i 1K.
//
// Modellen er Nano Banana 2 (Gemini 3.1 Flash Image) — ikke et åpent valg.
// #641 valgte Nano Banana Pro og verifiserte person-policyen manuelt mot
// DEN; Pro viste seg å ikke finnes i EU, så vi byttet ned i samme familie
// framfor å forlate EU. Person-policy-verifiseringen er altså IKKE overført
// — se docs/ai-act-vurdering.md § 8. SynthID-vannmerket, som hele
// art. 50(2)-argumentet hviler på, er felles for Gemini-bildemodellene og
// følger med. Det er en GEMINI-modell, ikke en Imagen-modell,
// og bruker derfor `:generateContent` med `contents` — ikke Imagens
// `:predict` med `instances[].referenceImages`. De to formene er ikke
// utbyttbare: et Imagen-payload mot en Gemini-modell svarer 400 på hvert
// eneste kall.
//
// Modell-ID-strengen er verifisert ved first light. Fellen var ikke navnet,
// men LOKASJONEN: modellen serveres ikke i noen europe-west*-enkeltregion, og
// Googles 404 sier «not found or your project does not have access» — samme
// melding for feil navn og feil region, så den peker deg mot å mistenke
// ID-en. GOOGLE_VERTEX_MODELL er fortsatt env-overridable, men et bytte til
// en annen MODELLFAMILIE krever også en ny request-form her, og en ny AI
// Act-vurdering (CLAUDE.md § Policy: AI-funksjoner).
export async function genererBildeVertex({
  bilder,
  prompt,
  signal,
}: {
  bilder: VertexReferansebilde[]
  prompt: string
  signal?: AbortSignal
}): Promise<VertexBilde> {
  if (bilder.length === 0) throw new Error('genererBildeVertex kalt uten referansebilder')
  const auth = await hentVertexAuthHeader(signal)
  const endpoint =
    `https://${vertexVert(GOOGLE_CLOUD_LOCATION)}/v1/` +
    `projects/${GOOGLE_CLOUD_PROJECT}/locations/${GOOGLE_CLOUD_LOCATION}/` +
    `publishers/google/models/${GOOGLE_VERTEX_MODELL}:generateContent`

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          // Referansebildet FØRST, prompten etter — Gemini leser delene i
          // rekkefølge, og teksten viser tilbake til «the reference photo».
          // Rekkefølgen er en DEL AV KONTRAKTEN, ikke en detalj: prompten
          // viser til bildene som «the first/second/third reference photo»,
          // så en omstokking her bytter om på hvem som blir hvem i bildet.
          // Derfor en liste inn, ikke et objekt per rolle — kallstedet eier
          // rekkefølgen, transporten bare videreformidler den.
          parts: [
            ...bilder.map(b => ({ inlineData: { mimeType: b.mimeType, data: b.base64 } })),
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        // Bildemodellen svarer med både tekst og bilde; begge modalitetene
        // må være etterspurt, ellers avvises requesten.
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { aspectRatio: '4:3', imageSize: '1K' },
      },
    }),
    signal,
  })

  if (!res.ok) {
    const kropp = await res.text().catch(() => '')
    throw lagVertexFeil(res.status, kropp)
  }

  const data = await res.json()

  // Sikkerhetsavvisning kommer som 200 med en blokkeringsgrunn, ikke som en
  // HTTP-feil — enten på prompten (promptFeedback.blockReason) eller på
  // kandidaten (finishReason). Klassifiseres som 'blokkert', som er den ene
  // terminale klassen: samme bilde + samme prompt gir samme avvisning.
  const blokkGrunn: string | undefined =
    data?.promptFeedback?.blockReason ?? undefined
  if (blokkGrunn) {
    throw new VertexFeil('blokkert', res.status, `blockReason: ${blokkGrunn}`)
  }

  const kandidat = data?.candidates?.[0]
  const deler: unknown[] = kandidat?.content?.parts ?? []
  const bildeDel = deler.find(
    (d): d is { inlineData: { data: string; mimeType?: string } } =>
      typeof (d as { inlineData?: { data?: unknown } })?.inlineData?.data === 'string' &&
      ((d as { inlineData: { data: string } }).inlineData.data.length > 0),
  )

  if (!bildeDel) {
    // Ingen bildedel i svaret: enten en finishReason-avvisning (SAFETY,
    // PROHIBITED_CONTENT, IMAGE_SAFETY …), eller at modellen kun svarte med
    // tekst. Begge er «vi fikk ikke noe bilde av denne mannen», ikke en
    // transport- eller formfeil.
    const grunn = kandidat?.finishReason ?? 'ingen bildedel i responsen'
    throw new VertexFeil('blokkert', res.status, `finishReason: ${grunn}`)
  }

  return {
    bytes: Buffer.from(bildeDel.inlineData.data, 'base64'),
    // Les mimeType FRA responsen — hardkod aldri 'image/png'. Feil antatt
    // type ville gitt feil Content-Type på objektet i R2.
    mimeType:
      typeof bildeDel.inlineData.mimeType === 'string' && bildeDel.inlineData.mimeType
        ? bildeDel.inlineData.mimeType
        : 'image/png',
    modell: GOOGLE_VERTEX_MODELL,
  }
}
