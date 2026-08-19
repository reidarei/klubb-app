// JWKS-cache for lokal JWT-verifisering i middleware.
//
// Hvorfor en egen cache: @supabase/auth-js cacher nøkkelsettet selv, men på
// KLIENT-instansen — og middleware må opprette en ny klient per request (den
// er bundet til requestens cookies). Instans-cachen er derfor alltid tom, og
// getClaims() ville hentet /.well-known/jwks.json på nytt ved hver eneste
// navigasjon. Det er nøyaktig nettverkskallet vi valgte getClaims() for å
// slippe (jf. ytelseskravet i CLAUDE.md), så nøklene må caches et sted som
// overlever mellom requests: modulnivå, som lever så lenge Edge-isolatet gjør.
//
// Date.now() brukes bevisst her — dette er elapsed time, ikke «hvilken dag er
// det» (jf. CLAUDE.md § Policy: Tidshåndtering).

type Jwk = { kid?: string; alg?: string; [k: string]: unknown }

let cache: { keys: Jwk[] } | null = null
let hentetPaa = 0

// 10 minutter. Nøkkelrotasjon i Supabase er sjelden og annonsert; en TTL i
// dette området gir rask nok innhenting uten å gjøre cachen meningsløs.
const TTL_MS = 10 * 60 * 1000

/**
 * Hent prosjektets JWKS, fra cache når den er fersk nok.
 *
 * Returnerer `null` hvis nøklene aldri har latt seg hente. Kallstedet skal da
 * falle tilbake på verifisering som koster et nettverkskall — aldri på å slippe
 * brukeren gjennom uverifisert. Ved en transient feil beholdes den forrige
 * cachen bevisst: en midlertidig utilgjengelig JWKS skal ikke logge ut klubben.
 */
export async function hentJwks(): Promise<{ keys: Jwk[] } | null> {
  const naa = Date.now()
  if (cache && naa - hentetPaa < TTL_MS) return cache

  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/.well-known/jwks.json`,
      { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! } },
    )
    if (!res.ok) return cache
    const data = (await res.json()) as { keys?: Jwk[] }
    if (!data.keys?.length) return cache

    cache = { keys: data.keys }
    hentetPaa = naa
    return cache
  } catch {
    // Nettverksfeil mot auth-tjenesten. Behold det vi har; kallstedet
    // håndterer null-tilfellet fail-closed.
    return cache
  }
}

/** Kun for test — nullstiller modulnivå-cachen mellom testtilfeller. */
export function _nullstillJwksCache() {
  cache = null
  hentetPaa = 0
}
