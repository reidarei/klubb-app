import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { adminKlient } from './admin-klient'
import { SEED_PASSORD } from './auth'

/**
 * Klient-fabrikker for e2e/rls/-suiten (#533). Til forskjell fra resten av
 * e2e-suiten (som går via `page` + UI) snakker RLS-testene direkte med
 * supabase-js som anon eller en innlogget bruker, og leser feltene PostgREST
 * faktisk returnerer — ingen `page`-fixture, ingen dev-server nødvendig.
 *
 * Se e2e/README.md § RLS-tester for hvorfor tre av fire RLS-nektelser gir
 * `data: []` uten feil, og hvorfor hver skrivetest MÅ verifisere med
 * service_role at raden faktisk er uendret.
 */

// De fire seedede brukerne fra supabase/seed.sql. Rollene speiler seed-
// oppdateringene — endres en rolle der, må denne tabellen følge etter.
export const TESTBRUKERE = {
  ADMIN: { id: '00000000-0000-4000-8000-000000000001', epost: 'e2e-admin@klubb.test', rolle: 'admin' },
  PETTER: { id: '00000000-0000-4000-8000-000000000002', epost: 'petter.prove@klubb.test', rolle: 'medlem' },
  OLA: { id: '00000000-0000-4000-8000-000000000003', epost: 'ola.testesen@klubb.test', rolle: 'medlem' },
  GUNNAR: { id: '00000000-0000-4000-8000-000000000004', epost: 'gunnar.general@klubb.test', rolle: 'generalsekretaer' },
} as const

/**
 * Sant når alle tre E2E_SUPABASE_*-variablene er satt. Samme mønster som
 * `harTestCreds()` i helpers/auth.ts, men RLS-suiten bruker ikke
 * TEST_EPOST/TEST_PASSORD (den logger ikke inn via UI) — den trenger derfor
 * sin egen vakt direkte på env-variablene.
 */
export function harRlsMiljo(): boolean {
  return Boolean(
    process.env.E2E_SUPABASE_URL &&
      process.env.E2E_SUPABASE_ANON_KEY &&
      process.env.E2E_SUPABASE_SERVICE_KEY,
  )
}

/**
 * Kaster hvis anon-nøkkelen og service-nøkkelen er identiske. Uten denne
 * vakten kunne en feilkonfigurert .env.local (samme nøkkel kopiert inn to
 * ganger) gjort HELE RLS-suiten grønn av feil grunn — «anon»-klienten ville i
 * praksis vært en service_role-klient, og enhver RLS-policy ville sett ut til
 * å virke.
 *
 * Kalles fra `anonKlient()` (og dermed indirekte fra `loggInnKlient()`), ikke
 * fra den enkelte speccen: en `beforeAll` i én fil beskytter bare den fila, og
 * kjøres ikke når man filtrerer suiten ned til en annen.
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
 * Anon-klient uten sesjon. `persistSession`/`autoRefreshToken` er slått av —
 * dette er en kortlevd testklient, ikke en nettleserfane, og vi vil ikke ha
 * bakgrunnstimere som holder testprosessen i live etter siste assert.
 *
 * Nøkkelvakten kjøres HER, ikke i den enkelte speccen: da er det umulig å
 * opprette en klient uten at vakten har kjørt, uansett hvilken delmengde av
 * suiten som kjøres (`--grep`, én enkelt fil, én prosjekt-filtrering).
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
 * GoTrue rate-limiter `sign_in_sign_ups` til 30 per 5 minutter per IP
 * (supabase/config.toml). RLS-suiten ber om ~26 innlogginger, resten av
 * e2e-suiten om noen til, og `retries: 1` i CI dobler et feilet delsett — uten
 * memoisering sprenger vi taket og får 429. Det verste med 429 her er ikke at
 * det er tregt: en feilet innlogging ser ut som et SIKKERHETSBRUDD i
 * rapporten (klienten får ingen sesjon, leser som anon, og en «kunne ikke
 * lese»-assert blir grønn av feil grunn).
 *
 * Merk at cachen ikke motsier gjenbruks-advarselen i `loggInnKlient()` under:
 * den advarer mot å gjenbruke ÉN klient PÅ TVERS AV brukere. Nøkkelen her er
 * e-posten, så hver bruker har sin egen klient og identitets-asserten under
 * kjøres når klienten opprettes.
 */
const innloggedeKlienter = new Map<string, SupabaseClient>()

/**
 * Anon-klient som logger inn som `epost` (felles SEED_PASSORD for alle
 * seedede brukere). Asserter at `auth.getUser()` faktisk gir tilbake
 * BRUKEREN VI BA OM før klienten returneres — vakten mot «testen brukte feil
 * klient», altså at en spec ved en feiltakelse leser en annen brukers
 * sesjon (f.eks. en gjenbrukt klient delt mellom to brukere) og feilaktig
 * tolker det som at RLS slapp gjennom.
 *
 * Klienten memoiseres per e-post (se kommentaren over `innloggedeKlienter`).
 * Sesjonen lever i minnet i workerens levetid; GoTrue-tokenet varer i 1 time,
 * langt mer enn en e2e-kjøring, så `autoRefreshToken: false` er uproblematisk.
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

// Re-eksportert for at RLS-specene kan importere alt de trenger fra én fil.
export { adminKlient }
