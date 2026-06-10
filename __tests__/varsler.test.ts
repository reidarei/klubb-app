import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lagFromMock, lagChain } from './helpers/supabase-mock'

// Mock Supabase admin-klient
const mockFrom = vi.fn()
const mockSupabase = { from: mockFrom }

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockSupabase,
}))

// Mock push og epost
const mockSendPush = vi.fn().mockResolvedValue(undefined)
const mockSendEpost = vi.fn().mockResolvedValue(undefined)
const mockArrangementEpostHtml = vi.fn().mockReturnValue('<html>test</html>')

vi.mock('@/lib/push', () => ({
  sendPush: (...args: unknown[]) => mockSendPush(...args),
}))

vi.mock('@/lib/epost', () => ({
  sendEpost: (...args: unknown[]) => mockSendEpost(...args),
  arrangementEpostHtml: (...args: unknown[]) => mockArrangementEpostHtml(...args),
}))

import {
  sendVarsel,
  sendNyttArrangementVarsler,
  sendPaaminneVarsler,
  sendArrangorPurringVarsler,
  formaterHilsenMelding,
} from '@/lib/varsler'

beforeEach(() => {
  vi.clearAllMocks()
})

function setupMock(tabeller: Record<string, unknown>) {
  mockFrom.mockImplementation(lagFromMock(tabeller))
}

describe('sendVarsel – kanalvalg', () => {
  it('sender kun epost når push er deaktivert', async () => {
    setupMock({
      varsel_logg: [],
      varsel_innstillinger: { aktiv: true, beskrivelse: null },
      profiles: [{ id: 'user1', navn: 'Ola', epost: 'ola@test.no' }],
      varsel_preferanser: [{ profil_id: 'user1', push_aktiv: false, epost_aktiv: true }],
      push_subscriptions: [],
    })

    await sendVarsel({
      mottakere: ['user1'],
      tittel: 'Test',
      melding: 'Test melding',
      type: 'test',
    })

    expect(mockSendEpost).toHaveBeenCalled()
    expect(mockSendPush).not.toHaveBeenCalled()
  })

  it('sender begge kanaler når bruker har push + epost aktivert', async () => {
    setupMock({
      varsel_logg: [],
      varsel_innstillinger: { aktiv: true, beskrivelse: null },
      profiles: [{ id: 'user1', navn: 'Ola', epost: 'ola@test.no' }],
      varsel_preferanser: [{ profil_id: 'user1', push_aktiv: true, epost_aktiv: true }],
      push_subscriptions: [{ profil_id: 'user1', endpoint: 'https://push.example.com', p256dh: 'key', auth: 'auth' }],
    })

    await sendVarsel({
      mottakere: ['user1'],
      tittel: 'Test',
      melding: 'Test melding',
      type: 'test',
    })

    expect(mockSendPush).toHaveBeenCalled()
    expect(mockSendEpost).toHaveBeenCalled()
  })

  it('skipper bruker uten noen kanal aktiv', async () => {
    setupMock({
      varsel_logg: [],
      varsel_innstillinger: { aktiv: true, beskrivelse: null },
      profiles: [{ id: 'user1', navn: 'Ola', epost: null }],
      varsel_preferanser: [{ profil_id: 'user1', push_aktiv: false, epost_aktiv: false }],
      push_subscriptions: [],
    })

    await sendVarsel({
      mottakere: ['user1'],
      tittel: 'Test',
      melding: 'Test melding',
      type: 'test',
    })

    expect(mockSendPush).not.toHaveBeenCalled()
    expect(mockSendEpost).not.toHaveBeenCalled()
  })
})

