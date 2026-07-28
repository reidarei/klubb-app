import { createServerClient } from '@/lib/supabase/server'
import { getProfil } from '@/lib/auth-cache'
import { notFound, redirect } from 'next/navigation'
import RedigerMedlemSkjema from './RedigerMedlemSkjema'
import { kanAdministrere } from '@/lib/roller'
import { logg } from '@/lib/logg'

export default async function RedigerMedlem({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [supabase, profil] = await Promise.all([createServerClient(), getProfil()])
  if (!kanAdministrere(profil?.rolle)) redirect('/klubbinfo/medlemmer')

  // Hent både målmedlem og sittende GS i parallell — GS-prop trengs i
  // RedigerMedlemSkjema for confirm-dialogen (hvem mister tittelen?).
  const [
    { data: medlem, error: medlemFeil },
    { data: naavaerendeGeneralsekretaer, error: gsFeil },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, navn, visningsnavn, epost, telefon, rolle, aktiv, fodselsdato, faar_issue_varsler')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('id, navn')
      .eq('rolle', 'generalsekretaer')
      .maybeSingle(),
  ])

  if (medlemFeil) throw new Error(`Kunne ikke hente medlem: ${medlemFeil.message}`)
  if (!medlem) notFound()

  // Ren berikelse (confirm-dialogen for å frata GS-tittelen) — skjemaet
  // fungerer fortsatt uten, bare uten den advarselen. Ikke kritisk nok til
  // å ta ned redigeringssiden.
  if (gsFeil) {
    await logg.feil('medlem.rediger.generalsekretaer.oppslag.feilet', gsFeil)
  }

  return (
    <RedigerMedlemSkjema
      medlem={medlem}
      naavaerendeGeneralsekretaer={naavaerendeGeneralsekretaer}
    />
  )
}
