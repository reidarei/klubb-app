'use server'

// Server action for bursdagsbilde (#641). Én eksport med vilje: alt som
// eksporteres fra 'use server' blir et klient-kallbart endepunkt, så kun
// funksjoner som selv autoriserer hører hjemme her. Orkestreringen bor i
// lib/bursdagsbilde-generering.ts.
//
// Bevisst grense: ingen varsel om at et bilde er klart — admin oppsøker
// /innstillinger/bursdagsbilde selv (beslutning i #641, ikke en forglemmelse).

import { ensureAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { slettR2, r2StiFraUrl } from '@/lib/r2'
import { naa } from '@/lib/dato'
import { logg } from '@/lib/logg'
import { revalidatePath } from 'next/cache'

/**
 * Fjern (ikke slett raden) et generert bursdagsbilde. Terminal for cron —
 * status 'fjernet' overtas kun av en TVUNGEN admin-regenerering (migrasjon
 * 140). Aldri `delete` — raden er claim-nøkkelen krev_bursdagsbilde()
 * bygger på; en slettet rad ville sett ut som «aldri forsøkt» for cron.
 */
export async function slettBursdagsbilde(profilId: string, feiringsdato: string): Promise<void> {
  // Enhver admin kan slette (#641).
  const { user } = await ensureAdmin()

  // `authenticated` har kun select (mig. 140), så admin-klienten bypasser RLS
  // — ensureAdmin() over er her ENESTE port, ikke bare en penere feilmelding.
  const admin = createAdminClient()

  const { data: rad, error: hentFeil } = await admin.from('bursdagsbilde')
    .select('bilde_url')
    .eq('profil_id', profilId)
    .eq('feiringsdato', feiringsdato)
    .maybeSingle()
  if (hentFeil) throw new Error(`Kunne ikke hente bursdagsbilde: ${hentFeil.message}`)

  // Idempotent: å slette to ganger er ikke en feil.
  const eksisterendeUrl = rad?.bilde_url ?? null
  if (!eksisterendeUrl) return

  // REKKEFØLGEN ER BEVISST — R2 før DB, ikke snu den (#641):
  //  · R2 først, DB feiler ⇒ et brutt kort, men pekeren består og operasjonen
  //    kan gjentas.
  //  · DB først, R2 feiler ⇒ et KI-ansiktsbilde blir liggende i en offentlig
  //    bucket uten noen peker. Usporbart.
  // Personvern slår kosmetikk.
  const sti = r2StiFraUrl(eksisterendeUrl)
  if (sti) await slettR2(sti)

  const { error: oppdaterFeil } = await admin.from('bursdagsbilde')
    .update({ bilde_url: null, status: 'fjernet', slettet_paa: naa(), slettet_av: user.id })
    .eq('profil_id', profilId)
    .eq('feiringsdato', feiringsdato)
  if (oppdaterFeil) {
    // Objektet er borte, raden peker fortsatt på det — logg sti for manuell rydding.
    await logg
      .feil('bursdagsbilde.slett.feilet', oppdaterFeil, {
        fingerprint: 'db-update-etter-r2',
        ctx: { profil_id: profilId, sti },
      })
      .catch(() => {})
    throw new Error(`Kunne ikke oppdatere bursdagsbilde: ${oppdaterFeil.message}`)
  }

  revalidatePath('/')
}