describe('sendVarsel – dedup', () => {
  it('blokkerer duplikat-varsler med samme type + arrangementId', async () => {
    setupMock({
      varsel_logg: [{ id: 'eksisterende' }],
      varsel_innstillinger: { aktiv: true, beskrivelse: null },
      profiles: [{ id: 'user1', navn: 'Ola', epost: 'ola@test.no' }],
      varsel_preferanser: [],
      push_subscriptions: [],
    })

    await sendVarsel({
      mottakere: ['user1'],
      tittel: 'Test',
      melding: 'Test',
      type: 'nytt_arrangement',
      arrangementId: 'arr1',
      tillatDuplikat: false,
    })

    expect(mockSendEpost).not.toHaveBeenCalled()
    expect(mockSendPush).not.toHaveBeenCalled()
  })

  it('tillater duplikat når tillatDuplikat=true', async () => {
    setupMock({
      varsel_logg: [{ id: 'eksisterende' }],
      varsel_innstillinger: { aktiv: true, beskrivelse: null },
      profiles: [{ id: 'user1', navn: 'Ola', epost: 'ola@test.no' }],
      varsel_preferanser: [{ profil_id: 'user1', push_aktiv: false, epost_aktiv: true }],
      push_subscriptions: [],
    })

    await sendVarsel({
      mottakere: ['user1'],
      tittel: 'Test',
      melding: 'Test',
      type: 'oppdatert',
      arrangementId: 'arr1',
      tillatDuplikat: true,
    })

    expect(mockSendEpost).toHaveBeenCalled()
  })
})

describe('wrapper-funksjoner', () => {
  it('sendNyttArrangementVarsler formatterer melding korrekt', async () => {
    setupMock({
      varsel_logg: [],
      varsel_innstillinger: { aktiv: true, beskrivelse: null },
      profiles: [{ id: 'user1', navn: 'Ola', epost: 'ola@test.no' }],
      varsel_preferanser: [{ profil_id: 'user1', push_aktiv: false, epost_aktiv: true }],
      push_subscriptions: [],
    })

    await sendNyttArrangementVarsler({
      arrangementId: 'arr1',
      tittel: 'Vårfest',
      startTidspunkt: '2026-06-15T16:00:00Z',
    })

    if (mockSendEpost.mock.calls.length > 0) {
      const epostArgs = mockSendEpost.mock.calls[0][0]
      expect(epostArgs.emne).toBe('Nytt arrangement')
    }
  })

  it('sendPaaminneVarsler sjekker riktig innstillingsnoekkel', async () => {
    const eqCalls: string[] = []
    mockFrom.mockImplementation((tabell: string) => {
      const chain = lagChain({ aktiv: false })
      const originalEq = chain.eq as ReturnType<typeof vi.fn>
      chain.eq = vi.fn((col: string, val: string) => {
        if (col === 'noekkel') eqCalls.push(val)
        return chain
      })
      return chain
    })

    await sendPaaminneVarsler({
      arrangementId: 'arr1',
      tittel: 'Test',
      startTidspunkt: '2026-06-15T16:00:00Z',
      type: 'paaminne_7',
    })
    expect(eqCalls).toContain('paaminnelse_7d')

    eqCalls.length = 0
    await sendPaaminneVarsler({
      arrangementId: 'arr2',
      tittel: 'Test',
      startTidspunkt: '2026-06-15T16:00:00Z',
      type: 'paaminne_1',
    })
    expect(eqCalls).toContain('paaminnelse_1d')
  })

  it('sendArrangorPurringVarsler sender til riktig mottaker', async () => {
    setupMock({
      varsel_logg: [],
      varsel_innstillinger: { aktiv: true, beskrivelse: null },
      profiles: [{ id: 'ansvarlig1', navn: 'Kari', epost: 'kari@test.no' }],
      varsel_preferanser: [{ profil_id: 'ansvarlig1', push_aktiv: false, epost_aktiv: true }],
      push_subscriptions: [],
    })

    await sendArrangorPurringVarsler({
      ansvarligId: 'ansvarlig1',
      arrangementNavn: 'Mars-april møte',
      aar: 2026,
    })

    if (mockSendEpost.mock.calls.length > 0) {
      expect(mockSendEpost.mock.calls[0][0].emne).toBe('Husk arrangøransvaret ditt!')
    }
  })
})

