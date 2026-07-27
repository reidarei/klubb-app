import { vi } from 'vitest'

// Lag en chainable Supabase-mock der alle metoder returnerer seg selv.
// `feil` er bakoverkompatibel — utelates den (default null) er oppførselen
// uendret for alle eksisterende kallsteder. Oppgitt `feil` gjør at data blir
// null og error settes, slik #503-testene kan simulere en feilet spørring. (#503)
export function lagChain(resolveData: unknown = [], feil: unknown = null) {
  const chain: Record<string, unknown> = {}

  // upsert er med her fordi paameldinger og auto-RSVP bruker det
  const metoder = ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'in', 'gte', 'lt', 'is', 'not', 'limit', 'order']
  for (const m of metoder) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }

  const data = feil ? null : resolveData
  chain.maybeSingle = vi.fn().mockResolvedValue({ data, error: feil })
  chain.single = vi.fn().mockResolvedValue({ data, error: feil })

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
