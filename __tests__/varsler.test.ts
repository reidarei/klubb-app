import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lagFromMock, lagChain } from './helpers/supabase-mock'
import { BASE_URL } from '@/lib/config'

// Mock Supabase admin-klient
const mockFrom = vi.fn()
const mockSupabase = { from: mockFrom }

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockSupabase,
}))

// Mock push og epost
const mockSendPush = vi.fn().mockResolvedValue(undefined)
const mockSendEpost = vi.fn().mockResolvedValue(undefined)
const mockSendEpostBatch = vi.fn().mockResolvedValue(undefined)
const mockArrangementEpostHtml = vi.fn().mockReturnValue('<html>test</html>')

vi.mock('@/lib/push', () => ({
  sendPush: (...args: unknown[]) => mockSendPush(...args),
}))

// Logg mockes så vi kan asserte på advarselen for ikke-normaliserbare URL-er
// uten at den ekte loggeren prøver å skrive til feil_logg/Sentry.
// ÉN vi.mock per modul: to kall for samme modul hoistes begge, og den siste
// vinner stille — spionen i den første blir da aldri kalt. (#503-rebase)
// logg.feil awaites i lib/varsler.ts, så mocken må returnere en Promise. (#503)
const mockLoggWarn = vi.fn()
const mockLoggFeil = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/logg', () => ({
  logg: {
    warn: (...args: unknown[]) => mockLoggWarn(...args),
    feil: (...args: unknown[]) => mockLoggFeil(...args),
  },
}))

vi.mock('@/lib/epost', () => ({
  sendEpost: (...args: unknown[]) => mockSendEpost(...args),
  sendEpostBatch: (...args: unknown[]) => mockSendEpostBatch(...args),
  arrangementEpostHtml: (...args: unknown[]) => mockArrangementEpostHtml(...args),
}))

