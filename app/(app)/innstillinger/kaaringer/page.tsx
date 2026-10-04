import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProfil } from '@/lib/auth-cache'
import { kanAdministrere } from '@/lib/roller'
import UndersideHode from '@/components/innstillinger/UndersideHode'
import KaaringMalAdmin from '@/components/KaaringMalAdmin'

export default async function Kaaringsmaler() {
  const profil = await getProfil()
  if (!kanAdministrere(profil?.rolle)) notFound()

  const { data: maler, error } = await createAdminClient()
    .from('kaaringmaler')
    .select('id, navn, rekkefolge')
    .order('rekkefolge')
    .order('navn')
  // En tom liste fra en svelget feil kan overskrive ekte rader ved neste lagring.
  if (error) throw new Error(`Kunne ikke hente kåringmaler: ${error.message}`)

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <UndersideHode tittel="Kåringer" ingress="Kåringene klubben deler ut hvert år." />
      <KaaringMalAdmin maler={maler ?? []} />
    </div>
  )
}
