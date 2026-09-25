// @vitest-environment node
//
// #760: feilet profiles-oppdatering etter opprettet auth-bruker logges, ikke
// kastes — admin MÅ få passordet uansett.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lagChain } from './helpers/supabase-mock'

const mockEnsureAdmin = vi.fn()
vi.mock('@/lib/auth', () => ({ ensureAdmin: (...a: unknown[]) => mockEnsureAdmin(...a) }))

const mockCreateUser = vi.fn()
const mockFrom = vi.fn()
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: { admin: { createUser: mockCreateUser } },
    from: mockFrom,
  })),
}))

const mockSendEpost = vi.fn()
vi.mock('@/lib/epost', () => ({
  sendEpost: (...a: unknown[]) => mockSendEpost(...a),
  velkommenEpostHtml: vi.fn().mockReturnValue('<html></html>'),
}))

const mockLoggFeil = vi.fn()
vi.mock('@/lib/logg', () => ({ logg: { feil: mockLoggFeil, warn: vi.fn() } }))

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

const { POST } = await import('@/app/api/admin/opprett-medlem/route')

function lagRequest(body: unknown) {
  return new Request('http://localhost/api/admin/opprett-medlem', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0]
}

beforeEach(() => {
  vi.clearAllMocks()
  mockEnsureAdmin.mockResolvedValue({ user: { id: 'admin-1' }, profil: { rolle: 'admin' } })
  mockCreateUser.mockResolvedValue({ data: { user: { id: 'ny-bruker-1' } }, error: null })
  mockFrom.mockReturnValue(lagChain(null))
  mockSendEpost.mockResolvedValue(undefined)
})

describe('POST /api/admin/opprett-medlem', () => {
  const gyldigBody = { navn: 'Ola Nordmann', epost: 'ola@example.com' }

  it('returnerer 200 med passord når profil-oppdateringen lykkes', async () => {
    const res = await POST(lagRequest(gyldigBody))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(typeof json.passord).toBe('string')
    expect(mockLoggFeil).not.toHaveBeenCalled()
    expect(mockSendEpost).toHaveBeenCalled()
  })

  it('logger admin.opprett_medlem.profil.feilet, men returnerer likevel 200 med passord når profil-oppdateringen feiler', async () => {
    mockFrom.mockReturnValue(lagChain(null, { message: 'DB nede', code: 'DBZ' }))

    const res = await POST(lagRequest(gyldigBody))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(typeof json.passord).toBe('string')
    expect(mockLoggFeil).toHaveBeenCalledWith(
      'admin.opprett_medlem.profil.feilet',
      expect.objectContaining({ message: 'DB nede' }),
      expect.objectContaining({ ctx: expect.objectContaining({ code: 'DBZ', profil_id: 'ny-bruker-1' }) }),
    )
    // Admin må uansett få passordet han nettopp genererte — e-posten går ut som normalt
    expect(mockSendEpost).toHaveBeenCalled()
  })
})
