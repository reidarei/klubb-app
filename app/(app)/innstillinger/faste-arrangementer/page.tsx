import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProfil } from '@/lib/auth-cache'
import { kanAdministrere } from '@/lib/roller'
import UndersideHode from '@/components/innstillinger/UndersideHode'
import ArrangementmalerAdmin from '@/components/ArrangementmalerAdmin'

export default async function FasteArrangementer() {
  const profil = await getProfil()
  if (!kanAdministrere(profil?.rolle)) notFound()

  // `navn` som tiebreaker: `rekkefølge` har ingen unique-constraint (#505),
  // så to maler kan dele verdi og ellers bytte plass mellom sidelastinger.
  const { data: maler, error } = await createAdminClient()
    .from('arrangementmaler')
    .select('*')
    .order('rekkefølge')
    .order('navn')
  // En tom liste fra en svelget feil kan overskrive ekte rader ved neste lagring.
  if (error) throw new Error(`Kunne ikke hente arrangementmaler: ${error.message}`)

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <UndersideHode
        tittel="Faste arrangementer"
        ingress="Malene som fordeles som arrangøransvar hvert år, og som kan velges når et arrangement opprettes."
      />
      <ArrangementmalerAdmin maler={maler ?? []} />
    </div>
  )
}
