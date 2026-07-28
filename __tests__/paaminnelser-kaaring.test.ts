import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lagChain } from './helpers/supabase-mock'

vi.mock('@/lib/dato', () => ({
  norskDatoNaa: () => new Date(2026, 5, 10),
  naa: () => '2026-06-10T00:00:00.000Z',
}))

const mockSendPaaminne = vi.fn().mockResolvedValue(undefined)
const mockSendPurring = vi.fn().mockResolvedValue(undefined)
const mockSendArrangorPurring = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/varsler', () => ({
  sendPaaminneVarsler: (...a: unknown[]) => mockSendPaaminne(...a),
  sendPurringVarsler: (...a: unknown[]) => mockSendPurring(...a),
  sendArrangorPurringVarsler: (...a: unknown[]) => mockSendArrangorPurring(...a),
}))

// Hele varsler-kaaringspoll-modulen mockes — testene her verifiserer
// KONTRAKTEN mellom paaminnelser.ts og disse tre funksjonene (kaller den dem
// riktig, stempler den kun på retur), ikke den interne logikken i modulen
// selv (dekket av __tests__/varsler-kaaringspoll.test.ts).
const mockBehandle = vi.fn()
const mockUtled = vi.fn().mockReturnValue('ingen_stemmer')
const mockStemple = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/varsler-kaaringspoll', () => ({
  behandleKaaringspollAvsluttResultat: (...a: unknown[]) => mockBehandle(...a),
  utledKaaringStatus: (...a: unknown[]) => mockUtled(...a),
  stempleKaaringspollVarslet: (...a: unknown[]) => mockStemple(...a),
  // Ekte implementasjon, ikke spion: guarden avgjør om koden i det hele tatt
  // når stemplingen, så en mock som returnerer undefined ville fått hver test
  // til å hoppe over — og de ville alle blitt grønne av feil grunn.
  erKaaringUtfall: (s: unknown) =>
    s === 'avgjort' || s === 'venter_paa_tiebreak' || s === 'ingen_stemmer',
}))

const mockLoggFeil = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/logg', () => ({
  logg: { warn: vi.fn(), feil: (...a: unknown[]) => mockLoggFeil(...a) },
}))

import { kjorPaaminnelser } from '@/lib/actions/paaminnelser'

beforeEach(() => {
  vi.clearAllMocks()
  mockUtled.mockReturnValue('ingen_stemmer')
  mockStemple.mockResolvedValue(undefined)
})

function lagAdmin({
  pollFersk = [],
  pollRetry = [],
  profiler = [],
  profilerFeil = null,
  rpcRes = {},
  arrangementerFeil = null,
  arrangoransvarFeil = null,
}: {
  pollFersk?: unknown[]
  pollRetry?: unknown[]
  profiler?: unknown[]
  profilerFeil?: Error | null
  rpcRes?: Record<string, { data: unknown; error: unknown }>
  arrangementerFeil?: Error | null
  arrangoransvarFeil?: Error | null
}) {
  let pollKall = 0
  return {
    from: vi.fn((tabell: string) => {
      if (tabell === 'arrangementer') return lagChain([], arrangementerFeil)
      if (tabell === 'arrangoransvar') return lagChain([], arrangoransvarFeil)
      if (tabell === 'poll') {
        pollKall++
        // Fresh-spørringen bygges (og dermed kalles from()) FØR retry-
        // spørringen i Promise.all-arrayet — se paaminnelser.ts.
        return lagChain(pollKall === 1 ? pollFersk : pollRetry)
      }
      if (tabell === 'profiles') return lagChain(profiler, profilerFeil)
      return lagChain([])
    }),
    rpc: vi.fn((_navn: string, args: { p_poll_id: string }) => {
      const res = rpcRes[args.p_poll_id]
      return Promise.resolve(res ?? { data: null, error: new Error('ikke mocket i test') })
    }),
  } as unknown as Parameters<typeof kjorPaaminnelser>[0] & { rpc: ReturnType<typeof vi.fn> }
}

