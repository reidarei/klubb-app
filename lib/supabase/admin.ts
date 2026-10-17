import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { bindTilKlubb, bindPlattform } from './klubb-binding'

function rawAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/** Service-role-klient bundet til én klubb (#871). Se lib/supabase/klubb-binding.ts. */
export type KlubbAdmin = SupabaseClient<Database> & { readonly klubbId: string }

/**
 * Service-role for én klubb: klubbeide tabeller får klubb_id på insert/upsert og
 * filtreres på den ved select/update/delete. `klubbId` kommer fra ensure*().klubbId,
 * aktivKlubbId(), en forelder-rad eller klubbForSystemjobb() — aldri fra request-body.
 */
export function adminForKlubb(klubbId: string): KlubbAdmin {
  return bindTilKlubb(rawAdmin(), klubbId)
}

/**
 * Service-role på tvers av klubber, kun for plattform-jobber (feilalarm, retention,
 * speilvakt, webhook-oppslag, logging). `grunn` er dokumentasjon ved kallstedet.
 * Insert/upsert må bære klubb_id eksplisitt (unntatt feil_logg).
 */
export function adminPlattform(grunn: string): SupabaseClient<Database> {
  if (!grunn) throw new Error('adminPlattform krever en grunn')
  return bindPlattform(rawAdmin())
}

/** @deprecated Bruk adminForKlubb()/adminPlattform(). Slettes i PR 2 av #871. */
export function createAdminClient() {
  return rawAdmin()
}
