'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getProfil } from '@/lib/auth-cache'
import { kjorPaaminnelser } from '@/lib/actions/paaminnelser'
import { revalidatePath } from 'next/cache'
import { kanAdministrere } from '@/lib/roller'
import { naa } from '@/lib/dato'

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

export async function kjorPaaminnerManuelt(): Promise<boolean> {
  const profil = await getProfil()
  if (!kanAdministrere(profil?.rolle)) return false

  const admin = createAdminClient()
  await kjorPaaminnelser(admin)
  return true
}
