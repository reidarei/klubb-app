'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getProfil } from '@/lib/auth-cache'
import { revalidatePath } from 'next/cache'
import { kanAdministrere, rollerMed } from '@/lib/roller'
import { naa } from '@/lib/dato'
import { ensureAdmin } from '@/lib/auth'
import { KJENTE_FLAGG, erKjentFlagg } from '@/lib/app-innstillinger'
import { erVarselBryter } from '@/lib/varsel-typer'

export async function oppdaterVarselInnstilling(noekkel: string, aktiv: boolean) {
  // Brukerens egen klient, ikke service role: upserten kan SETTE INN rader, så
  // er_admin()-policyene på varsel_innstillinger må være det som slipper
  // skrivingen gjennom (#767).
  const { supabase } = await ensureAdmin()

  // erVarselBryter(), ikke «finnes i VARSEL_TEKSTER»: registeret har også
  // oppføringer uten `panel` (bare for å navngi historiske varsel_logg-rader,
  // #643). En rad for dem ville dukket opp som etikettløs bryter (#767).
  // Vakten dekker også prototype-hullet — se erVarselBryter().
  if (!erVarselBryter(noekkel)) {
    throw new Error(`Ukjent varsel-innstilling: ${noekkel}`)
  }

  // upsert, ikke update: symbol-avledede varseltyper seedes ikke (mig. 152,
  // #767), og UI-et viser en syntetisk rad — update() ville vært en stille
  // no-op før raden finnes.
  //
  // Payloaden bærer KUN noekkel/aktiv/oppdatert. For et enkelt objekt blir
  // `do update set` bare disse kolonnene, så `beskrivelse` (= test-eposten for
  // test_modus) og `dager_foer` står urørt, atomisk uten les-før-skriv.
  // Nullingen lib/app-innstillinger.ts advarer mot gjelder kun BULK-upsert.
  const { error } = await supabase
    .from('varsel_innstillinger')
    .upsert({ noekkel, aktiv, oppdatert: naa() }, { onConflict: 'noekkel' })
  if (error) throw new Error(`Kunne ikke lagre varsel-innstilling «${noekkel}»: ${error.message}`)

  revalidatePath('/innstillinger', 'layout')
}

// Returnerer resultat i stedet for å kaste: kalles fra startTransition() i
// TestEpostVelger, og et kast der ville byttet hele /innstillinger ut med
// error boundary-en (#459, samme mønster som fond.ts).
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

  const { error: skriveFeil } = await admin
    .from('varsel_innstillinger')
    .update({ beskrivelse: epost, oppdatert: naa() })
    .eq('noekkel', 'test_modus')
  if (skriveFeil) return { ok: false, feil: `Kunne ikke lagre test-epost: ${skriveFeil.message}` }

  revalidatePath('/innstillinger', 'layout')
  return { ok: true }
}

// RLS-klienten fra ensureAdmin(), så er_admin()-policyen slår til.
export async function oppdaterAppInnstilling(noekkel: string, aktiv: boolean) {
  // En ukjent nøkkel skal aldri opprette en tilfeldig rad via upserten.
  if (!erKjentFlagg(noekkel)) {
    throw new Error(`Ukjent app-innstilling: ${noekkel}`)
  }

  const { supabase } = await ensureAdmin()

  // upsert, ikke update: på friske instanser (klubb-app) mangler raden.
  // beskrivelse sendes med for INSERT-grenens skyld (nullable, mig. 111). Se
  // KJENTE_FLAGG for hvorfor enkelt-objekt-upsert ikke nuller felt (#771).
  const { error } = await supabase
    .from('app_innstillinger')
    .upsert(
      { noekkel, aktiv, beskrivelse: KJENTE_FLAGG[noekkel].beskrivelse, oppdatert: naa() },
      { onConflict: 'noekkel' },
    )
  if (error) throw error

  // Layout også: TopHeader sine visFond/visChat-props kommer fra delt layout.
  revalidatePath('/', 'layout')
  revalidatePath('/fond')
  revalidatePath('/chat')
  revalidatePath('/innstillinger', 'layout')
}

// Per-admin bryter, skrevet med egen RLS-kontekst — ingen kan endre andres.
export async function oppdaterBursdagsgratulasjon(aktiv: boolean) {
  const { supabase, user } = await ensureAdmin()
  const { error } = await supabase
    .from('profiles')
    .update({ bursdagsgratulasjon_aktiv: aktiv })
    .eq('id', user.id)
  if (error) throw new Error(`Kunne ikke lagre bursdagsgratulasjon-valget: ${error.message}`)

  revalidatePath('/profil')
}
