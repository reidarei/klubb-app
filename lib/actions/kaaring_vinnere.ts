'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { ensureAdmin } from '@/lib/auth'
import { naa } from '@/lib/dato'

interface VinnerData {
  profil_id?: string
  arrangement_id?: string
  begrunnelse?: string
}

export async function settVinnerPaaKaaring(malId: string, aar: number, vinner: VinnerData) {
  const { user } = await ensureAdmin()
  const admin = createAdminClient()

  // Check if vinner already exists for this mal_id and aar
  const { data: eksisterende } = await admin
    .from('kaaring_vinnere')
    .select('id')
    .eq('mal_id', malId)
    .eq('aar', aar)
    .single()

  if (eksisterende) {
    // Update existing
    const { error } = await admin
      .from('kaaring_vinnere')
      .update({
        profil_id: vinner.profil_id || null,
        arrangement_id: vinner.arrangement_id || null,
        begrunnelse: vinner.begrunnelse || null,
        oppdatert: naa()
      })
      .eq('mal_id', malId)
      .eq('aar', aar)
    if (error) throw new Error(error.message)
  } else {
    // Create new
    const { error } = await admin
      .from('kaaring_vinnere')
      .insert({
        mal_id: malId,
        aar,
        profil_id: vinner.profil_id || null,
        arrangement_id: vinner.arrangement_id || null,
        begrunnelse: vinner.begrunnelse || null,
        opprettet_av: user.id
      })
    if (error) throw new Error(error.message)
  }

  revalidatePath('/kaaringer')
  revalidatePath('/innstillinger')
}

export async function fjernVinnerFraKaaring(malId: string, aar: number) {
  await ensureAdmin()
  const admin = createAdminClient()

  const { error } = await admin
    .from('kaaring_vinnere')
    .delete()
    .eq('mal_id', malId)
    .eq('aar', aar)

  if (error) throw new Error(error.message)
  revalidatePath('/kaaringer')
  revalidatePath('/innstillinger')
}
