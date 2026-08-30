import { describe, it, expect, vi, beforeEach } from 'vitest'
import { formatInTimeZone } from 'date-fns-tz'
import { TIDSSONE } from '@/lib/dato'
import { lagChain } from './helpers/supabase-mock'

const mockSendVarsel = vi.fn().mockResolvedValue({ utfall: 'sendt', levert: 1, kunApp: 0, dedupHoppet: 0 })
const mockSendChatVarsler = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/varsler', () => ({
  sendVarsel: (...args: unknown[]) => mockSendVarsel(...args),
  sendChatVarsler: (...args: unknown[]) => mockSendChatVarsler(...args),
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
                // visningsnavn er kallenavnet og skal være ULIKT navn i
                // fixturen — settes de like, kan en tagg bygget på feil
                // kolonne aldri oppdages (review-funn på #642).
                navn: 'Ola Nordmann',
                visningsnavn: 'Ola',
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
          return lagChain({ id: 'eksisterende-post', innhold: 'Gratulerer med dagen @Ola! 🎉' })
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

// #642: den automatiske gratulasjonen skal utløse nøyaktig det samme som en
// menneskeskrevet chat-post — sendChatVarsler(), ikke bare det dedikerte
// bursdagsgratulasjon-varselet (som er utenfor scope her, se #643).
describe('kjorBursdagsgratulasjon – chat-varsel (#642)', () => {
  function lagAdmin(klubbChatData: unknown) {
    let profilesKall = 0
    return {
      from: vi.fn((tabell: string) => {
        if (tabell === 'profiles') {
          profilesKall++
          if (profilesKall === 1) {
            return lagChain([
              {
                id: 'barn1',
                // visningsnavn er kallenavnet og skal være ULIKT navn i
                // fixturen — settes de like, kan en tagg bygget på feil
                // kolonne aldri oppdages (review-funn på #642).
                navn: 'Ola Nordmann',
                visningsnavn: 'Ola',
                fodselsdato: `2000-${dagStr}`,
              },
            ])
          }
          return lagChain([{ id: 'admin1', navn: 'Admin Adminsen' }])
        }
        if (tabell === 'klubb_chat') {
          return lagChain(klubbChatData)
        }
        return lagChain([])
      }),
    } as unknown as Admin
  }

  it('fersk post: sendChatVarsler kalles med teksten og en per-avsender dedup-nøkkel', async () => {
    // Ingen eksisterende post (maybeSingle gir null på null-input) — insert
    // skjer, og siste slot garanterer sending (skalSende = true).
    const admin = lagAdmin(null)

    const resultat = await kjorBursdagsgratulasjon(admin, { slotIndex: 3, totalSlots: 4 })

    expect(resultat.sendt).toBe(1)
    expect(mockSendChatVarsler).toHaveBeenCalledTimes(1)
    const [scope, tekst, avsenderId, harBilde, opts] = mockSendChatVarsler.mock.calls[0]
    expect(scope).toEqual({ type: 'klubb' })
    // Fullt navn, ikke kallenavnet ('Ola') — fixturen har dem ULIKE nettopp
    // for at denne assertionen skal kunne feile hvis koden bytter kolonne.
    expect(tekst).toMatch(/@Ola Nordmann/)
    expect(avsenderId).toBe('admin1')
    expect(harBilde).toBe(false)
    expect(opts).toEqual({
      dedupNoekkel: `bursdag-chat:barn1:${aarStr}:admin1`,
      nevnte: ['barn1'],
    })
  })

  it('post fra tidligere slot: sendChatVarsler kalles likevel, med innhold lest fra DB', async () => {
    const admin = lagAdmin({ id: 'eksisterende-post', innhold: 'Gratulerer med dagen @Ola Nordmann! 🎉' })

    const resultat = await kjorBursdagsgratulasjon(admin, { slotIndex: 2, totalSlots: 4 })

    expect(resultat.hoppet).toBe(1)
    expect(mockSendChatVarsler).toHaveBeenCalledWith(
      { type: 'klubb' },
      'Gratulerer med dagen @Ola Nordmann! 🎉',
      'admin1',
      false,
      { dedupNoekkel: `bursdag-chat:barn1:${aarStr}:admin1`, nevnte: ['barn1'] },
    )
  })

  it('fornavn kolliderer med en annen profil: taggen bruker fullt navn, og nevnte peker eksplisitt på barnet', async () => {
    // Flere medlemmer i klubben deler fornavn (her: to «Per») —
    // finnNevnte()s tekstmatching ville truffet begge på et rent fornavn.
    // Fiksen er todelt: (1) taggen i teksten er fullt `navn`, ikke
    // `visningsnavn` (som er kallenavnet, her «Per»), og (2) opts.nevnte
    // peker eksplisitt på barnets id uavhengig av teksten — sendChatVarsler
    // (testet for seg i chat-varsler.test.ts) skal derfor aldri trenge å
    // gjette hvilken Per det gjelder.
    let profilesKall = 0
    const admin = {
      from: vi.fn((tabell: string) => {
        if (tabell === 'profiles') {
          profilesKall++
          if (profilesKall === 1) {
            return lagChain([
              {
                id: 'per-hansen',
                navn: 'Per Hansen',
                visningsnavn: 'Per',
                fodselsdato: `2000-${dagStr}`,
              },
            ])
          }
          return lagChain([{ id: 'admin1', navn: 'Admin Adminsen' }])
        }
        if (tabell === 'klubb_chat') return lagChain(null)
        return lagChain([])
      }),
    } as unknown as Admin

    await kjorBursdagsgratulasjon(admin, { slotIndex: 3, totalSlots: 4 })

    const [, tekst, , , opts] = mockSendChatVarsler.mock.calls[0]
    expect(tekst).toContain('@Per Hansen')
    // Og aldri det tvetydige kallenavnet alene — «@Per!» ville truffet begge.
    expect(tekst).not.toMatch(/@Per(?! Hansen)/)
    expect(opts).toMatchObject({ nevnte: ['per-hansen'] })
  })

  it('slot-utsatt post: verken insert eller sendChatVarsler kalles', async () => {
    const admin = lagAdmin(null)
    // Math.random() = 1 er ALDRI < P for slotIndex 0 av 4 (P = 0.25) —
    // garanterer at skalSende blir false uten å mocke insert-kallet i seg selv.
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.999)

    const resultat = await kjorBursdagsgratulasjon(admin, { slotIndex: 0, totalSlots: 4 })

    expect(resultat.sendt).toBe(0)
    expect(resultat.hoppet).toBe(0)
    expect(mockSendChatVarsler).not.toHaveBeenCalled()
    expect(mockSendVarsel).not.toHaveBeenCalled()

    randomSpy.mockRestore()
  })

  it('sendChatVarsler kaster: feil telles, feilen logges, og det dedikerte varselet sendes fortsatt', async () => {
    const admin = lagAdmin(null)
    mockSendChatVarsler.mockRejectedValueOnce(new Error('sendChatVarsler feilet'))

    const resultat = await kjorBursdagsgratulasjon(admin, { slotIndex: 3, totalSlots: 4 })

    expect(resultat.sendt).toBe(1)
    expect(resultat.feil).toBe(1)
    expect(mockLoggFeil).toHaveBeenCalledWith(
      'bursdagsgratulasjon.chatvarsel.feilet',
      expect.any(Error),
      expect.objectContaining({ ctx: { profil_id: 'barn1' } }),
    )
    expect(mockSendVarsel).toHaveBeenCalledWith(
      expect.objectContaining({ mottakere: ['barn1'], type: 'bursdagsgratulasjon' }),
    )
  })
})
