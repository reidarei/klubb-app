// aktivKlubbId() (#868, #869) har sin uuid i tre kopier som ikke kan importere hverandre:
// koden, standard_klubb_id() i SQL og init-admin.mjs. Denne testen holder dem like,
// og dekker hver tilstand claimen kan ha i fase 1 (alltid STANDARD, logging etter tilstand).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const STANDARD = '00000000-0000-4000-a000-000000000001'
const ANNEN = '00000000-0000-4000-a000-000000000002'

const getSession = vi.fn()
const getClaims = vi.fn()
const getUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({ auth: { getSession, getClaims, getUser } }),
}))
const loggFeil = vi.fn(async (..._args: unknown[]) => {})
vi.mock('@/lib/logg', () => ({
  logg: { feil: (...a: unknown[]) => loggFeil(...a), warn: vi.fn() },
}))

// React cache() memoiserer bare innenfor en request; utenfor en request kjører den uten memo.
async function kjor() {
  const { aktivKlubbId } = await import('@/lib/klubb-kontekst')
  return aktivKlubbId()
}

function jwt(claims: Record<string, unknown> | string) {
  const b64 = (v: string) => Buffer.from(v).toString('base64url')
  const payload = typeof claims === 'string' ? claims : b64(JSON.stringify(claims))
  return `${b64('{"alg":"ES256"}')}.${payload}.sig`
}
function medToken(claims: Record<string, unknown> | string) {
  getSession.mockResolvedValue({ data: { session: { access_token: jwt(claims) } } })
}

function les(rel: string) {
  return readFileSync(path.resolve(__dirname, '..', rel), 'utf-8').replace(/\r\n/g, '\n')
}

describe('aktivKlubbId()', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    vi.resetModules()
    getSession.mockReset()
    getClaims.mockReset()
    getUser.mockReset()
    loggFeil.mockClear()
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })
  afterEach(() => {
    // Ingen nettverk, getClaims eller getUser i noen tilstand (kontrakten mot middleware).
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(getClaims).not.toHaveBeenCalled()
    expect(getUser).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  const sqlUuid = /standard_klubb_id\(\) returns uuid[\s\S]*?'([0-9a-f-]{36})'::uuid/.exec(
    les('supabase/migrations/161_klubb_id.sql'),
  )?.[1]

  it('er lik uuid-en i standard_klubb_id() (161_klubb_id.sql)', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    expect(sqlUuid).toBeDefined()
    expect(await kjor()).toBe(sqlUuid)
  })

  it('står også i scripts/init-admin.mjs', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    expect(les('scripts/init-admin.mjs')).toContain(`'${await kjor()}'`)
  })

  it('lib/klubb-kontekst.ts er server-only', () => {
    expect(les('lib/klubb-kontekst.ts').startsWith("import 'server-only'")).toBe(true)
  })

  it('er cache()-wrappet og bruker aldri getClaims/getUser', () => {
    const kilde = les('lib/klubb-kontekst.ts')
    expect(kilde).toMatch(/export const aktivKlubbId = cache\(/)
    expect(kilde).not.toMatch(/getClaims|getUser|jwks/i)
  })

  it('sesjonen leses via den delte hentSesjon() (#869-review: én parsing per request)', () => {
    const sesjon = les('lib/sesjon.ts')
    expect(sesjon).toMatch(/export const hentSesjon = cache\(/)
    expect(sesjon).not.toMatch(/\.(getClaims|getUser)\(|jwks/i)
    for (const fil of ['lib/klubb-kontekst.ts', 'lib/auth-cache.ts']) {
      const kilde = les(fil)
      expect(kilde).toContain("from '@/lib/sesjon'")
      expect(kilde).not.toMatch(/\.auth\.getSession\(/)
    }
  })

  it('ingen sesjon: STANDARD, stille', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    expect(await kjor()).toBe(STANDARD)
    expect(loggFeil).not.toHaveBeenCalled()
  })

  it('aktiv + standardklubb: STANDARD, stille', async () => {
    medToken({ klubb_status: 'aktiv', klubb_id: STANDARD, rolle: 'admin' })
    expect(await kjor()).toBe(STANDARD)
    expect(loggFeil).not.toHaveBeenCalled()
  })

  it('aktiv + fremmed klubb: STANDARD og klubb.claim.avvik', async () => {
    medToken({ klubb_status: 'aktiv', klubb_id: ANNEN })
    expect(await kjor()).toBe(STANDARD)
    expect(loggFeil).toHaveBeenCalledTimes(1)
    expect(loggFeil.mock.calls[0][0]).toBe('klubb.claim.avvik')
  })

  it('aktiv uten gyldig uuid: klubb.claim.inkonsistent', async () => {
    medToken({ klubb_status: 'aktiv', klubb_id: 'tull' })
    expect(await kjor()).toBe(STANDARD)
    expect(loggFeil.mock.calls[0][0]).toBe('klubb.claim.inkonsistent')
  })

  it('aktiv uten klubb_id: klubb.claim.inkonsistent', async () => {
    medToken({ klubb_status: 'aktiv' })
    expect(await kjor()).toBe(STANDARD)
    expect(loggFeil.mock.calls[0][0]).toBe('klubb.claim.inkonsistent')
  })

  it('ukjent klubb_status: klubb.claim.inkonsistent', async () => {
    medToken({ klubb_status: 'noe_nytt' })
    expect(await kjor()).toBe(STANDARD)
    expect(loggFeil.mock.calls[0][0]).toBe('klubb.claim.inkonsistent')
  })

  it('uleselig payload: klubb.claim.inkonsistent', async () => {
    medToken('ikke-base64-json!!')
    expect(await kjor()).toBe(STANDARD)
    expect(loggFeil.mock.calls[0][0]).toBe('klubb.claim.inkonsistent')
  })

  it('ingen_medlemskap: STANDARD, stille', async () => {
    medToken({ klubb_status: 'ingen_medlemskap' })
    expect(await kjor()).toBe(STANDARD)
    expect(loggFeil).not.toHaveBeenCalled()
  })

  it('feil: klubb.claim.hookfeil', async () => {
    medToken({ klubb_status: 'feil' })
    expect(await kjor()).toBe(STANDARD)
    expect(loggFeil.mock.calls[0][0]).toBe('klubb.claim.hookfeil')
  })

  it('markør mangler: klubb.claim.mangler', async () => {
    medToken({ sub: 'x', role: 'authenticated' })
    expect(await kjor()).toBe(STANDARD)
    expect(loggFeil.mock.calls[0][0]).toBe('klubb.claim.mangler')
  })

  it('logger aldri token-innhold utover klubb_status og klubb_id (ctx)', async () => {
    medToken({ klubb_status: 'aktiv', klubb_id: ANNEN, sub: 'hemmelig-bruker', rolle: 'admin' })
    await kjor()
    expect(JSON.stringify(loggFeil.mock.calls[0])).not.toMatch(/hemmelig-bruker|admin/)
    // ctx, ikke sample: logg.feil() viderefører kun ctx (se klubb-kontekst-logg.test.ts).
    expect(loggFeil.mock.calls[0][2]).toEqual({ ctx: { klubb_status: 'aktiv', klubb_id: ANNEN } })
  })

  it('kappet ukjent klubb_status går i ctx', async () => {
    medToken({ klubb_status: 'x'.repeat(100) })
    await kjor()
    expect(loggFeil.mock.calls[0][2]).toEqual({
      ctx: { klubb_status: 'x'.repeat(40), klubb_id: undefined },
    })
  })
})
