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

// === Posisjons- og «finnes det mer»-logikk for én kilde (se #488) ===
//
// To spørsmål er lett å blande sammen, men er ikke det samme:
//   1. Hvor skal neste side starte for denne typen? (posisjon i keyset)
//   2. Finnes det i det hele tatt en neste side? (om «Last mer» rendres)
// #488 var et symptom av at disse var slått sammen — «Last mer» ble vist
// på siste side fordi posisjons-logikken (feilaktig) også avgjorde
// synlighet.
export type Posisjon = [string, string]

export type KildeTilstand = {
  inn: Posisjon | null // input-cursor for typen (null = les fra toppen)
  // Rader i sidevinduet — dvs. ETTER klipp til sidestørrelse, ikke rå-svarets
  // lengde (som er sidestørrelse+1). Feltet het `antallLest` før; navnet
  // inviterte til å sende inn rå-svaret, og gjør man det blir
  // `antallEmittert < antallISidevindu` permanent true og hele #488-fiksen
  // forsvinner stille.
  antallISidevindu: number
  antallEmittert: number // rader av typen som faktisk kom med i den viste siden
  sisteEmittert: Posisjon | null
  flereEnnSiden: boolean // spørringen returnerte mer enn sidestørrelsen
  // Tri-state mot #492: en avskrudd kilde (filteret ekskluderer typen) har
  // ALLTID feilet: false — den ble aldri spurt. «Noen kilde feilet» betyr
  // derfor reelt «noen *aktiv* kilde feilet», ikke «alle tre feilet».
  feilet: boolean
}

// Posisjonen for neste side er ubetinget «siste emitterte, ellers inn-posisjonen
// uendret». Vi nullstiller ALDRI en posisjon for å markere «uttømt» — null
// betyr «start fra toppen» i keyset-filteret (se page.tsx), så det ville gitt
// restart og duplikater for en kilde som fortsatt har mer å hente.
export function nestePosisjon(k: KildeTilstand): Posisjon | null {
  return k.sisteEmittert ?? k.inn
}

// «Har denne kilden mer» = finnes det rader igjen etter den sist emitterte.
// Eksakt når spørringen lykkes: `flereEnnSiden=false` betyr at de leste radene
// *er* hele restmengden, så false her er et sant «uttømt» — ikke et gjett.
// Konservativ som feilmodus: ved tvil viser vi lenka, fordi skjult historikk er
// verre enn en tom side. Blir «Last mer» stående på en åpenbart siste side, er
// det en regresjon å grave i — ikke forventet oppførsel.
//   - `flereEnnSiden`: spørringen leste mer enn sidestørrelsen (den kjente
//     «hent N+1»-sjekken).
//   - `antallEmittert < antallISidevindu`: alle N leste radene var av denne
//     typen, men noen ble kastet i merge-klippingen på tvers av typer
//     (side.slice) og er dermed ikke vist ennå.
// `feilet` leses bevisst IKKE her — porten mot en feilet kilde ligger i
// byggNesteCursor (under), ikke i denne funksjonen. Se #492.
export function harMerFraKilde(k: KildeTilstand): boolean {
  return k.flereEnnSiden || k.antallEmittert < k.antallISidevindu
}

export function byggNesteCursor(kilder: { a: KildeTilstand; m: KildeTilstand; p: KildeTilstand }): string | null {
  const { a, m, p } = kilder
  // Invariant (#492): en cursor emitteres kun fra en side der alle aktive
  // kilder lyktes. Uten denne gaten peker cursoren forbi rader vi aldri
  // leste — «Last mer» ville da hoppet over historikk i stedet for å
  // signalisere at noe manglet.
  if (a.feilet || m.feilet || p.feilet) return null
  if (!harMerFraKilde(a) && !harMerFraKilde(m) && !harMerFraKilde(p)) return null
  return enkodeCursor({ a: nestePosisjon(a), m: nestePosisjon(m), p: nestePosisjon(p) })
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
