// @vitest-environment node
//
// #760: en feilet upsert/delete i push_subscriptions skal ikke se ut som
// suksess — mønster fra varsel-preferanser-route.test.ts (#614).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lagChain } from './helpers/supabase-mock'

const mockGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}))

const mockLoggFeil = vi.fn()
vi.mock('@/lib/logg', () => ({ logg: { feil: mockLoggFeil, warn: vi.fn() } }))

const { POST, DELETE } = await import('@/app/api/push/subscribe/route')

function lagRequest(method: string, body: unknown) {
  return new Request('http://localhost/api/push/subscribe', {
    method,
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0]
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user1' } } })
  mockFrom.mockReturnValue(lagChain(null))
})

describe('POST /api/push/subscribe', () => {
  const gyldigBody = { endpoint: 'https://push.example/x', keys: { p256dh: 'a', auth: 'b' } }

  it('returnerer 200 når upserten lykkes', async () => {
    const res = await POST(lagRequest('POST', gyldigBody))
    expect(res.status).toBe(200)
    expect(mockLoggFeil).not.toHaveBeenCalled()
  })

  it('logger push.abonnement.lagring.feilet og returnerer 500 når upserten feiler', async () => {
    mockFrom.mockReturnValue(lagChain(null, { message: 'DB nede', code: 'DBX' }))

    const res = await POST(lagRequest('POST', gyldigBody))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.ok).not.toBe(true)
    expect(mockLoggFeil).toHaveBeenCalledWith(
      'push.abonnement.lagring.feilet',
      expect.objectContaining({ message: 'DB nede' }),
      expect.objectContaining({ ctx: expect.objectContaining({ profil_id: 'user1', code: 'DBX' }) }),
    )
  })
})

describe('DELETE /api/push/subscribe', () => {
  it('returnerer 200 når slettingen lykkes', async () => {
    const res = await DELETE(lagRequest('DELETE', { endpoint: 'https://push.example/x' }))
    expect(res.status).toBe(200)
    expect(mockLoggFeil).not.toHaveBeenCalled()
  })

  it('logger push.abonnement.sletting.feilet og returnerer 500 når slettingen feiler', async () => {
    mockFrom.mockReturnValue(lagChain(null, { message: 'DB nede', code: 'DBY' }))

    const res = await DELETE(lagRequest('DELETE', { endpoint: 'https://push.example/x' }))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.ok).not.toBe(true)
    expect(mockLoggFeil).toHaveBeenCalledWith(
      'push.abonnement.sletting.feilet',
      expect.objectContaining({ message: 'DB nede' }),
      expect.objectContaining({ ctx: expect.objectContaining({ profil_id: 'user1', code: 'DBY' }) }),
    )
  })
})
