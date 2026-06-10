'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { ensureAdmin } from '@/lib/auth'

export async function leggTilMal(navn: string) {
  await ensureAdmin()
  const admin = createAdminClient()
  const { data: max } = await admin.from('arrangementmaler').select('*').order('rekkefølge', { ascending: false }).limit(1).single()
  const { error } = await admin.from('arrangementmaler').insert({ navn: navn.trim(), rekkefølge: (max?.rekkefølge ?? 0) + 1 })
  if (error) throw new Error(error.message)
  revalidatePath('/innstillinger')
  revalidatePath('/arrangoransvar')
}

export async function oppdaterMal(id: string, navn: string, purredato?: string | null) {
  await ensureAdmin()
  const admin = createAdminClient()
  const oppdatering: Record<string, unknown> = { navn: navn.trim() }
  if (purredato !== undefined) oppdatering.purredato = purredato
  const { error } = await admin.from('arrangementmaler').update(oppdatering).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/innstillinger')
  revalidatePath('/arrangoransvar')
}

export async function slettMal(id: string) {
  await ensureAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('arrangementmaler').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/innstillinger')
  revalidatePath('/arrangoransvar')
}