import {
  sendVarsel,
  sendNyttArrangementVarsler,
  sendPaaminneVarsler,
  sendArrangorPurringVarsler,
  sendNyPollVarsler,
  sendPurringVarsler,
  sendChatMentionVarsler,
  formaterHilsenMelding,
  byggPaaminne7Melding,
  byggPaaminne1Melding,
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

    // sendEpostBatch kalles ubetinget (early-return håndterer tom liste internt),
    // så vi asserter på innholdet i batchen fremfor bare at mocken ble kalt.
    expect(mockSendEpostBatch).toHaveBeenCalledWith([expect.objectContaining({ til: 'ola@test.no' })])
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
    expect(mockSendEpostBatch).toHaveBeenCalledWith([expect.objectContaining({ til: 'ola@test.no' })])
  })

  it('skriver varsel_logg-rad med kanal: kun_app for bruker uten noen kanal aktiv (#504)', async () => {
    // Navnet lyver ikke lenger: raden skal skrives (kanal: 'kun_app'), ikke
    // «skippes» — varsel_logg ER innboksen på /profil, og ingen mottaker skal
    // være usynlig for alle tre kanaler bare fordi push og epost er avslått.
    const insertSpy = vi.fn().mockReturnValue({
      select: () => ({
        single: () => Promise.resolve({ data: { id: 'ny-rad' }, error: null }),
      }),
    })
    mockFrom.mockImplementation((tabell: string) => {
      if (tabell === 'varsel_logg') {
        const chain = lagChain([])
        chain.insert = insertSpy
        return chain
      }
      if (tabell === 'varsel_innstillinger') return lagChain({ aktiv: true, beskrivelse: null })
      if (tabell === 'profiles') return lagChain([{ id: 'user1', navn: 'Ola', epost: null }])
      if (tabell === 'varsel_preferanser') {
        return lagChain([{ profil_id: 'user1', push_aktiv: false, epost_aktiv: false }])
      }
      return lagChain([])
    })

    const utfall = await sendVarsel({
      mottakere: ['user1'],
      tittel: 'Test',
      melding: 'Test melding',
      type: 'test',
    })

    expect(mockSendPush).not.toHaveBeenCalled()
    // sendEpostBatch kalles ubetinget, men skal ha fått en tom liste her —
    // se kommentaren i testen over for hvorfor vi asserter på innhold, ikke kall-status.
    expect(mockSendEpostBatch).toHaveBeenCalledWith([])
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ profil_id: 'user1', kanal: 'kun_app' }),
    )
    expect(utfall).toEqual({ utfall: 'sendt', levert: 0, kunApp: 1, dedupHoppet: 0 })
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

    // Dedup-sjekken returnerer tidlig — sendEpostBatch (og dermed varsel_logg-loopen) når aldri å kjøre.
    expect(mockSendEpostBatch).not.toHaveBeenCalled()
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

    expect(mockSendEpostBatch).toHaveBeenCalledWith([expect.objectContaining({ til: 'ola@test.no' })])
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

    // Batchen skal inneholde nøyaktig ett element til Ola med emnet fra wrapperen.
    // Ingen guard: mocken er satt opp med epost_aktiv, så en tom batch her ville
    // vært en reell regresjon vi vil at testen skal fange.
    expect(mockSendEpostBatch).toHaveBeenCalledWith([
      expect.objectContaining({ til: 'ola@test.no', emne: 'Nytt arrangement' }),
    ])
  })

  it('sendPaaminneVarsler sjekker riktig innstillingsnoekkel', async () => {
    const eqCalls: string[] = []
    mockFrom.mockImplementation((tabell: string) => {
      const chain = lagChain({ aktiv: false })
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
      oppmoetested: null,
      paameldinger: [],
    })
    expect(eqCalls).toContain('paaminnelse_7d')

    eqCalls.length = 0
    await sendPaaminneVarsler({
      arrangementId: 'arr2',
      tittel: 'Test',
      startTidspunkt: '2026-06-15T16:00:00Z',
      type: 'paaminne_1',
      oppmoetested: null,
      paameldinger: [],
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

    // Batchen skal inneholde nøyaktig ett element til den ansvarlige med
    // purre-emnet — ingen guard, jf. kommentaren i nytt-arrangement-testen over.
    expect(mockSendEpostBatch).toHaveBeenCalledWith([
      expect.objectContaining({ til: 'kari@test.no', emne: 'Husk arrangøransvaret ditt!' }),
    ])
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

describe('byggPaaminne7Melding', () => {
  // Alle asserts pinner EKSAKT streng (Reidars godkjente ordlyd, #591) — en
  // omformulering skal feile testen, ikke bare et innholdssjekk.
  const BASIS = {
    tittel: 'Vårfest',
    startTidspunkt: '2026-06-15T16:00:00Z',
    oppmoetested: 'Klubbhuset',
    antallPaameldt: 5,
  }

  it('med oppmøtested og flere påmeldte', () => {
    const melding = byggPaaminne7Melding({ ...BASIS, rsvp: 'ja' })
    expect(melding).toBe(
      'Det er syv dager til Vårfest, 15. juni. Oppmøte Klubbhuset kl. 18:00. 5 påmeldt så langt. Du har svart ja — vel møtt!'
    )
  })

  it('uten oppmøtested (null)', () => {
    const melding = byggPaaminne7Melding({ ...BASIS, oppmoetested: null, rsvp: 'ja' })
    expect(melding).toBe(
      'Det er syv dager til Vårfest, 15. juni. Vi starter kl. 18:00. 5 påmeldt så langt. Du har svart ja — vel møtt!'
    )
  })

  it('ingen påmeldte ennå', () => {
    const melding = byggPaaminne7Melding({ ...BASIS, antallPaameldt: 0, rsvp: 'ja' })
    expect(melding).toBe(
      'Det er syv dager til Vårfest, 15. juni. Oppmøte Klubbhuset kl. 18:00. Ingen har meldt seg på ennå. Du har svart ja — vel møtt!'
    )
  })

  it('entall når nøyaktig én er påmeldt', () => {
    const melding = byggPaaminne7Melding({ ...BASIS, antallPaameldt: 1, rsvp: 'ja' })
    expect(melding).toBe(
      'Det er syv dager til Vårfest, 15. juni. Oppmøte Klubbhuset kl. 18:00. 1 påmeldt så langt. Du har svart ja — vel møtt!'
    )
  })

  it('whitespace-only oppmøtested behandles som fraværende', () => {
    const melding = byggPaaminne7Melding({ ...BASIS, oppmoetested: '   ', rsvp: 'ja' })
    expect(melding).toBe(
      'Det er syv dager til Vårfest, 15. juni. Vi starter kl. 18:00. 5 påmeldt så langt. Du har svart ja — vel møtt!'
    )
  })

  it('kanskje-svarer bes om å bestemme seg', () => {
    const melding = byggPaaminne7Melding({ ...BASIS, rsvp: 'kanskje' })
    expect(melding).toBe(
      'Det er syv dager til Vårfest, 15. juni. Oppmøte Klubbhuset kl. 18:00. 5 påmeldt så langt. Du har svart kanskje — bestem deg, så arrangøren vet hvor mange han skal planlegge for.'
    )
  })

  it('den som har meldt avbud får verken oppmøtested eller påmeldingstall', () => {
    // Ikke bare en tekstvariant: hele detalj-blokken utelates for 'nei'. Testen
    // står her for å fange at noen senere «harmoniserer» de fire variantene.
    const melding = byggPaaminne7Melding({ ...BASIS, rsvp: 'nei' })
    expect(melding).toBe('Det er syv dager til Vårfest, 15. juni. Du har meldt avbud.')
    expect(melding).not.toContain('Klubbhuset')
    expect(melding).not.toContain('påmeldt')
  })

  it('den som ikke har svart bes om å gi beskjed', () => {
    const melding = byggPaaminne7Melding({ ...BASIS, rsvp: 'ikke_svart' })
    expect(melding).toBe(
      'Det er syv dager til Vårfest, 15. juni. Oppmøte Klubbhuset kl. 18:00. 5 påmeldt så langt. Du har ikke svart enda — gi beskjed, så arrangøren vet hvor mange han skal planlegge for.'
    )
  })
})

describe('sendPaaminneVarsler – riktig tekst per type', () => {
  // Begge grenene av type-ternæren i sendPaaminneVarsler pinnes e2e mot
  // arrangementEpostHtml. Kun 1-dagers-testen fantes før: snudde man ternæren
  // feil vei, fanget suiten det asymmetrisk, og byggPaaminne7Melding kunne
  // være aldri koblet til utsendingen uten at noen test merket det.
  const KANAL_EPOST = {
    varsel_logg: [],
    varsel_innstillinger: { aktiv: true, beskrivelse: null },
    profiles: [{ id: 'user1', navn: 'Ola', epost: 'ola@test.no' }],
    varsel_preferanser: [{ profil_id: 'user1', push_aktiv: false, epost_aktiv: true }],
    push_subscriptions: [],
  }

  // Fem «ja» så antallPaameldt-teksten blir «5 påmeldt så langt» uavhengig av
  // hvor mange profiler mocken returnerer.
  const FEM_JA = Array.from({ length: 5 }, (_, i) => ({ profil_id: `ja${i}`, status: 'ja' }))

  it('bruker 7-dagers-teksten for paaminne_7', async () => {
    setupMock(KANAL_EPOST)

    await sendPaaminneVarsler({
      arrangementId: 'arr1',
      tittel: 'Vårfest',
      startTidspunkt: '2026-06-15T16:00:00Z',
      type: 'paaminne_7',
      oppmoetested: 'Klubbhuset',
      paameldinger: [...FEM_JA, { profil_id: 'user1', status: 'ja' }],
    })

    expect(mockArrangementEpostHtml).toHaveBeenCalledWith(
      expect.objectContaining({
        tekst:
          'Det er syv dager til Vårfest, 15. juni. Oppmøte Klubbhuset kl. 18:00. 6 påmeldt så langt. Du har svart ja — vel møtt!',
      }),
    )
  })

  it('bruker "I morgen er det"-teksten for paaminne_1', async () => {
    setupMock({
      varsel_logg: [],
      varsel_innstillinger: { aktiv: true, beskrivelse: null },
      profiles: [{ id: 'user1', navn: 'Ola', epost: 'ola@test.no' }],
      varsel_preferanser: [{ profil_id: 'user1', push_aktiv: false, epost_aktiv: true }],
      push_subscriptions: [],
    })

    await sendPaaminneVarsler({
      arrangementId: 'arr1',
      tittel: 'Vårfest',
      startTidspunkt: '2026-06-15T16:00:00Z',
      type: 'paaminne_1',
      oppmoetested: 'Klubbhuset',
      paameldinger: FEM_JA,
    })

    expect(mockArrangementEpostHtml).toHaveBeenCalledWith(
      expect.objectContaining({
        tekst: 'I morgen er det Vårfest. Oppmøte Klubbhuset kl. 18:00. 5 påmeldt så langt. Vel møtt!',
      }),
    )
  })

  it('paaminne_1 går som ÉN broadcast, ikke gruppert', async () => {
    // Vokter at 1-dagers ikke ble dratt med i personaliseringen: én sending,
    // og uten mottakerliste (broadcast) slik den alltid har vært.
    setupMock(KANAL_EPOST)

    await sendPaaminneVarsler({
      arrangementId: 'arr1',
      tittel: 'Vårfest',
      startTidspunkt: '2026-06-15T16:00:00Z',
      type: 'paaminne_1',
      oppmoetested: 'Klubbhuset',
      paameldinger: [{ profil_id: 'user1', status: 'kanskje' }],
    })

    expect(mockSendEpostBatch).toHaveBeenCalledTimes(1)
  })
})

describe('sendPaaminneVarsler – 7-dagers grupperes per RSVP-status', () => {
  const PROFILER = [
    { id: 'ja1', navn: 'Ja', epost: 'ja@test.no' },
    { id: 'nei1', navn: 'Nei', epost: 'nei@test.no' },
    { id: 'kanskje1', navn: 'Kanskje', epost: 'kanskje@test.no' },
    { id: 'taus1', navn: 'Taus', epost: 'taus@test.no' },
  ]

  const PAAMELDINGER = [
    { profil_id: 'ja1', status: 'ja' },
    { profil_id: 'nei1', status: 'nei' },
    { profil_id: 'kanskje1', status: 'kanskje' },
    // taus1 har bevisst ingen rad — han skal havne i 'ikke_svart'.
  ]

  function setupFireProfiler() {
    setupMock({
      varsel_logg: [],
      varsel_innstillinger: { aktiv: true, beskrivelse: null },
      profiles: PROFILER,
      varsel_preferanser: PROFILER.map(p => ({
        profil_id: p.id,
        push_aktiv: false,
        epost_aktiv: true,
      })),
      push_subscriptions: [],
    })
  }

  async function send() {
    await sendPaaminneVarsler({
      arrangementId: 'arr1',
      tittel: 'Vårfest',
      startTidspunkt: '2026-06-15T16:00:00Z',
      type: 'paaminne_7',
      oppmoetested: 'Klubbhuset',
      paameldinger: PAAMELDINGER,
    })
  }

  it('hver mann får teksten som matcher hans eget svar', async () => {
    setupFireProfiler()
    await send()

    // E-postene kommer i samme rekkefølge som PROFILER (Promise.all over
    // profil-lista), så vi kan knytte tekst til mottaker via epostBatch.
    const batch = mockSendEpostBatch.mock.calls[0][0] as { til: string }[]
    const tekster = mockArrangementEpostHtml.mock.calls.map(([arg]) => (arg as { tekst: string }).tekst)
    const perMottaker = new Map(batch.map((e, i) => [e.til, tekster[i]]))

    expect(perMottaker.get('ja@test.no')).toContain('Du har svart ja — vel møtt!')
    expect(perMottaker.get('kanskje@test.no')).toContain('Du har svart kanskje — bestem deg')
    expect(perMottaker.get('nei@test.no')).toBe(
      'Det er syv dager til Vårfest, 15. juni. Du har meldt avbud.',
    )
    expect(perMottaker.get('taus@test.no')).toContain('Du har ikke svart enda')
  })

  it('går som ÉN sending, ikke fire grupperte kall', async () => {
    // Vokter valget dokumentert på melding-parameteren i sendVarsel: fire kall
    // ville gitt fire bryter-oppslag, fire Resend-batcher (rate limit-en fra
    // #478) og — verst — 'dedup' på kall 2–4 fordi dedup-sjekken på
    // (type, arrangement_id) er global. Én batch med fire ulike tekster er
    // beviset på at personaliseringen skjer inne i sendingen.
    setupFireProfiler()
    await send()

    expect(mockSendEpostBatch).toHaveBeenCalledTimes(1)
    expect(mockSendEpostBatch.mock.calls[0][0]).toHaveLength(4)
  })

  it('lagrer den personlige teksten i innboksen, ikke en felles', async () => {
    // varsel_logg ER innboksen på /profil. Fanger at melding-funksjonen
    // resolves før inserten, ikke bare på vei til push/e-post.
    const insertSpy = vi.fn().mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: { id: 'ny-rad' }, error: null }) }),
    })
    mockFrom.mockImplementation((tabell: string) => {
      const chain = lagChain(
        tabell === 'profiles'
          ? PROFILER
          : tabell === 'varsel_innstillinger'
            ? { aktiv: true, beskrivelse: null }
            : tabell === 'varsel_preferanser'
              ? PROFILER.map(p => ({ profil_id: p.id, push_aktiv: false, epost_aktiv: true }))
              : [],
      )
      if (tabell === 'varsel_logg') chain.insert = insertSpy
      return chain
    })

    await send()

    const lagret = new Map(
      insertSpy.mock.calls.map(([rad]) => [
        (rad as { profil_id: string }).profil_id,
        (rad as { melding: string }).melding,
      ]),
    )
    expect(lagret.get('nei1')).toBe('Det er syv dager til Vårfest, 15. juni. Du har meldt avbud.')
    expect(lagret.get('kanskje1')).toContain('bestem deg')
  })
})

