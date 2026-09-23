// @vitest-environment node
//
// Pinner #632: koblingen mellom et lukket ønske-issue og innsenderen skal
// overleve at issue-teksten er redigert (markøren i body forsvinner), og et
// tapt oppslag skal aldri se ut som en vellykket levering (200).
//
// Node-miljø: ruten bruker Request/crypto som jsdom ikke leverer (se
// varsel-mottaker-felter.test.ts for samme begrunnelse).

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { INNSPILL_KOBLING_INNFOERT } from '@/lib/konstanter'
// Importeres i stedet for å dupliseres: teksten eies av lib/innspill-svar.ts,
// og en test som gjentar strengen ville bare pinnet sin egen kopi.
import { INNSPILL_HANDTERT_TITTEL, INNSPILL_HANDTERT_MELDING } from '@/lib/innspill-svar'
// Ikke mocket — ren funksjon. Brukes til å bygge den FORVENTEDE strengen, så
// testen pinner at ruten sender teksten uavkortet uten å duplisere ordlyden
// (den er pinnet for seg i __tests__/innspill-svar.test.ts).
import {
  byggInnspillSvar,
  INNSPILL_AVSLUTTET_TITTEL,
  INNSPILL_AVSLUTTET_MELDING,
} from '@/lib/innspill-svar'

// Samme generiske chainable mock som varsel-mottaker-felter.test.ts, utvidet
// med maybeSingle() — innspill_kobling-oppslaget i finnInnsender() bruker den.
function lagAdminKlient(tabellResultater: Record<string, unknown>) {
  function lagChain(resultat: unknown) {
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'insert']) {
      chain[m] = vi.fn(() => chain)
    }
    chain.maybeSingle = vi.fn(() => Promise.resolve(resultat))
    chain.then = (resolve: (v: unknown) => void) => Promise.resolve(resultat).then(resolve)
    return chain
  }

  const from = vi.fn((tabell: string) => lagChain(tabellResultater[tabell]))
  const klient = { from } as unknown as SupabaseClient<Database>
  return { klient }
}

const { mockSendVarsel, mockCreateAdmin, mockLoggFeil, mockLoggWarn } = vi.hoisted(() => ({
  mockSendVarsel: vi.fn(),
  mockCreateAdmin: vi.fn(),
  mockLoggFeil: vi.fn(),
  mockLoggWarn: vi.fn(),
}))

// Fixturen er bevisst OVER 200 tegn (#633-review): det gamle
// kommentarutdraget klippet på nøyaktig 200, og med en kort mock-tekst ville
// en gjeninnført .slice(0, 200) hvor som helst i webhook-stien passert grønt.
const { MOCK_ENDRING } = vi.hoisted(() => ({
  MOCK_ENDRING: {
    versjon: 'V3.5.58',
    dato: '2026-08-26',
    tekst:
      'Åpner du et bilde i fullskjerm kan du nå knipe for å zoome inn og dra rundt i bildet — både i chatten og i albumene. Bakgrunnen bak bildet er helt svart, så bildet står alene i stedet for at appen skinner igjennom bak kantene.',
    innspill: [625],
  },
}))

vi.mock('@/lib/varsler', () => ({ sendVarsel: mockSendVarsel }))
vi.mock('@/lib/logg', () => ({ logg: { feil: mockLoggFeil, warn: mockLoggWarn } }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mockCreateAdmin }))
// Én endringslogg-oppføring merket #625 (#633) — nok til å teste både
// «finnes» og «finnes ikke»-grenen uten å røre den ekte, håndskrevne listen.
vi.mock('@/lib/endringslogg-data', () => ({ ENDRINGER: [MOCK_ENDRING] }))

const HEMMELIGHET = 'test-webhook-secret'

// GITHUB_WEBHOOK_SECRET leses av ruten på modul-nivå — må settes FØR
// modulen lastes, derfor dynamisk import i beforeAll (se
// varsel-mottaker-felter.test.ts for samme begrunnelse).
let POST: typeof import('@/app/api/github/webhook/route').POST
let GITHUB_ONSKE_LABEL: string

beforeAll(async () => {
  process.env.GITHUB_WEBHOOK_SECRET = HEMMELIGHET
  ;({ POST } = await import('@/app/api/github/webhook/route'))
  ;({ GITHUB_ONSKE_LABEL } = await import('@/lib/config'))
})

