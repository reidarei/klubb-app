'use server'

import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ensureInnlogget } from '@/lib/auth'
import { logg } from '@/lib/logg'

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
  // eslint-disable-next-line hk/supabase-feil-maa-hentes -- bevisst fail-open: unique-constraint samtale_par_unik (profil_a, profil_b) i migrasjon 055 fanger den tapte grenen — feiler oppslaget, faller vi gjennom til insert under, som gir 23505 hvis raden alt fantes, og 23505-grenen der henter raden på nytt og redirecter (#503-review)
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

  // 23505 = unique_violation på samtale_par_unik. To veier hit: to samtidige
  // klikk (ekte race), eller at select-en over feilet mens raden fantes. I
  // begge tilfeller er svaret det samme — samtalen finnes, brukeren skal inn i
  // den. Å kaste her ville gitt ham «duplicate key value violates unique
  // constraint» i ansiktet for å ha trykket «åpne samtale» på en samtale som
  // faktisk er der. Dette er grenen fail-open-kommentaren over lover. (#503)
  if (error?.code === '23505') {
    const { data: etterRace, error: etterRaceFeil } = await supabase
      .from('samtale')
      .select('id')
      .eq('profil_a', a)
      .eq('profil_b', b)
      .maybeSingle()
    if (etterRaceFeil) throw new Error(`Kunne ikke åpne samtalen: ${etterRaceFeil.message}`)
    // Ingen rad tross 23505 betyr at constrainten som slo til var en annen
    // enn den vi tror — da er den opprinnelige feilen fortsatt sannheten.
    if (!etterRace) throw new Error(error.message)
    redirect(`/samtaler/${etterRace.id}`)
  }

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

  const { error } = await supabase
    .from('samtale_chat')
    .update({ lest: true })
    .eq('samtale_id', samtaleId)
    .neq('profil_id', user.id)
    .eq('lest', false)

  if (error) {
    await logg.feil('samtaler.marker_lest.oppdatering.feilet', error, { ctx: { code: error.code } })
  }

  // Ingen revalidatePath her: /profil er dynamisk rendret (createServerClient()),
  // så ulest-tallet er ferskt ved neste server-render uansett. revalidatePath ville
  // vært ulovlig — actionen kalles som løs promise under render av /samtaler/[id]
  // og nådde uansett aldri klienten (#539).
}

// Send/oppdater/slett private meldinger går via sendChatMelding /
// oppdaterChatMelding / slettChatMelding i lib/actions/chat.ts (scope
// 'privat'). Privat-melding-varselet håndteres i samme generiske flyt.
