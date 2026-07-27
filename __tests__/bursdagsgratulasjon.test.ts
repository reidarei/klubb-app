import { describe, it, expect, vi, beforeEach } from 'vitest'
import { formatInTimeZone } from 'date-fns-tz'
import { TIDSSONE } from '@/lib/dato'
import { lagChain } from './helpers/supabase-mock'

const mockSendVarsel = vi.fn().mockResolvedValue({ utfall: 'sendt', levert: 1, kunApp: 0, dedupHoppet: 0 })
vi.mock('@/lib/varsler', () => ({
  sendVarsel: (...args: unknown[]) => mockSendVarsel(...args),
}))

vi.mock('@/lib/roller', () => ({
  rollerMed: () => ['admin', 'generalsekretaer'],
}))

const mockLoggWarn = vi.fn()
const mockLoggFeil = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/logg', () => ({
  logg: {
    warn: (...args: unknown[]) => mockLoggWarn(...args),
    feil: (...args: unknown[]) => mockLoggFeil(...args),
  },
}))

import { kjorBursdagsgratulasjon } from '@/lib/actions/bursdagsgratulasjon'

beforeEach(() => {
  vi.clearAllMocks()
})

// Dagens dato som MM-DD/YYYY i norsk tid — samme beregning som modulen selv
// bruker, slik at fødselsdatoene i testene alltid treffer «i dag» uansett
// hvilken dato testene faktisk kjører på.
const idag = new Date()
const dagStr = formatInTimeZone(idag, TIDSSONE, 'MM-dd')
const aarStr = formatInTimeZone(idag, TIDSSONE, 'yyyy')

type Admin = Parameters<typeof kjorBursdagsgratulasjon>[0]

describe('kjorBursdagsgratulasjon – #504', () => {
  it('profil-oppslag med error gir feil: 1, ingen varsler sendt', async () => {
    const admin = {
      from: vi.fn(() => lagChain([], new Error('DB nede'))),
    } as unknown as Admin

    const resultat = await kjorBursdagsgratulasjon(admin, { slotIndex: 0, totalSlots: 4 })

    expect(resultat).toEqual({ sendt: 0, hoppet: 0, feil: 1 })
    expect(mockLoggFeil).toHaveBeenCalledWith(
      'bursdagsgratulasjon.profiler.feilet',
      expect.any(Error),
    )
    expect(mockSendVarsel).not.toHaveBeenCalled()
  })

  it('sender varsel til bursdagsbarnet selv om chat-posten allerede finnes fra et tidligere slot', async () => {
    // Kjernen i #504-fiksen: `eksisterende`-grenen (posten postet i et
    // tidligere slot) satte tidligere ALDRI harPost/varselSendt-flagget slik
    // at varsel-koden ble nådd — «hoppet++; continue» hoppet forbi den helt.
    let profilesKall = 0
    const admin = {
      from: vi.fn((tabell: string) => {
        if (tabell === 'profiles') {
          profilesKall++
          if (profilesKall === 1) {
            // Bursdagsbarnet
            return lagChain([
              {
                id: 'barn1',
                navn: 'Ola Nordmann',
                visningsnavn: 'Ola Nordmann',
                fodselsdato: `2000-${dagStr}`,
              },
            ])
          }
          // Avsender-admin
          return lagChain([{ id: 'admin1', navn: 'Admin Adminsen' }])
        }
        if (tabell === 'klubb_chat') {
          // Posten finnes alt — simulerer at en tidligere slot/kjøring
          // allerede har postet gratulasjonen.
          return lagChain({ id: 'eksisterende-post' })
        }
        return lagChain([])
      }),
    } as unknown as Admin

    const resultat = await kjorBursdagsgratulasjon(admin, { slotIndex: 2, totalSlots: 4 })

    expect(resultat.hoppet).toBe(1)
    expect(resultat.sendt).toBe(0)
    expect(resultat.feil).toBe(0)
    expect(mockSendVarsel).toHaveBeenCalledWith(
      expect.objectContaining({
        mottakere: ['barn1'],
        type: 'bursdagsgratulasjon',
        dedupNoekkel: `bursdag:barn1:${aarStr}`,
      }),
    )
  })
})
