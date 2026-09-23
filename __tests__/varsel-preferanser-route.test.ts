/**
 * #614: ruta validerer varsel_nivaa server-side (ikke stol på klienten) og
 * skal ikke returnere { ok: true } når upserten faktisk feilet
 * (§ Policy: Databasespørringer).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn()
const mockUpsert = vi.fn()
const mockFrom = vi.fn(() => ({ upsert: mockUpsert }))

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}))

const { PUT } = await import('@/app/api/varsel-preferanser/route')

function lagRequest(body: unknown) {
  return new Request('http://localhost/api/varsel-preferanser', {
    method: 'PUT',
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof PUT>[0]
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user1' } } })
  mockUpsert.mockResolvedValue({ error: null })
})

describe('PUT /api/varsel-preferanser — varsel_nivaa (#614)', () => {
  it('lagrer gyldig verdi "viktige"', async () => {
    const res = await PUT(lagRequest({ varsel_nivaa: 'viktige' }))
    expect(res.status).toBe(200)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ profil_id: 'user1', varsel_nivaa: 'viktige' }),
      { onConflict: 'profil_id' },
    )
  })

  it('lagrer gyldig verdi "alle"', async () => {
    const res = await PUT(lagRequest({ varsel_nivaa: 'alle' }))
    expect(res.status).toBe(200)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ varsel_nivaa: 'alle' }),
      { onConflict: 'profil_id' },
    )
  })

  it('avviser ugyldig varsel_nivaa uten å kalle upsert', async () => {
    const res = await PUT(lagRequest({ varsel_nivaa: 'kanskje' }))
    expect(res.status).toBe(400)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('returnerer feil (ikke {ok:true}) når upserten feiler', async () => {
    mockUpsert.mockResolvedValue({ error: { message: 'DB nede' } })
    const res = await PUT(lagRequest({ push_aktiv: true }))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.ok).not.toBe(true)
  })
})
