// @vitest-environment node
//
// Pinner status-gatingen i /api/cron/paaminne (#504 krav 9, testet etter
// #504-review MAJOR-3). Regelen har tre distinkte utfall, og et rødt
// GitHub Actions-kryss er hele varslingskjedens eneste synlige alarm:
//
//   påminner-feil (kjører KUN på slot 1, ingen ny sjanse i dag)  → 500
//   bursdagsfeil på slot 0–2 (får nye sjanser senere i dag)      → 200
//   bursdagsfeil på slot 3 (siste slot, terminal)                → 500
//
// Node-miljø (ikke jsdom): NextRequest trenger web-standardene Request/
// Headers/URL som jsdom ikke leverer.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockPaaminnelser, mockBursdag, mockBursdagsvarsel, mockLoggFeil } = vi.hoisted(() => ({
  mockPaaminnelser: vi.fn(),
  mockBursdag: vi.fn(),
  mockBursdagsvarsel: vi.fn(),
  mockLoggFeil: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({}),
}))
vi.mock('@/lib/logg', () => ({
  logg: { warn: vi.fn(), feil: (...a: unknown[]) => mockLoggFeil(...a) },
}))
vi.mock('@/lib/actions/paaminnelser', () => ({
  kjorPaaminnelser: (...a: unknown[]) => mockPaaminnelser(...a),
}))
vi.mock('@/lib/actions/bursdagsgratulasjon', () => ({
  kjorBursdagsgratulasjon: (...a: unknown[]) => mockBursdag(...a),
}))
// Uten denne mocken drar ruten inn ekte lib/actions/bursdagsvarsel →
// lib/varsler → createAdminClient (fra riktige lib/supabase/admin, ikke den
// mockede over — sendVarsel bruker sin egen server-klient), og testen feiler
// på manglende env/nettverk i stedet for å teste gatingen isolert.
vi.mock('@/lib/actions/bursdagsvarsel', () => ({
  kjorBursdagsvarsel: (...a: unknown[]) => mockBursdagsvarsel(...a),
}))

import { NextRequest } from 'next/server'
import { POST, GET } from '@/app/api/cron/paaminne/route'
import { BURSDAG_VINDU_SLOTS } from '@/lib/konstanter'

const HEMMELIGHET = 'test-cron-secret'

function lagReq(slotIndex?: number, auth: string = `Bearer ${HEMMELIGHET}`) {
  const url =
    slotIndex === undefined
      ? 'http://localhost:3000/api/cron/paaminne'
      : `http://localhost:3000/api/cron/paaminne?slotIndex=${slotIndex}`
  return new NextRequest(url, { method: 'POST', headers: { authorization: auth } })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = HEMMELIGHET
  mockPaaminnelser.mockResolvedValue({ behandlet: [], feil: 0, lukketKaaringer: 0, sendteVarsler: 0 })
  mockBursdag.mockResolvedValue({ postet: 0, hoppet: 0, feil: 0 })
  mockBursdagsvarsel.mockResolvedValue({ varslet: 0, hoppet: 0, blokkert: 0, feil: 0 })
  mockLoggFeil.mockResolvedValue(undefined)
})

