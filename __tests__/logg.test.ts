import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lagFromMock } from './helpers/supabase-mock'

// Mock Supabase admin-klient — logg.ts importerer denne LAZY (`await
// import('@/lib/supabase/admin')`) inne i persisterFeilLogg(), men vi.mock
// fanger opp modulen uansett om importen er statisk eller dynamisk. (#496)
const mockFrom = vi.fn()
const mockSupabase = { from: mockFrom }

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockSupabase,
}))

import { logg, DbFeil } from '@/lib/logg'
import { LOGG_NOEKLER_MAKS_ANTALL, LOGG_NOEKKEL_MAKS_TEGN } from '@/lib/konstanter'
import { IkkeInnloggetFeil } from '@/lib/auth'

beforeEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

function pgFeil(code: string, message: string) {
  return { code, message }
}

describe('logg.feil() – feil_logg-persistering (#496)', () => {
  it('kaster aldri selv om feil_logg-inserten feiler', async () => {
    mockFrom.mockImplementation(lagFromMock({}, { feil_logg: { code: '08006', message: 'connection refused' } }))

    await expect(
      logg.feil('test.event', new Error('noe gikk galt')),
    ).resolves.toBeUndefined()
  })

  it('kaster aldri selv om createAdminClient/insert kaster (f.eks. timeout)', async () => {
    mockFrom.mockImplementation(() => {
      throw new Error('AbortError: signal timed out')
    })

    await expect(
      logg.feil('test.event', new Error('noe gikk galt')),
    ).resolves.toBeUndefined()
  })

  it('persisterer error-tilfeller til feil_logg med kun {event, code, tabell, nivaa, profil_id}', async () => {
    const insertSpion = vi.fn()
    mockFrom.mockImplementation((tabell: string) => {
      const chain: Record<string, unknown> = {}
      const metoder = ['insert', 'abortSignal']
      for (const m of metoder) chain[m] = vi.fn().mockReturnValue(chain)
      // insert() kalles med selve raden — fang den for assertions.
      chain.insert = vi.fn((rad: unknown) => {
        insertSpion(tabell, rad)
        return chain
      })
      chain.then = (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: null, error: null }).then(resolve)
      return chain
    })

    await logg.feil('test.event', pgFeil('23505', 'duplicate key value violates unique constraint "profiles_epost_key"\nKey (epost)=(x@y.no) already exists'), {
      ctx: { profil_id: 'user-1', arrangement_id: 'arr-1', count: 3 },
    })

    expect(insertSpion).toHaveBeenCalledTimes(1)
    const [tabell, rad] = insertSpion.mock.calls[0] as [string, Record<string, unknown>]
    expect(tabell).toBe('feil_logg')
    expect(Object.keys(rad).sort()).toEqual(['event', 'kontekst', 'nivaa', 'profil_id'])
    expect(rad.event).toBe('test.event')
    expect(rad.nivaa).toBe('error')
    expect(rad.profil_id).toBe('user-1')
    // arrangement_id og count skal IKKE følge med i kontekst — kun code/tabell/noekler.
    // noekler: 'code,message' fordi pgFeil() returnerer et rått objekt med
    // nøyaktig disse to nøklene (#711).
    expect(rad.kontekst).toEqual({ code: '23505', tabell: 'profiles_epost_key', noekler: 'code,message' })
  })

  it('persisterer aldri melding-feltet (kan bære radverdier)', async () => {
    const insertSpion = vi.fn()
    mockFrom.mockImplementation((tabell: string) => {
      const chain: Record<string, unknown> = {}
      chain.insert = vi.fn((rad: unknown) => {
        insertSpion(rad)
        return chain
      })
      chain.abortSignal = vi.fn().mockReturnValue(chain)
      chain.then = (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: null, error: null }).then(resolve)
      return chain
    })

    await logg.feil('test.event', pgFeil('23505', 'Key (epost)=(hemmelig@test.no) already exists'))

    const rad = insertSpion.mock.calls[0][0] as Record<string, unknown>
    expect(JSON.stringify(rad)).not.toContain('hemmelig@test.no')
    expect(rad.melding).toBeUndefined()
  })

  it('legger en AbortSignal på inserten (hard cap under pool-utmattelse)', async () => {
    // Reviewer mutasjonstestet: .abortSignal(...) kunne fjernes helt uten at
    // én av 559 tester ble rød, selv om den er et eksplisitt krav i #496.
    // Uten den kan en logge-skriving vente ubegrenset på en ledig tilkobling —
    // altså legge seg oppå akkurat det trykket som utløste feilen. (#498-review)
    const signaler: unknown[] = []
    mockFrom.mockImplementation(() => {
      const chain: Record<string, unknown> = {}
      chain.insert = vi.fn().mockReturnValue(chain)
      chain.abortSignal = vi.fn((signal: unknown) => {
        signaler.push(signal)
        return chain
      })
      chain.then = (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: null, error: null }).then(resolve)
      return chain
    })

    await logg.feil('test.event', new Error('noe gikk galt'))

    expect(signaler).toHaveLength(1)
    expect(signaler[0]).toBeInstanceOf(AbortSignal)
    // Skal være en timeout som ennå ikke har løpt ut, ikke et ferdig-abortert
    // signal (som ville avbrutt hver eneste insert umiddelbart).
    expect((signaler[0] as AbortSignal).aborted).toBe(false)
  })

  it('persisterer ikke warn-nivå til feil_logg', async () => {
    // RLS-avvisning (violates row-level security policy) klassifiseres warn
    // og skal returnere før persisterFeilLogg() i det hele tatt kalles.
    await logg.feil('test.event', pgFeil('42501', 'new row violates row-level security policy for table "chat"'))

    expect(mockFrom).not.toHaveBeenCalled()
  })
})

