/**
 * Integrasjonstester for lib/actions/dato-forslag.ts.
 *
 * Bruker rene stubs — ingen ekte Anthropic-kall. Fanger forretningslogikk:
 * terskel, feature-flag, datovalidering, fremtidsfilter, sanity-cap,
 * feilhåndtering og PII-frie logs.
 *
 * Mønster: vi.hoisted() for mock-refs, deretter vi.mock()-fabrikker,
 * deretter import av SUT etter mockene.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// --- Hoistede mock-refs ---

const {
  mockEnsureInnlogget,
  mockAnthropicApiKey,
  mockLoggFeil,
  mockFetch,
} = vi.hoisted(() => {
  const mockEnsureInnlogget = vi.fn().mockResolvedValue({ supabase: {}, user: { id: 'bruker-123' } })
  // ANTHROPIC_API_KEY kan overstyres per test via mockAnthropicApiKey.mockReturnValue(...)
  const mockAnthropicApiKey = vi.fn().mockReturnValue('test-api-key')
  const mockLoggFeil = vi.fn().mockResolvedValue(undefined)
  const mockFetch = vi.fn()
  return { mockEnsureInnlogget, mockAnthropicApiKey, mockLoggFeil, mockFetch }
})

// --- Modul-mocker ---

vi.mock('@/lib/auth', () => ({
  ensureInnlogget: (...args: unknown[]) => mockEnsureInnlogget(...args),
}))

// lib/config eksporteres som et objekt med getters slik at ANTHROPIC_API_KEY
// kan overstyres per test (mockAnthropicApiKey.mockReturnValue).
vi.mock('@/lib/config', () => ({
  get ANTHROPIC_API_KEY() { return mockAnthropicApiKey() },
  ANTHROPIC_MODEL: 'claude-haiku-4-5',
}))

vi.mock('@/lib/logg', () => ({
  logg: {
    feil: (...args: unknown[]) => mockLoggFeil(...args),
    warn: vi.fn(),
  },
}))

// Frys tiden: iDagOslo() bruker new Date() under panseret, så uten mock ville
// fremtids-/fortids-/2-års-cap-casene drifte fra pass til feil etter hvert som
// den frosne referansedatoen blir fortid. Vi overstyrer KUN iDagOslo og beholder
// erGyldigKalenderdato ekte (via importActual) — kalendervalideringen skal teste
// på ekte. Alle dato-cases under er relative til FROSSET_DATO.
const FROSSET_DATO = '2026-07-07'
vi.mock('@/lib/dato', async () => {
  const actual = await vi.importActual<typeof import('@/lib/dato')>('@/lib/dato')
  return {
    ...actual,
    iDagOslo: () => FROSSET_DATO,
  }
})

// Importer SUT etter mockene
import { foreslaaAktuellDato } from '@/lib/actions/dato-forslag'

// --- Helpers ---

/** Bygg en fetch-mock som returnerer en gyldig Anthropic-respons. */
function lagFetchMock(contentText: string, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => ({
      content: [{ type: 'text', text: contentText }],
    }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  // Standard: nøkkel satt, fetch ikke kalt
  mockAnthropicApiKey.mockReturnValue('test-api-key')
  mockFetch.mockReset()
  // Stub fetch per test (ikke på modulnivå) så afterEach kan rydde trygt
  vi.stubGlobal('fetch', mockFetch)
})

// Rydd opp den globale fetch-stubben så den ikke lekker til andre testfiler
// i samme Vitest-worker og gjør dem flaky (Copilot-funn, PR #425).
afterEach(() => {
  vi.unstubAllGlobals()
})

// --- Test-cases ---

