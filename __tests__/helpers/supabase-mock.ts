import { vi } from 'vitest'

// Lag en chainable Supabase-mock der alle metoder returnerer seg selv
export function lagChain(resolveData: unknown = []) {
  const chain: Record<string, unknown> = {}

  const metoder = ['select', 'insert', 'update', 'delete', 'eq', 'in', 'gte', 'lt', 'is', 'not', 'limit', 'order']
  for (const m of metoder) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }

  chain.maybeSingle = vi.fn().mockResolvedValue({ data: resolveData, error: null })
  chain.single = vi.fn().mockResolvedValue({ data: resolveData, error: null })

  // Gjør chain thenable (for await supabase.from(...).select(...))
  chain.then = (resolve: (v: unknown) => void) =>
    Promise.resolve({ data: Array.isArray(resolveData) ? resolveData : resolveData, error: null }).then(resolve)

  return chain
}

// Lag en from()-mock som returnerer ulike data per tabell
export function lagFromMock(tabeller: Record<string, unknown>) {
  return vi.fn((tabell: string) => lagChain(tabeller[tabell] ?? []))
}