beforeEach(() => {
  vi.clearAllMocks()
  mockSendVarsel.mockResolvedValue({})
})

function signer(body: string): string {
  const hmac = crypto.createHmac('sha256', HEMMELIGHET)
  hmac.update(body)
  return `sha256=${hmac.digest('hex')}`
}

function lagRequest(payload: unknown): Request {
  const body = JSON.stringify(payload)
  return new Request('http://localhost:3000/api/github/webhook', {
    method: 'POST',
    headers: {
      'x-github-event': 'issues',
      'x-hub-signature-256': signer(body),
    },
    body,
  })
}

// Default created_at er FØR koblingstabellen ble innført — der bor
// #625-klassen, og der er overskrifts-heuristikken fortsatt i bruk. Tester som
// gjelder nye issues setter created_at eksplisitt.
const FOER_KOBLING = new Date(INNSPILL_KOBLING_INNFOERT.getTime() - 86_400_000).toISOString()
const ETTER_KOBLING = new Date(INNSPILL_KOBLING_INNFOERT.getTime() + 86_400_000).toISOString()

function lukketPayload(overrides: {
  number: number
  body: string | null
  created_at?: string
  state_reason?: string
}) {
  return {
    action: 'closed',
    issue: {
      number: overrides.number,
      body: overrides.body,
      created_at: overrides.created_at ?? FOER_KOBLING,
      comments: 0,
      labels: [{ name: GITHUB_ONSKE_LABEL }],
      state_reason: overrides.state_reason ?? null,
    },
  }
}

