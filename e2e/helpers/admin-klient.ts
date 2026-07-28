import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Delt service-role-klient for e2e-specs som må seede eller rydde data direkte
 * i databasen (uten å gå via UI, så cleanup fungerer selv om testen feilet
 * halvveis).
 *
 * Kjører mot TEST-INSTANSEN (E2E_SUPABASE_*, se docs/test-instans.md) — aldri
 * prod. playwright.config.ts garanterer at URL-en ikke peker mot sky-Supabase.
 *
 * Returnerer null hvis env mangler, men logger alltid hvorfor: en stille null
 * her betyr at seeding eller cleanup ikke skjedde, og det skal ikke gjettes på
 * i etterkant.
 */
export function adminKlient(kilde: string): SupabaseClient | null {
  const url = process.env.E2E_SUPABASE_URL
  const serviceKey = process.env.E2E_SUPABASE_SERVICE_KEY
  if (!url || !serviceKey) {
    // Uten test-instans skippes specene (harTestCreds) — men vær eksplisitt om
    // hvorfor ingenting skjedde hvis vi likevel havner her.
    console.warn(`[${kilde}] E2E_SUPABASE_* mangler — hopper over DB-tilgang`)
    return null
  }
  return createClient(url, serviceKey)
}
