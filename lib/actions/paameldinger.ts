'use server'

import { revalidatePath } from 'next/cache'
import { naa } from '@/lib/dato'
import { ensureInnlogget } from '@/lib/auth'

export async function oppdaterPaamelding(
  arrangementId: string,
  status: 'ja' | 'nei' | 'kanskje'
) {
  const { supabase, user } = await ensureInnlogget()

  const { error } = await supabase
    .from('paameldinger')
    .upsert({
      arrangement_id: arrangementId,
      profil_id: user.id,
      status,
      oppdatert: naa(),
    })

  if (error) throw new Error(error.message)
  revalidatePath(`/arrangementer/${arrangementId}`)
  revalidatePath('/')
}
