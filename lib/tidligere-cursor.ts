// Cursor for /tidligere. Arrangementer, meldinger og polls pagineres hver for
// seg med keyset, så cursoren har én posisjon per type; null = fra toppen.
// base64url slipper URL-escape av +/.

export type TidligereCursor = {
  a: [string, string] | null  // arrangementer: [start_tidspunkt, id]
  m: [string, string] | null  // meldinger:    [sorterings_tidspunkt, id] (mig. 120, #491)
  p: [string, string] | null  // polls:        [svarfrist, id]
}

// Cursorer laget før #491 bærer sist_aktivitet for meldinger. For ikke-arkiverte
// er den lik sorterings_tidspunkt, så de virker. Arkiverte kan tapes eller
// dupliseres i en gammel pagineringskjede; en fersk lasting retter det. Bevisst
// ingen cursor-versjonering for dette (#491).

export function enkodeCursor(c: TidligereCursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url')
}

// === Posisjon og «finnes det mer» for én kilde (#488) ===
//
// To ulike spørsmål som ikke må blandes: hvor neste side starter, og om
// «Last mer» skal vises i det hele tatt. #488 var at de var slått sammen.
export type Posisjon = [string, string]

export type KildeTilstand = {
  inn: Posisjon | null // input-cursor for typen (null = les fra toppen)
  // Rader ETTER klipp til sidestørrelse, ikke rå-svarets lengde (N+1) — ellers
  // er `antallEmittert < antallISidevindu` alltid sann (#488). Bygg via
  // kildeTilstandFra(), som bare tar en KlippetSide (#851).
  antallISidevindu: number
  antallEmittert: number // rader av typen som faktisk kom med i den viste siden
  sisteEmittert: Posisjon | null
  flereEnnSiden: boolean // spørringen returnerte mer enn sidestørrelsen
  // En avskrudd kilde (filteret ekskluderer typen) har alltid feilet: false —
  // den ble aldri spurt (#492).
  feilet: boolean
}

// Ett svar klippet til sidestørrelse. Merket type, så KildeTilstand bare kan
// bygges fra en klippet side og aldri fra rå-svaret med N+1 rader (#488, #851).
declare const klippetMerke: unique symbol
export type KlippetSide<T> = {
  readonly rader: T[]
  readonly flereEnnSiden: boolean
  readonly [klippetMerke]: true
}

export function klippSide<T>(raad: T[] | null, stoerrelse: number): KlippetSide<T> {
  const alle = raad ?? []
  return {
    rader: alle.slice(0, stoerrelse),
    flereEnnSiden: alle.length > stoerrelse,
  } as KlippetSide<T>
}

export function kildeTilstandFra({
  inn,
  side,
  emittert,
  feilet,
}: {
  inn: Posisjon | null
  side: KlippetSide<unknown>
  emittert: { sortIso: string; data: { id: string } }[]
  feilet: boolean
}): KildeTilstand {
  const siste = emittert.at(-1)
  return {
    inn,
    antallISidevindu: side.rader.length,
    antallEmittert: emittert.length,
    sisteEmittert: siste ? [siste.sortIso, siste.data.id] : null,
    flereEnnSiden: side.flereEnnSiden,
    feilet,
  }
}

// Aldri nullstill en posisjon for å markere «uttømt»: null betyr «fra toppen»
// i keyset-filteret og ville gitt duplikater.
export function nestePosisjon(k: KildeTilstand): Posisjon | null {
  return k.sisteEmittert ?? k.inn
}

// Eksakt når spørringen lykkes; ved tvil vises lenka, fordi skjult historikk er
// verre enn en tom side.
//   - `flereEnnSiden`: «hent N+1»-sjekken.
//   - `antallEmittert < antallISidevindu`: leste rader ble kastet i
//     merge-klippingen på tvers av typer og er ikke vist ennå.
// `feilet` leses bevisst ikke her — porten ligger i byggNesteCursor (#492).
export function harMerFraKilde(k: KildeTilstand): boolean {
  return k.flereEnnSiden || k.antallEmittert < k.antallISidevindu
}

export function byggNesteCursor(kilder: { a: KildeTilstand; m: KildeTilstand; p: KildeTilstand }): string | null {
  const { a, m, p } = kilder
  // Invariant: cursor kun når alle aktive kilder lyktes — ellers hopper
  // «Last mer» over rader vi aldri leste (#492).
  if (a.feilet || m.feilet || p.feilet) return null
  if (!harMerFraKilde(a) && !harMerFraKilde(m) && !harMerFraKilde(p)) return null
  return enkodeCursor({ a: nestePosisjon(a), m: nestePosisjon(m), p: nestePosisjon(p) })
}

// Streng validering: verdiene settes rett inn i PostgREST `.or()`-uttrykk, så
// alt utenom ren ISO/UUID-form ville åpnet for filter-injection.
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
const UUID_RE = /^[0-9a-f-]{36}$/i

export function dekodeCursor(s: string | undefined): TidligereCursor {
  if (!s) return { a: null, m: null, p: null }
  try {
    const obj = JSON.parse(Buffer.from(s, 'base64url').toString('utf8'))
    // Ugyldig par → null for den typen (fra toppen); ingen delvis godtatte par.
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
    return { a: null, m: null, p: null }
  }
}
