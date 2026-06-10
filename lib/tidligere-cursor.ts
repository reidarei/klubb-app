// Cursor-koding for paginering på /tidligere-siden.
// Siden blander tre element-typer (arrangementer, meldinger, polls) som
// hver pagineres uavhengig med keyset — en cursor inneholder én posisjon
// per type. null betyr «ingen cursor satt ennå» (hent fra toppen).
//
// Vi bruker base64url (ikke base64) for å slippe URL-escape av +/ i query
// strings. Buffer.from(..., 'base64url') er Node.js ≥ 14 og kjører trygt
// i Next.js server-kontekst.

export type TidligereCursor = {
  a: [string, string] | null  // arrangementer: [start_tidspunkt, id]
  m: [string, string] | null  // meldinger:    [sist_aktivitet, id]
  p: [string, string] | null  // polls:        [svarfrist, id]
}

export function enkodeCursor(c: TidligereCursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url')
}

// Streng validering av cursor-feltene. Begge verdiene plasseres rett inn i
// PostgREST `.or()`-uttrykk («start_tidspunkt.lt.<iso>,…»), så vi MÅ avvise
// alt som inneholder komma, parentes, punktum-tegn utenfor fast posisjon,
// osv. — ellers åpner vi en filter-injection-flate hvor en bruker kan
// base64-enkode cursorverdier som injiserer ekstra PostgREST-uttrykk.
// Se review-funn på branch eksp/issue-176.
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
const UUID_RE = /^[0-9a-f-]{36}$/i

export function dekodeCursor(s: string | undefined): TidligereCursor {
  if (!s) return { a: null, m: null, p: null }
  try {
    const obj = JSON.parse(Buffer.from(s, 'base64url').toString('utf8'))
    // Et gyldig par består av (ISO-timestamp, UUID). Alt annet → null
    // (behandles som «start fra toppen for denne typen»). Vi tillater ikke
    // delvis ugyldig cursor: hele paret faller hvis ett felt er feil.
    const erGyldigPar = (v: unknown): v is [string, string] =>
      Array.isArray(v) &&
      v.length === 2 &&
      typeof v[0] === 'string' &&
      typeof v[1] === 'string' &&
      ISO_TIMESTAMP_RE.test(v[0]) &&
      UUID_RE.test(v[1])
    return {
      a: erGyldigPar(obj.a) ? obj.a : null,
      m: erGyldigPar(obj.m) ? obj.m : null,
      p: erGyldigPar(obj.p) ? obj.p : null,
    }
  } catch {
    // Ugyldig cursor — behandle som tom (start fra toppen)
    return { a: null, m: null, p: null }
  }
}
