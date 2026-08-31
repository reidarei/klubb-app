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
})

// #642: den automatiske gratulasjonen skal utløse nøyaktig det samme som en
// menneskeskrevet chat-post — sendChatVarsler(), som etter #643 er ENESTE
// varsel til bursdagsbarnet (det tidligere dedikerte «Gratulerer med
// dagen!»-varselet er fjernet, se lib/actions/bursdagsgratulasjon.ts filhode).
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
                navn: 'Ola Nordmann',
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
    expect(tekst).toMatch(/@Ola Nordmann/)
    expect(avsenderId).toBe('admin1')
    expect(harBilde).toBe(false)
    expect(opts).toEqual({
      dedupNoekkel: `bursdag-chat:barn1:${aarStr}:admin1`,
      nevnte: ['barn1'],
    })
  })

  it('post fra tidligere slot: sendChatVarsler kalles likevel, ikke det slettede dedikerte varselet', async () => {
    // Kjernen i #504-fiksen (opprinnelig pinnet mot det dedikerte varselet,
    // fjernet i #643): `eksisterende`-grenen (posten postet i et tidligere
    // slot) satte tidligere ALDRI harPost/varselSendt-flagget slik at
    // varsel-koden ble nådd — «hoppet++; continue» hoppet forbi den helt.
    // Etter #643 er sendChatVarsler() eneste varsel, og dedup_noekkel
    // («bursdag-chat:{barnId}:{år}:{avsenderId}») er retry-korrektheten på
    // tvers av slots, ikke en lokal variabel.
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
    expect(mockSendVarsel).not.toHaveBeenCalled()
  })

  it('fornavn kolliderer med en annen profil: taggen bruker fullt navn, og nevnte peker eksplisitt på barnet', async () => {
    // Flere medlemmer i klubben deler fornavn (her: to «Per») —
    // finnNevnte()s tekstmatching ville truffet begge på et rent fornavn.
    // Fiksen er todelt: (1) taggen i teksten er fullt `navn`, ikke
    // kallenavnet, og (2) opts.nevnte peker eksplisitt på barnets id
    // uavhengig av teksten — sendChatVarsler (testet for seg i
    // chat-varsler.test.ts) skal derfor aldri trenge å gjette hvilken Per
    // det gjelder.
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

  it('sendChatVarsler kaster: feil telles og logges, det dedikerte varselet er ikke gjenopprettet', async () => {
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
    expect(mockSendVarsel).not.toHaveBeenCalled()
  })
})

// #643-vakt: bursdagsmannen skal få ETT varsel, ikke to. Regresjonsvakt mot
// at noen setter det dedikerte bursdagsgratulasjon-varselet tilbake ved
// siden av chat-mention-varselet.
describe('kjorBursdagsgratulasjon – ett varsel, ikke to (#643)', () => {
  it('én avsender, én bursdagsmann: mockSendVarsel kalles aldri, mockSendChatVarsler nøyaktig én gang', async () => {
    let profilesKall = 0
    const admin = {
      from: vi.fn((tabell: string) => {
        if (tabell === 'profiles') {
          profilesKall++
          if (profilesKall === 1) {
            return lagChain([{ id: 'barn1', navn: 'Ola Nordmann', fodselsdato: `2000-${dagStr}` }])
          }
          return lagChain([{ id: 'admin1', navn: 'Admin Adminsen' }])
        }
        if (tabell === 'klubb_chat') return lagChain(null)
        return lagChain([])
      }),
    } as unknown as Admin

    await kjorBursdagsgratulasjon(admin, { slotIndex: 3, totalSlots: 4 })

    expect(mockSendVarsel).not.toHaveBeenCalled()
    expect(mockSendChatVarsler).toHaveBeenCalledTimes(1)
  })
})
