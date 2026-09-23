import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lagFromMock } from './helpers/supabase-mock'

// Samme mock-oppsett som logg.test.ts: logg.ts importerer admin-klienten lazy
// inne i skrivFeilLoggRad(), men vi.mock fanger den uansett importform.
const mockFrom = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mockFrom }),
}))

import { loggRenderFeil } from '@/lib/logg'

// Fanger raden som ble sendt til .insert(), slik at vi kan assertere på
// innholdet og ikke bare på at et kall skjedde.
function fangInsert() {
  const spion = vi.fn()
  mockFrom.mockImplementation((tabell: string) => {
    const chain: Record<string, unknown> = {}
    for (const m of ['insert', 'abortSignal']) chain[m] = vi.fn().mockReturnValue(chain)
    chain.insert = vi.fn((rad: unknown) => {
      spion(tabell, rad)
      return chain
    })
    chain.then = (resolve: (v: unknown) => void) =>
      Promise.resolve({ data: null, error: null }).then(resolve)
    return chain
  })
  return spion
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('loggRenderFeil() — server-render-feil til feil_logg (#631)', () => {
  it('lagrer digest, feilnavn og melding så en digest kan slås opp i ettertid', async () => {
    const spion = fangInsert()
    const feil = new Error('Kunne ikke hente arrangementer: TypeError: fetch failed')

    await loggRenderFeil({ error: feil, rute: '/', digest: '217913069' })

    expect(spion).toHaveBeenCalledTimes(1)
    const [tabell, rad] = spion.mock.calls[0] as [string, Record<string, unknown>]
    expect(tabell).toBe('feil_logg')
    expect(rad.event).toBe('server.render.feilet')
    expect(rad.nivaa).toBe('error')
    expect(rad.url).toBe('/')

    const kontekst = rad.kontekst as Record<string, unknown>
    // Digesten er hele poenget: uten den kan ikke serverfeilen kobles til
    // raden app/error.tsx skriver fra klienten.
    expect(kontekst.digest).toBe('217913069')
    expect(kontekst.navn).toBe('Error')
    // normaliserFeil() bruker String(err) for ikke-PostgREST-feil, så
    // klassenavnet står foran meldingen. Det er ønsket: «TypeError: fetch
    // failed» og «Error: Kunne ikke hente …» skal kunne skilles på ett blikk.
    expect(kontekst.melding).toBe('Error: Kunne ikke hente arrangementer: TypeError: fetch failed')
  })

  it('maskerer radverdier i meldingen før den lagres', async () => {
    const spion = fangInsert()
    // Formen PostgREST bruker ved unique-brudd — verdien etter «=» er en
    // radverdi og kan være e-post, navn eller telefonnummer.
    const feil = new Error(
      'Kunne ikke lagre: duplicate key value violates unique constraint "profiles_epost_key" Key (epost)=(ola@example.no) already exists',
    )

    await loggRenderFeil({ error: feil, rute: '/profil' })

    const [, rad] = spion.mock.calls[0] as [string, Record<string, unknown>]
    const melding = (rad.kontekst as Record<string, unknown>).melding as string
    expect(melding).not.toContain('ola@example.no')
    expect(melding).toContain('=(…)')
  })

  it('avkorter lange meldinger så en rå PostgREST-melding ikke sprenger raden', async () => {
    const spion = fangInsert()

    await loggRenderFeil({ error: new Error('x'.repeat(2000)) })

    const [, rad] = spion.mock.calls[0] as [string, Record<string, unknown>]
    const melding = (rad.kontekst as Record<string, unknown>).melding as string
    expect(melding.length).toBe(500)
  })

  it('bevarer PostgREST-koden så feilen kan grupperes', async () => {
    const spion = fangInsert()

    await loggRenderFeil({
      error: { code: '57014', message: 'canceling statement due to statement timeout' },
      rute: '/',
    })

    const [, rad] = spion.mock.calls[0] as [string, Record<string, unknown>]
    expect((rad.kontekst as Record<string, unknown>).code).toBe('57014')
  })

  it('skriver INGEN rad for død sesjon — det er rutine på iOS, ikke en programfeil', async () => {
    const spion = fangInsert()

    // PGRST301 = utløpt JWT. Skrev vi error-rader for denne, ville hver
    // utløpte innlogging vekket døgnalarmen (regresjonen #602/#604 rettet).
    await loggRenderFeil({
      error: { code: 'PGRST301', message: 'JWT expired' },
      rute: '/',
    })

    expect(spion).not.toHaveBeenCalled()
  })

  it('kaster aldri, heller ikke når feil_logg-inserten selv feiler', async () => {
    mockFrom.mockImplementation(lagFromMock({}, { feil_logg: { code: '08006', message: 'connection refused' } }))

    // Kalles fra Next sin feilhåndtering — kaster den, skjuler den den ekte feilen.
    await expect(
      loggRenderFeil({ error: new Error('noe gikk galt'), rute: '/' }),
    ).resolves.toBeUndefined()
  })

  it('kaster aldri når admin-klienten selv kaster (timeout/nettverk)', async () => {
    mockFrom.mockImplementation(() => {
      throw new Error('AbortError: signal timed out')
    })

    await expect(
      loggRenderFeil({ error: new Error('noe gikk galt'), rute: '/' }),
    ).resolves.toBeUndefined()
  })

  it('tier om 23505 — det er burst-dedupen (mig. 122) som gjør jobben sin', async () => {
    mockFrom.mockImplementation(lagFromMock({}, { feil_logg: { code: '23505', message: 'duplicate key' } }))
    const loggSpion = vi.spyOn(console, 'log')

    await loggRenderFeil({ error: new Error('noe gikk galt'), rute: '/' })

    const linjer = loggSpion.mock.calls.map(c => String(c[0]))
    expect(linjer.some(l => l.includes('logg.feillogg.insert.feilet'))).toBe(false)
  })
})
