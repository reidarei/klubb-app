import { notFound } from 'next/navigation'
import { getProfil } from '@/lib/auth-cache'
import { kanAdministrere } from '@/lib/roller'
import { hentKlubbInfo, stiftetTilDato } from '@/lib/klubb-info'
import UndersideHode from '@/components/innstillinger/UndersideHode'
import OmKlubbenSkjema from './OmKlubbenSkjema'

// Stiftelsesdato, sted og teksten øverst på Klubb-siden. Datoen styrer også
// jubileumskortet på agendaen og medaljen i minikalenderen.
export default async function OmKlubben() {
  const profil = await getProfil()
  if (!kanAdministrere(profil?.rolle)) notFound()

  const info = await hentKlubbInfo()

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <UndersideHode
        tittel="Om klubben"
        ingress="Vises øverst på Klubb-siden. Stiftelsesdatoen bestemmer også når jubileet dukker opp på agendaen."
      />
      <OmKlubbenSkjema
        stiftet={stiftetTilDato(info.stiftet)}
        sted={info.sted}
        omTekst={info.omAvsnitt.join('\n\n')}
      />
    </div>
  )
}
