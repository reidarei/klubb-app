import { describe, it, expect, vi, beforeEach } from 'vitest'
import { iDagOslo } from '@/lib/dato'
import { lagChain } from './helpers/supabase-mock'

const mockSendVarsel = vi.fn().mockResolvedValue({ utfall: 'sendt', levert: 1, kunApp: 0, dedupHoppet: 0 })
vi.mock('@/lib/varsler', () => ({
  sendVarsel: (...args: unknown[]) => mockSendVarsel(...args),
}))

const mockLoggFeil = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/logg', () => ({
  logg: {
    warn: vi.fn(),
    feil: (...args: unknown[]) => mockLoggFeil(...args),
  },
}))

import { kjorBursdagsvarsel } from '@/lib/actions/bursdagsvarsel'

beforeEach(() => {
  vi.clearAllMocks()
  mockSendVarsel.mockResolvedValue({ utfall: 'sendt', levert: 1, kunApp: 0, dedupHoppet: 0 })
})

// Dagens dato som "YYYY-MM-DD" i norsk tid — samme beregning som modulen
// selv bruker, slik at fixturene alltid treffer «i dag» uansett hvilken
// dato testene faktisk kjører på.
const iDag = iDagOslo()
const aarStr = iDag.split('-')[0]

type Admin = Parameters<typeof kjorBursdagsvarsel>[0]

function lagAdmin(profiler: unknown, feil: unknown = null) {
  return {
    from: vi.fn(() => lagChain(profiler, feil)),
  } as unknown as Admin
}