describe('/api/github/webhook – closed varsler via innspill_kobling (#632)', () => {
  it('body uten markør, DB-rad finnes → varsler riktig profilId (regresjon for #625)', async () => {
    const { klient } = lagAdminKlient({
      innspill_kobling: { data: { profil_id: 'db-profil-1' }, error: null },
    })
    mockCreateAdmin.mockReturnValue(klient)

    const req = lagRequest(lukketPayload({
      number: 625,
      body: '## Ønske fra Ola\n\nZoom på bilder',
    }))

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(mockSendVarsel).toHaveBeenCalledWith(
      expect.objectContaining({ mottakere: ['db-profil-1'], type: 'ønske_lukket' }),
    )
    expect(mockLoggFeil).not.toHaveBeenCalled()
  })

  it('body med markør, ingen DB-rad → faller tilbake til markøren (gamle issues)', async () => {
    const { klient } = lagAdminKlient({
      innspill_kobling: { data: null, error: null },
    })
    mockCreateAdmin.mockReturnValue(klient)

    const req = lagRequest(lukketPayload({
      number: 500,
      body: '## Ønske fra Kari\n\nNoe fint\n\n<!-- profil_id:11111111-1111-1111-1111-111111111111 -->',
    }))

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(mockSendVarsel).toHaveBeenCalledWith(
      expect.objectContaining({ mottakere: ['11111111-1111-1111-1111-111111111111'] }),
    )
    // Presis assertion: denne testen handler om at KOBLINGEN ble funnet via
    // markøren. At issuet mangler endringslogg-oppføring er en annen sak, og
    // logges legitimt her — en bred `not.toHaveBeenCalled()` ville koblet
    // testen til noe den ikke tester.
    expect(mockLoggFeil).not.toHaveBeenCalledWith(
      'github.webhook.kobling.tapt',
      expect.anything(),
      expect.anything(),
    )
  })

  it('reformatert markør uten mellomrom parses også (felles regex, #632-review)', async () => {
    const { klient } = lagAdminKlient({
      innspill_kobling: { data: null, error: null },
    })
    mockCreateAdmin.mockReturnValue(klient)

    const req = lagRequest(lukketPayload({
      number: 501,
      body: '## Ønske fra Per\n\nNoe fint\n\n<!--profil_id:22222222-2222-2222-2222-222222222222-->',
    }))

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(mockSendVarsel).toHaveBeenCalledWith(
      expect.objectContaining({ mottakere: ['22222222-2222-2222-2222-222222222222'] }),
    )
    expect(mockLoggFeil).not.toHaveBeenCalledWith(
      'github.webhook.kobling.tapt',
      expect.anything(),
      expect.anything(),
    )
  })

  it('gammelt app-issue, verken DB-rad eller markør → logg.feil + 422, ingen varsling', async () => {
    const { klient } = lagAdminKlient({
      innspill_kobling: { data: null, error: null },
    })
    mockCreateAdmin.mockReturnValue(klient)

    const req = lagRequest(lukketPayload({
      number: 625,
      body: '## Ønske fra Ola\n\nZoom på bilder (redigert, markøren er borte)',
    }))

    const res = await POST(req)
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.ok).toBe(false)
    expect(mockLoggFeil).toHaveBeenCalledWith(
      'github.webhook.kobling.tapt',
      expect.anything(),
      expect.objectContaining({ ctx: { issue_nummer: 625 } }),
    )
    expect(mockSendVarsel).not.toHaveBeenCalled()
  })

  it('CLI-issue uten app-header og uten markør → 200 skipped, ingen alarm', async () => {
    const { klient } = lagAdminKlient({
      innspill_kobling: { data: null, error: null },
    })
    mockCreateAdmin.mockReturnValue(klient)

    const req = lagRequest(lukketPayload({
      number: 400,
      body: 'En vanlig CLI-opprettet issue uten noen kobling.',
    }))

    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.skipped).toBe('ikke-fra-appen')
    expect(mockLoggFeil).not.toHaveBeenCalled()
    expect(mockSendVarsel).not.toHaveBeenCalled()
  })

  // Overskriften skrives også for hånd fra CLI-en (#595, #447). Etter at
  // koblingstabellen kom kan et issue uten rad ikke være et app-innspill, så
  // teksten skal ikke lenger kunne utløse morgenalarmen.
  it('nytt håndskrevet issue med «## Ønske fra»-overskrift → 200 skipped, ingen alarm', async () => {
    const { klient } = lagAdminKlient({
      innspill_kobling: { data: null, error: null },
    })
    mockCreateAdmin.mockReturnValue(klient)

    const req = lagRequest(lukketPayload({
      number: 700,
      body: '## Ønske fra Per\n\nSkrevet rett i GitHub, aldri innom appen.',
      created_at: ETTER_KOBLING,
    }))

    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.skipped).toBe('ikke-fra-appen')
    expect(mockLoggFeil).not.toHaveBeenCalled()
    expect(mockSendVarsel).not.toHaveBeenCalled()
  })

  // MAJOR fra #632-review: «klarte ikke slå opp» skal ikke misdiagnostiseres
  // som «koblingen er tapt». 500 gjør manuell redelivery mulig og redder
  // varselet; 422 + kobling.tapt ville løyet og lukket saken for godt.
  it('DB-oppslaget feiler og markøren mangler → 500, ingen kobling.tapt', async () => {
    const { klient } = lagAdminKlient({
      innspill_kobling: { data: null, error: { code: '57014', message: 'timeout' } },
    })
    mockCreateAdmin.mockReturnValue(klient)

    const req = lagRequest(lukketPayload({
      number: 800,
      body: '## Ønske fra Ola\n\nRedigert, markøren er borte.',
      created_at: ETTER_KOBLING,
    }))

    const res = await POST(req)
    expect(res.status).toBe(500)
    expect(mockSendVarsel).not.toHaveBeenCalled()

    const eventer = mockLoggFeil.mock.calls.map(([event]) => event)
    expect(eventer).toContain('github.webhook.kobling.oppslag.feilet')
    expect(eventer).not.toContain('github.webhook.kobling.tapt')
  })

  it('DB-oppslaget feiler, men markøren finnes → varsler via markøren (fail-open)', async () => {
    const { klient } = lagAdminKlient({
      innspill_kobling: { data: null, error: { code: '57014', message: 'timeout' } },
    })
    mockCreateAdmin.mockReturnValue(klient)

    const req = lagRequest(lukketPayload({
      number: 801,
      body: '## Ønske fra Per\n\nNoe fint\n\n<!-- profil_id:33333333-3333-3333-3333-333333333333 -->',
    }))

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(mockSendVarsel).toHaveBeenCalledWith(
      expect.objectContaining({ mottakere: ['33333333-3333-3333-3333-333333333333'] }),
    )
    // Ikke kun_body: markøren ble brukt fordi spørringen røk, ikke fordi
    // raden manglet — de to skal ikke se like ut i loggen.
    expect(mockLoggWarn).not.toHaveBeenCalledWith('github.webhook.kobling.kun_body', expect.anything())
  })

  // #633: teksten medlemmet får skal komme fra endringslogg-oppføringen
  // merket med issue-nummeret, aldri fra en GitHub-kommentar.
  it('lukket issue med matchende oppføring → HELE meldingen sendes uavkortet, versjon inkludert', async () => {
    const { klient } = lagAdminKlient({
      innspill_kobling: { data: { profil_id: 'db-profil-625' }, error: null },
    })
    mockCreateAdmin.mockReturnValue(klient)

    const req = lagRequest(lukketPayload({
      number: 625,
      body: '## Ønske fra Ola\n\nZoom på bilder',
    }))

    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.kilde).toBe('endringslogg')

    // Fixturen er over 200 tegn, og asserten er på HELE strengen — en
    // .slice(0, 200) noe sted i stien kan ikke passere her (#633-review).
    expect(MOCK_ENDRING.tekst.length).toBeGreaterThan(200)
    const forventet = byggInnspillSvar(MOCK_ENDRING, null)
    expect(mockSendVarsel).toHaveBeenCalledWith(
      expect.objectContaining({
        mottakere: ['db-profil-625'],
        tittel: forventet.tittel,
        melding: forventet.melding,
      }),
    )
    expect(forventet.melding).toContain('V3.5.58')
    // Tre argumenter: logg.feil kalles med (event, Error, opts). En matcher
    // med bare to ville aldri matchet et reelt kall, og testen ville passert
    // selv om eventet FAKTISK ble logget (#636-review).
    expect(mockLoggFeil).not.toHaveBeenCalledWith(
      'github.webhook.innspill.uten_endringslogg',
      expect.anything(),
      expect.anything(),
    )
  })

  // #633-review (MAJOR 2): not_planned er en NORMALTILSTAND — et innspill vi
  // ikke går videre med har legitimt ingen endringslogg-oppføring. Fyrer
  // warn-en her, blir den trent bort og fanger heller ikke de reelle avvikene.
  it('lukket som not_planned uten oppføring → avslutningstekst og INGEN warn', async () => {
    const { klient } = lagAdminKlient({
      innspill_kobling: { data: { profil_id: 'db-profil-888' }, error: null },
    })
    mockCreateAdmin.mockReturnValue(klient)

    const req = lagRequest(lukketPayload({
      number: 888,
      body: '## Ønske fra Petter\n\nNoe vi ikke gjør',
      state_reason: 'not_planned',
    }))

    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.kilde).toBe('standardtekst')
    expect(mockSendVarsel).toHaveBeenCalledWith(
      expect.objectContaining({
        mottakere: ['db-profil-888'],
        tittel: INNSPILL_AVSLUTTET_TITTEL,
        melding: INNSPILL_AVSLUTTET_MELDING,
      }),
    )
    expect(mockLoggWarn).not.toHaveBeenCalledWith(
      'github.webhook.innspill.uten_endringslogg',
      expect.anything(),
    )
  })

  it('lukket issue uten matchende oppføring → standardtekst + logg.warn, varsel sendes fortsatt', async () => {
    const { klient } = lagAdminKlient({
      innspill_kobling: { data: { profil_id: 'db-profil-999' }, error: null },
    })
    mockCreateAdmin.mockReturnValue(klient)

    const req = lagRequest(lukketPayload({
      number: 999,
      body: '## Ønske fra Kari\n\nNoe helt annet',
    }))

    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.kilde).toBe('standardtekst')
    expect(mockSendVarsel).toHaveBeenCalledWith(
      expect.objectContaining({
        mottakere: ['db-profil-999'],
        tittel: INNSPILL_HANDTERT_TITTEL,
        melding: INNSPILL_HANDTERT_MELDING,
      }),
    )
    // Versjonen må være med: den er det eneste som i ettertid skiller «glemt
    // merkelapp» fra «issuet ble lukket før deployen var ute» (#633-review).
    // logg.feil, ikke warn: et brukerinnspill lukket som gjennomført uten
    // merket oppføring er kontraktbrudd — det skal vekke noen, ikke dempes.
    expect(mockLoggFeil).toHaveBeenCalledWith(
      'github.webhook.innspill.uten_endringslogg',
      expect.any(Error),
      expect.objectContaining({
        ctx: expect.objectContaining({
          issue_nummer: 999,
          versjon: expect.stringMatching(/^V\d+\.\d+\.\d+$/),
        }),
      }),
    )
  })
})
