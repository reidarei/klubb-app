import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { logg } from '@/lib/logg'

/**
 * Prod-vakt for speilet profiles <-> medlemskap (#868, migrasjon 163).
 *
 * `profiles.rolle/aktiv/faar_*` er et enveis speil av medlemskap for
 * standardklubben, og speilet er bare riktig så lenge ÉN klubb har medlemmer.
 * Vakten alarmerer (via feil_logg og morgenalarmen i sjekk-klientfeil) når:
 *  - avvik > 0: speilet stemmer ikke med medlemskap, eller
 *  - klubber > 1: første medlemskap i klubb nr. 2 er opprettet. Det er fristen
 *    for PR C, som fjerner speilet — håndheves her, ikke bare i en kommentar.
 *
 * Kaster ALDRI: cron-ruten skal kjøre retention og alarm uansett. Et feilet
 * oppslag logges som eget event, så «vakten er blind» ikke ser ut som «alt ok».
 * Egen modul fordi route-filer ikke kan eksportere hjelpere og vakten må
 * kunne testes.
 */
export async function sjekkMedlemskapSpeil(admin: SupabaseClient<Database>): Promise<void> {
  try {
    const { data, error } = await admin.rpc('medlemskap_speil_avvik')
    const rad = data?.[0]
    if (error || !rad) {
      await logg.feil(
        'medlemskap.speil.oppslag.feilet',
        error ?? new Error('medlemskap_speil_avvik() ga ingen rad'),
      )
      return
    }

    const avvik = Number(rad.avvik)
    const klubber = Number(rad.klubber)
    if (avvik > 0 || klubber > 1) {
      await logg.feil(
        'medlemskap.speil.avvik',
        new Error(`medlemskap.speil.avvik: avvik=${avvik} klubber=${klubber}`),
        { ctx: { count: avvik } },
      )
    }
  } catch (err) {
    try {
      await logg.feil('medlemskap.speil.oppslag.feilet', err)
    } catch {
      // Vakten kaster aldri — heller ikke når loggingen selv feiler.
    }
  }
}
