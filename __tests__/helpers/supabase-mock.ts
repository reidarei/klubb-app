import { vi } from 'vitest'

// PostgREST-feilen `.single()` gir når spørringen traff 0 rader. Eksportert
// slik at tester kan sammenligne mot den. Formen er kopiert fra
// @supabase/postgrest-js (Accept: application/vnd.pgrst.object+json).
export const PGRST116 = {
  code: 'PGRST116',
  details: 'The result contains 0 rows',
  hint: null,
  message: 'JSON object requested, multiple (or no) rows returned',
}

// Lag en chainable Supabase-mock der alle metoder returnerer seg selv.
// `feil` er bakoverkompatibel — utelates den (default null) er oppførselen
// uendret for alle eksisterende kallsteder. Oppgitt `feil` gjør at data blir
// null og error settes, slik #503-testene kan simulere en feilet spørring. (#503)
export function lagChain(resolveData: unknown = [], feil: unknown = null) {
  const chain: Record<string, unknown> = {}

  // upsert er med her fordi paameldinger og auto-RSVP bruker det.
  // abortSignal er med for logg.feil()s feil_logg-insert (#496), som legger
  // en hard timeout på skrivingen via AbortSignal.timeout(...).
  const metoder = ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'in', 'gte', 'lt', 'is', 'not', 'limit', 'order', 'neq', 'abortSignal']
  for (const m of metoder) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }

  const data = feil ? null : resolveData
  chain.maybeSingle = vi.fn().mockResolvedValue({ data, error: feil })

  // VIKTIG — dette er hele poenget med #503-review-runden: `.single()` er IKKE
  // det samme som `.maybeSingle()`. PostgREST rapporterer 0 rader fra
  // `.single()` som error PGRST116, ikke som data=null. En mock som lot dem
  // oppføre seg likt gjorde alle `if (!x) throw 'Ikke funnet'`-grener grønne i
  // test selv når de var død kode i prod. Mocken må være tro mot dette,
  // ellers fanger ingen test at noen skriver `.single()` foran en ikke-funnet-
  // gren i pulje B og C.
  const ingenRader = data === null || data === undefined || (Array.isArray(data) && data.length === 0)
  chain.single = vi.fn().mockResolvedValue(
    feil ? { data: null, error: feil } : ingenRader ? { data: null, error: PGRST116 } : { data, error: null },
  )

  // Gjør chain thenable (for await supabase.from(...).select(...))
  chain.then = (resolve: (v: unknown) => void) =>
    Promise.resolve({ data, error: feil }).then(resolve)

  return chain
}

// Lag en from()-mock som returnerer ulike data per tabell. `feilPerTabell` er
// et valgfritt andre argument — en tabell→feil-map — som lar enkelttabeller
// simulere feilende spørringer uten å måtte skrive en håndrullet
// mockImplementation. (#503)
export function lagFromMock(tabeller: Record<string, unknown>, feilPerTabell?: Record<string, unknown>) {
  return vi.fn((tabell: string) => lagChain(tabeller[tabell] ?? [], feilPerTabell?.[tabell] ?? null))
}
