'use server'

import { createServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { sendNyPollVarsler } from '@/lib/varsler'
import { ensureInnlogget } from '@/lib/auth'

export type PollInput = {
  spoersmaal: string
  svarfrist: string // ISO (UTC)
  flervalg: boolean
  valg: string[]
}

/**
 * Oppretter en poll med alternativer atomisk. Validerer at:
 *  - spørsmålet er 1–200 tegn
 *  - svarfristen ligger i fremtiden
 *  - 2–10 alternativer, hvert med 1–120 tegn
 *
 * DB-siden har matchende CHECK-constraints, men vi validerer i app-laget
 * også for å gi ordentlige feilmeldinger til brukeren.
 */
export async function opprettPoll(data: PollInput) {
  const { supabase, user } = await ensureInnlogget()

  const spoersmaal = data.spoersmaal.trim()
  if (spoersmaal.length < 1 || spoersmaal.length > 200) {
    throw new Error('Spørsmålet må være 1–200 tegn')
  }
  const frist = new Date(data.svarfrist)
  if (Number.isNaN(frist.getTime()) || frist.getTime() <= Date.now()) {
    throw new Error('Svarfristen må være i fremtiden')
  }
  const valg = data.valg.map(v => v.trim()).filter(v => v.length > 0)
  if (valg.length < 2 || valg.length > 10) {
    throw new Error('En poll må ha 2–10 alternativer')
  }
  if (valg.some(v => v.length > 120)) {
    throw new Error('Hvert alternativ må være 1–120 tegn')
  }

  const { data: poll, error: pollErr } = await supabase
    .from('poll')
    .insert({
      spoersmaal,
      svarfrist: frist.toISOString(),
      flervalg: data.flervalg,
      opprettet_av: user.id,
    })
    .select('id')
    .single()

  if (pollErr) throw new Error(pollErr.message)

  const valgRader = valg.map((tekst, i) => ({
    poll_id: poll.id,
    tekst,
    rekkefoelge: i,
  }))

  const { error: valgErr } = await supabase.from('poll_valg').insert(valgRader)
  if (valgErr) {
    // Rydd opp — slik at vi ikke etterlater en poll uten alternativer
    await supabase.from('poll').delete().eq('id', poll.id)
    throw new Error(valgErr.message)
  }

  revalidatePath('/')

  // Send varsler før redirect — after() er ikke pålitelig på Vercel Hobby
  await sendNyPollVarsler({
    pollId: poll.id,
    spoersmaal,
    svarfrist: frist.toISOString(),
  }).catch(console.error)

  redirect(`/poll/${poll.id}`)
}

/**
 * Erstatter brukerens stemmer på en poll. For enkeltvalg-poller forventes
 * valgIds å ha lengde 1. Flervalg tillater alle kombinasjoner.
 *
 * Vi sletter først alle eksisterende stemmer fra brukeren på denne pollen,
 * deretter innsetter de nye. RLS håndhever at svarfristen ikke er passert
 * — hvis den er det, vil insert feile og brukeren får beskjed.
 */
export async function stemPaaPoll(pollId: string, valgIds: string[]) {
  const { supabase, user } = await ensureInnlogget()

  if (valgIds.length === 0) throw new Error('Velg minst ett alternativ')

  // Sanity: alle valgIds må tilhøre denne pollen. Billig validering før
  // vi sletter eksisterende stemmer.
  const { data: valg } = await supabase
    .from('poll_valg')
    .select('id')
    .eq('poll_id', pollId)
    .in('id', valgIds)

  if (!valg || valg.length !== valgIds.length) {
    throw new Error('Ugyldig valg')
  }

  // Slett eksisterende stemmer fra denne brukeren på denne pollen
  const { error: slettErr } = await supabase
    .from('poll_stemme')
    .delete()
    .eq('poll_id', pollId)
    .eq('profil_id', user.id)

  if (slettErr) throw new Error(slettErr.message)

  const { error: insertErr } = await supabase.from('poll_stemme').insert(
    valgIds.map(vid => ({
      poll_id: pollId,
      valg_id: vid,
      profil_id: user.id,
    })),
  )

  if (insertErr) throw new Error(insertErr.message)

  revalidatePath(`/poll/${pollId}`)
  revalidatePath('/')
}

/**
 * Sletter en poll. RLS håndhever at kun oppretter eller admin kan slette.
 * Cascade-delete på poll_valg og poll_stemme rydder opp automatisk.
 */
export async function slettPoll(pollId: string) {
  const supabase = await createServerClient()
  const { error } = await supabase.from('poll').delete().eq('id', pollId)
  if (error) throw new Error(error.message)

  revalidatePath('/')
  redirect('/')
}
