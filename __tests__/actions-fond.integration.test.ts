/**
 * Integrasjonstester for lib/actions/fond.ts — pulje A av «svelgede Supabase-
 * feil»-opprydningen (se CLAUDE.md § pulje A).
 *
 * Fokus: at et feilet historikk-oppslag FØR en oppdatering/sletting kaster
 * FØR skrivingen skjer, i stedet for å skrive stille uten historikk-spor.
 * Penger uten historikk er verre enn en handling brukeren må gjenta.
 *
 * Mønster kopiert fra actions-arrangementer.integration.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lagChain } from './helpers/supabase-mock'

const { mockFrom, mockSupabase, mockRevalidatePath, mockLoggFeil } = vi.hoisted(() => {
  const mockFrom = vi.fn<(tabell: string) => unknown>()
  const mockSupabase = { from: mockFrom }
  const mockRevalidatePath = vi.fn()
  const mockLoggFeil = vi.fn()
  return { mockFrom, mockSupabase, mockRevalidatePath, mockLoggFeil }
})

vi.mock('@/lib/auth', () => ({
  ensureAdmin: vi.fn().mockResolvedValue({
    supabase: mockSupabase,
    user: { id: 'admin-1' },
    profil: { rolle: 'admin' },
  }),
}))

vi.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args) }))

vi.mock('@/lib/logg', () => ({
  logg: { warn: vi.fn(), feil: (...a: unknown[]) => mockLoggFeil(...a) },
}))

import {
  oppdaterEiendom,
  slettEiendom,
  oppdaterVerdipapir,
  slettVerdipapir,
  oppdaterKontantSaldo,
} from '@/lib/actions/fond'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('oppdaterEiendom — historikk-oppslag kaster FØR skriving', () => {
  it('skriver historikk med riktig gammel/ny verdi ved suksess', async () => {
    const historikkInsertSpy = vi.fn().mockResolvedValue({ data: null, error: null })
    mockFrom.mockImplementation((tabell: string) => {
      if (tabell === 'fond_eiendom') {
        const chain = lagChain({ markedsverdi: 100 })
        chain.then = (resolve: (v: unknown) => void) =>
          Promise.resolve({ data: null, error: null }).then(resolve)
        return chain
      }
      if (tabell === 'fond_verdi_historikk') {
        const chain = lagChain(null)
        chain.insert = historikkInsertSpy
        return chain
      }
      return lagChain(null)
    })

    await oppdaterEiendom({ id: 'e-1', navn: 'Hytta', markedsverdi: 150, anskaffelsesverdi: 90, husleie_i_aar: 0, driftskostnader_i_aar: 0 })

    expect(historikkInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ kilde: 'eiendom', kilde_id: 'e-1', gammel_verdi: 100, ny_verdi: 150 }),
    )
  })

  it('kaster når oppslaget på gammel markedsverdi feiler, OG oppdaterer aldri raden', async () => {
    const updateSpy = vi.fn()
    mockFrom.mockImplementation((tabell: string) => {
      if (tabell === 'fond_eiendom') {
        const chain = lagChain(null, { message: 'DB nede' })
        chain.update = updateSpy.mockReturnValue(chain)
        return chain
      }
      return lagChain(null)
    })

    await expect(
      oppdaterEiendom({ id: 'e-1', navn: 'Hytta', markedsverdi: 150, anskaffelsesverdi: 90, husleie_i_aar: 0, driftskostnader_i_aar: 0 }),
    ).rejects.toThrow('Kunne ikke lese gjeldende markedsverdi for historikk')

    // Skrivingen skal ALDRI skje når vi ikke fikk lest gammel verdi —
    // ellers ville vi skrevet ny verdi uten historikk-spor.
    expect(updateSpy).not.toHaveBeenCalled()
    expect(mockLoggFeil).toHaveBeenCalledWith('fond.eiendom.oppslag.feilet', expect.anything(), expect.anything())
  })
})

describe('slettEiendom — historikk-oppslag kaster FØR sletting', () => {
  it('kaster når oppslaget feiler, OG sletter aldri raden', async () => {
    const deleteSpy = vi.fn()
    mockFrom.mockImplementation((tabell: string) => {
      if (tabell === 'fond_eiendom') {
        const chain = lagChain(null, { message: 'DB nede' })
        chain.delete = deleteSpy.mockReturnValue(chain)
        return chain
      }
      return lagChain(null)
    })

    await expect(slettEiendom('e-1')).rejects.toThrow('Kunne ikke lese gjeldende markedsverdi for historikk')
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  // Idempotens-kontrakten: to admins (eller to faner) på /fond. A sletter, B
  // klikker slett på sin stale liste. Utfallet B ba om er allerede sant — han
  // skal ikke få en rød feil, og revalider() MÅ kjøre, ellers blir den
  // ikke-eksisterende raden stående i UI-et hos B.
  it('raden er allerede slettet: kaster ikke, hopper over historikk, revaliderer', async () => {
    const historikkInsertSpy = vi.fn().mockResolvedValue({ data: null, error: null })
    const deleteSpy = vi.fn()
    mockFrom.mockImplementation((tabell: string) => {
      if (tabell === 'fond_eiendom') {
        const chain = lagChain(null) // 0 rader, ingen feil
        chain.delete = deleteSpy.mockReturnValue(chain)
        return chain
      }
      if (tabell === 'fond_verdi_historikk') {
        const chain = lagChain(null)
        chain.insert = historikkInsertSpy
        return chain
      }
      return lagChain(null)
    })

    await expect(slettEiendom('e-borte')).resolves.toBeUndefined()
    expect(deleteSpy).toHaveBeenCalled()
    // Ingen ny 0-rad: den ble skrevet av den som slettet først.
    expect(historikkInsertSpy).not.toHaveBeenCalled()
    expect(mockRevalidatePath).toHaveBeenCalled()
  })

  it('slettVerdipapir har samme idempotens-kontrakt', async () => {
    const deleteSpy = vi.fn()
    mockFrom.mockImplementation((tabell: string) => {
      if (tabell === 'fond_verdipapir') {
        const chain = lagChain(null)
        chain.delete = deleteSpy.mockReturnValue(chain)
        return chain
      }
      return lagChain(null)
    })

    await expect(slettVerdipapir('v-borte')).resolves.toBeUndefined()
    expect(deleteSpy).toHaveBeenCalled()
    expect(mockRevalidatePath).toHaveBeenCalled()
  })
})

// Oppdatering er motsatt av sletting: en no-op-update ser ut som suksess for
// brukeren, men ingenting ble lagret. Da skal han få vite det — på norsk.
describe('oppdaterEiendom / oppdaterVerdipapir — raden er borte', () => {
  it('oppdaterEiendom sier fra på norsk i stedet for å lekke PostgREST-tekst', async () => {
    const updateSpy = vi.fn()
    mockFrom.mockImplementation((tabell: string) => {
      if (tabell === 'fond_eiendom') {
        const chain = lagChain(null)
        chain.update = updateSpy.mockReturnValue(chain)
        return chain
      }
      return lagChain(null)
    })

    await expect(
      oppdaterEiendom({ id: 'e-borte', navn: 'Hytta', markedsverdi: 150, anskaffelsesverdi: 90, husleie_i_aar: 0, driftskostnader_i_aar: 0 }),
    ).rejects.toThrow('Eiendommen finnes ikke lenger')
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it('oppdaterVerdipapir gjør det samme', async () => {
    mockFrom.mockImplementation((tabell: string) =>
      tabell === 'fond_verdipapir' ? lagChain(null) : lagChain(null),
    )

    await expect(
      oppdaterVerdipapir({ id: 'v-borte', navn: 'Aksjefond', type: 'fond', verdi: 100, anskaffelsesverdi: 90, utbytte_i_aar: 0 }),
    ).rejects.toThrow('Verdipapiret finnes ikke lenger')
  })
})

describe('oppdaterVerdipapir / slettVerdipapir — samme kontrakt som eiendom', () => {
  it('oppdaterVerdipapir kaster når gammel verdi ikke kan leses', async () => {
    mockFrom.mockImplementation((tabell: string) => {
      if (tabell === 'fond_verdipapir') return lagChain(null, { message: 'DB nede' })
      return lagChain(null)
    })

    await expect(
      oppdaterVerdipapir({ id: 'v-1', navn: 'Aksjefond', type: 'fond', verdi: 100, anskaffelsesverdi: 90, utbytte_i_aar: 0 }),
    ).rejects.toThrow('Kunne ikke lese gjeldende verdi for historikk')
  })

  it('slettVerdipapir kaster når gammel verdi ikke kan leses', async () => {
    mockFrom.mockImplementation((tabell: string) => {
      if (tabell === 'fond_verdipapir') return lagChain(null, { message: 'DB nede' })
      return lagChain(null)
    })

    await expect(slettVerdipapir('v-1')).rejects.toThrow('Kunne ikke lese gjeldende verdi for historikk')
  })
})

describe('oppdaterKontantSaldo — maybeSingle skiller «ikke seedet ennå» fra ekte feil', () => {
  it('singleton finnes ikke ennå (data=null, error=null): fortsetter med gammel_verdi=0', async () => {
    const historikkInsertSpy = vi.fn().mockResolvedValue({ data: null, error: null })
    mockFrom.mockImplementation((tabell: string) => {
      if (tabell === 'fond_kontant') {
        const chain = lagChain(null) // ingen rad, ingen feil — legitim tilstand
        chain.then = (resolve: (v: unknown) => void) =>
          Promise.resolve({ data: null, error: null }).then(resolve)
        return chain
      }
      if (tabell === 'fond_verdi_historikk') {
        const chain = lagChain(null)
        chain.insert = historikkInsertSpy
        return chain
      }
      return lagChain(null)
    })

    await oppdaterKontantSaldo(500)

    expect(historikkInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ kilde: 'kontant', gammel_verdi: 0, ny_verdi: 500 }),
    )
    expect(mockLoggFeil).not.toHaveBeenCalled()
  })

  it('ekte DB-feil ved lesing av gammel saldo: kaster, skriver aldri ny saldo', async () => {
    const upsertSpy = vi.fn()
    mockFrom.mockImplementation((tabell: string) => {
      if (tabell === 'fond_kontant') {
        const chain = lagChain(null, { message: 'DB nede' })
        chain.upsert = upsertSpy.mockReturnValue(chain)
        return chain
      }
      return lagChain(null)
    })

    await expect(oppdaterKontantSaldo(500)).rejects.toThrow('Kunne ikke lese gjeldende saldo for historikk')
    expect(upsertSpy).not.toHaveBeenCalled()
    expect(mockLoggFeil).toHaveBeenCalledWith('fond.kontant.oppslag.feilet', expect.anything())
  })
})
