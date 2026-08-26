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

vi.mock('@/lib/varsler', () => ({ sendVarsel: mockSendVarsel }))
vi.mock('@/lib/logg', () => ({ logg: { feil: mockLoggFeil, warn: mockLoggWarn } }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mockCreateAdmin }))

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

function lukketPayload(overrides: { number: number; body: string | null; created_at?: string }) {
  return {
    action: 'closed',
    issue: {
      number: overrides.number,
      body: overrides.body,
      created_at: overrides.created_at ?? FOER_KOBLING,
      comments: 0,
      labels: [{ name: GITHUB_ONSKE_LABEL }],
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
    expect(mockLoggFeil).not.toHaveBeenCalled()
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
    expect(mockLoggFeil).not.toHaveBeenCalled()
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
})
