// Cloudflare R2 bildelagring. S3-kompatibelt API via aws4fetch (lett bundle,
// ~5 KB, signing kun — ingen S3-SDK-bagasje).
//
// Brukes kun server-side (server actions, route handlers). Klient-side må
// gå via /lib/actions/bilde-opplasting.ts som proxy-er filen hit etter at
// klienten har komprimert.
//
// Public URL eksponeres til klienten via lib/config.ts (R2_PUBLIC_URL).
// Secrets (access key, secret) holdes server-side — leses kun her.

import { AwsClient } from 'aws4fetch'

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const BUCKET = process.env.R2_BUCKET ?? 'herreklubben-bilder'
const PUBLIC_URL = process.env.R2_PUBLIC_URL?.replace(/\/$/, '') ?? ''

// R2 har separate endpoints per jurisdiksjon. Hvis bucket og API-token er
// skapt i EU-jurisdiksjon, må endpointet ha 'eu'-segment. Settes via env
// (R2_JURISDICTION = 'default' | 'eu' | 'fedramp'). Default = 'default'.
const JURISDICTION = (process.env.R2_JURISDICTION ?? 'default').toLowerCase()
const JURISDICTION_SEGMENT = JURISDICTION === 'default' ? '' : `.${JURISDICTION}`

let klient: AwsClient | null = null

function hentKlient(): AwsClient {
  if (!ACCESS_KEY_ID || !SECRET_ACCESS_KEY || !ACCOUNT_ID) {
    throw new Error(
      'R2 ikke konfigurert — sett R2_ACCOUNT_ID, R2_ACCESS_KEY_ID og R2_SECRET_ACCESS_KEY i miljøet',
    )
  }
  if (klient) return klient
  klient = new AwsClient({
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
    // R2 godtar kun: auto, wnam, enam, weur, eeur, apac, oc.
    // 'auto' fungerer for alle jurisdiksjoner — endpointet (med eu-segment
    // for EU-bucket) ruter til riktig region.
    region: 'auto',
    service: 's3',
  })
  return klient
}

function bucketUrl(sti: string): string {
  return `https://${ACCOUNT_ID}${JURISDICTION_SEGMENT}.r2.cloudflarestorage.com/${BUCKET}/${sti}`
}

// Last opp en fil til R2. `sti` er nøkkelen i bucket-en (f.eks.
// "arrangementer/abc123.jpg"). Returnerer public URL hvor filen kan hentes.
//
// Cache-Control settes til 1 år immutable — vi gjenbruker aldri samme path
// (alle filnavn inneholder unik prefix), så browsere kan cache evig.
export async function lastOppR2(
  sti: string,
  data: Uint8Array | ArrayBuffer | Blob,
  contentType: string,
): Promise<string> {
  const aws = hentKlient()
  // R2 krever eksplisitt Content-Length-header. Vercel-runtime bruker ofte
  // chunked transfer-encoding som skipper headeren — vi setter den manuelt
  // basert på data-størrelsen.
  const lengde =
    data instanceof Blob ? data.size :
    data instanceof Uint8Array ? data.byteLength :
    data.byteLength
  const res = await aws.fetch(bucketUrl(sti), {
    method: 'PUT',
    body: data as BodyInit,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(lengde),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
  if (!res.ok) {
    const tekst = await res.text().catch(() => '')
    throw new Error(`R2 upload feilet (${res.status}): ${tekst}`)
  }
  return `${PUBLIC_URL}/${sti}`
}

// Slett en fil fra R2. Idempotent — 404 fra R2 telles som suksess.
export async function slettR2(sti: string): Promise<void> {
  const aws = hentKlient()
  const res = await aws.fetch(bucketUrl(sti), { method: 'DELETE' })
  if (!res.ok && res.status !== 404) {
    const tekst = await res.text().catch(() => '')
    throw new Error(`R2 slett feilet (${res.status}): ${tekst}`)
  }
}

// Konverterer en R2 public URL tilbake til intern path. Brukes når en
// bilde-URL i DB skal slettes — vi kjenner ikke prefiks i forveien hvis
// det skulle endres. Returnerer null hvis URL-en ikke peker til vår R2.
export function r2StiFraUrl(url: string | null): string | null {
  if (!url || !PUBLIC_URL) return null
  if (!url.startsWith(`${PUBLIC_URL}/`)) return null
  return url.slice(PUBLIC_URL.length + 1)
}