describe('byggPaaminne1Melding', () => {
  it('med oppmøtested og flere påmeldte', () => {
    expect(
      byggPaaminne1Melding({
        tittel: 'Vårfest',
        startTidspunkt: '2026-06-15T16:00:00Z',
        oppmoetested: 'Klubbhuset',
        antallPaameldt: 5,
      }),
    ).toBe('I morgen er det Vårfest. Oppmøte Klubbhuset kl. 18:00. 5 påmeldt så langt. Vel møtt!')
  })

  it('uten oppmøtested (null) — faller tilbake til «Vi starter»', () => {
    expect(
      byggPaaminne1Melding({
        tittel: 'Vårfest',
        startTidspunkt: '2026-06-15T16:00:00Z',
        oppmoetested: null,
        antallPaameldt: 5,
      }),
    ).toBe('I morgen er det Vårfest. Vi starter kl. 18:00. 5 påmeldt så langt. Vel møtt!')
  })

  it('whitespace-only oppmøtested behandles som fraværende', () => {
    expect(
      byggPaaminne1Melding({
        tittel: 'Vårfest',
        startTidspunkt: '2026-06-15T16:00:00Z',
        oppmoetested: '   ',
        antallPaameldt: 5,
      }),
    ).toBe('I morgen er det Vårfest. Vi starter kl. 18:00. 5 påmeldt så langt. Vel møtt!')
  })

  it('ingen påmeldte ennå', () => {
    expect(
      byggPaaminne1Melding({
        tittel: 'Vårfest',
        startTidspunkt: '2026-06-15T16:00:00Z',
        oppmoetested: 'Klubbhuset',
        antallPaameldt: 0,
      }),
    ).toBe('I morgen er det Vårfest. Oppmøte Klubbhuset kl. 18:00. Ingen har meldt seg på ennå. Vel møtt!')
  })

  it('entall når nøyaktig én er påmeldt', () => {
    expect(
      byggPaaminne1Melding({
        tittel: 'Vårfest',
        startTidspunkt: '2026-06-15T16:00:00Z',
        oppmoetested: 'Klubbhuset',
        antallPaameldt: 1,
      }),
    ).toBe('I morgen er det Vårfest. Oppmøte Klubbhuset kl. 18:00. 1 påmeldt så langt. Vel møtt!')
  })

  // Datoen skal IKKE stå i teksten — «I morgen» gir den allerede. Pinnes fordi
  // en fremtidig refaktor lett kan gjenbruke formaterDatoKlokke ved et uhell.
  it('utelater datoen', () => {
    const melding = byggPaaminne1Melding({
      tittel: 'Vårfest',
      startTidspunkt: '2026-06-15T16:00:00Z',
      oppmoetested: null,
      antallPaameldt: 5,
    })
    expect(melding).not.toContain('juni')
  })
})

describe('sendChatMentionVarsler – @ gir varsel', () => {
  // Kontrakten gutta faktisk merker: skriver noen @Navn i en chat, skal den
  // som nevnes få et varsel. Fram til nå fantes bare feilstien i test (kaster
  // når profil-oppslaget feiler), så en regresjon som stille sluttet å varsle
  // ville passert grønt.
  const ALLE_PROFILER = [
    { id: 'avsender1', navn: 'Nils Nordmann', visningsnavn: 'Nils', epost: 'nils@test.no' },
    { id: 'user1', navn: 'Ola Nordmann', visningsnavn: 'Ola', epost: 'ola@test.no' },
    { id: 'user2', navn: 'Per Hansen', visningsnavn: 'Per', epost: 'per@test.no' },
  ]

  // Egen profiles-chain fordi lagChain ignorerer filtrene: profiles spørres TO
  // ganger her — først av sendChatMentionVarsler (alle aktive, for å matche
  // @-navnet), så av sendVarsel med .in('id', mottakere). Respekterer ikke den
  // andre .in(), får alle e-post, og testen kan ikke skille «Ola ble varslet»
  // fra «alle ble varslet» — altså nøyaktig det den skal måle.
  function profilChain() {
    let idFilter: string[] | null = null
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'gt', 'gte', 'lt', 'is', 'not', 'limit', 'order', 'neq']) {
      chain[m] = vi.fn().mockReturnValue(chain)
    }
    chain.in = vi.fn((_kol: string, verdier: string[]) => {
      idFilter = verdier
      return chain
    })
    const resultat = () => ({
      data: idFilter ? ALLE_PROFILER.filter(p => idFilter!.includes(p.id)) : ALLE_PROFILER,
      error: null,
    })
    chain.then = (resolve: (v: unknown) => void) => Promise.resolve(resultat()).then(resolve)
    chain.maybeSingle = vi.fn(async () => ({ data: resultat().data[0] ?? null, error: null }))
    return chain
  }

  function mentionOppsett() {
    const rest = lagFromMock({
      varsel_logg: [],
      varsel_innstillinger: { aktiv: true, beskrivelse: null },
      varsel_preferanser: [
        { profil_id: 'user1', push_aktiv: true, epost_aktiv: true },
        { profil_id: 'user2', push_aktiv: true, epost_aktiv: true },
      ],
      push_subscriptions: [
        { profil_id: 'user1', endpoint: 'https://push.example.com', p256dh: 'key', auth: 'auth' },
        { profil_id: 'user2', endpoint: 'https://push.example.com/2', p256dh: 'key', auth: 'auth' },
      ],
    })
    mockFrom.mockImplementation((tabell: string) =>
      tabell === 'profiles' ? profilChain() : rest(tabell),
    )
  }

  it('varsler den som nevnes med @', async () => {
    mentionOppsett()

    await sendChatMentionVarsler({ type: 'klubb' }, 'Grattis med dagen @Ola!', 'avsender1')

    expect(mockSendPush).toHaveBeenCalled()
    // Kun Ola — Per var ikke nevnt.
    expect(mockSendEpostBatch).toHaveBeenCalledWith([
      expect.objectContaining({ til: 'ola@test.no' }),
    ])
  })

  it('setter avsenderens navn i meldinga', async () => {
    mentionOppsett()

    await sendChatMentionVarsler({ type: 'klubb' }, 'Hei @Ola', 'avsender1')

    // Push-argumentene bærer teksten mottakeren ser på låseskjermen.
    const push = mockSendPush.mock.calls[0]
    expect(JSON.stringify(push)).toContain('Nils: Hei @Ola')
  })

  it('varsler ikke avsenderen selv når han nevner seg selv', async () => {
    mentionOppsett()

    await sendChatMentionVarsler({ type: 'klubb' }, 'Dette er @Nils sitt ansvar', 'avsender1')

    expect(mockSendPush).not.toHaveBeenCalled()
  })

  it('@alle varsler alle andre enn avsenderen', async () => {
    mentionOppsett()

    await sendChatMentionVarsler({ type: 'klubb' }, '@alle husk møtet', 'avsender1')

    const batch = mockSendEpostBatch.mock.calls[0][0] as { til: string }[]
    expect(batch.map(e => e.til).sort()).toEqual(['ola@test.no', 'per@test.no'])
  })

  it('sender ingenting når teksten ikke har noen @', async () => {
    mentionOppsett()

    await sendChatMentionVarsler({ type: 'klubb' }, 'Ingen nevnt her', 'avsender1')

    expect(mockSendPush).not.toHaveBeenCalled()
    expect(mockSendEpostBatch).not.toHaveBeenCalled()
  })
})