describe('foreslaaAktuellDato', () => {
  it('returnerer ingen_dato uten fetch når tekst er under DATO_FORSLAG_MIN_TEGN', async () => {
    const res = await foreslaaAktuellDato('pils') // 4 tegn, under terskelen
    expect(res).toEqual({ dato: null, grunn: 'ingen_dato' })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returnerer feil uten fetch når ANTHROPIC_API_KEY er tom', async () => {
    // Feature av (tom nøkkel) er et teknisk utfall, ikke «ingen dato» (#462)
    mockAnthropicApiKey.mockReturnValue('')
    const res = await foreslaaAktuellDato('Dette er en tilstrekkelig lang tekst for test')
    expect(res).toEqual({ dato: null, grunn: 'feil' })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returnerer { dato } for gyldig fremtidig dato fra LLM', async () => {
    // Prefill-teknikk: vi sender '{"dato":"...' og LLM-en returnerer resten
    // UTEN det ledende '{' (pga prefill). Fetch-mock returnerer teksten slik
    // action-en ser den etter at '{' er strippet av prefill-assistent-rollen.
    // 2026-08-01 er ~1 mnd etter FROSSET_DATO → innenfor både fremtidsfilter og cap.
    mockFetch.mockImplementation(lagFetchMock('"dato":"2026-08-01"}'))
    const res = await foreslaaAktuellDato('Hei, vi møtes fredag 1. august til middag hos meg')
    expect(res).toEqual({ dato: '2026-08-01' })
  })

  it('parser korrekt når modellen echoer det ledende {', async () => {
    // Prefill echoes normalt ikke, men enkelte gjennomkjøringer inkluderer det
    // ledende '{' i svaret likevel. Da må rekonstruksjonen unngå '{{...}}' som
    // ville feilet parsingen og forkastet et ellers gyldig svar. Se funn 1 (#425).
    mockFetch.mockImplementation(lagFetchMock('{"dato":"2026-08-01"}'))
    const res = await foreslaaAktuellDato('Hei, vi møtes fredag 1. august til middag hos meg')
    expect(res).toEqual({ dato: '2026-08-01' })
  })

  it('returnerer ingen_dato for fortidsdato fra LLM', async () => {
    // 2026-07-01 er 6 dager før FROSSET_DATO → fremtidsfilteret skal avvise den.
    // Fra brukerens ståsted er «modellen fant bare en fortidsdato» det samme
    // som «ingen brukbar dato» — ikke en teknisk feil (#462).
    mockFetch.mockImplementation(lagFetchMock('"dato":"2026-07-01"}'))
    const res = await foreslaaAktuellDato('Dette handlet om et arrangement vi hadde 1. juli')
    expect(res).toEqual({ dato: null, grunn: 'ingen_dato' })
  })

  it('returnerer ingen_dato for roll-over-dato (2026-02-30)', async () => {
    // 2026-02-30 eksisterer ikke — erGyldigKalenderdato skal avvise den før
    // fremtidsfilteret i det hele tatt kjører.
    mockFetch.mockImplementation(lagFetchMock('"dato":"2026-02-30"}'))
    const res = await foreslaaAktuellDato('Vi setter av 30. februar til den store festen')
    expect(res).toEqual({ dato: null, grunn: 'ingen_dato' })
  })

  it('returnerer ingen_dato for dato mer enn 2 år frem', async () => {
    // FROSSET_DATO=2026-07-07 → cap=2028-07-07. 2029-01-01 er fremtidig og gyldig,
    // men overskrider 2-års-cap-en → skal avvises av sanity-cap-en, ikke fremtidsfilteret.
    mockFetch.mockImplementation(lagFetchMock('"dato":"2029-01-01"}'))
    const res = await foreslaaAktuellDato('La oss planlegge noe stort til nyttår 2029 en gang')
    expect(res).toEqual({ dato: null, grunn: 'ingen_dato' })
  })

  it('returnerer feil og kaller logg.feil med transient-fingerprint ved 429', async () => {
    mockFetch.mockImplementation(lagFetchMock('', false, 429))
    const res = await foreslaaAktuellDato('Vi planlegger noe spennende til neste helg i november')
    expect(res).toEqual({ dato: null, grunn: 'feil' })
    expect(mockLoggFeil).toHaveBeenCalledOnce()
    const [, , opts] = mockLoggFeil.mock.calls[0]
    expect(opts.fingerprint).toBe('ai.datoforslag.transient')
    // PII-sjekk: sample-nøkkel skal ALDRI sendes
    expect(opts).not.toHaveProperty('sample')
  })

  it('returnerer feil og kaller logg.feil med auth-fingerprint ved 401', async () => {
    mockFetch.mockImplementation(lagFetchMock('', false, 401))
    const res = await foreslaaAktuellDato('Vi planlegger noe spennende til neste helg i november')
    expect(res).toEqual({ dato: null, grunn: 'feil' })
    expect(mockLoggFeil).toHaveBeenCalledOnce()
    const [, , opts] = mockLoggFeil.mock.calls[0]
    expect(opts.fingerprint).toBe('ai.datoforslag.auth')
    // PII-sjekk: sample-nøkkel skal ALDRI sendes
    expect(opts).not.toHaveProperty('sample')
  })

  it('returnerer ingen_dato uten å logge feil når LLM svarer {"dato":null}', async () => {
    // Den vanligste ikke-feil-null-veien i prod: modellen finner ingen dato.
    // Prefill strippet '{', så content-text = '"dato":null}' → { dato: null }.
    mockFetch.mockImplementation(lagFetchMock('"dato":null}'))
    const res = await foreslaaAktuellDato('Bare en generell prat uten noen konkret dato nevnt')
    expect(res).toEqual({ dato: null, grunn: 'ingen_dato' })
    // Dette er et gyldig svar (res.ok=true), ikke en infrastruktur-feil —
    // logg.feil skal IKKE kalles.
    expect(mockLoggFeil).not.toHaveBeenCalled()
  })

  it('returnerer feil og logger transient med undefined status når fetch rejecter', async () => {
    // Nettverksfeil / AbortError (timeout): fetch kaster en Error uten .status.
    // Dette er den sikkerhetsrelevante transient-grenen der status er undefined.
    const nettverksfeil = new Error('The operation was aborted')
    nettverksfeil.name = 'AbortError'
    mockFetch.mockRejectedValue(nettverksfeil)
    const res = await foreslaaAktuellDato('Vi planlegger noe spennende til neste helg i november')
    expect(res).toEqual({ dato: null, grunn: 'feil' })
    expect(mockLoggFeil).toHaveBeenCalledOnce()
    const [, , opts] = mockLoggFeil.mock.calls[0]
    expect(opts.fingerprint).toBe('ai.datoforslag.transient')
    expect(opts.ctx.status).toBeUndefined()
    // PII-sjekk: sample-nøkkel skal ALDRI sendes
    expect(opts).not.toHaveProperty('sample')
  })

  it('returnerer feil ved malformed JSON fra LLM', async () => {
    // Sender ugyldig JSON-fragment — parse feiler og rapporteres som teknisk
    // utfall (retry kan hjelpe), men logges ikke (LLM-hallusinasjon, ikke infra).
    mockFetch.mockImplementation(lagFetchMock('IKKE_GYLDIG_JSON'))
    const res = await foreslaaAktuellDato('Hei gutta, vi møtes i Oslo til helga for en tur')
    expect(res).toEqual({ dato: null, grunn: 'feil' })
    // Malformed JSON er ikke en Anthropic-feil (res.ok=true) — logg.feil
    // skal IKKE kalles for dette (det er LLM-hallusinasjon, ikke infrastruktur-feil)
    expect(mockLoggFeil).not.toHaveBeenCalled()
  })
})