describe('cron /api/cron/paaminne – status-gating (#504)', () => {
  it('alt grønt gir 200', async () => {
    const res = await POST(lagReq(1))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.slot).toBe(1)
  })

  it('påminner-feil på slot 1 gir 500 (ingen ny sjanse i dag)', async () => {
    mockPaaminnelser.mockResolvedValue({ behandlet: [], feil: 2, lukketKaaringer: 0, sendteVarsler: 0 })

    const res = await POST(lagReq(1))
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.ok).toBe(false)
    expect(body.paaminnerFeil).toBe(2)
  })

  it.each([0, 1, 2])('bursdagsfeil på slot %i gir 200 (nye sjanser senere i dag)', async slot => {
    mockBursdag.mockResolvedValue({ postet: 0, hoppet: 0, feil: 3 })

    const res = await POST(lagReq(slot))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.bursdagFeil).toBe(3)
  })

  it('bursdagsfeil på siste slot gir 500 (terminal)', async () => {
    mockBursdag.mockResolvedValue({ postet: 0, hoppet: 0, feil: 1 })

    const res = await POST(lagReq(BURSDAG_VINDU_SLOTS - 1))
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.ok).toBe(false)
    expect(body.bursdagFeil).toBe(1)
  })

  it.each([0, 1, 2])('bursdagsvarsel-feil på slot %i gir 200 (nye sjanser senere i dag)', async slot => {
    mockBursdagsvarsel.mockResolvedValue({ varslet: 0, hoppet: 0, blokkert: 0, feil: 2 })

    const res = await POST(lagReq(slot))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.bursdagsvarselFeil).toBe(2)
  })

  it('bursdagsvarsel-feil på siste slot gir 500 (terminal)', async () => {
    mockBursdagsvarsel.mockResolvedValue({ varslet: 0, hoppet: 0, blokkert: 0, feil: 1 })

    const res = await POST(lagReq(BURSDAG_VINDU_SLOTS - 1))
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.ok).toBe(false)
    expect(body.bursdagsvarselFeil).toBe(1)
  })

  it('påminnelser kjøres kun på slot 1, bursdag på alle slots i vinduet', async () => {
    await POST(lagReq(0))
    expect(mockPaaminnelser).not.toHaveBeenCalled()
    expect(mockBursdag).toHaveBeenCalledWith({}, { slotIndex: 0, totalSlots: BURSDAG_VINDU_SLOTS })

    vi.clearAllMocks()
    mockPaaminnelser.mockResolvedValue({ behandlet: [], feil: 0, lukketKaaringer: 0, sendteVarsler: 0 })
    mockBursdag.mockResolvedValue({ postet: 0, hoppet: 0, feil: 0 })

    await POST(lagReq(1))
    expect(mockPaaminnelser).toHaveBeenCalledTimes(1)
    expect(mockBursdag).toHaveBeenCalledTimes(1)
  })

  it('avviser feil CRON_SECRET med 401 uten å kjøre noe', async () => {
    const res = await POST(lagReq(1, 'Bearer feil'))

    expect(res.status).toBe(401)
    expect(mockPaaminnelser).not.toHaveBeenCalled()
    expect(mockBursdag).not.toHaveBeenCalled()
  })

  it('avviser slotIndex utenfor 0..3 med 400', async () => {
    const res = await POST(lagReq(BURSDAG_VINDU_SLOTS))

    expect(res.status).toBe(400)
    expect(mockBursdag).not.toHaveBeenCalled()
  })

  it('GET treffer samme handler som POST', async () => {
    mockPaaminnelser.mockResolvedValue({ behandlet: [], feil: 1, lukketKaaringer: 0, sendteVarsler: 0 })

    const res = await GET(lagReq(1))

    expect(res.status).toBe(500)
  })
})

// Uavhengigheten mellom jobbene skal være strukturell, ikke bare påstått i en
// kommentar (#638-review MAJOR). Før try/catch-en rundt hvert kall ville et
// kast i en tidligere jobb boblet ut av handleren, og bursdagsvarselet ville
// aldri kjørt — på noen slot, siden gratulasjonen deler hele vinduet.
describe('cron /api/cron/paaminne – en kastende jobb stopper ikke de andre', () => {
  it('gratulasjonen kaster: bursdagsvarselet kjøres likevel, feilen telles og logges', async () => {
    mockBursdag.mockRejectedValue(new Error('gratulasjon nede'))

    const res = await POST(lagReq(0))
    const body = await res.json()

    expect(mockBursdagsvarsel).toHaveBeenCalledTimes(1)
    expect(body.bursdagFeil).toBe(1)
    expect(body.bursdagsvarselFeil).toBe(0)
    // Slot 0 er ikke terminal — bursdagsjobbene får nye sjanser i dag.
    expect(res.status).toBe(200)
    expect(mockLoggFeil).toHaveBeenCalledWith(
      'cron.bursdagsgratulasjon.jobb.feilet',
      expect.any(Error),
      expect.objectContaining({ ctx: { slot: 0 } }),
    )
  })

  it('gratulasjonen kaster på siste slot: 500, men bursdagsvarselet har kjørt', async () => {
    mockBursdag.mockRejectedValue(new Error('gratulasjon nede'))

    const res = await POST(lagReq(BURSDAG_VINDU_SLOTS - 1))

    expect(mockBursdagsvarsel).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(500)
  })

  it('påminnelsene kaster: begge bursdagsjobbene kjøres likevel, status 500', async () => {
    mockPaaminnelser.mockRejectedValue(new Error('påminnelser nede'))

    const res = await POST(lagReq(1))
    const body = await res.json()

    expect(mockBursdag).toHaveBeenCalledTimes(1)
    expect(mockBursdagsvarsel).toHaveBeenCalledTimes(1)
    expect(body.paaminnerFeil).toBe(1)
    // Påminnelser har ingen ny sjanse i dag — kast der er alltid rødt.
    expect(res.status).toBe(500)
  })

  it('bursdagsvarselet kaster: fanget, telles som feil, ruten svarer fortsatt', async () => {
    mockBursdagsvarsel.mockRejectedValue(new Error('bursdagsvarsel nede'))

    const res = await POST(lagReq(0))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.bursdagsvarselFeil).toBe(1)
    expect(mockLoggFeil).toHaveBeenCalledWith(
      'cron.bursdagsvarsel.jobb.feilet',
      expect.any(Error),
      expect.objectContaining({ ctx: { slot: 0 } }),
    )
  })
})
