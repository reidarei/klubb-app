import { test, expect } from '@playwright/test'
import { harRlsMiljo, loggInnKlient, TESTBRUKERE } from '../helpers/rls-klienter'
import { FOERSTE_KLUBB_ID } from '../helpers/klubb'

// Multi-tenant 2.2 (#869): custom_access_token_hook legger klubb og rolle i tokenet.
// Her måles det ekte GoTrue faktisk utsteder (psql-steget «Verifiser JWT-hook» kaller
// bare funksjonen direkte). Krever at hooken er aktivert i config.toml for instansen;
// på test-instansen først etter `supabase stop && supabase start` (docs/test-instans.md).
//
// Bruker memoisert loggInnKlient(): GoTrue tillater 30 innlogginger per 5 min per IP,
// og RLS-suiten bruker ~26 fra før.

function dekodNyttelast(token: string): Record<string, unknown> {
  // JWT er tre base64url-deler; nyttelasten er del 2.
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf-8'))
}

test.describe('klubb og rolle i innloggings-tokenet (#869)', () => {
  test.skip(!harRlsMiljo(), 'E2E_SUPABASE_* mangler — se docs/test-instans.md')

  for (const bruker of [TESTBRUKERE.ADMIN, TESTBRUKERE.PETTER, TESTBRUKERE.GUNNAR]) {
    test(`${bruker.epost}: tokenet har klubb_id, rolle og klubb_status`, async () => {
      const klient = await loggInnKlient(bruker.epost)
      const { data, error } = await klient.auth.getSession()
      expect(error).toBeNull()
      const token = data.session?.access_token
      expect(token, 'ingen access_token i sesjonen').toBeTruthy()
      const claims = dekodNyttelast(token as string)

      expect(claims.klubb_status).toBe('aktiv')
      expect(claims.klubb_id).toBe(FOERSTE_KLUBB_ID)
      expect(claims.rolle).toBe(bruker.rolle)
      // Hooken skal ikke ha rørt resten av tokenet.
      expect(claims.role).toBe('authenticated')
      expect(claims.sub).toBe(bruker.id)
      expect(claims.aud).toBeTruthy()
      expect(claims.session_id).toBeTruthy()
      expect(claims.aal).toBeTruthy()
    })
  }
})
