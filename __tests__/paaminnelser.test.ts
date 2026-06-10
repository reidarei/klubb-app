import { describe, it, expect, vi, beforeEach } from 'vitest'
import { addDays } from 'date-fns'
import { lagChain } from './helpers/supabase-mock'

// Mock dato-modul
vi.mock('@/lib/dato', () => ({
  norskDatoNaa: () => new Date(2026, 5, 10), // 10. juni 2026
  naa: () => '2026-06-10T00:00:00.000Z',
}))

// Mock varsler
const mockSendPaaminne = vi.fn().mockResolvedValue(undefined)
const mockSendPurring = vi.fn().mockResolvedValue(undefined)
const mockSendArrangorPurring = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/varsler', () => ({
  sendPaaminneVarsler: (...args: unknown[]) => mockSendPaaminne(...args),
  sendPurringVarsler: (...args: unknown[]) => mockSendPurring(...args),
  sendArrangorPurringVarsler: (...args: unknown[]) => mockSendArrangorPurring(...args),
}))

import { kjorPaaminnelser } from '@/lib/actions/paaminnelser'

function dagStreng(dato: Date): string {
  return dato.toISOString().slice(0, 10)
}

function lagMockAdmin(arrangementer: Record<string, unknown[]>, arrangorPurringer: unknown[] = []) {
  return {
    from: vi.fn((tabell: string) => {
      if (tabell === 'arrangementer') {
        const chain = lagChain([])
        // Override gte for å fange opp datoen
        chain.gte = vi.fn((_col: string, val: string) => {
          const dag = val.slice(0, 10)
          const data = arrangementer[dag] ?? []
          const inner = lagChain(data)
          return inner
        })
        return chain
      }
      if (tabell === 'arrangoransvar') {
        return lagChain(arrangorPurringer)
      }
      return lagChain([])
    }),
  } as unknown as Parameters<typeof kjorPaaminnelser>[0]
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('kjorPaaminnelser', () => {
  it('sender 7-dagers påminnelse for arrangement om 7 dager', async () => {
    const idag = new Date(2026, 5, 10)
    const om7 = dagStreng(addDays(idag, 7))

    const admin = lagMockAdmin({
      [om7]: [{ id: 'arr1', tittel: 'Vårfest', start_tidspunkt: `${om7}T18:00:00Z` }],
    })

    await kjorPaaminnelser(admin)
    expect(mockSendPaaminne).toHaveBeenCalledWith(
      expect.objectContaining({ arrangementId: 'arr1', type: 'paaminne_7' })
    )
  })

  it('sender 1-dags påminnelse for arrangement i morgen', async () => {
    const idag = new Date(2026, 5, 10)
    const imorgen = dagStreng(addDays(idag, 1))

    const admin = lagMockAdmin({
      [imorgen]: [{ id: 'arr2', tittel: 'Grillkveld', start_tidspunkt: `${imorgen}T18:00:00Z` }],
    })

    await kjorPaaminnelser(admin)
    expect(mockSendPaaminne).toHaveBeenCalledWith(
      expect.objectContaining({ arrangementId: 'arr2', type: 'paaminne_1' })
    )
  })

  it('sender purring til de som ikke har svart (3 dager før)', async () => {
    const idag = new Date(2026, 5, 10)
    const om3 = dagStreng(addDays(idag, 3))

    const admin = lagMockAdmin({
      [om3]: [{ id: 'arr3', tittel: 'Bowling', start_tidspunkt: `${om3}T19:00:00Z` }],
    })

    await kjorPaaminnelser(admin)
    expect(mockSendPurring).toHaveBeenCalledWith(
      expect.objectContaining({ arrangementId: 'arr3' })
    )
  })

  it('sender arrangør-purring når purredato er i dag', async () => {
    const admin = lagMockAdmin({}, [
      { id: 'ansvar1', aar: 2026, arrangement_navn: 'Mai-juni møte', ansvarlig_id: 'user1' },
    ])

    await kjorPaaminnelser(admin)
    expect(mockSendArrangorPurring).toHaveBeenCalledWith(
      expect.objectContaining({
        ansvarligId: 'user1',
        arrangementNavn: 'Mai-juni møte',
        aar: 2026,
      })
    )
  })

  it('håndterer feil i enkelt-varsel uten å stoppe resten', async () => {
    const idag = new Date(2026, 5, 10)
    const om7 = dagStreng(addDays(idag, 7))
    const imorgen = dagStreng(addDays(idag, 1))

    mockSendPaaminne
      .mockRejectedValueOnce(new Error('Push-feil'))
      .mockResolvedValueOnce(undefined)

    const admin = lagMockAdmin({
      [om7]: [{ id: 'arr-fail', tittel: 'Feil', start_tidspunkt: `${om7}T18:00:00Z` }],
      [imorgen]: [{ id: 'arr-ok', tittel: 'OK', start_tidspunkt: `${imorgen}T18:00:00Z` }],
    })

    const resultat = await kjorPaaminnelser(admin)
    expect(resultat.feil).toBe(1)
    expect(resultat.behandlet.length).toBe(1)
  })

  it('gjør ingenting når ingen arrangementer matcher', async () => {
    const admin = lagMockAdmin({})
    const resultat = await kjorPaaminnelser(admin)
    expect(resultat.behandlet).toHaveLength(0)
    expect(resultat.feil).toBe(0)
    expect(mockSendPaaminne).not.toHaveBeenCalled()
    expect(mockSendPurring).not.toHaveBeenCalled()
    expect(mockSendArrangorPurring).not.toHaveBeenCalled()
  })
})
