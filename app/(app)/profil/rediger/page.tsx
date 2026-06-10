import { createServerClient } from '@/lib/supabase/server'
import { getInnloggetBruker } from '@/lib/auth-cache'
import RedigerProfilForm from './RedigerProfilForm'

export default async function RedigerProfil() {
  const [supabase, user] = await Promise.all([createServerClient(), getInnloggetBruker()])

  const { data: profil } = await supabase
    .from('profiles')
    .select('navn, visningsnavn, telefon, fodselsdato, epost, rolle, bilde_url')
    .eq('id', user!.id)
    .single()

  return (
    <RedigerProfilForm
      navn={profil?.navn ?? ''}
      visningsnavn={profil?.visningsnavn ?? ''}
      telefon={profil?.telefon ?? ''}
      fodselsdato={profil?.fodselsdato ?? ''}
      epost={profil?.epost ?? user!.email ?? ''}
      bildeUrl={profil?.bilde_url ?? null}
      rolle={profil?.rolle ?? null}
    />
  )
}
