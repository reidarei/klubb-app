'use server'

// Server action for bursdagsbilde (#641). ÉN eksport, med vilje: alt som
// eksporteres fra en 'use server'-modul blir et klient-kallbart endepunkt,
// så bare funksjoner som selv autoriserer hører hjemme her. Selve
// orkestreringen (claim → Vertex → R2 → rad) bor i
// lib/bursdagsbilde-generering.ts, som er en vanlig lib-modul kalt av cron
// og av admin-actionen.
//
// BEVISST GRENSE — les før du endrer denne fila: ingen sendVarsel(), ingen
// sendChatVarsler(), og lib/actions/bursdagsgratulasjon.ts /
// lib/actions/bursdagsvarsel.ts er IKKE rørt av #641. Ingen får varsel om at
// et bilde er klart; admin må selv oppsøke /innstillinger/bursdagsbilde for
// å se resultatet. Reidars uttrykkelige beslutning (issue #641), ikke en
// forglemmelse.

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
  // Reidars beslutning (issue #641): enhver admin kan slette et
  // bursdagsbilde — ikke bare subjektet selv (som uansett ikke har noen
  // egen tilgang til denne tabellen, se migrasjon 140).
  const { user } = await ensureAdmin()

  // RLS på bursdagsbilde gir `authenticated` KUN select (migrasjon 140) —
  // update er service_role-only. createAdminClient() bypasser RLS med
  // vilje her; ensureAdmin() over er ENESTE porten inn til denne
  // funksjonen, ikke en penere feilmelding oppå en RLS-sjekk som uansett
  // ville sluppet gjennom for en admin.
  const admin = createAdminClient()

  const { data: rad, error: hentFeil } = await admin.from('bursdagsbilde')
    .select('bilde_url')
    .eq('profil_id', profilId)
    .eq('feiringsdato', feiringsdato)
    .maybeSingle()
  if (hentFeil) throw new Error(`Kunne ikke hente bursdagsbilde: ${hentFeil.message}`)

  // Idempotent: ingen rad, eller raden har allerede bilde_url = null ⇒
  // ingenting å gjøre. Returnerer stille — ikke en feil å slette to ganger.
  const eksisterendeUrl = rad?.bilde_url ?? null
  if (!eksisterendeUrl) return

  // REKKEFØLGEN ER BEVISST: R2-objektet slettes FØR raden nulles ut. Ikke snu
  // den — begge feilmodusene er avveid (arkitekturstyret, #641):
  //  · Slett først, DB feiler  ⇒ raden peker på et bilde som ikke finnes:
  //    ett brutt kort i inntil ett døgn, og operasjonen kan gjentas fordi
  //    pekeren består.
  //  · DB først, R2-slett feiler ⇒ et KI-generert ansiktsbilde av et navngitt
  //    medlem blir liggende i en offentlig bucket UTEN at noe i systemet vet
  //    at det finnes — raden er eneste peker til objektet. Usporbart, umulig
  //    å rydde.
  // Personvern slår kosmetikk. En feilet DB-oppdatering under logges nedenfor
  // med stien, så det brutte kortet kan ryddes manuelt.
  const sti = r2StiFraUrl(eksisterendeUrl)
  if (sti) await slettR2(sti)

  const { error: oppdaterFeil } = await admin.from('bursdagsbilde')
    .update({ bilde_url: null, status: 'fjernet', slettet_paa: naa(), slettet_av: user.id })
    .eq('profil_id', profilId)
    .eq('feiringsdato', feiringsdato)
  if (oppdaterFeil) {
    // Vinduet mellom R2-slett og DB-oppdatering: objektet er borte, raden
    // peker fortsatt på det. Logg med sti og profil før kastet, ellers står
    // det brutte kortet uten spor noen kan rydde etter.
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