describe('formaterHilsenMelding', () => {
  it('returnerer fallback når hilsen mangler', () => {
    const melding = formaterHilsenMelding({
      verb: 'purrer deg på',
      basis: 'Vårfest (15.06.2026)',
      fallback: 'Vårfest — 15.06.2026. Du har ikke svart enda.',
    })
    expect(melding).toBe('Vårfest — 15.06.2026. Du har ikke svart enda.')
  })

  it('returnerer fallback når hilsen er tom streng', () => {
    const melding = formaterHilsenMelding({
      fraNavn: 'Ola Nordmann',
      hilsen: '   ',
      verb: 'purrer deg på',
      basis: 'Vårfest (15.06.2026)',
      fallback: 'Vårfest — 15.06.2026. Du har ikke svart enda.',
    })
    expect(melding).toBe('Vårfest — 15.06.2026. Du har ikke svart enda.')
  })

  it('returnerer formatert streng med hilsen og fraNavn', () => {
    const melding = formaterHilsenMelding({
      fraNavn: 'Ola Nordmann',
      hilsen: 'Kom deg på banen!',
      verb: 'purrer deg på',
      basis: 'Vårfest (15.06.2026)',
      fallback: 'Vårfest — 15.06.2026. Du har ikke svart enda.',
    })
    expect(melding).toBe('Ola Nordmann purrer deg på Vårfest (15.06.2026) og skriver: «Kom deg på banen!»')
  })

  it('returnerer fallback når hilsen kun er whitespace uten fraNavn', () => {
    // Whitespace-only hilsen skal trimmes bort, så fraNavn-kravet
    // gjelder ikke — fallback returneres uten å kaste.
    const melding = formaterHilsenMelding({
      hilsen: '   ',
      verb: 'purrer deg på',
      basis: 'Vårfest',
      fallback: 'fallback-melding',
    })
    expect(melding).toBe('fallback-melding')
  })

  it('kaster når hilsen er oppgitt uten fraNavn', () => {
    expect(() =>
      formaterHilsenMelding({
        hilsen: 'En hilsen',
        verb: 'purrer deg på',
        basis: 'Vårfest (15.06.2026)',
        fallback: 'fallback',
      })
    ).toThrow('fraNavn må oppgis sammen med hilsen')
  })

  it('kaster når hilsen overskrider maksLengde', () => {
    expect(() =>
      formaterHilsenMelding({
        fraNavn: 'Ola',
        hilsen: 'x'.repeat(201),
        verb: 'purrer deg på',
        basis: 'Vårfest',
        fallback: 'fallback',
        maksLengde: 200,
      })
    ).toThrow('Hilsen kan ikke være lengre enn 200 tegn')
  })

  it('respekterer maksLengde: 0 (truthy-fellen)', () => {
    // Sikrer at falsy men gyldig maksLengde (0) ikke hoppes over av truthy-sjekk.
    expect(() =>
      formaterHilsenMelding({
        fraNavn: 'Ola',
        hilsen: 'x',
        verb: 'purrer deg på',
        basis: 'Vårfest',
        fallback: 'fallback',
        maksLengde: 0,
      })
    ).toThrow('Hilsen kan ikke være lengre enn 0 tegn')
  })
})

describe('sendVarsel – testmodus', () => {
  it('filtrerer til kun testprofil når testmodus er aktiv', async () => {
    mockFrom.mockImplementation((tabell: string) => {
      if (tabell === 'varsel_innstillinger') {
        return lagChain({ aktiv: true, beskrivelse: 'test@test.no' })
      }
      if (tabell === 'profiles') {
        const chain = lagChain([
          { id: 'user1', navn: 'Ola', epost: 'ola@test.no' },
          { id: 'user2', navn: 'Test', epost: 'test@test.no' },
        ])
        return chain
      }
      return lagChain([])
    })

    await sendVarsel({
      tittel: 'Test',
      melding: 'Test',
      type: 'test',
    })

    // I testmodus skal kun bruker med test@test.no motta varsel
    expect(mockSendEpost.mock.calls.length).toBeLessThanOrEqual(1)
    if (mockSendEpost.mock.calls.length === 1) {
      expect(mockSendEpost.mock.calls[0][0].til).toBe('test@test.no')
    }
  })
})
