import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { adminKlient } from './admin-klient'
import { SEED_PASSORD } from './auth'

/**
 * Klient-fabrikker for e2e/rls/-suiten (#533): snakker direkte med supabase-js
 * som anon eller innlogget bruker, uten `page` eller dev-server.
 *
 * Se e2e/README.md § RLS-tester for hvorfor de fleste RLS-nektelser gir
 * `data: []` uten feil, og hvorfor hver skrivetest MÅ verifisere med
 * service_role at raden er uendret.
 */

// Speiler supabase/seed.sql — endres en rolle der, må denne følge etter.
export const TESTBRUKERE = {
  ADMIN: { id: '00000000-0000-4000-8000-000000000001', epost: 'e2e-admin@klubb.test', rolle: 'admin' },
  PETTER: { id: '00000000-0000-4000-8000-000000000002', epost: 'petter.prove@klubb.test', rolle: 'medlem' },
  OLA: { id: '00000000-0000-4000-8000-000000000003', epost: 'ola.testesen@klubb.test', rolle: 'medlem' },
  GUNNAR: { id: '00000000-0000-4000-8000-000000000004', epost: 'gunnar.general@klubb.test', rolle: 'generalsekretaer' },
} as const

/**
 * Sant når alle tre E2E_SUPABASE_*-variablene er satt. Egen vakt fordi
 * RLS-suiten ikke bruker TEST_EPOST/TEST_PASSORD (jf. `harTestCreds()`).
 */
export function harRlsMiljo(): boolean {
  return Boolean(
    process.env.E2E_SUPABASE_URL &&
      process.env.E2E_SUPABASE_ANON_KEY &&
      process.env.E2E_SUPABASE_SERVICE_KEY,
  )
}

/**
 * Kaster hvis anon- og service-nøkkelen er identiske — ellers ville
 * «anon»-klienten vært service_role, og hele RLS-suiten grønn av feil grunn.
 *
 * Kalles fra `anonKlient()`, ikke fra hver spec: en `beforeAll` beskytter bare
 * sin egen fil og kjøres ikke når suiten filtreres.
 */
export function assertNoklerErUlike(): void {
  const anon = process.env.E2E_SUPABASE_ANON_KEY
  const service = process.env.E2E_SUPABASE_SERVICE_KEY
  if (anon && service && anon === service) {
    throw new Error(
      'E2E_SUPABASE_ANON_KEY og E2E_SUPABASE_SERVICE_KEY er identiske — RLS-testene ' +
        'ville vært verdiløse (anon-klienten hadde i praksis vært service_role). Sjekk .env.local.',
    )
  }
}

/**
 * Anon-klient uten sesjon. `persistSession`/`autoRefreshToken` av, så ingen
 * bakgrunnstimere holder testprosessen i live etter siste assert.
 */
export function anonKlient(): SupabaseClient {
  assertNoklerErUlike()
  const url = process.env.E2E_SUPABASE_URL ?? ''
  const anonKey = process.env.E2E_SUPABASE_ANON_KEY ?? ''
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Memoiserte innloggede klienter, én per e-post per worker-prosess.
 *
 * GoTrue rate-limiter innlogging til 30 per 5 min per IP (supabase/config.toml);
 * RLS-suiten alene ber om ~26, og CI-retries dobler. En 429 er verre enn tregt:
 * klienten leser da som anon, og en «kunne ikke lese»-assert blir grønn av feil grunn.
 * Nøkkelen er e-posten, så ingen klient deles på tvers av brukere.
 */
const innloggedeKlienter = new Map<string, SupabaseClient>()

/**
 * Anon-klient innlogget som `epost` (felles SEED_PASSORD). Asserter at
 * `auth.getUser()` gir BRUKEREN VI BA OM — vakt mot at en spec leser en annen
 * brukers sesjon og feiltolker det som at RLS slapp gjennom.
 *
 * Memoisert per e-post. Tokenet varer 1 time, langt over en e2e-kjøring, så
 * `autoRefreshToken: false` er uproblematisk.
 */
export async function loggInnKlient(epost: string): Promise<SupabaseClient> {
  const bufret = innloggedeKlienter.get(epost)
  if (bufret) return bufret

  const klient = anonKlient()
  const { data: innData, error: innFeil } = await klient.auth.signInWithPassword({
    email: epost,
    password: SEED_PASSORD,
  })
  if (innFeil || !innData.user) {
    throw new Error(`Innlogging feilet for ${epost}: ${innFeil?.message ?? 'ingen bruker returnert'}`)
  }

  const forventetId = Object.values(TESTBRUKERE).find(b => b.epost === epost)?.id
  const { data: brukerData, error: brukerFeil } = await klient.auth.getUser()
  if (brukerFeil || !brukerData.user) {
    throw new Error(`auth.getUser() feilet etter innlogging som ${epost}: ${brukerFeil?.message ?? 'ingen bruker'}`)
  }
  if (forventetId && brukerData.user.id !== forventetId) {
    throw new Error(
      `Feil klient: logget inn som ${epost} men auth.getUser() ga id ${brukerData.user.id}, forventet ${forventetId}.`,
    )
  }

  innloggedeKlienter.set(epost, klient)
  return klient
}

export { adminKlient }
