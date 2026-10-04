import { notFound } from 'next/navigation'
import { getProfil } from '@/lib/auth-cache'
import { kanAdministrere } from '@/lib/roller'
import UndersideHode from '@/components/innstillinger/UndersideHode'
import IssuesListe, { hentAapneIssues } from '../IssuesListe'

export default async function OnskerFraBrukerne() {
  const profil = await getProfil()
  if (!kanAdministrere(profil?.rolle)) notFound()

  const aapne = await hentAapneIssues()

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <UndersideHode tittel="Ønsker fra brukerne" ingress="Innspill gutta har sendt inn fra appen." />
      <IssuesListe aapne={aapne} />
    </div>
  )
}
