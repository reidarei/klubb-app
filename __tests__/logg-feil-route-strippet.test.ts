/**
 * #681 (review): `logg-feil.kontekst.strippet` gjengir nøkkelnavn som kommer
 * rått fra en uautentisert klient. Kapping begrenser volum, ikke PII — en
 * klient kan legge en epostadresse i selve nøkkelnavnet. Formvakten i ruta
 * slipper derfor kun identifikator-formede navn inn i `sample` og teller
 * resten i `ugyldige`. Testen her pinner begge retninger.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockWarn = vi.fn()
const mockInsert = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
  })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: () => ({ insert: mockInsert }) })),
}))

vi.mock('@/lib/logg', () => ({
  logg: { warn: mockWarn, feil: vi.fn(), info: vi.fn() },
}))

const { POST } = await import('@/app/api/logg-feil/route')

// Hver test får sin egen IP: rate-limit-bøttene er modul-lokale og lever
// videre mellom testene i samme fil.
let ipTeller = 0

function lagRequest(kontekst: Record<string, unknown>) {
  ipTeller += 1
  return new Request('http://localhost/api/logg-feil', {
    method: 'POST',
    headers: { 'x-forwarded-for': `10.0.0.${ipTeller}` },
    body: JSON.stringify({ event: 'klient.test', nivaa: 'warn', kontekst }),
  }) as unknown as Parameters<typeof POST>[0]
}

function sisteStrippetVarsel() {
  const kall = mockWarn.mock.calls.filter((k) => k[0] === 'logg-feil.kontekst.strippet')
  expect(kall.length, 'forventet ett logg-feil.kontekst.strippet-varsel').toBe(1)
  return kall[0][1] as { count: number; sample: string; ugyldige: number }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockInsert.mockResolvedValue({ error: null })
})

describe('POST /api/logg-feil — formvakt på strippede nøkkelnavn (#681)', () => {
  it('gjengir identifikator-formede nøkler i sample', async () => {
    await POST(lagRequest({ ukjent_felt: 1, ogsaaUkjent2: 2 }))
    const ctx = sisteStrippetVarsel()
    expect(ctx.sample.split(',')).toEqual(['ukjent_felt', 'ogsaaUkjent2'])
    expect(ctx.ugyldige).toBe(0)
    expect(ctx.count).toBe(2)
  })

  it('holder epostadresser og nøkler med mellomrom UTE av sample, men teller dem', async () => {
    await POST(
      lagRequest({
        'reidar.haavik@example.com': 1,
        'fornavn etternavn': 2,
        'https://example.com/side?q=hemmelig': 3,
        ukjent_felt: 4,
      }),
    )
    const ctx = sisteStrippetVarsel()
    expect(ctx.sample).toBe('ukjent_felt')
    expect(ctx.sample).not.toContain('@')
    expect(ctx.sample).not.toContain(' ')
    expect(ctx.ugyldige).toBe(3)
    // `count` er fortsatt totalen: signalet «noe ble strippet» skal ikke
    // krympe fordi navnene ikke kunne gjengis.
    expect(ctx.count).toBe(4)
  })

  it('sender tomt sample — ikke noe klientkontrollert — når ingen nøkkel har gyldig form', async () => {
    await POST(lagRequest({ 'ola@example.com': 1 }))
    const ctx = sisteStrippetVarsel()
    expect(ctx.sample).toBe('')
    expect(ctx.ugyldige).toBe(1)
  })

  it('varsler ikke når hele konteksten står i whitelisten', async () => {
    await POST(lagRequest({ appversjon: 'V3.6.11', online: true }))
    expect(mockWarn.mock.calls.filter((k) => k[0] === 'logg-feil.kontekst.strippet')).toEqual([])
  })
})
