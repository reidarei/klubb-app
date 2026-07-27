/**
 * Pinner stemplings-kontrakten i lib/actions/pass.ts (#504-review MAJOR-4).
 *
 * Tre ting som PR 2 («Varsle på nytt»-knappen) bygger rett oppå:
 *  (a) stemple_pass_varslet() kalles INNE i try-blokka, ETTER sendVarsel —
 *      flyttes den ut, stempler vi en tilstand som aldri ble varslet om, og
 *      «Varsle på nytt» ville trodd at jobben var gjort.
 *  (b) dedupNoekkel sendes med, navnerom-prefikset per type.
 *  (c) RPC-feil logges, men kaster ikke — tilstandsendringen er alt committet.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lagChain } from './helpers/supabase-mock'

const { mockSupabaseFrom, mockAdminFrom, mockRpc, mockSendVarsel, mockLoggFeil } = vi.hoisted(
  () => ({
    mockSupabaseFrom: vi.fn(),
    mockAdminFrom: vi.fn(),
    mockRpc: vi.fn(),
    mockSendVarsel: vi.fn(),
    mockLoggFeil: vi.fn(),
  }),
)

vi.mock('@/lib/auth', () => ({
  ensureInnlogget: vi.fn().mockResolvedValue({
    supabase: { from: mockSupabaseFrom },
    user: { id: 'gensek-1' },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mockAdminFrom, rpc: mockRpc }),
}))

vi.mock('@/lib/varsler', () => ({
  sendVarsel: (...a: unknown[]) => mockSendVarsel(...a),
}))

vi.mock('@/lib/logg', () => ({
  logg: { warn: vi.fn(), feil: (...a: unknown[]) => mockLoggFeil(...a) },
}))

import { godkjennPassTilgang, avslaaPassTilgang } from '@/lib/actions/pass'

const FORESPORSEL = {
  soker_id: 'soker-1',
  eier_id: 'eier-1',
  arrangement_id: 'arr-1',
}

beforeEach(() => {
  vi.clearAllMocks()
  // Beslutnings-oppdateringen lykkes og returnerer forespørselsraden.
  mockSupabaseFrom.mockImplementation(() => lagChain(FORESPORSEL))
  // Admin-klienten brukes til profil-oppslag (eier-navn i meldingsteksten).
  mockAdminFrom.mockImplementation(() => lagChain({ navn: 'Ola Nordmann', visningsnavn: null }))
  mockRpc.mockResolvedValue({ data: true, error: null })
  mockSendVarsel.mockResolvedValue({ utfall: 'sendt', levert: 1, kunApp: 0, dedupHoppet: 0 })
})

describe('godkjennPassTilgang – stempling', () => {
  it('stempler via stemple_pass_varslet ETTER at sendVarsel returnerte', async () => {
    await godkjennPassTilgang('fp-1')

    expect(mockSendVarsel).toHaveBeenCalledTimes(1)
    expect(mockRpc).toHaveBeenCalledWith('stemple_pass_varslet', { p_id: 'fp-1' })
    // Rekkefølgen er hele poenget: stempelet er kvittering for et varsel som
    // faktisk gikk ut, ikke for at vi hadde tenkt å sende ett.
    expect(mockSendVarsel.mock.invocationCallOrder[0]).toBeLessThan(
      mockRpc.mock.invocationCallOrder[0],
    )
  })

  it('stempler IKKE når sendVarsel kaster (ukjent utfall — retry er lov)', async () => {
    mockSendVarsel.mockRejectedValueOnce(new Error('Resend nede'))

    await expect(godkjennPassTilgang('fp-2')).resolves.toBeUndefined()

    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockLoggFeil).toHaveBeenCalledWith('pass.varsler.feilet', expect.any(Error))
  })

  it('sender navnerom-prefikset dedupNoekkel', async () => {
    await godkjennPassTilgang('fp-3')

    expect(mockSendVarsel).toHaveBeenCalledWith(
      expect.objectContaining({
        mottakere: ['soker-1'],
        type: 'pass-godkjent',
        dedupNoekkel: 'pass-godkjent:fp-3',
        tillatDuplikat: true,
      }),
    )
  })

  it('RPC-feil logges, men kaster ikke videre til brukeren', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'DB nede' } })

    await expect(godkjennPassTilgang('fp-4')).resolves.toBeUndefined()

    expect(mockLoggFeil).toHaveBeenCalledWith('pass.stempel.feilet', expect.anything())
  })

  it('kaster når selve beslutnings-oppdateringen feiler (ingen varsel, ingen stempel)', async () => {
    mockSupabaseFrom.mockImplementation(() => lagChain(null, { message: 'ikke funnet' }))

    await expect(godkjennPassTilgang('fp-5')).rejects.toThrow('ikke funnet')

    expect(mockSendVarsel).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
  })
})

describe('avslaaPassTilgang – stempling', () => {
  it('stempler ETTER sendVarsel, med egen dedup-nøkkel', async () => {
    await avslaaPassTilgang('fp-6')

    expect(mockSendVarsel).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'pass-avslatt',
        dedupNoekkel: 'pass-avslatt:fp-6',
      }),
    )
    expect(mockRpc).toHaveBeenCalledWith('stemple_pass_varslet', { p_id: 'fp-6' })
    expect(mockSendVarsel.mock.invocationCallOrder[0]).toBeLessThan(
      mockRpc.mock.invocationCallOrder[0],
    )
  })

  it('stempler IKKE når sendVarsel kaster', async () => {
    mockSendVarsel.mockRejectedValueOnce(new Error('Resend nede'))

    await expect(avslaaPassTilgang('fp-7')).resolves.toBeUndefined()

    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockLoggFeil).toHaveBeenCalledWith('pass.varsler.feilet', expect.any(Error))
  })
})