describe('logg.feil() – PGRST301 er død sesjon, ikke tilgangsfeil (#498-review)', () => {
  beforeEach(() => {
    mockFrom.mockImplementation(lagFromMock({}))
  })

  it('«JWT expired» med PGRST301 → warn, ingen feil_logg-rad, ingen alarm', async () => {
    const consoleSpion = vi.spyOn(console, 'log').mockImplementation(() => {})

    await logg.feil('test.event', pgFeil('PGRST301', 'JWT expired'))

    const linjer = consoleSpion.mock.calls.map(c => JSON.parse(c[0] as string))
    expect(linjer).toHaveLength(1)
    expect(linjer[0].nivaa).toBe('warn')
    // Ingen rad → teller ikke mot KLIENT_FEIL_ALARM_TERSKEL (som er 0).
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('PGRST301 er warn uansett meldingstekst — koden alene holder', async () => {
    const consoleSpion = vi.spyOn(console, 'log').mockImplementation(() => {})

    await logg.feil('test.event', pgFeil('PGRST301', 'noe helt annet'))

    const linjer = consoleSpion.mock.calls.map(c => JSON.parse(c[0] as string))
    expect(linjer.every(l => l.nivaa === 'warn')).toBe(true)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('JWT-meldinger uten kode → warn (GoTrue-varianter bærer ikke alltid kode)', async () => {
    const consoleSpion = vi.spyOn(console, 'log').mockImplementation(() => {})

    for (const melding of ['JWT expired', 'JWT invalid', 'JWSError JWSInvalidSignature']) {
      await logg.feil('test.event', new Error(melding))
    }

    const linjer = consoleSpion.mock.calls.map(c => JSON.parse(c[0] as string))
    expect(linjer).toHaveLength(3)
    expect(linjer.every(l => l.nivaa === 'warn')).toBe(true)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('42501 påvirkes ikke — tripwiren for GRANT-klippen 30.10.2026 står', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await logg.feil('test.event', pgFeil('42501', 'permission denied for table "profiles"'))

    expect(mockFrom).toHaveBeenCalledWith('feil_logg')
  })

  it('IkkeInnloggetFeil → warn, ingen feil_logg-rad, ingen alarm', async () => {
    // Samme rotårsak som PGRST301 (utløpt/manglende sesjon), men den kom aldri
    // hit som PostgREST-feil — en naken Error uten kode falt til error og fyrte
    // Sentry + morgenalarm på noe som er rutine når iOS spiser cookies.
    const consoleSpion = vi.spyOn(console, 'log').mockImplementation(() => {})

    await logg.feil('ulest.marker_chat_sett.feilet', new IkkeInnloggetFeil())

    const linjer = consoleSpion.mock.calls.map(c => JSON.parse(c[0] as string))
    expect(linjer).toHaveLength(1)
    expect(linjer[0].nivaa).toBe('warn')
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('IkkeInnloggetFeil beholder meldings-kontrakten «Ikke innlogget»', async () => {
    // Route handlers streng-matcher denne teksten for å velge 401 vs 403.
    // Klassen skal legge på en kode, ikke bytte ut meldingen.
    expect(new IkkeInnloggetFeil().message).toBe('Ikke innlogget')
    expect(new IkkeInnloggetFeil()).toBeInstanceOf(Error)
  })
})

describe('logg.feil() – feilklassens navn persisteres (tom kontekst-fella)', () => {
  function fangInsert() {
    const spion = vi.fn()
    mockFrom.mockImplementation(() => {
      const chain: Record<string, unknown> = {}
      chain.insert = vi.fn((rad: unknown) => {
        spion(rad)
        return chain
      })
      chain.abortSignal = vi.fn().mockReturnValue(chain)
      chain.then = (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: null, error: null }).then(resolve)
      return chain
    })
    return spion
  }

  it('en vanlig Error gir ikke lenger kontekst {}', async () => {
    // Bugen som gjorde feil #13 udiagnostiserbar: code og tabell er begge
    // undefined for en vanlig Error, så raden ble skrevet som `{}` og kunne
    // ikke fortelle om feilen var en programfeil eller en vi selv kastet.
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const spion = fangInsert()

    await logg.feil('test.event', new TypeError('x is not a function'))

    const rad = spion.mock.calls[0][0] as Record<string, unknown>
    expect((rad.kontekst as Record<string, unknown>).navn).toBe('TypeError')
  })

  it('navnet er en kodekonstant, aldri en radverdi', async () => {
    // Vokter personvern-grensen: melding persisteres bevisst aldri fordi den
    // kan bære radverdier. `navn` må ikke bli en bakvei rundt det.
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const spion = fangInsert()

    await logg.feil('test.event', new Error('Key (epost)=(hemmelig@test.no) already exists'))

    const rad = spion.mock.calls[0][0] as Record<string, unknown>
    expect(JSON.stringify(rad)).not.toContain('hemmelig@test.no')
    expect((rad.kontekst as Record<string, unknown>).navn).toBe('Error')
  })
})

describe('logg.feil() – kontekst er aldri {} (#711)', () => {
  // Rotårsak: normaliserFeil() satte `navn` kun for Error-instanser, og en
  // supabase-feil er et vanlig objekt. Manglet den i tillegg `code`
  // (transport-/nettverksfeil), falt den til else-grenen som kun ga
  // { melding }, og melding persisteres aldri i feil_logg. Resultatet var
  // kontekst: {} — udiagnostiserbart. Se lib/logg.ts § normaliserFeil().
  function fangInsert() {
    const spion = vi.fn()
    mockFrom.mockImplementation(() => {
      const chain: Record<string, unknown> = {}
      chain.insert = vi.fn((rad: unknown) => {
        spion(rad)
        return chain
      })
      chain.abortSignal = vi.fn().mockReturnValue(chain)
      chain.then = (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: null, error: null }).then(resolve)
      return chain
    })
    return spion
  }

  it('den faktiske repro-saken: en supabase-lignende feil UTEN code gir nøkkelnavn, ikke {}', async () => {
    // vitals.insert.feilet (#711): objektet er verken en Error-instans eller
    // har `code` — akkurat kombinasjonen som ga en tom rad før fiksen.
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const spion = fangInsert()

    await logg.feil('vitals.insert.feilet', { message: 'fetch failed' })

    const rad = spion.mock.calls[0][0] as Record<string, unknown>
    expect(rad.kontekst).not.toEqual({})
    expect((rad.kontekst as Record<string, unknown>).noekler).toBe('message')
  })

  it('et objekt uten egne nøkler (f.eks. et bokstavelig throw {}) faller ikke tilbake til {}', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const spion = fangInsert()

    await logg.feil('test.event', {})

    const rad = spion.mock.calls[0][0] as Record<string, unknown>
    expect(rad.kontekst).not.toEqual({})
    expect((rad.kontekst as Record<string, unknown>).navn).toBe('objekt-uten-egne-nokler')
  })

  it.each([
    ['streng', 'noe gikk galt'],
    ['tall', 42],
    ['null', null],
    ['undefined', undefined],
  ])('en kastet primitiv (%s) faller ikke tilbake til {}', async (_label, verdi) => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const spion = fangInsert()

    await logg.feil('test.event', verdi)

    const rad = spion.mock.calls[0][0] as Record<string, unknown>
    expect(rad.kontekst).not.toEqual({})
    expect(typeof (rad.kontekst as Record<string, unknown>).navn).toBe('string')
  })

  // ── Formvakt på nøkkelnavnene (#711-review) ───────────────────────────────
  //
  // normaliserFeil() tar `unknown`. Nøkkelnavnene i en kastet struktur er
  // derfor IKKE garantert kodekontrollerte — de kan være en epostadresse, en
  // URL eller flere tusen tegn. Testene under pinner at raden aldri gjengir
  // slike navn rått, og at den likevel aldri blir tom.

  function kontekstFra(spion: ReturnType<typeof vi.fn>) {
    const rad = spion.mock.calls[0][0] as Record<string, unknown>
    return rad.kontekst as Record<string, unknown>
  }

  it('gjengir aldri nøkkelnavn som ser ut som PII — men teller dem', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const spion = fangInsert()

    await logg.feil('test.event', {
      'ola@example.com': 1,
      'https://example.com/side?token=hemmelig': 2,
      melding: 'fetch failed',
    })

    const noekler = kontekstFra(spion).noekler as string
    expect(noekler).not.toContain('@')
    expect(noekler).not.toContain('example.com')
    expect(noekler).not.toContain('token')
    // Det gjengibare navnet står igjen, resten telles: signalet «strukturen
    // hadde tre felter» går ikke tapt selv om to av dem ikke kan skrives.
    expect(noekler).toBe('melding,+2_ukjent_form')
  })

  it('filtreres ALLE nøkkelnavnene bort, bærer raden fortsatt et diagnostisk spor', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const spion = fangInsert()

    await logg.feil('test.event', {
      'ola@example.com': 1,
      'fornavn etternavn': 2,
    })

    const kontekst = kontekstFra(spion)
    // Invarianten fra #711 må overleve formvakten.
    expect(kontekst).not.toEqual({})
    expect(kontekst.noekler).toBe('+2_ukjent_form')
    // «objekt-uten-egne-nokler» skal IKKE slå inn: objektet HADDE nøkler, de
    // var bare ikke gjengibare. De to markørene betyr ulike ting.
    expect(kontekst.navn).toBeUndefined()
  })

  it('kapper antall nøkler — og sier fra om at det ble kappet', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const spion = fangInsert()

    const mange: Record<string, unknown> = {}
    for (let i = 0; i < 40; i++) mange[`felt_${String(i).padStart(2, '0')}`] = i

    await logg.feil('test.event', mange)

    const deler = (kontekstFra(spion).noekler as string).split(',')
    expect(deler).toHaveLength(LOGG_NOEKLER_MAKS_ANTALL + 1)
    expect(deler.at(-1)).toBe(`+${40 - LOGG_NOEKLER_MAKS_ANTALL}_flere`)
  })

  it('gjengir aldri et svært langt nøkkelnavn — heller ikke kappet', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const spion = fangInsert()

    // Identifikator-formet, men 5000 tegn: en feilstruktur skal ikke kunne
    // blåse opp feil_logg-raden via et nøkkelNAVN.
    const langt = 'a'.repeat(5000)
    await logg.feil('test.event', { [langt]: 1, kort: 2 })

    const noekler = kontekstFra(spion).noekler as string
    expect(noekler).toBe('kort,+1_ukjent_form')
    expect(noekler.length).toBeLessThan(LOGG_NOEKKEL_MAKS_TEGN * 2)
  })
})

