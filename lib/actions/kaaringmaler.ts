'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { ensureAdmin } from '@/lib/auth'

export async function leggTilKaaringMal(navn: string) {
  await ensureAdmin()
  const admin = createAdminClient()
  const { data: max } = await admin.from('kaaringmaler').select('rekkefolge').order('rekkefolge', { ascending: false }).limit(1).single()
  const { error } = await admin.from('kaaringmaler').insert({ navn: navn.trim(), rekkefolge: (max?.rekkefolge ?? 0) + 1 })
  if (error) throw new Error(error.message)
  revalidatePath('/innstillinger')
  revalidatePath('/kaaringer')
}

export async function oppdaterKaaringMal(id: string, navn: string) {
  await ensureAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('kaaringmaler').update({ navn: navn.trim() }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/innstillinger')
  revalidatePath('/kaaringer')
}

export async function slettKaaringMal(id: string) {
  await ensureAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('kaaringmaler').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/innstillinger')
  revalidatePath('/kaaringer')
}
