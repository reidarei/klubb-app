'use server'

import { revalidatePath } from 'next/cache'
import { ensureAdmin } from '@/lib/auth'
import { naa } from '@/lib/dato'

export async function oppdaterVedtekt(data: {
  slug: string
  nyttInnhold: string
  vedtaksdato: string
  endringsnotat: string
}) {
  const { supabase, user } = await ensureAdmin()

  // Hent gjeldende innhold for å versjonere det
  const { data: vedtekt } = await supabase
    .from('vedtekter')
    .select('id, innhold')
    .eq('slug', data.slug)
    .single()

  if (!vedtekt) throw new Error('Vedtekt ikke funnet')

  // Lagre gammel versjon
  await supabase.from('vedtekter_versjoner').insert({
    vedtekt_id: vedtekt.id,
    innhold: vedtekt.innhold,
    vedtaksdato: data.vedtaksdato,
    endringsnotat: data.endringsnotat,
    endret_av: user.id,
  })

  // Oppdater gjeldende innhold
  await supabase
    .from('vedtekter')
    .update({ innhold: data.nyttInnhold, oppdatert: naa() })
    .eq('slug', data.slug)

  revalidatePath(`/klubbinfo/vedtekter/${data.slug}`)
}
