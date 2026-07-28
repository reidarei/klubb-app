'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@/lib/supabase/server'
import { getProfil, getInnloggetBruker } from '@/lib/auth-cache'
import { revalidatePath } from 'next/cache'
import { kanAdministrere, rollerMed } from '@/lib/roller'
import { naa } from '@/lib/dato'
import { ensureAdmin } from '@/lib/auth'
import { KJENTE_FLAGG, erKjentFlagg } from '@/lib/app-innstillinger'

export async function oppdaterVarselInnstilling(noekkel: string, aktiv: boolean) {
  const profil = await getProfil()
  if (!kanAdministrere(profil?.rolle)) return

  const admin = createAdminClient()
  await admin
    .from('varsel_innstillinger')
    .update({ aktiv, oppdatert: naa() })
    .eq('noekkel', noekkel)

  revalidatePath('/innstillinger')
}

// Returnerer resultat i stedet for å kaste: kallet skjer fra en
// startTransition() i TestEpostVelger, og en avvist server action i en
// transition propagerer til nærmeste error boundary i React 19 — altså ville
// hele /innstillinger blitt byttet ut med feilskjermen fordi et nedtrekk
// feilet. Samme mønster som fond.ts (#459). Feilen vises inline ved velgeren.
export async function oppdaterTestEpost(
  epost: string,
): Promise<{ ok: true } | { ok: false; feil: string }> {
  const profil = await getProfil()
  if (!kanAdministrere(profil?.rolle)) return { ok: false, feil: 'Du har ikke tilgang til å endre dette' }

  const admin = createAdminClient()
  // Kun aktive admin-profiler er gyldige test-mottakere — testmodus skal
  // aldri kunne rute varsler til et vanlig medlem ved en feiltastet epost.
  const { data: mottaker, error: mottakerFeil } = await admin
    .from('profiles')
    .select('id')
    .eq('epost', epost)
    .eq('aktiv', true)
    .in('rolle', rollerMed('kanAdministrere'))
    .maybeSingle()
  if (mottakerFeil) return { ok: false, feil: `Kunne ikke slå opp testmottaker: ${mottakerFeil.message}` }
  // Praktisk talt uoppnåelig — <select> fôres kun med admin-eposter fra
  // serveren — men en deaktivert admin midt i økta ville treffe her.
  if (!mottaker) return { ok: false, feil: 'Fant ingen aktiv admin med den eposten' }

  // Uten error-uthenting ville en feilet update sett ut som suksess i UI-et
  // (Policy: Databasespørringer) — nedtrekket ville sprette tilbake ved neste
  // lasting uten at noen forsto hvorfor.
  const { error: skriveFeil } = await admin
    .from('varsel_innstillinger')
    .update({ beskrivelse: epost, oppdatert: naa() })
    .eq('noekkel', 'test_modus')
  if (skriveFeil) return { ok: false, feil: `Kunne ikke lagre test-epost: ${skriveFeil.message}` }

  revalidatePath('/innstillinger')
  return { ok: true }
}

// Oppdaterer ett funksjonsflagg i app_innstillinger.
// Bruker ensureAdmin() per Policy: Auth — returnerer RLS-klienten som er
// autentisert som admin, slik at er_admin()-policyen på tabellen slår til.
export async function oppdaterAppInnstilling(noekkel: string, aktiv: boolean) {
  // Valider mot registeret av kjente flagg først — en ukjent nøkkel skal aldri
  // føre til at vi oppretter en tilfeldig rad i app_innstillinger.
  if (!erKjentFlagg(noekkel)) {
    throw new Error(`Ukjent app-innstilling: ${noekkel}`)
  }

  const { supabase } = await ensureAdmin()

  // upsert (ikke update) slik at en manglende rad opprettes i stedet for stille
  // no-op på friske instanser (klubb-app). beskrivelse sendes med fra metadata
  // fordi kolonnen er nullable (migrasjon 111) — utelates den, nulles den ved
  // konflikt. onConflict='noekkel' matcher primærnøkkelen.
  const { error } = await supabase
    .from('app_innstillinger')
    .upsert(
      { noekkel, aktiv, beskrivelse: KJENTE_FLAGG[noekkel].beskrivelse, oppdatert: naa() },
      { onConflict: 'noekkel' },
    )
  if (error) throw error

  // Revalider layout i tillegg til de flagg-gatede sidene og innstillinger —
  // TopHeader lever i delt layout og trenger en ny server-render for at
  // visFond/visChat-props endres.
  revalidatePath('/', 'layout')
  revalidatePath('/fond')
  revalidatePath('/chat')
  revalidatePath('/innstillinger')
}

// Oppdaterer per-admin toggle for automatisk bursdagsgratulasjon.
// Skrives til profiles-tabellen med innlogget brukers RLS-kontekst —
// ingen kan skru på/av for andre.
export async function oppdaterBursdagsgratulasjon(aktiv: boolean) {
  const [profil, bruker] = await Promise.all([getProfil(), getInnloggetBruker()])
  if (!kanAdministrere(profil?.rolle) || !bruker) return

  const supabase = await createServerClient()
  await supabase
    .from('profiles')
    .update({ bursdagsgratulasjon_aktiv: aktiv })
    .eq('id', bruker.id)

  revalidatePath('/innstillinger')
}