describe('kjorPaaminnelser – kåringsvarsel-retry (#495/#504)', () => {
  it('stempler vinner_varslet_paa når behandleKaaringspollAvsluttResultat returnerer', async () => {
    mockBehandle.mockResolvedValueOnce({ sendt: true })
    const admin = lagAdmin({
      pollFersk: [{ id: 'poll1', spoersmaal: 'Årets X', tiebreak_status: null }],
      profiler: [{ id: 'gensek1', rolle: 'generalsekretaer' }],
      rpcRes: { poll1: { data: [{ var_ny: true, status: 'avgjort' }], error: null } },
    })

    const resultat = await kjorPaaminnelser(admin)

    expect(mockStemple).toHaveBeenCalledWith(admin, 'poll1', 'avgjort')
    expect(resultat.sendteVarsler).toBe(1)
    expect(resultat.lukketKaaringer).toBe(1)
    expect(resultat.feil).toBe(0)
  })

  it('ukjent status fra RPC-en: stempler ikke, teller som feil, prøver igjen i morgen', async () => {
    // Et gjett her ville stemplet feil kolonne og filtrert pollen permanent
    // bort fra retry — nøyaktig #521. Guarden skal hoppe over i stedet. Typen
    // fanger det ved kompilering; denne testen pinner oppførselen ved en
    // status som først dukker opp i runtime (ny RPC-verdi). (#521-review)
    const admin = lagAdmin({
      pollFersk: [{ id: 'poll9', spoersmaal: 'Årets Z', tiebreak_status: null }],
      profiler: [{ id: 'gensek1', rolle: 'generalsekretaer' }],
      rpcRes: { poll9: { data: [{ var_ny: true, status: 'noe_helt_nytt' }], error: null } },
    })

    const resultat = await kjorPaaminnelser(admin)

    expect(mockStemple).not.toHaveBeenCalled()
    expect(mockBehandle).not.toHaveBeenCalled()
    expect(resultat.feil).toBeGreaterThanOrEqual(1)
  })

  it('stempler IKKE når behandleKaaringspollAvsluttResultat kaster (sendVarsel feilet)', async () => {
    mockBehandle.mockRejectedValueOnce(new Error('epost-tjeneste nede'))
    const admin = lagAdmin({
      pollFersk: [{ id: 'poll2', spoersmaal: 'Årets Y', tiebreak_status: null }],
      profiler: [{ id: 'gensek1', rolle: 'generalsekretaer' }],
      rpcRes: { poll2: { data: [{ var_ny: true, status: 'avgjort' }], error: null } },
    })

    const resultat = await kjorPaaminnelser(admin)

    expect(mockStemple).not.toHaveBeenCalled()
    expect(resultat.feil).toBeGreaterThanOrEqual(1)
  })

  it('relevanteProfiler-feil gir kaaringFeil og kaller aldri behandleKaaringspollAvsluttResultat', async () => {
    // DEN ufravikelige (#504): uten fail-closed her ville en tom mottakerliste
    // gått videre til stempling — en poll som ser varslet ut, men der ingen
    // faktisk fikk beskjed.
    const admin = lagAdmin({
      pollFersk: [{ id: 'poll3', spoersmaal: 'Årets Z', tiebreak_status: null }],
      profilerFeil: new Error('DB nede'),
    })

    const resultat = await kjorPaaminnelser(admin)

    expect(mockBehandle).not.toHaveBeenCalled()
    expect(mockStemple).not.toHaveBeenCalled()
    expect(resultat.feil).toBeGreaterThanOrEqual(1)
  })

  it('retry-stien (poll allerede avsluttet) utleder status fra tiebreak_status og stempler ved retur', async () => {
    mockBehandle.mockResolvedValueOnce({ sendt: false })
    mockUtled.mockReturnValueOnce('avgjort')
    const admin = lagAdmin({
      pollRetry: [{ id: 'poll4', spoersmaal: 'Årets Å', tiebreak_status: 'avgjort' }],
      profiler: [{ id: 'admin1', rolle: 'admin' }],
      // var_ny: false — RPC-en fant en allerede lukket poll (#495-stien).
      rpcRes: { poll4: { data: [{ var_ny: false, status: 'allerede_avsluttet' }], error: null } },
    })

    const resultat = await kjorPaaminnelser(admin)

    expect(mockUtled).toHaveBeenCalledWith('avgjort')
    expect(mockBehandle).toHaveBeenCalledWith(
      expect.objectContaining({ pollId: 'poll4', status: 'avgjort' }),
    )
    expect(mockStemple).toHaveBeenCalledWith(admin, 'poll4', 'avgjort')
    // var_ny var false — RPC-en lukket den ikke NÅ, så telleren skal ikke øke.
    expect(resultat.lukketKaaringer).toBe(0)
  })

  it('retry-stien kaller ikke avslutt_kaaringspoll-RPC-en (pollen er alt lukket)', async () => {
    mockBehandle.mockResolvedValueOnce({ sendt: true })
    mockUtled.mockReturnValueOnce('venter_paa_tiebreak')
    const admin = lagAdmin({
      pollRetry: [{ id: 'poll5', spoersmaal: 'Årets Ø', tiebreak_status: 'venter_paa_tiebreak' }],
      profiler: [{ id: 'gensek1', rolle: 'generalsekretaer' }],
    })

    await kjorPaaminnelser(admin)

    expect((admin as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).not.toHaveBeenCalled()
    expect(mockStemple).toHaveBeenCalledWith(admin, 'poll5', 'venter_paa_tiebreak')
  })

  it('fersk poll med var_ny=false hverken varsler eller stempler (#504-review MAJOR-1)', async () => {
    // Kappløp/klokkeskew: pollen var åpen da vi leste den, men RPC-en lukket
    // den ikke. Uten proveniens ville var_ny=false sendt oss til
    // utledKaaringStatus(null) → «ingen stemte i kåringen» til alle admins,
    // OG stemplet vinner_varslet_paa slik at ekte vinnervarsel var tapt.
    const admin = lagAdmin({
      pollFersk: [{ id: 'poll6', spoersmaal: 'Årets Æ', tiebreak_status: null }],
      profiler: [{ id: 'admin1', rolle: 'admin' }],
      rpcRes: { poll6: { data: [{ var_ny: false, status: 'ikke_moden' }], error: null } },
    })

    const resultat = await kjorPaaminnelser(admin)

    expect(mockUtled).not.toHaveBeenCalled()
    expect(mockBehandle).not.toHaveBeenCalled()
    expect(mockStemple).not.toHaveBeenCalled()
    // Ikke en feil — bare utsatt til morgendagens retry-spørring.
    expect(resultat.feil).toBe(0)
    expect(resultat.lukketKaaringer).toBe(0)
    expect(resultat.sendteVarsler).toBe(0)
  })

  it('samme, for allerede_avsluttet (lukkKaaringspollNaa vant kappløpet)', async () => {
    const admin = lagAdmin({
      pollFersk: [{ id: 'poll7', spoersmaal: 'Årets Ä', tiebreak_status: null }],
      profiler: [{ id: 'admin1', rolle: 'admin' }],
      rpcRes: { poll7: { data: [{ var_ny: false, status: 'allerede_avsluttet' }], error: null } },
    })

    const resultat = await kjorPaaminnelser(admin)

    expect(mockBehandle).not.toHaveBeenCalled()
    expect(mockStemple).not.toHaveBeenCalled()
    expect(resultat.feil).toBe(0)
  })

  it('tom RPC-retur logges med egen kode og telles som feil', async () => {
    const admin = lagAdmin({
      pollFersk: [{ id: 'poll8', spoersmaal: 'Årets Ö', tiebreak_status: null }],
      profiler: [{ id: 'admin1', rolle: 'admin' }],
      rpcRes: { poll8: { data: null, error: null } },
    })

    const resultat = await kjorPaaminnelser(admin)

    expect(mockLoggFeil).toHaveBeenCalledWith(
      'cron.paaminne.kaaring.tom_rpc',
      expect.any(Error),
      expect.objectContaining({ ctx: { sample: 'poll8' } }),
    )
    expect(mockStemple).not.toHaveBeenCalled()
    expect(resultat.feil).toBe(1)
  })
})

describe('kjorPaaminnelser – retry skiller tiebreak- og vinner-stempel (#521)', () => {
  // Regresjonstest for selve #521-bugen: FØR fiksen delte tiebreak- og
  // vinner-varselet samme kolonne (vinner_varslet_paa), så en poll som ble
  // avgjort via velgTiebreakVinner så ALT stemplet ut (fra tiebreak-steget)
  // selv om det ekte vinner-varselet aldri gikk ut. Retry-spørringen filtrerte
  // den derfor bort, og vinnerannonseringen var tapt for godt. Med to
  // kolonner har denne pollen fortsatt vinner_varslet_paa = null etter
  // tiebreak-varselet, og plukkes korrekt opp her.
  it('poll avgjort via tiebreak med feilet vinner-varsel plukkes opp av retry og varsles på nytt', async () => {
    mockBehandle.mockResolvedValueOnce({ sendt: true })
    mockUtled.mockReturnValueOnce('avgjort')
    const admin = lagAdmin({
      pollRetry: [{
        id: 'pollC',
        spoersmaal: 'Årets C',
        tiebreak_status: 'avgjort',
        // Tiebreak-varselet gikk ut for lenge siden (pollen VAR uavgjort),
        // men vinner-varselet feilet etter at gensek avgjorde — derfor null.
        tiebreak_varslet_paa: '2026-06-01T00:00:00.000Z',
        vinner_varslet_paa: null,
      }],
      profiler: [{ id: 'admin1', rolle: 'admin' }],
    })

    const resultat = await kjorPaaminnelser(admin)

    expect(mockUtled).toHaveBeenCalledWith('avgjort')
    expect(mockBehandle).toHaveBeenCalledWith(
      expect.objectContaining({ pollId: 'pollC', status: 'avgjort' }),
    )
    expect(mockStemple).toHaveBeenCalledWith(admin, 'pollC', 'avgjort')
    expect(resultat.sendteVarsler).toBe(1)
  })

  // Speilbildet: en poll som fortsatt venter på gensek sin avgjørelse, men
  // der TIEBREAK-varselet alt gikk ut, skal IKKE plukkes opp av retry i det
  // hele tatt — den er ikke uvarslet, den venter bare på en beslutning som
  // ikke er tatt. Uten status-grenen ville denne feilaktig blitt tolket som
  // «uvarslet vinner» (fordi vinner_varslet_paa også er null her) og fått
  // sendt tiebreak-varselet PÅ NYTT hver morgen — daglig spam til gensek.
  it('poll som venter på gensek (tiebreak alt varslet) plukkes IKKE opp av retry', async () => {
    const admin = lagAdmin({
      pollRetry: [{
        id: 'pollB',
        spoersmaal: 'Årets B',
        tiebreak_status: 'venter_paa_tiebreak',
        tiebreak_varslet_paa: '2026-06-01T00:00:00.000Z',
        vinner_varslet_paa: null,
      }],
      profiler: [{ id: 'gensek1', rolle: 'generalsekretaer' }],
    })

    const resultat = await kjorPaaminnelser(admin)

    expect(mockBehandle).not.toHaveBeenCalled()
    expect(mockStemple).not.toHaveBeenCalled()
    expect(resultat.sendteVarsler).toBe(0)
  })
})

// Fail-closed på de to dag-spørringene (#503-klassen, pinnet i #504-review).
// En svelget feil her ga tidligere `[]` — bit-identisk med «ingen
// arrangementer denne dagen» — og cronen hoppet stille over en hel dags
// påminnelser med grønn status.
describe('kjorPaaminnelser – fail-closed på dag-spørringene', () => {
  it('kaster når arrangementer-oppslaget feiler', async () => {
    const admin = lagAdmin({ arrangementerFeil: new Error('DB nede') })

    await expect(kjorPaaminnelser(admin)).rejects.toThrow(/Kunne ikke hente arrangementer/)
    expect(mockSendPaaminne).not.toHaveBeenCalled()
  })

  it('kaster når arrangoransvar-oppslaget feiler', async () => {
    const admin = lagAdmin({ arrangoransvarFeil: new Error('DB nede') })

    await expect(kjorPaaminnelser(admin)).rejects.toThrow(
      /Kunne ikke hente arrangøransvar-purringer/,
    )
    expect(mockSendArrangorPurring).not.toHaveBeenCalled()
  })
})
