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

  // Hent gjeldende innhold for å versjonere det. Feil hentes eksplisitt:
  // uten den ville en DB-feil sett identisk ut som «vedtekt ikke funnet»
  // under, OG vi ville ha mistet historikk-versjoneringen av en vedtekts-
  // endring stille — samme alvorlighetsgrad som pengehistorikk i fond.ts.
  // maybeSingle (ikke single) er det som gjør «Vedtekt ikke funnet» under
  // nåbar: single rapporterer 0 rader som error PGRST116, ikke som data=null.
  const { data: vedtekt, error: vedtektFeil } = await supabase
    .from('vedtekter')
    .select('id, innhold')
    .eq('slug', data.slug)
    .maybeSingle()
  if (vedtektFeil) throw new Error(`Kunne ikke hente gjeldende vedtekt: ${vedtektFeil.message}`)

  if (!vedtekt) throw new Error('Vedtekt ikke funnet')

  // Lagre gammel versjon. Kastes ved feil FØR oppdateringen under (#760) —
  // ellers ville en feilet versjonering vært usynlig og historikken mistet.
  const { error: versjonFeil } = await supabase.from('vedtekter_versjoner').insert({
    vedtekt_id: vedtekt.id,
    innhold: vedtekt.innhold,
    vedtaksdato: data.vedtaksdato,
    endringsnotat: data.endringsnotat,
    endret_av: user.id,
  })
  if (versjonFeil) throw new Error(`Kunne ikke lagre vedtektsversjon: ${versjonFeil.message}`)

  // Oppdater gjeldende innhold
  const { error: oppdaterFeil } = await supabase
    .from('vedtekter')
    .update({ innhold: data.nyttInnhold, oppdatert: naa() })
    .eq('slug', data.slug)
  if (oppdaterFeil) throw new Error(`Kunne ikke oppdatere vedtekten: ${oppdaterFeil.message}`)

  revalidatePath(`/klubbinfo/vedtekter/${data.slug}`)
}
