import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lagChain } from './helpers/supabase-mock'

// Mock dato-modul. hentForDag() (lib/actions/paaminnelser.ts) bruker etter
// #675 osloDagStartIso() for spørringsvinduet og osloDagPluss() for
// purredato-nøkkelen — begge mockes her forankret til «10. juni 2026» som
// fast «i dag».
//
// Aritmetikken går via Date.UTC, ALDRI via new Date(2026, 5, 10 + n) +
// toISOString(): den siste formen bygger LOKAL midnatt og kapper deretter
// UTC-strengen, så «10. juni» blir 2026-06-09 i Europe/Oslo. Fordi både
// fixture-nøkkelen og spørrings-mocken brukte samme hjelper, var testene
// grønne på en annen dato enn kommentaren lovet — selvkonsistente, ikke
// korrekte (review av #675: tautologien fra produksjonskodens egen dagStreng
// var flyttet ett hakk inn i testen, ikke fjernet). Vakten mot en ny runde er
// «test-mocken selv»-blokka nederst, som pinner eksakte literaler.
vi.mock('@/lib/dato', () => {
  // Defineres inne i factoryen: vi.mock hoistes over modulkroppen, så en
  // hjelper deklarert utenfor ville stått i TDZ når mocken først brukes.
  const dagStreng = (n: number) => new Date(Date.UTC(2026, 5, 10 + n)).toISOString().slice(0, 10)
  return {
    naa: () => '2026-06-10T00:00:00.000Z',
    // Ankeret kjorPaaminnelser sampler én gang for hele kjøringen. Mocken
    // ignorerer `anker`-argumentet i hjelperne under — datoen er frosset her.
    iDagOslo: () => dagStreng(0),
    osloDagPluss: (n: number) => dagStreng(n),
    // hentForDag slicer kun de første 10 tegnene av gte-verdien (se
    // lagMockAdmin under) — klokkeslettet i suffixet spiller ingen rolle,
    // bare datoen matcher osloDagPluss over.
    osloDagStartIso: (n = 0) => `${dagStreng(n)}T00:00:00.000Z`,
  }
})

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
import { osloDagPluss, osloDagStartIso } from '@/lib/dato'

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

// Vakten mot at mocken igjen blir selvkonsistent i stedet for korrekt. Uten
// minst én eksakt literal kan hjelperen over og fixture-nøklene under være
// enige om samme feil dato i all evighet, slik de var før review av #675 —
// «10. juni» ble 2026-06-09 i Europe/Oslo, og ingen test merket det.
describe('test-mocken selv', () => {
  it('forankrer «i dag» til 10. juni 2026, uansett runnerens tidssone', () => {
    expect(osloDagPluss(0)).toBe('2026-06-10')
    expect(osloDagPluss(1)).toBe('2026-06-11')
    expect(osloDagPluss(3)).toBe('2026-06-13')
    expect(osloDagPluss(7)).toBe('2026-06-17')
    // Månedsskifte: Date.UTC normaliserer overflyt, så 10. juni + 21 = 1. juli.
    expect(osloDagPluss(21)).toBe('2026-07-01')
    // Verdien hentForDag faktisk spør med i denne fila. Selve Oslo-midnatt-
    // konverteringen er ikke mocken sin jobb å bevise — den er dekket av
    // __tests__/paaminnelser-tidssone.test.ts, som bruker den EKTE lib/dato.
    expect(osloDagStartIso(7)).toBe('2026-06-17T00:00:00.000Z')
  })
})

describe('kjorPaaminnelser', () => {
  it('sender 7-dagers påminnelse for arrangement om 7 dager', async () => {
    // Literal nøkkel, ikke osloDagPluss(7): fixture og produksjonskode skal
    // ikke kunne bli enige om samme feil dato. De øvrige testene bruker
    // hjelperen for lesbarhet — den er pinnet mot literalene rett over.
    const om7 = '2026-06-17'

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
    const om7 = osloDagPluss(7)
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
    const imorgen = osloDagPluss(1)
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
    const om3 = osloDagPluss(3)

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
    const om7 = osloDagPluss(7)
    const imorgen = osloDagPluss(1)

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