describe('sendVarsel – URL-normalisering', () => {
  it('gjør relativ URL absolutt før den sendes til e-post-malen (#507)', async () => {
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
      url: '/chat',
    })

    // E-postklienter har ingen base-URL å resolve relative lenker mot —
    // uten normalisering blir href-en ubrukelig i innboksen.
    expect(mockArrangementEpostHtml).toHaveBeenCalledWith(
      expect.objectContaining({ url: `${BASE_URL}/chat` }),
    )
  })

  it('lar en allerede absolutt URL være uendret (ingen dobbelt-prefiksing)', async () => {
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
      url: `${BASE_URL}/poll/abc`,
    })

    expect(mockArrangementEpostHtml).toHaveBeenCalledWith(
      expect.objectContaining({ url: `${BASE_URL}/poll/abc` }),
    )
  })

  it('logger advarsel når URL-en verken er absolutt eller starter med /', async () => {
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
      url: 'chat',
    })

    // Vi kaster ikke — varselet skal ut — men feilen skal ikke være stille.
    expect(mockLoggWarn).toHaveBeenCalledWith(
      'varsel.url.relativ',
      expect.objectContaining({ sample: 'test' }),
    )
  })
})

describe('sendVarsel – dedup-nøkkel-fella (#518)', () => {
  it('logger advarsel når tillatDuplikat er false uten arrangementId/pollId/dedupNoekkel', async () => {
    setupMock({
      varsel_logg: [],
      varsel_innstillinger: { aktiv: true, beskrivelse: null },
      profiles: [{ id: 'user1', navn: 'Ola', epost: 'ola@test.no' }],
      varsel_preferanser: [{ profil_id: 'user1', push_aktiv: false, epost_aktiv: true }],
      push_subscriptions: [],
    })

    // Ingen av de tre nøklene er oppgitt, og tillatDuplikat er default false
    // (ikke oppgitt) — dedup-sjekkene lenger ned har ingenting å kjøre på.
    await sendVarsel({
      mottakere: ['user1'],
      tittel: 'Test',
      melding: 'Test melding',
      type: 'test-uten-noekkel',
    })

    expect(mockLoggWarn).toHaveBeenCalledWith(
      'varsel.dedup.ingen_noekkel',
      expect.objectContaining({ sample: 'test-uten-noekkel' }),
    )
  })

  it('logger IKKE advarselen når arrangementId er satt', async () => {
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
      type: 'test-med-arrangement',
      arrangementId: 'arr1',
    })

    expect(mockLoggWarn).not.toHaveBeenCalledWith(
      'varsel.dedup.ingen_noekkel',
      expect.anything(),
    )
  })

  it('logger IKKE advarselen når dedupNoekkel er satt', async () => {
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
      type: 'test-med-dedupnoekkel',
      dedupNoekkel: 'noe:unikt',
    })

    expect(mockLoggWarn).not.toHaveBeenCalledWith(
      'varsel.dedup.ingen_noekkel',
      expect.anything(),
    )
  })

  it('logger IKKE advarselen når tillatDuplikat er true', async () => {
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
      type: 'test-tillater-duplikat',
      tillatDuplikat: true,
    })

    expect(mockLoggWarn).not.toHaveBeenCalledWith(
      'varsel.dedup.ingen_noekkel',
      expect.anything(),
    )
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

    // I testmodus skal kun bruker med test@test.no motta varsel — batchen skal
    // ha nøyaktig ett element, med nøyaktig testadressen.
    const batch = mockSendEpostBatch.mock.calls[0]?.[0] ?? []
    expect(batch.length).toBe(1)
    expect(batch[0].til).toBe('test@test.no')
  })
})

