'use server'

import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { ensureInnlogget } from '@/lib/auth'

/**
 * Finn eller opprett samtalen mellom innlogget bruker og motpart.
 * Idempotent — bruker unique-constraint på (profil_a, profil_b) der
 * a < b. Returnerer samtaleId eller redirecter til samtalesiden.
 */
export async function aapneSamtale(motpartId: string) {
  const { supabase, user } = await ensureInnlogget()
  if (motpartId === user.id) throw new Error('Kan ikke åpne samtale med deg selv')

  // Sorter ID-ene så constraint-en (profil_a < profil_b) holder uavhengig
  // av hvem som starter samtalen. Bruker streng-sammenligning siden uuid
  // er strenger i app-laget.
  const [a, b] = user.id < motpartId ? [user.id, motpartId] : [motpartId, user.id]

  // Forsøk å hente eksisterende
  const { data: eksisterende } = await supabase
    .from('samtale')
    .select('id')
    .eq('profil_a', a)
    .eq('profil_b', b)
    .maybeSingle()

  if (eksisterende) {
    redirect(`/samtaler/${eksisterende.id}`)
  }

  // Opprett ny
  const { data: ny, error } = await supabase
    .from('samtale')
    .insert({ profil_a: a, profil_b: b })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  if (!ny) throw new Error('Klarte ikke å opprette samtale')

  redirect(`/samtaler/${ny.id}`)
}

/**
 * Marker alle innkomne meldinger i samtalen som lest. Kalles fra
 * samtalesiden ved load. RLS sørger for at man kun kan oppdatere
 * andres meldinger (mottatte) — ikke egne.
 */
export async function markerSamtaleLest(samtaleId: string) {
  // se #305 — bevisst silent no-op, ikke ensureInnlogget: kalles som background-
  // effekt ved sidelast, og en utløpt sesjon skal ikke kaste feil til klienten
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('samtale_chat')
    .update({ lest: true })
    .eq('samtale_id', samtaleId)
    .neq('profil_id', user.id)
    .eq('lest', false)

  // Oppdater ulest-tellingen som nå vises på profil-siden (#256)
  revalidatePath('/profil')
}

// Send/oppdater/slett private meldinger går via sendChatMelding /
// oppdaterChatMelding / slettChatMelding i lib/actions/chat.ts (scope
// 'privat'). Privat-melding-varselet håndteres i samme generiske flyt.