describe('logg.feil() – 42501-klassifisering (#497)', () => {
  beforeEach(() => {
    mockFrom.mockImplementation(lagFromMock({}))
  })

  it('«permission denied for table» → alltid error, aldri overstyrbar', async () => {
    const consoleSpion = vi.spyOn(console, 'log').mockImplementation(() => {})

    await logg.feil('test.event', pgFeil('42501', 'permission denied for table "profiles"'))

    const linjer = consoleSpion.mock.calls.map(c => JSON.parse(c[0] as string))
    expect(linjer.some(l => l.nivaa === 'error')).toBe(true)
    expect(linjer.some(l => l.nivaa === 'warn')).toBe(false)
    // Skal falle gjennom til persistering (ikke tidlig-retur).
    expect(mockFrom).toHaveBeenCalledWith('feil_logg')
  })

  it('«violates row-level security policy» → warn, ikke persistert', async () => {
    const consoleSpion = vi.spyOn(console, 'log').mockImplementation(() => {})

    // Bruker 42501 her (ikke PGRST301) — PGRST301 er nå warn på koden alene,
    // så den ville ikke lenger testet RLS-grenen. (#498-review)
    await logg.feil('test.event', pgFeil('42501', 'new row violates row-level security policy for table "meldinger"'))

    const linjer = consoleSpion.mock.calls.map(c => JSON.parse(c[0] as string))
    expect(linjer).toHaveLength(1)
    expect(linjer[0].nivaa).toBe('warn')
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('annet 42501-innhold → error (defaulten snudd, se #497)', async () => {
    const consoleSpion = vi.spyOn(console, 'log').mockImplementation(() => {})

    await logg.feil('test.event', pgFeil('42501', 'noe uventet med samme SQLSTATE'))

    const linjer = consoleSpion.mock.calls.map(c => JSON.parse(c[0] as string))
    expect(linjer.some(l => l.nivaa === 'error')).toBe(true)
    expect(mockFrom).toHaveBeenCalledWith('feil_logg')
  })
})

describe('DbFeil – bevarer PostgREST-koden gjennom innpakking', () => {
  // En innpakket Supabase-feil (`new Error(`… ${error.message}`)`) taper `code`.
  // Meldingen persisteres bevisst aldri, så raden i feil_logg ble stående som
  // `{"navn":"Error"}` — synlig, men umulig å diagnostisere. Det var
  // blindsonen ulest.marker_chat_sett.feilet lå i (fire rader, august 2026).
  function fangInsert() {
    const spion = vi.fn()
    mockFrom.mockImplementation(() => {
      const chain: Record<string, unknown> = {}
      chain.insert = vi.fn((rad: unknown) => {
        spion(rad)
        return chain
      })
      chain.abortSignal = vi.fn().mockReturnValue(chain)
      chain.then = (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: null, error: null }).then(resolve)
      return chain
    })
    return spion
  }

  it('en vanlig Error taper koden — dette er tilstanden vi rettet bort fra', async () => {
    const spion = fangInsert()
    await logg.feil('test.event', new Error('marker_chat_sett feilet: noe gikk galt'))

    const rad = spion.mock.calls[0][0] as Record<string, unknown>
    expect(rad.kontekst).toEqual({ code: undefined, tabell: undefined, navn: 'Error' })
  })

  it('DbFeil bærer koden helt fram til raden', async () => {
    const spion = fangInsert()
    await logg.feil(
      'test.event',
      new DbFeil('marker_chat_sett feilet: permission denied', '42501'),
    )

    const rad = spion.mock.calls[0][0] as Record<string, unknown>
    expect((rad.kontekst as Record<string, unknown>).code).toBe('42501')
    expect((rad.kontekst as Record<string, unknown>).navn).toBe('DbFeil')
  })

  it('persisterer fortsatt ikke meldingen, som kan bære radverdier', async () => {
    const spion = fangInsert()
    await logg.feil('test.event', new DbFeil('Key (epost)=(hemmelig@test.no) finnes', '23505'))

    expect(JSON.stringify(spion.mock.calls[0][0])).not.toContain('hemmelig@test.no')
  })

  it('går gjennom tilgangsklassifiseringen som før — død sesjon er fortsatt warn', async () => {
    // DbFeil skal ikke smugle en rutinefeil forbi nedgraderingen i #498:
    // koden er nå synlig, og PGRST301 må fortsatt ende som warn uten rad.
    const consoleSpion = vi.spyOn(console, 'log').mockImplementation(() => {})

    await logg.feil('test.event', new DbFeil('JWT expired', 'PGRST301'))

    const linjer = consoleSpion.mock.calls.map(c => JSON.parse(c[0] as string))
    expect(linjer.every(l => l.nivaa === 'warn')).toBe(true)
    expect(mockFrom).not.toHaveBeenCalled()
  })
})

describe('logg.feil() – status fra DB-svaret (#711, runde 2)', () => {
  // Samme fangInsert-mønster som DbFeil-blokka over.
  function fangInsert() {
    const spion = vi.fn()
    mockFrom.mockImplementation(() => {
      const chain: Record<string, unknown> = {}
      chain.insert = vi.fn((rad: unknown) => {
        spion(rad)
        return chain
      })
      chain.abortSignal = vi.fn().mockReturnValue(chain)
      chain.then = (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: null, error: null }).then(resolve)
      return chain
    })
    return spion
  }

  function kontekstFra(spion: ReturnType<typeof vi.fn>) {
    const rad = spion.mock.calls[0][0] as Record<string, unknown>
    return rad.kontekst as Record<string, unknown>
  }

  it('status 0 (transport) bevares — ingen truthy-sjekk', async () => {
    const spion = fangInsert()

    await logg.feil('test.event', pgFeil('23505', 'duplicate key value violates unique constraint "profiles_epost_key"'), {
      ctx: { status: 0 },
    })

    expect(kontekstFra(spion).status).toBe(0)
  })

  it('500 og 504 tas med fra ctx.status', async () => {
    const spion500 = fangInsert()
    await logg.feil('test.event', pgFeil('23505', 'duplicate key value violates unique constraint "profiles_epost_key"'), {
      ctx: { status: 500 },
    })
    expect(kontekstFra(spion500).status).toBe(500)

    const spion504 = fangInsert()
    await logg.feil('test.event', pgFeil('23505', 'duplicate key value violates unique constraint "profiles_epost_key"'), {
      ctx: { status: 504 },
    })
    expect(kontekstFra(spion504).status).toBe(504)
  })

  it('DbFeil bærer status helt fram til raden når rad.kontekst.status er satt', async () => {
    const spion = fangInsert()

    await logg.feil('test.event', new DbFeil('marker_chat_sett feilet: nettverksfeil', undefined, 502))

    expect(kontekstFra(spion).status).toBe(502)
  })

  it.each([
    ['negativ', -1],
    ['over grensen', 600],
    ['ikke heltall', 1.5],
    ['NaN', NaN],
    ['streng', '500'],
    ['null', null],
  ])('ugyldig status (%s) droppes — feltet er fraværende, ikke null', async (_label, ugyldigStatus) => {
    const spion = fangInsert()

    await logg.feil('test.event', pgFeil('23505', 'duplicate key value violates unique constraint "profiles_epost_key"'), {
      ctx: { status: ugyldigStatus },
    })

    const kontekst = kontekstFra(spion)
    expect(kontekst.status).toBeUndefined()
    // Nøkkelen står i JS-objektet med verdien undefined (samme mønster som
    // code/tabell andre steder), men JSON-serialiseringen som faktisk går til
    // Postgres dropper en undefined-nøkkel helt — i motsetning til null, som
    // ville blitt stående i kontekst-kolonnen. Verifiser derfor «fraværende»
    // etter samme runde inserten faktisk går gjennom.
    expect('status' in JSON.parse(JSON.stringify(kontekst))).toBe(false)
  })

  it('fravær av status gir ingen status-nøkkel', async () => {
    const spion = fangInsert()

    await logg.feil('test.event', pgFeil('23505', 'duplicate key value violates unique constraint "profiles_epost_key"'))

    const kontekst = kontekstFra(spion)
    expect(kontekst.status).toBeUndefined()
    expect('status' in JSON.parse(JSON.stringify(kontekst))).toBe(false)
  })

  it('ctx.status vinner over feilobjektets egen status', async () => {
    const spion = fangInsert()

    await logg.feil('test.event', new DbFeil('feilet', undefined, 502), { ctx: { status: 404 } })

    expect(kontekstFra(spion).status).toBe(404)
  })

  it('radformen er fortsatt uendret: event, kontekst, nivaa, profil_id', async () => {
    const spion = fangInsert()

    await logg.feil('test.event', new DbFeil('feilet', 'PGRST100', 500))

    const rad = spion.mock.calls[0][0] as Record<string, unknown>
    expect(Object.keys(rad).sort()).toEqual(['event', 'kontekst', 'nivaa', 'profil_id'])
  })
})
