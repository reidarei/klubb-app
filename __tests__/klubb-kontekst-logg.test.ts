// klubb.claim.*-feltene må nå loggerens observerbare utdata (#869-review): logg.feil()
// leser kun opts.ctx, og scrubbet() stripper nøkler utenfor KONTEKST_WHITELIST stille.
// Testen går gjennom EKTE lib/logg (ikke mocket), så både ctx-veien og whitelisten pinnes.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lagFromMock } from './helpers/supabase-mock'

const ANNEN = '00000000-0000-4000-a000-000000000002'

const getSession = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({ auth: { getSession } }),
}))
const mockFrom = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: mockFrom }) }))

// Statisk import (ikke resetModules + dynamisk import i testen): ekte lib/logg er tung å
// transformere kaldt, og det skal ikke telle mot testens timeout. cache() memoiserer
// ikke utenfor en React-request, så hver kjøring leser getSession på nytt.
import { aktivKlubbId } from '@/lib/klubb-kontekst'

function jwt(claims: Record<string, unknown>) {
  const b64 = (v: string) => Buffer.from(v).toString('base64url')
  return `${b64('{"alg":"ES256"}')}.${b64(JSON.stringify(claims))}.sig`
}

describe('aktivKlubbId() → lib/logg', () => {
  beforeEach(() => {
    mockFrom.mockImplementation(lagFromMock({}))
  })

  it('klubb_status og klubb_id står i stdout-linja, annet token-innhold ikke', async () => {
    getSession.mockResolvedValue({
      data: {
        session: {
          access_token: jwt({ klubb_status: 'aktiv', klubb_id: ANNEN, sub: 'hemmelig-bruker' }),
        },
      },
    })
    const spion = vi.spyOn(console, 'log').mockImplementation(() => {})
    await aktivKlubbId()
    const linjer = spion.mock.calls.map((c) => JSON.parse(String(c[0])) as Record<string, unknown>)
    spion.mockRestore()
    const linje = linjer.find((l) => l.event === 'klubb.claim.avvik')
    expect(linje).toMatchObject({ nivaa: 'error', klubb_status: 'aktiv', klubb_id: ANNEN })
    expect(JSON.stringify(linjer)).not.toContain('hemmelig-bruker')
  })
})
