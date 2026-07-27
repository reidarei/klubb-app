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

const { mockPaaminnelser, mockBursdag } = vi.hoisted(() => ({
  mockPaaminnelser: vi.fn(),
  mockBursdag: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({}),
}))
vi.mock('@/lib/actions/paaminnelser', () => ({
  kjorPaaminnelser: (...a: unknown[]) => mockPaaminnelser(...a),
}))
vi.mock('@/lib/actions/bursdagsgratulasjon', () => ({
  kjorBursdagsgratulasjon: (...a: unknown[]) => mockBursdag(...a),
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