// #503: styrende regel er «feil skal aldri føre til at noen får noe de ikke
// skulle hatt». Oppslag som beskytter mot uønsket utsending feiler LUKKET
// (kaster), mens dedup — som i verste fall bare gir et duplikat — feiler ÅPENT.
describe('sendVarsel – feilhåndtering', () => {
  it('kaster og sender ingenting når mottaker-oppslaget feiler', async () => {
    mockFrom.mockImplementation(
      lagFromMock(
        {
          varsel_logg: [],
          varsel_innstillinger: { aktiv: true, beskrivelse: null },
          push_subscriptions: [],
          varsel_preferanser: [],
        },
        { profiles: new Error('DB nede') },
      ),
    )

    await expect(
      sendVarsel({ mottakere: ['user1'], tittel: 'Test', melding: 'Test', type: 'test' }),
    ).rejects.toThrow()

    expect(mockSendPush).not.toHaveBeenCalled()
    expect(mockSendEpostBatch).not.toHaveBeenCalled()
  })

  it('kaster og sender ingenting når varsel_innstillinger feiler (fail-closed-vakten)', async () => {
    mockFrom.mockImplementation(lagFromMock({}, { varsel_innstillinger: new Error('DB nede') }))

    await expect(
      sendVarsel({ mottakere: ['user1'], tittel: 'Test', melding: 'Test', type: 'test' }),
    ).rejects.toThrow()

    expect(mockSendPush).not.toHaveBeenCalled()
    expect(mockSendEpostBatch).not.toHaveBeenCalled()
  })

  // Denne er selve overskriften i #503: et nytt-arrangement-varsel til hele
  // klubben som stille gikk til null personer fordi en feilet profiles-spørring
  // ga tomt array. Broadcast-stien (uten mottakerliste) går via hentProfiler og
  // var ikke pinnet av noen test. (#503-review)
  it('kaster på broadcast uten mottakerliste når profiles-oppslaget feiler', async () => {
    mockFrom.mockImplementation(
      lagFromMock(
        {
          varsel_logg: [],
          varsel_innstillinger: { aktiv: true, beskrivelse: null },
          varsel_preferanser: [],
          push_subscriptions: [],
        },
        { profiles: new Error('DB nede') },
      ),
    )

    await expect(
      sendVarsel({ tittel: 'Test', melding: 'Test', type: 'test' }),
    ).rejects.toThrow(/kunne ikke hente profiler/i)

    expect(mockSendPush).not.toHaveBeenCalled()
    expect(mockSendEpostBatch).not.toHaveBeenCalled()
  })

  it('kaster når test_modus-oppslaget feiler, selv om varseltype-oppslaget lykkes', async () => {
    // Begge oppslagene går mot varsel_innstillinger, så en tabell-bred feil ville
    // stoppet allerede i erVarselAktiv og maskert denne throw-en. Vi skiller på
    // nøkkelen i .eq() slik at kun test_modus-formen feiler. (#503-review)
    mockFrom.mockImplementation((tabell: string) => {
      if (tabell === 'varsel_innstillinger') {
        let noekkel = ''
        const chain = lagChain({ aktiv: true, beskrivelse: null })
        chain.eq = vi.fn((kol: string, verdi: string) => {
          if (kol === 'noekkel') noekkel = verdi
          return chain
        })
        chain.maybeSingle = vi.fn(() =>
          noekkel === 'test_modus'
            ? Promise.resolve({ data: null, error: new Error('DB nede') })
            : Promise.resolve({ data: { aktiv: true, beskrivelse: null }, error: null }),
        )
        return chain
      }
      if (tabell === 'profiles') return lagChain([{ id: 'user1', navn: 'Ola', epost: 'ola@test.no' }])
      if (tabell === 'varsel_preferanser') {
        return lagChain([{ profil_id: 'user1', push_aktiv: false, epost_aktiv: true }])
      }
      return lagChain([])
    })

    await expect(
      sendVarsel({ mottakere: ['user1'], tittel: 'Test', melding: 'Test', type: 'test' }),
    ).rejects.toThrow(/test_modus/)

    expect(mockSendPush).not.toHaveBeenCalled()
    expect(mockSendEpostBatch).not.toHaveBeenCalled()
  })

  it('kaster når varseltype-oppslaget feiler, selv om test_modus-oppslaget lykkes', async () => {
    // Speilvendt av testen over: uten denne maskerer de to varsel_innstillinger-
    // oppslagene hverandre begge veier — fjerner man throw-en i erVarselAktiv
    // faller kallet bare videre til test_modus-throw-en og testene ser grønt ut.
    // Mutasjonstestet: begge throw-ene er nå pinnet hver for seg. (#503-review)
    mockFrom.mockImplementation((tabell: string) => {
      if (tabell === 'varsel_innstillinger') {
        let noekkel = ''
        const chain = lagChain({ aktiv: true, beskrivelse: null })
        chain.eq = vi.fn((kol: string, verdi: string) => {
          if (kol === 'noekkel') noekkel = verdi
          return chain
        })
        chain.maybeSingle = vi.fn(() =>
          noekkel === 'test_modus'
            ? Promise.resolve({ data: { aktiv: false, beskrivelse: null }, error: null })
            : Promise.resolve({ data: null, error: new Error('DB nede') }),
        )
        return chain
      }
      if (tabell === 'profiles') return lagChain([{ id: 'user1', navn: 'Ola', epost: 'ola@test.no' }])
      if (tabell === 'varsel_preferanser') {
        return lagChain([{ profil_id: 'user1', push_aktiv: false, epost_aktiv: true }])
      }
      return lagChain([])
    })

    await expect(
      sendVarsel({ mottakere: ['user1'], tittel: 'Test', melding: 'Test', type: 'test' }),
    ).rejects.toThrow(/varsel-innstilling/)

    expect(mockSendPush).not.toHaveBeenCalled()
    expect(mockSendEpostBatch).not.toHaveBeenCalled()
  })

  it('kaster når fortids-sperren ikke kan leses (arrangementer-oppslaget feiler)', async () => {
    // En sperre vi ikke klarer å lese skal ikke tolkes som «ikke passert» — da
    // ville en transient DB-feil kunne pinge hele klubben om en gammel tur.
    mockFrom.mockImplementation(
      lagFromMock(
        {
          varsel_logg: [],
          varsel_innstillinger: { aktiv: true, beskrivelse: null },
          profiles: [{ id: 'user1', navn: 'Ola', epost: 'ola@test.no' }],
          varsel_preferanser: [{ profil_id: 'user1', push_aktiv: false, epost_aktiv: true }],
          push_subscriptions: [],
        },
        { arrangementer: new Error('DB nede') },
      ),
    )

    await expect(
      sendVarsel({
        mottakere: ['user1'],
        tittel: 'Test',
        melding: 'Test',
        type: 'paaminne_7',
        arrangementId: 'arr1',
      }),
    ).rejects.toThrow(/fortids-sperre/)

    expect(mockSendPush).not.toHaveBeenCalled()
    expect(mockSendEpostBatch).not.toHaveBeenCalled()
  })

  it('sendChatMentionVarsler kaster når profil-oppslaget feiler', async () => {
    // Samme klasse som mottaker-oppslaget: en feilet spørring skal ikke tolkes
    // som «ingen mentions å varsle».
    mockFrom.mockImplementation(lagFromMock({}, { profiles: new Error('DB nede') }))

    await expect(
      sendChatMentionVarsler({ type: 'klubb' }, '@alle husk møtet', 'avsender1'),
    ).rejects.toThrow(/@-mention/)

    expect(mockSendPush).not.toHaveBeenCalled()
    expect(mockSendEpostBatch).not.toHaveBeenCalled()
  })

  it('kaster og sender ingenting når varsel_preferanser feiler', async () => {
    mockFrom.mockImplementation(
      lagFromMock(
        {
          varsel_logg: [],
          varsel_innstillinger: { aktiv: true, beskrivelse: null },
          profiles: [{ id: 'user1', navn: 'Ola', epost: 'ola@test.no' }],
          push_subscriptions: [],
        },
        { varsel_preferanser: new Error('DB nede') },
      ),
    )

    await expect(
      sendVarsel({ mottakere: ['user1'], tittel: 'Test', melding: 'Test', type: 'test' }),
    ).rejects.toThrow()

    expect(mockSendPush).not.toHaveBeenCalled()
    expect(mockSendEpostBatch).not.toHaveBeenCalled()
  })

  it('kaster og sender ingenting når push_subscriptions feiler', async () => {
    mockFrom.mockImplementation(
      lagFromMock(
        {
          varsel_logg: [],
          varsel_innstillinger: { aktiv: true, beskrivelse: null },
          profiles: [{ id: 'user1', navn: 'Ola', epost: 'ola@test.no' }],
          varsel_preferanser: [{ profil_id: 'user1', push_aktiv: true, epost_aktiv: true }],
        },
        { push_subscriptions: new Error('DB nede') },
      ),
    )

    await expect(
      sendVarsel({ mottakere: ['user1'], tittel: 'Test', melding: 'Test', type: 'test' }),
    ).rejects.toThrow()

    expect(mockSendPush).not.toHaveBeenCalled()
    expect(mockSendEpostBatch).not.toHaveBeenCalled()
  })

  it('sender likevel når dedup-select feiler, og logg.feil kalles med feilobjektet (motsatt av oppslagene over)', async () => {
    mockFrom.mockImplementation(
      lagFromMock(
        {
          varsel_innstillinger: { aktiv: true, beskrivelse: null },
          profiles: [{ id: 'user1', navn: 'Ola', epost: 'ola@test.no' }],
          varsel_preferanser: [{ profil_id: 'user1', push_aktiv: false, epost_aktiv: true }],
          push_subscriptions: [],
        },
        { varsel_logg: new Error('DB nede') },
      ),
    )

    await sendVarsel({
      mottakere: ['user1'],
      tittel: 'Test',
      melding: 'Test',
      type: 'nytt_arrangement',
      arrangementId: 'arr1',
      tillatDuplikat: false,
    })

    expect(mockSendEpostBatch).toHaveBeenCalledWith([expect.objectContaining({ til: 'ola@test.no' })])
    // Fail-open er et valg om leveranse, ikke om synlighet: feilobjektet skal
    // være med (2. argument), ikke bare et event-navn. (#503-review)
    expect(mockLoggFeil).toHaveBeenCalledWith(
      'varsel.dedup.feilet',
      expect.any(Error),
      expect.objectContaining({ ctx: expect.objectContaining({ sample: 'nytt_arrangement' }) }),
    )
  })

  it('sender likevel når varsel_logg-insert feiler, og logg.feil kalles', async () => {
    // Håndrullet mock: select (dedup-sjekk) må lykkes mens insert (logging av
    // utsendingen) feiler — samme teknikk som testen for paaminnelse-nøkler over,
    // siden lagFromMock/lagChain ikke skiller mellom metoder på samme tabell.
    mockFrom.mockImplementation((tabell: string) => {
      if (tabell === 'varsel_logg') {
        const chain = lagChain([])
        chain.insert = vi.fn(() => ({
          select: () => ({
            single: () => Promise.resolve({ data: null, error: new Error('insert feilet') }),
          }),
        }))
        return chain
      }
      if (tabell === 'varsel_innstillinger') return lagChain({ aktiv: true, beskrivelse: null })
      if (tabell === 'profiles') return lagChain([{ id: 'user1', navn: 'Ola', epost: 'ola@test.no' }])
      if (tabell === 'varsel_preferanser') {
        return lagChain([{ profil_id: 'user1', push_aktiv: false, epost_aktiv: true }])
      }
      if (tabell === 'push_subscriptions') return lagChain([])
      return lagChain([])
    })

    await sendVarsel({ mottakere: ['user1'], tittel: 'Test', melding: 'Test', type: 'test' })

    expect(mockSendEpostBatch).toHaveBeenCalledWith([expect.objectContaining({ til: 'ola@test.no' })])
    expect(mockLoggFeil).toHaveBeenCalledWith('varsel.logg.insert.feilet', expect.anything(), expect.anything())
  })

  it('eksplisitt mottakerliste med 0 treff utenfor testmodus: ingen kast, ingen utsending, logg.warn kalles', async () => {
    setupMock({
      varsel_logg: [],
      varsel_innstillinger: { aktiv: true, beskrivelse: null },
      profiles: [],
      varsel_preferanser: [],
      push_subscriptions: [],
    })

    await expect(
      sendVarsel({ mottakere: ['user1'], tittel: 'Test', melding: 'Test', type: 'test' }),
    ).resolves.not.toThrow()

    expect(mockSendPush).not.toHaveBeenCalled()
    expect(mockSendEpostBatch).not.toHaveBeenCalled()
    expect(mockLoggWarn).toHaveBeenCalledWith('varsel.mottakere.tomme', expect.anything())
  })

  it('regresjonsvakt: broadcast med 0 aktive profiler og error: null kaster ikke, men eskaleres til logg.feil (#504)', async () => {
    setupMock({
      varsel_logg: [],
      varsel_innstillinger: { aktiv: true, beskrivelse: null },
      profiles: [],
      varsel_preferanser: [],
      push_subscriptions: [],
    })

    const utfall = await sendVarsel({ tittel: 'Test', melding: 'Test', type: 'test' })

    expect(mockSendPush).not.toHaveBeenCalled()
    expect(mockSendEpostBatch).not.toHaveBeenCalled()
    // #504: en broadcast som ikke treffer noen er den mest mistenkelige
    // ikke-feil-tilstanden i hele varslingskjernen (RLS-/grant-glipp mot
    // profiles) — logg.warn går ALDRI til Sentry, så den eskaleres til
    // logg.feil. ctx (ikke toppnivå sample) — se #517.
    expect(mockLoggWarn).not.toHaveBeenCalledWith('varsel.mottakere.tomme', expect.anything())
    expect(mockLoggFeil).toHaveBeenCalledWith(
      'varsel.mottakere.tomme',
      expect.anything(),
      expect.objectContaining({ ctx: expect.objectContaining({ sample: 'test' }) }),
    )
    expect(utfall).toEqual({ utfall: 'ingen_mottakere', levert: 0, kunApp: 0, dedupHoppet: 0 })
  })
})

