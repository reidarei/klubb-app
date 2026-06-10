import { describe, it, expect, vi } from 'vitest'

// Mock next/headers for createServerClient
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: () => [],
    set: vi.fn(),
  }),
}))

describe('responstid – dato-operasjoner', () => {
  it('formaterDato kjører under 1ms', async () => {
    const { formaterDato, FORMAT_DATO_KLOKKE } = await import('@/lib/dato')
    const iso = '2026-06-15T14:00:00Z'

    // Varm opp
    formaterDato(iso, FORMAT_DATO_KLOKKE)

    const start = performance.now()
    for (let i = 0; i < 1000; i++) {
      formaterDato(iso, FORMAT_DATO_KLOKKE)
    }
    const elapsed = performance.now() - start
    const perKall = elapsed / 1000

    expect(perKall).toBeLessThan(1) // Under 1ms per kall
  })

  it('norskDatoNaa kjører under 1ms', async () => {
    const { norskDatoNaa } = await import('@/lib/dato')

    norskDatoNaa() // Varm opp

    const start = performance.now()
    for (let i = 0; i < 1000; i++) {
      norskDatoNaa()
    }
    const elapsed = performance.now() - start
    const perKall = elapsed / 1000

    expect(perKall).toBeLessThan(1)
  })

  it('datetimeLocalTilIso roundtrip kjører under 2ms', async () => {
    const { datetimeLocalTilIso, isoTilDatetimeLocal } = await import('@/lib/dato')

    const iso = '2026-06-15T14:00:00Z'
    isoTilDatetimeLocal(iso) // Varm opp

    const start = performance.now()
    for (let i = 0; i < 500; i++) {
      const local = isoTilDatetimeLocal(iso)
      datetimeLocalTilIso(local)
    }
    const elapsed = performance.now() - start
    const perRoundtrip = elapsed / 500

    expect(perRoundtrip).toBeLessThan(2)
  })
})

describe('responstid – bursdagsberegning', () => {
  function beregnBursdager(
    profiler: { id: string; visningsnavn: string | null; fodselsdato: string | null }[],
    frem: number
  ) {
    const naa = new Date(2026, 5, 10)
    const toMndSiden = new Date(naa.getFullYear(), naa.getMonth() - 2, naa.getDate())
    const fremTid = new Date(naa.getFullYear(), naa.getMonth() + frem, naa.getDate())

    return profiler.flatMap(p => {
      if (!p.fodselsdato) return []
      const [fodselsaar, mnd, dag] = p.fodselsdato.split('-').map(Number)
      const items: unknown[] = []
      const aarRange = Math.ceil(frem / 12) + 2
      for (let i = -1; i <= aarRange; i++) {
        const yr = naa.getFullYear() + i
        const bdag = new Date(yr, mnd - 1, dag)
        if (bdag >= toMndSiden && bdag <= fremTid) {
          items.push({
            id: `bursdag-${p.id}-${yr}`,
            profilId: p.id,
            visningsnavn: p.visningsnavn ?? '',
            dato: `${yr}-${String(mnd).padStart(2, '0')}-${String(dag).padStart(2, '0')}`,
            alder: yr - fodselsaar,
          })
        }
      }
      return items
    })
  }

  it('beregner bursdager for 17 brukere x 48 måneder under 5ms', () => {
    const profiler = Array.from({ length: 17 }, (_, i) => ({
      id: `p${i}`,
      visningsnavn: `Bruker ${i}`,
      fodselsdato: `199${i % 10}-${String((i % 12) + 1).padStart(2, '0')}-15`,
    }))

    // Varm opp
    beregnBursdager(profiler, 48)

    const start = performance.now()
    for (let i = 0; i < 100; i++) {
      beregnBursdager(profiler, 48)
    }
    const elapsed = performance.now() - start
    const perKall = elapsed / 100

    expect(perKall).toBeLessThan(5)
  })
})

describe('responstid – FNV-1a hashing', () => {
  function fnv1a(str: string): number {
    let hash = 2166136261
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i)
      hash = (hash * 16777619) >>> 0
    }
    return hash
  }

  it('hasher 1000 navn på under 5µs i snitt', () => {
    // Måler over mange runder for å midle ut performance.now()-jitter på
    // Windows (typisk 1ms-oppløsning) og JIT-oppvarming. Tight budget per
    // kall fanger fortsatt opp en reell regresjon.
    const navn = Array.from({ length: 1000 }, (_, i) => `Bruker Nummer ${i}`)
    const RUNDER = 50

    for (const n of navn) fnv1a(n) // Varm opp

    const start = performance.now()
    for (let r = 0; r < RUNDER; r++) {
      for (const n of navn) fnv1a(n)
    }
    const elapsed = performance.now() - start
    const perKall = elapsed / (RUNDER * navn.length) * 1000 // µs

    expect(perKall).toBeLessThan(5)
  })
})

describe('responstid – cron-jobb overhead', () => {
  it('kjorPaaminnelser med tomme resultater fullfører under 50ms', async () => {
    // Mock alt som trengs
    vi.doMock('@/lib/dato', () => ({
      norskDatoNaa: () => new Date(2026, 5, 10),
      naa: () => '2026-06-10T00:00:00.000Z',
    }))
    vi.doMock('@/lib/varsler', () => ({
      sendPaaminneVarsler: vi.fn().mockResolvedValue(undefined),
      sendPurringVarsler: vi.fn().mockResolvedValue(undefined),
      sendArrangorPurringVarsler: vi.fn().mockResolvedValue(undefined),
    }))

    // Fleksibel chainable mock: alle filter-metoder returnerer chain-en
    // selv, og hele kjeden er thenable. Dekker alle tabell-kall i
    // kjorPaaminnelser inkludert behandleKaaringspoller (poll, profiles).
    function lagChain(): Record<string, unknown> {
      const chain: Record<string, unknown> = {}
      const metoder = ['select', 'eq', 'in', 'gte', 'lt', 'is', 'not', 'limit', 'order']
      for (const m of metoder) {
        chain[m] = vi.fn().mockReturnValue(chain)
      }
      chain.then = (r: (v: unknown) => void) =>
        Promise.resolve({ data: [], error: null }).then(r)
      return chain
    }
    const mockAdmin = {
      from: vi.fn(() => lagChain()),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    }

    const { kjorPaaminnelser } = await import('@/lib/actions/paaminnelser')

    const start = performance.now()
    await kjorPaaminnelser(mockAdmin as unknown as Parameters<typeof kjorPaaminnelser>[0])
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(50)
  })
})
