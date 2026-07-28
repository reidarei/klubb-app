// @vitest-environment node
//
// Pinner at de to varsel-mottakerne filtrerer på hvert sitt
// profiles-felt etter at faar_issue_varsler ble delt i to (migrasjon 123):
//   - /api/cron/sjekk-klientfeil (døgnalarmen)  → faar_feilvarsler
//   - /api/github/webhook (nye innspill)        → faar_issue_varsler
// Feltene styrer helt ulike ting (feilhåndtering vs. dialog om innspill), og
// er lett å blande sammen ved et uhell siden de lenge var samme kolonne.
//
// Node-miljø: begge rutene bruker Request/NextRequest/crypto som jsdom ikke
// leverer (se cron-paaminne-gating.test.ts for samme begrunnelse).
//
// vi.mock/vi.hoisted MÅ stå på modul-toppnivå (Vitest hoister dem uansett,
// og varsler om det hvis de står inni describe-blokker — se
// https://vitest.dev/guide/mocking/modules#how-it-works).

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

// Generisk chainable mock — én chain per tabellnavn, med konfigurerbart
// sluttresultat og full logg av eq()-kallene, slik at vi kan pinne både
// FELTNAVNET og verdien filteret ble kalt med.
function lagAdminKlient(tabellResultater: Record<string, unknown>) {
  const kallPerTabell: Record<string, [string, ...unknown[]][]> = {}

  function lagChain(tabell: string, resultat: unknown) {
    const kall: [string, ...unknown[]][] = []
    kallPerTabell[tabell] = kall
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'lt', 'delete']) {
      chain[m] = vi.fn((...args: unknown[]) => {
        kall.push([m, ...args])
        return chain
      })
    }
    chain.then = (resolve: (v: unknown) => void) => Promise.resolve(resultat).then(resolve)
    return chain
  }

  const from = vi.fn((tabell: string) => lagChain(tabell, tabellResultater[tabell]))
  const klient = { from } as unknown as SupabaseClient<Database>

  const eqKallFor = (tabell: string) =>
    (kallPerTabell[tabell] ?? []).filter(k => k[0] === 'eq').map(k => k.slice(1))

  return { klient, from, eqKallFor }
}

const {
  mockSendVarsel,
  mockCreateAdmin,
  mockTellAlarmverdigeFeil,
  mockHentToppEventRader,
} = vi.hoisted(() => ({
  mockSendVarsel: vi.fn(),
  mockCreateAdmin: vi.fn(),
  mockTellAlarmverdigeFeil: vi.fn(),
  mockHentToppEventRader: vi.fn(),
}))

vi.mock('@/lib/varsler', () => ({ sendVarsel: mockSendVarsel }))
vi.mock('@/lib/logg', () => ({
  logg: { feil: vi.fn(), warn: vi.fn() },
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mockCreateAdmin }))
vi.mock('@/lib/feil-alarm', () => ({
  tellAlarmverdigeFeil: mockTellAlarmverdigeFeil,
  hentToppEventRader: mockHentToppEventRader,
  lagToppEventTekst: () => '',
}))

describe('/api/cron/sjekk-klientfeil – mottakere filtreres på faar_feilvarsler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-cron-secret'
    mockSendVarsel.mockResolvedValue({})
    mockTellAlarmverdigeFeil.mockResolvedValue({ count: 1, error: null })
    mockHentToppEventRader.mockResolvedValue({ data: [] })
  })

  it('spør profiles på faar_feilvarsler = true, ikke faar_issue_varsler', async () => {
    const { klient, eqKallFor } = lagAdminKlient({
      profiles: { data: [{ id: 'p1' }], error: null },
      feil_logg: { count: 0 },
    })
    mockCreateAdmin.mockReturnValue(klient)

    const { POST } = await import('@/app/api/cron/sjekk-klientfeil/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest('http://localhost:3000/api/cron/sjekk-klientfeil', {
      method: 'POST',
      headers: { authorization: 'Bearer test-cron-secret' },
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    expect(eqKallFor('profiles')).toEqual([
      ['faar_feilvarsler', true],
      ['aktiv', true],
    ])
    expect(mockSendVarsel).toHaveBeenCalledWith(
      expect.objectContaining({ mottakere: ['p1'] }),
    )
  })
})

describe('/api/github/webhook – mottakere filtreres på faar_issue_varsler', () => {
  const HEMMELIGHET = 'test-webhook-secret'

  // GITHUB_WEBHOOK_SECRET leses av ruten på modul-nivå (const ved import) —
  // må derfor settes FØR modulen lastes. Statiske imports kjøres uansett før
  // annen topp-nivå-kode i samme fil (ES-modul-hoisting), så vi må importere
  // dynamisk i beforeAll etter at env er satt.
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

  it('spør profiles på faar_issue_varsler = true, ikke faar_feilvarsler', async () => {
    const { klient, eqKallFor } = lagAdminKlient({
      profiles: { data: [{ id: 'a1' }], error: null },
    })
    mockCreateAdmin.mockReturnValue(klient)

    const payload = {
      action: 'opened',
      issue: {
        number: 42,
        body: '## Ønske fra Kari\n\nNoe fint\n\n<!-- profil_id:11111111-1111-1111-1111-111111111111 -->',
        labels: [{ name: GITHUB_ONSKE_LABEL }],
      },
    }
    const body = JSON.stringify(payload)

    const req = new Request('http://localhost:3000/api/github/webhook', {
      method: 'POST',
      headers: {
        'x-github-event': 'issues',
        'x-hub-signature-256': signer(body),
      },
      body,
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    expect(eqKallFor('profiles')).toEqual([
      ['faar_issue_varsler', true],
      ['aktiv', true],
    ])
  })
})