// #504: VarselUtfall er kontrakten kallere bygger CAS-stempling på — hver
// tidlig-retur MÅ ha riktig diskriminant. blokkert_lokal er dekket separat
// i __tests__/varsler-blokkert.test.ts (krever modul-reimport med overstyrt
// VITEST-env, siden BLOKKER_UTSENDING regnes ut på modul-nivå).
describe('sendVarsel – VarselUtfall-diskriminant per tidlig-retur (#504)', () => {
  it('type_deaktivert når varsel_innstillinger.aktiv er false', async () => {
    setupMock({
      varsel_innstillinger: { aktiv: false, beskrivelse: null },
    })

    const utfall = await sendVarsel({
      mottakere: ['user1'],
      tittel: 'Test',
      melding: 'Test',
      type: 'test',
    })

    expect(utfall).toEqual({ utfall: 'type_deaktivert', levert: 0, kunApp: 0, dedupHoppet: 0 })
  })

  it('hendelse_passert når arrangementet allerede har startet', async () => {
    setupMock({
      varsel_innstillinger: { aktiv: true, beskrivelse: null },
      arrangementer: { start_tidspunkt: '2020-01-01T00:00:00Z' },
    })

    const utfall = await sendVarsel({
      mottakere: ['user1'],
      tittel: 'Test',
      melding: 'Test',
      type: 'paaminne_7',
      arrangementId: 'arr1',
    })

    expect(utfall).toEqual({ utfall: 'hendelse_passert', levert: 0, kunApp: 0, dedupHoppet: 0 })
  })

  it('dedup når en varsel_logg-rad for samme type+arrangementId alt finnes', async () => {
    setupMock({
      varsel_innstillinger: { aktiv: true, beskrivelse: null },
      varsel_logg: [{ id: 'eksisterende' }],
    })

    const utfall = await sendVarsel({
      mottakere: ['user1'],
      tittel: 'Test',
      melding: 'Test',
      type: 'nytt_arrangement',
      arrangementId: 'arr1',
      tillatDuplikat: false,
    })

    expect(utfall).toEqual({ utfall: 'dedup', levert: 0, kunApp: 0, dedupHoppet: 0 })
  })

  it('ingen_mottakere når en eksplisitt mottakerliste ikke gir treff', async () => {
    setupMock({
      varsel_innstillinger: { aktiv: true, beskrivelse: null },
      varsel_logg: [],
      profiles: [],
    })

    const utfall = await sendVarsel({
      mottakere: ['user1'],
      tittel: 'Test',
      melding: 'Test',
      type: 'test',
    })

    expect(utfall).toEqual({ utfall: 'ingen_mottakere', levert: 0, kunApp: 0, dedupHoppet: 0 })
  })

  it('sendt med korrekt levert-teller når varselet faktisk går ut', async () => {
    setupMock({
      varsel_logg: [],
      varsel_innstillinger: { aktiv: true, beskrivelse: null },
      profiles: [{ id: 'user1', navn: 'Ola', epost: 'ola@test.no' }],
      varsel_preferanser: [{ profil_id: 'user1', push_aktiv: false, epost_aktiv: true }],
      push_subscriptions: [],
    })

    const utfall = await sendVarsel({
      mottakere: ['user1'],
      tittel: 'Test',
      melding: 'Test',
      type: 'test',
    })

    expect(utfall).toEqual({ utfall: 'sendt', levert: 1, kunApp: 0, dedupHoppet: 0 })
  })
})

