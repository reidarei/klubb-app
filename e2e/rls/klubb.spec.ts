import { test, expect } from '@playwright/test'
import { harRlsMiljo, loggInnKlient, TESTBRUKERE, adminKlient } from '../helpers/rls-klienter'
import { FOERSTE_KLUBB_ID } from '../helpers/klubb'

// Multi-tenant 1.1 (#864): `klubb` kan leses av innloggede, men ingen
// authenticated-rolle skal kunne skrive — heller ikke admin (det finnes ingen
// er_admin()-sti; klubber opprettes først i 5.3 via service_role).
//
// Klientene er utypede (SupabaseClient uten Database-generic), så
// `.from('klubb')` typesjekker før typene regenereres etter merge.

test.describe('klubb — lesbar for innloggede, ikke skrivbar (#864)', () => {
  test.skip(!harRlsMiljo(), 'E2E_SUPABASE_* mangler — se docs/test-instans.md')

  test('medlem leser nøyaktig den første klubben', async () => {
    const petter = await loggInnKlient(TESTBRUKERE.PETTER.epost)
    const { data, error } = await petter.from('klubb').select('id, slug')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].id).toBe(FOERSTE_KLUBB_ID)
    expect(data![0].slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  for (const [navn, epost] of [
    ['medlem', TESTBRUKERE.PETTER.epost],
    ['admin', TESTBRUKERE.ADMIN.epost],
  ] as const) {
    test(`${navn} kan verken sette inn, endre eller slette klubb-rader`, async () => {
      const service = adminKlient('klubb-skrivetest')
      if (!service) throw new Error('adminKlient ga null selv om harRlsMiljo() er sann')
      const foer = await service.from('klubb').select('slug, navn').eq('id', FOERSTE_KLUBB_ID).single()
      expect(foer.error).toBeNull()

      // Feilmeldingen skiller grant fra policy: uten privilegium svarer Postgres
      // «permission denied for table klubb». Med arvet GRANT ALL ville INSERT
      // i stedet stoppet på RLS («violates row-level security policy»), og
      // UPDATE/DELETE gitt 0 rader uten feil — derfor sjekkes meldingen, ikke
      // bare at det feilet. Selve grant-listen vaktes også av
      // __tests__/migrasjon-klubb-grants.test.ts.
      const ingenGrant = /permission denied for table klubb/

      const klient = await loggInnKlient(epost)
      const ins = await klient.from('klubb').insert({ slug: 'skal-ikke-lages', navn: 'Nei' })
      expect(ins.error?.message, 'insert skulle vært avvist av manglende grant').toMatch(ingenGrant)

      const upd = await klient.from('klubb').update({ navn: 'Kapret' }).eq('id', FOERSTE_KLUBB_ID).select()
      expect(upd.error?.message, 'update skulle vært avvist av manglende grant').toMatch(ingenGrant)

      const del = await klient.from('klubb').delete().eq('id', FOERSTE_KLUBB_ID).select()
      expect(del.error?.message, 'delete skulle vært avvist av manglende grant').toMatch(ingenGrant)

      const etter = await service.from('klubb').select('slug, navn').eq('id', FOERSTE_KLUBB_ID).single()
      expect(etter.error).toBeNull()
      expect(etter.data).toEqual(foer.data)
      const ekstra = await service.from('klubb').select('id').eq('slug', 'skal-ikke-lages')
      expect(ekstra.error).toBeNull()
      expect(ekstra.data).toHaveLength(0)
    })
  }
})
