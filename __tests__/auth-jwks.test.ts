import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { hentJwks, _nullstillJwksCache } from '@/lib/auth-jwks'

const JWKS = { keys: [{ kid: 'abc', alg: 'ES256', kty: 'EC' }] }

function mockFetch(svar: () => Promise<Response> | Response) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(svar() as Response))
}

function ok(body: unknown) {
  return { ok: true, json: () => Promise.resolve(body) } as unknown as Response
}

beforeEach(() => {
  _nullstillJwksCache()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('hentJwks – cache', () => {
  it('henter nøklene én gang og gjenbruker dem', async () => {
    // Hele poenget med modulen: middleware lager en ny Supabase-klient per
    // request, så auth-js sin egen cache er alltid tom. Uten denne ville
    // /.well-known/jwks.json blitt hentet ved HVER navigasjon — nøyaktig
    // nettverkskallet vi valgte getClaims() framfor getUser() for å slippe.
    const spion = mockFetch(() => ok(JWKS))

    const a = await hentJwks()
    const b = await hentJwks()
    const c = await hentJwks()

    expect(spion).toHaveBeenCalledTimes(1)
    expect(a?.keys).toHaveLength(1)
    expect(b).toEqual(a)
    expect(c).toEqual(a)
  })

  it('sender apikey — endepunktet avviser anonyme kall', async () => {
    const spion = mockFetch(() => ok(JWKS))

    await hentJwks()

    const [url, init] = spion.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/auth/v1/.well-known/jwks.json')
    expect((init.headers as Record<string, string>).apikey).toBe('anon')
  })
})

describe('hentJwks – feilhåndtering', () => {
  it('returnerer null når nøklene aldri har latt seg hente', async () => {
    // Kallstedet skal da verifisere på en dyrere måte — aldri slippe brukeren
    // gjennom uverifisert fordi nøkkelsettet var utilgjengelig.
    mockFetch(() => {
      throw new Error('nettverk nede')
    })

    expect(await hentJwks()).toBeNull()
  })

  it('returnerer null ved HTTP-feil uten tidligere cache', async () => {
    mockFetch(() => ({ ok: false, json: () => Promise.resolve({}) }) as unknown as Response)

    expect(await hentJwks()).toBeNull()
  })

  it('beholder forrige cache ved transient feil — logger ikke ut klubben', async () => {
    // Tiden styres eksplisitt: uten det er cachen fortsatt fersk når andre
    // kall skjer, TTL-en kortslutter, og testen ville bestått uten å ha rørt
    // fail-stien den påstår å dekke.
    const t0 = 1_700_000_000_000
    const naa = vi.spyOn(Date, 'now').mockReturnValue(t0)

    const spion = mockFetch(() => ok(JWKS))
    const foerste = await hentJwks()
    expect(foerste?.keys).toHaveLength(1)

    // Hopp forbi TTL-en (10 min) og la neste henting feile.
    naa.mockReturnValue(t0 + 11 * 60 * 1000)
    spion.mockImplementation(() => {
      throw new Error('nettverk nede')
    })

    expect(await hentJwks()).toEqual(foerste)
    // Bevis at fail-stien faktisk ble kjørt, ikke bare TTL-en.
    expect(spion).toHaveBeenCalledTimes(2)
  })

  it('tomt nøkkelsett behandles som mislykket henting', async () => {
    mockFetch(() => ok({ keys: [] }))

    expect(await hentJwks()).toBeNull()
  })
})
