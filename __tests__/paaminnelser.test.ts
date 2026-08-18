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

// Speiler select-en i hentForDag eksakt. Alle tre dagene henter samme kolonner,
// så en fixture som glemmer paameldinger skal feile i typecheck — ikke i runtime.
// profil_id er med fordi 7-dagers-teksten er personlig: den trenger å vite HVEM
// som svarte hva, ikke bare hvor mange. Selve tellingen og gruppe-inndelingen
// skjer i sendPaaminneVarsler (lib/varsler.ts) — cronen videresender listen rå,
// og det er nettopp det testene under vokter.
type ArrangementFixture = {
  id: string
  tittel: string
  start_tidspunkt: string
  oppmoetested: string | null
  paameldinger: { profil_id: string; status: string }[]
}

function lagMockAdmin(
  arrangementer: Record<string, ArrangementFixture[]>,
  arrangorPurringer: unknown[] = [],
) {
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
      [om7]: [{ id: 'arr1', tittel: 'Vårfest', start_tidspunkt: `${om7}T18:00:00Z`, oppmoetested: 'Klubbhuset', paameldinger: [] }],
    })

    await kjorPaaminnelser(admin)
    expect(mockSendPaaminne).toHaveBeenCalledWith(
      expect.objectContaining({ arrangementId: 'arr1', type: 'paaminne_7', oppmoetested: 'Klubbhuset', paameldinger: [] })
    )
  })

  it('videresender påmeldingene rått, med profil_id i behold', async () => {
    // 7-dagers-teksten er personlig, så cronen må gi fra seg HVEM som svarte
    // hva — ikke en ferdig telling. Et select som mister profil_id ville gjort
    // alle til «ikke svart» uten at noe annet feilet.
    const idag = new Date(2026, 5, 10)
    const om7 = dagStreng(addDays(idag, 7))
    const paameldinger = [
      { profil_id: 'p1', status: 'ja' },
      { profil_id: 'p2', status: 'ja' },
      { profil_id: 'p3', status: 'kanskje' },
      { profil_id: 'p4', status: 'nei' },
    ]

    const admin = lagMockAdmin({
      [om7]: [{
        id: 'arr1',
        tittel: 'Vårfest',
        start_tidspunkt: `${om7}T18:00:00Z`,
        oppmoetested: 'Klubbhuset',
        paameldinger,
      }],
    })

    await kjorPaaminnelser(admin)
    expect(mockSendPaaminne).toHaveBeenCalledWith(
      expect.objectContaining({ arrangementId: 'arr1', type: 'paaminne_7', paameldinger })
    )
  })

  it('sender 1-dags påminnelse for arrangement i morgen', async () => {
    const idag = new Date(2026, 5, 10)
    const imorgen = dagStreng(addDays(idag, 1))
    const paameldinger = [
      { profil_id: 'p1', status: 'ja' },
      { profil_id: 'p2', status: 'ja' },
      { profil_id: 'p3', status: 'kanskje' },
      { profil_id: 'p4', status: 'nei' },
    ]

    const admin = lagMockAdmin({
      // Samme fixture-form som 7-dagers: 1-dagers-teksten teller også kun `ja`.
      [imorgen]: [{
        id: 'arr2',
        tittel: 'Grillkveld',
        start_tidspunkt: `${imorgen}T18:00:00Z`,
        oppmoetested: 'Klubbhuset',
        paameldinger,
      }],
    })

    await kjorPaaminnelser(admin)
    expect(mockSendPaaminne).toHaveBeenCalledWith(
      expect.objectContaining({
        arrangementId: 'arr2',
        type: 'paaminne_1',
        oppmoetested: 'Klubbhuset',
        paameldinger,
      })
    )
  })

  it('sender purring til de som ikke har svart (3 dager før)', async () => {
    const idag = new Date(2026, 5, 10)
    const om3 = dagStreng(addDays(idag, 3))

    const admin = lagMockAdmin({
      [om3]: [{ id: 'arr3', tittel: 'Bowling', start_tidspunkt: `${om3}T19:00:00Z`, oppmoetested: null, paameldinger: [] }],
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
      [om7]: [{ id: 'arr-fail', tittel: 'Feil', start_tidspunkt: `${om7}T18:00:00Z`, oppmoetested: null, paameldinger: [] }],
      [imorgen]: [{ id: 'arr-ok', tittel: 'OK', start_tidspunkt: `${imorgen}T18:00:00Z`, oppmoetested: null, paameldinger: [] }],
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
