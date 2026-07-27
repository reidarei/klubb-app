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
  sendChatMentionVarsler,
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
    // sendEpostBatch kalles ubetinget, men skal ha fått en tom liste her —
    // se kommentaren i testen over for hvorfor vi asserter på innhold, ikke kall-status.
    expect(mockSendEpostBatch).toHaveBeenCalledWith([])
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

  it('regresjonsvakt: broadcast med 0 aktive profiler og error: null kaster ikke, men logges', async () => {
    setupMock({
      varsel_logg: [],
      varsel_innstillinger: { aktiv: true, beskrivelse: null },
      profiles: [],
      varsel_preferanser: [],
      push_subscriptions: [],
    })

    await expect(
      sendVarsel({ tittel: 'Test', melding: 'Test', type: 'test' }),
    ).resolves.not.toThrow()

    expect(mockSendPush).not.toHaveBeenCalled()
    expect(mockSendEpostBatch).not.toHaveBeenCalled()
    // En broadcast som ikke treffer noen er ikke nødvendigvis feil, men den er
    // mistenkelig nok til at den ikke skal være stille. `count: 0` = broadcast. (#503-review)
    expect(mockLoggWarn).toHaveBeenCalledWith(
      'varsel.mottakere.tomme',
      expect.objectContaining({ sample: 'test', count: 0 }),
    )
  })
})