// #504: 23505 fra dedup_noekkel-unique-indeksen skal fanges PER MOTTAKER og
// aldri rive med seg resten av broadcasten.
describe('sendVarsel – dedup_noekkel per mottaker (#504)', () => {
  it('hopper over kun mottakeren som traff 23505, resten får epost, ingen throw', async () => {
    mockFrom.mockImplementation((tabell: string) => {
      if (tabell === 'varsel_logg') {
        const chain = lagChain([])
        chain.insert = vi.fn((rad: { profil_id: string }) => ({
          select: () => ({
            single: () =>
              rad.profil_id === 'user1'
                ? Promise.resolve({
                    data: null,
                    error: Object.assign(new Error('duplicate key'), { code: '23505' }),
                  })
                : Promise.resolve({ data: { id: `logg-${rad.profil_id}` }, error: null }),
          }),
        }))
        return chain
      }
      if (tabell === 'varsel_innstillinger') return lagChain({ aktiv: true, beskrivelse: null })
      if (tabell === 'profiles') {
        return lagChain([
          { id: 'user1', navn: 'Ola', epost: 'ola@test.no' },
          { id: 'user2', navn: 'Kari', epost: 'kari@test.no' },
        ])
      }
      if (tabell === 'varsel_preferanser') {
        return lagChain([
          { profil_id: 'user1', push_aktiv: false, epost_aktiv: true },
          { profil_id: 'user2', push_aktiv: false, epost_aktiv: true },
        ])
      }
      if (tabell === 'push_subscriptions') return lagChain([])
      return lagChain([])
    })

    const utfall = await sendVarsel({
      mottakere: ['user1', 'user2'],
      tittel: 'Test',
      melding: 'Test',
      type: 'bursdagsgratulasjon',
      dedupNoekkel: 'bursdag:barn1:2026',
    })

    // user1 traff 23505 (allerede kvittert) — hoppes stille over. user2 får
    // epost som normalt. Ingen throw ut av funksjonen uansett.
    expect(mockSendEpostBatch).toHaveBeenCalledWith([
      expect.objectContaining({ til: 'kari@test.no' }),
    ])
    expect(mockLoggFeil).not.toHaveBeenCalledWith(
      'varsel.logg.insert.feilet',
      expect.anything(),
      expect.anything(),
    )
    expect(utfall).toEqual({ utfall: 'sendt', levert: 1, kunApp: 0, dedupHoppet: 1 })
  })
})

// ─── ÉN PORT, IKKE TO (#547) ────────────────────────────────────────────────
// Bryter-oppslaget skal skje NØYAKTIG ett sted: i sendVarsel. Fram til #547
// gjorde fem wrapper-funksjoner samme oppslag selv, rett før de kalte
// sendVarsel som slo opp på nytt. To DB-spørringer der én holder — og verre:
// forsøket på å lage et unntak fra bryteren (ignorerAktivBryter) hoppet kun
// over den ytre sjekken, mens porten stoppet varselet likevel. Stille, med
// grønn kvittering til admin.
describe('bryter-oppslaget skjer kun i porten (#547)', () => {
  /** Teller oppslag mot varsel_innstillinger og returnerer `aktiv` per nøkkel. */
  function mockMedTeller(aktivPerNoekkel: Record<string, boolean>) {
    const spurteNoekler: string[] = []
    mockFrom.mockImplementation((tabell: string) => {
      // sendPurringVarsler (kanskje-raden under) beregner mottakere FØR sendVarsel
      // kalles, så den trenger en ekte kanskje-svarer for i det hele tatt å nå
      // porten som teller opp mot varsel_innstillinger. De andre wrapperne i
      // denne testen bryr seg ikke om profiles/paameldinger — de blokkeres av
      // sin egen (aktiv=false) nøkkel inne i sendVarsel før noen mottakere
      // hentes, så disse fallback-radene er harmløse for dem.
      if (tabell === 'paameldinger') return lagChain([{ profil_id: 'p1', status: 'kanskje' }])
      if (tabell === 'profiles') return lagChain([{ id: 'p1', navn: 'Ola', epost: 'ola@test.no' }])
      if (tabell !== 'varsel_innstillinger') return lagChain([])
      // Nøkkelen er ikke kjent når chainen lages — .eq('noekkel', x) kommer
      // etterpå — så maybeSingle leser den fra en lukket variabel.
      let noekkel = ''
      const chain = lagChain({ aktiv: true, beskrivelse: null }) as Record<string, unknown>
      chain.eq = vi.fn((col: string, val: string) => {
        if (col === 'noekkel') {
          noekkel = val
          spurteNoekler.push(val)
        }
        return chain
      })
      chain.maybeSingle = vi.fn(async () => ({
        data: { aktiv: aktivPerNoekkel[noekkel] ?? true, beskrivelse: null },
        error: null,
      }))
      return chain
    })
    return spurteNoekler
  }

  it.each([
    ['sendNyttArrangementVarsler', 'nytt_arrangement', () =>
      sendNyttArrangementVarsler({ arrangementId: 'a1', tittel: 'T', startTidspunkt: '2026-06-15T16:00:00Z' })],
    ['sendPaaminneVarsler', 'paaminnelse_7d', () =>
      sendPaaminneVarsler({ arrangementId: 'a1', tittel: 'T', startTidspunkt: '2026-06-15T16:00:00Z', type: 'paaminne_7', oppmoetested: null, paameldinger: [] })],
    ['sendArrangorPurringVarsler', 'arrangor_purring', () =>
      sendArrangorPurringVarsler({ ansvarligId: 'p1', arrangementNavn: 'Tur', aar: 2026 })],
    ['sendNyPollVarsler', 'ny_poll', () =>
      sendNyPollVarsler({ pollId: 'p1', spoersmaal: 'Hva?', svarfrist: '2026-06-15T16:00:00Z' })],
    ['sendPurringVarsler (kanskje)', 'purring_kanskje', () =>
      sendPurringVarsler({ arrangementId: 'a1', tittel: 'T', startTidspunkt: '2026-06-15T16:00:00Z', variant: 'kanskje' })],
  ])('%s slår opp %s nøyaktig én gang', async (_navn, forventetNoekkel, kall) => {
    const spurte = mockMedTeller({ [forventetNoekkel]: false })
    await kall()
    // Eksakt liste, ikke bare «forventetNoekkel forekommer én gang»: vakten skal
    // også fange at wrapperen slår opp en ANNEN bryter enn sin egen — det var
    // nøyaktig feilmodusen i #547. 'test_modus' filtreres bort fordi det ikke er
    // en bryter for noen varseltype, men en uavhengig sperre hentTestModus()
    // slår opp for alle typer på vei til mottakerlista (kun de wrapperne som
    // kommer forbi sin egen aktiv-sjekk rekker dit).
    expect(spurte.filter(n => n !== 'test_modus')).toEqual([forventetNoekkel])
  })

  it('manuell purring går ut selv når den automatiske purringen er skrudd av', async () => {
    // Selve bugen i #547: admin skrur av cron-purringen, trykker «Purre disse»,
    // får grønn kvittering — og ingen får noe.
    mockFrom.mockImplementation((tabell: string) => {
      if (tabell === 'varsel_innstillinger') {
        let noekkel = ''
        const chain = lagChain([]) as Record<string, unknown>
        chain.eq = vi.fn((col: string, val: string) => {
          if (col === 'noekkel') noekkel = val
          return chain
        })
        chain.maybeSingle = vi.fn(async () => ({
          // Den automatiske purringen er AV, den manuelle er PÅ.
          data: { aktiv: noekkel !== 'purring_aktiv', beskrivelse: null },
          error: null,
        }))
        return chain
      }
      if (tabell === 'paameldinger') return lagChain([])  // ingen har svart
      if (tabell === 'profiles') return lagChain([{ id: 'p1', navn: 'Ola', epost: 'ola@test.no' }])
      if (tabell === 'varsel_preferanser') return lagChain([{ profil_id: 'p1', push_aktiv: false, epost_aktiv: true }])
      if (tabell === 'push_subscriptions') return lagChain([])
      if (tabell === 'varsel_logg') return lagChain({ id: 'logg1' })
      return lagChain([])
    })

    await sendPurringVarsler({
      arrangementId: 'a1',
      tittel: 'Vårtur',
      startTidspunkt: '2026-06-15T16:00:00Z',
      fraNavn: 'Nils',
      hilsen: 'Kom igjen, gutta',
      variant: 'manuell',
    })

    expect(mockSendEpostBatch).toHaveBeenCalledWith([
      expect.objectContaining({ til: 'ola@test.no', emne: 'Husk å svare!' }),
    ])
  })

  it('kanskje-purring går ut selv når purring_aktiv og purring_manuell er AV (speiler #547)', async () => {
    // Samme feilmodus som testen over, men for den tredje varianten: en
    // regresjon som lot kanskje-purring lese purring_aktiv- eller
    // purring_manuell-bryteren ville stanset «Bestem dere» stille.
    mockFrom.mockImplementation((tabell: string) => {
      if (tabell === 'varsel_innstillinger') {
        let noekkel = ''
        const chain = lagChain([]) as Record<string, unknown>
        chain.eq = vi.fn((col: string, val: string) => {
          if (col === 'noekkel') noekkel = val
          return chain
        })
        chain.maybeSingle = vi.fn(async () => ({
          // purring_aktiv og purring_manuell er AV, purring_kanskje er PÅ.
          data: { aktiv: noekkel === 'purring_kanskje', beskrivelse: null },
          error: null,
        }))
        return chain
      }
      if (tabell === 'paameldinger') return lagChain([{ profil_id: 'p1', status: 'kanskje' }])
      if (tabell === 'profiles') return lagChain([{ id: 'p1', navn: 'Ola', epost: 'ola@test.no' }])
      if (tabell === 'varsel_preferanser') return lagChain([{ profil_id: 'p1', push_aktiv: false, epost_aktiv: true }])
      if (tabell === 'push_subscriptions') return lagChain([])
      if (tabell === 'varsel_logg') return lagChain({ id: 'logg1' })
      return lagChain([])
    })

    await sendPurringVarsler({
      arrangementId: 'a1',
      tittel: 'Vårtur',
      startTidspunkt: '2026-06-15T16:00:00Z',
      variant: 'kanskje',
    })

    expect(mockSendEpostBatch).toHaveBeenCalledWith([
      expect.objectContaining({ til: 'ola@test.no', emne: 'Bestem deg!' }),
    ])
  })

  it('automatisk purring stoppes fortsatt av sin egen bryter', async () => {
    // Speilvendt av testen over — uten denne kunne fiksen ha vært «skru av
    // sjekken for purring» i stedet for «gi manuell purring sin egen bryter».
    mockFrom.mockImplementation((tabell: string) => {
      if (tabell === 'varsel_innstillinger') {
        let noekkel = ''
        const chain = lagChain([]) as Record<string, unknown>
        chain.eq = vi.fn((col: string, val: string) => {
          if (col === 'noekkel') noekkel = val
          return chain
        })
        chain.maybeSingle = vi.fn(async () => ({
          data: { aktiv: noekkel !== 'purring_aktiv', beskrivelse: null },
          error: null,
        }))
        return chain
      }
      if (tabell === 'paameldinger') return lagChain([])
      if (tabell === 'profiles') return lagChain([{ id: 'p1', navn: 'Ola', epost: 'ola@test.no' }])
      if (tabell === 'varsel_preferanser') return lagChain([{ profil_id: 'p1', push_aktiv: false, epost_aktiv: true }])
      if (tabell === 'push_subscriptions') return lagChain([])
      if (tabell === 'varsel_logg') return lagChain({ id: 'logg1' })
      return lagChain([])
    })

    await sendPurringVarsler({
      arrangementId: 'a1',
      tittel: 'Vårtur',
      startTidspunkt: '2026-06-15T16:00:00Z',
    })

    expect(mockSendEpostBatch).not.toHaveBeenCalled()
  })
})