describe('kjorBursdagsvarsel – #638', () => {
  it('profil-oppslag med error gir feil: 1, ingen varsel sendt', async () => {
    const admin = lagAdmin([], new Error('DB nede'))

    const resultat = await kjorBursdagsvarsel(admin)

    expect(resultat).toEqual({ varslet: 0, hoppet: 0, blokkert: 0, feil: 1 })
    expect(mockLoggFeil).toHaveBeenCalledWith('bursdagsvarsel.profiler.feilet', expect.any(Error))
    expect(mockSendVarsel).not.toHaveBeenCalled()
  })

  it('ingen har bursdag i dag: ingen varsel sendt', async () => {
    const admin = lagAdmin([
      { id: 'a', navn: 'Ola Nordmann', visningsnavn: 'Ola', fodselsdato: '1990-01-01' },
    ])

    const resultat = await kjorBursdagsvarsel(admin)

    expect(resultat).toEqual({ varslet: 0, hoppet: 0, blokkert: 0, feil: 0 })
    expect(mockSendVarsel).not.toHaveBeenCalled()
  })

  it('ett bursdagsbarn: sendVarsel kalles én gang, uten barnets egen id i mottakerlista', async () => {
    const admin = lagAdmin([
      { id: 'barn1', navn: 'Ola Nordmann', visningsnavn: 'Ola', fodselsdato: `1990-${iDag.slice(5)}` },
      { id: 'venn1', navn: 'Kari Nordmann', visningsnavn: 'Kari', fodselsdato: '1980-01-01' },
      { id: 'venn2', navn: 'Per Hansen', visningsnavn: 'Per', fodselsdato: '1975-05-05' },
    ])

    const resultat = await kjorBursdagsvarsel(admin)

    expect(resultat).toEqual({ varslet: 1, hoppet: 0, blokkert: 0, feil: 0 })
    expect(mockSendVarsel).toHaveBeenCalledTimes(1)
    const kall = mockSendVarsel.mock.calls[0][0]
    expect(kall.mottakere.sort()).toEqual(['venn1', 'venn2'])
    expect(kall.mottakere).not.toContain('barn1')
    expect(kall.type).toBe('bursdag_i_dag')
    expect(kall.dedupNoekkel).toBe(`bursdag_i_dag:barn1:${aarStr}`)
    // Fullt navn, ikke visningsnavn: fixturen har visningsnavn 'Ola', så en
    // regresjon til kallenavnet ville feilet her (flere medlemmer deler fornavn).
    expect(kall.melding).toMatch(/^Ola Nordmann fyller \d+ i dag\.$/)
    expect(kall.url).toBe('/chat')
    expect(kall.tellerUlest).toBeUndefined()
    expect(kall.pushTag).toBeUndefined()
  })

  it('sendVarsel returnerer kun dedupHoppet: telles som hoppet, ikke feil', async () => {
    mockSendVarsel.mockResolvedValueOnce({ utfall: 'dedup', levert: 0, kunApp: 0, dedupHoppet: 2 })
    const admin = lagAdmin([
      { id: 'barn1', navn: 'Ola Nordmann', visningsnavn: 'Ola', fodselsdato: `1990-${iDag.slice(5)}` },
      { id: 'venn1', navn: 'Kari Nordmann', visningsnavn: 'Kari', fodselsdato: '1980-01-01' },
    ])

    const resultat = await kjorBursdagsvarsel(admin)

    expect(resultat).toEqual({ varslet: 0, hoppet: 1, blokkert: 0, feil: 0 })
  })

  it('varseltypen er slått av: telles som blokkert, ikke som hoppet', async () => {
    // «levert 0» alene skiller ikke ren dedup fra en avslått varseltype — uten
    // det skillet ville cron-JSON-en meldt «hoppet: 1» for en dag der ingen
    // kunne fått noe uansett.
    mockSendVarsel.mockResolvedValueOnce({
      utfall: 'type_deaktivert',
      levert: 0,
      kunApp: 0,
      dedupHoppet: 0,
    })
    const admin = lagAdmin([
      { id: 'barn1', navn: 'Ola Nordmann', visningsnavn: 'Ola', fodselsdato: `1990-${iDag.slice(5)}` },
      { id: 'venn1', navn: 'Kari Nordmann', visningsnavn: 'Kari', fodselsdato: '1980-01-01' },
    ])

    const resultat = await kjorBursdagsvarsel(admin)

    expect(resultat).toEqual({ varslet: 0, hoppet: 0, blokkert: 1, feil: 0 })
  })

  it('sendVarsel kaster for ett bursdagsbarn: feilen telles og logges, neste bursdagsbarn får likevel sitt varsel', async () => {
    mockSendVarsel
      .mockRejectedValueOnce(new Error('sendVarsel feilet'))
      .mockResolvedValueOnce({ utfall: 'sendt', levert: 1, kunApp: 0, dedupHoppet: 0 })

    const admin = lagAdmin([
      { id: 'barn1', navn: 'Ola Nordmann', visningsnavn: 'Ola', fodselsdato: `1990-${iDag.slice(5)}` },
      { id: 'barn2', navn: 'Per Hansen', visningsnavn: 'Per', fodselsdato: `1985-${iDag.slice(5)}` },
      { id: 'venn1', navn: 'Kari Nordmann', visningsnavn: 'Kari', fodselsdato: '1980-01-01' },
    ])

    const resultat = await kjorBursdagsvarsel(admin)

    expect(resultat).toEqual({ varslet: 1, hoppet: 0, blokkert: 0, feil: 1 })
    expect(mockSendVarsel).toHaveBeenCalledTimes(2)
    expect(mockLoggFeil).toHaveBeenCalledWith(
      'bursdagsvarsel.feilet',
      expect.any(Error),
      expect.objectContaining({ ctx: { profil_id: 'barn1' } }),
    )
  })

  it('kun bursdagsbarnet selv er aktiv: ingen mottakere, ingen sending, telles som hoppet', async () => {
    const admin = lagAdmin([
      { id: 'barn1', navn: 'Ola Nordmann', visningsnavn: 'Ola', fodselsdato: `1990-${iDag.slice(5)}` },
    ])

    const resultat = await kjorBursdagsvarsel(admin)

    expect(resultat).toEqual({ varslet: 0, hoppet: 1, blokkert: 0, feil: 0 })
    expect(mockSendVarsel).not.toHaveBeenCalled()
  })
})