describe('sendPurringVarsler – kanskje treffer kun kanskje-gruppa (#596)', () => {
  // Delt fixture for begge tester under: p1 svarte ja, p2 kanskje, p3 nei,
  // p4 har ikke svart i det hele tatt, p5 svarte kanskje men er ikke en aktiv
  // profil (se paameldinger-fixturen). Kanskje-varianten skal treffe KUN p2.
  // Manuell (uten svar) skal treffe KUN p4 — speilvendt, og verifiserer at
  // utvidelsen av select til 'profil_id, status' ikke har endret uten_svar-
  // grenen, som fortsatt kun ser på HVEM som har svart, ikke MED HVA.
  //
  // Mocken (lagChain) filtrerer ikke faktisk på .in()/.eq() — den returnerer
  // hele tabellen uansett filter, i motsetning til ekte PostgREST. Derfor kan
  // vi ikke lese av sendEpostBatch-mottakerne direkte (de ville inkludert
  // alle fire uansett). Testen spionerer i stedet på .in('id', …)-kallet
  // sendVarsel gjør mot 'profiles' med den mottakerlisten sendPurringVarsler
  // regnet ut — det er nøyaktig linjen der filtreringslogikken lever.
  function mockMedInSpion() {
    const idKall: string[][] = []
    mockFrom.mockImplementation((tabell: string) => {
      if (tabell === 'paameldinger') {
        return lagChain([
          { profil_id: 'p1', status: 'ja' },
          { profil_id: 'p2', status: 'kanskje' },
          { profil_id: 'p3', status: 'nei' },
          // p5 svarte kanskje, men finnes IKKE i profiles-fixturen under — han
          // står for en som siden er deaktivert (eller filtrert bort av
          // testmodus). Uten denne raden er snittet med hentProfiler en no-op,
          // og en regresjon som purret rått over påmeldingsradene ville
          // passert testen.
          { profil_id: 'p5', status: 'kanskje' },
        ])
      }
      if (tabell === 'profiles') {
        const chain = lagChain([
          { id: 'p1', navn: 'Ola', epost: 'ola@test.no' },
          { id: 'p2', navn: 'Kari', epost: 'kari@test.no' },
          { id: 'p3', navn: 'Per', epost: 'per@test.no' },
          { id: 'p4', navn: 'Nils', epost: 'nils@test.no' },
        ]) as Record<string, unknown>
        chain.in = vi.fn((col: string, ids: string[]) => {
          if (col === 'id') idKall.push(ids)
          return chain
        })
        return chain
      }
      if (tabell === 'varsel_preferanser') {
        return lagChain([
          { profil_id: 'p2', push_aktiv: false, epost_aktiv: true },
          { profil_id: 'p4', push_aktiv: false, epost_aktiv: true },
        ])
      }
      if (tabell === 'push_subscriptions') return lagChain([])
      if (tabell === 'varsel_logg') return lagChain({ id: 'logg1' })
      // varsel_innstillinger uten data → default aktiv (se erVarselAktiv)
      return lagChain([])
    })
    return idKall
  }

  it('variant kanskje sender kun til p2', async () => {
    const idKall = mockMedInSpion()

    await sendPurringVarsler({
      arrangementId: 'a1',
      tittel: 'Vårtur',
      startTidspunkt: '2026-06-15T16:00:00Z',
      variant: 'kanskje',
    })

    expect(idKall).toEqual([['p2']])
  })

  it('variant manuell sender kun til p4 (uendret uten_svar-oppførsel)', async () => {
    const idKall = mockMedInSpion()

    await sendPurringVarsler({
      arrangementId: 'a1',
      tittel: 'Vårtur',
      startTidspunkt: '2026-06-15T16:00:00Z',
      variant: 'manuell',
    })

    expect(idKall).toEqual([['p4']])
  })
})
