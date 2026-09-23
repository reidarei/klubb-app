import { createServerClient } from '@/lib/supabase/server'
import { getInnloggetBruker, getProfil } from '@/lib/auth-cache'
import { notFound, redirect } from 'next/navigation'
import RedigerSkjema from './RedigerSkjema'
import { kanAdministrere } from '@/lib/roller'
import { hentMalValg } from '@/lib/mal-valg'
import { ANNET_KEY } from '@/components/arrangement/mal-valg-typer'
import { logg } from '@/lib/logg'

export default async function RedigerArrangement({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [supabase, user, profil] = await Promise.all([
    createServerClient(),
    getInnloggetBruker(),
    getProfil(),
  ])

  if (!user) redirect('/login')

  const { data: arr, error: arrFeil } = await supabase
    .from('arrangementer')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (arrFeil) throw new Error(`Kunne ikke hente arrangement: ${arrFeil.message}`)
  if (!arr) notFound()

  const erAdmin = kanAdministrere(profil?.rolle)
  const kanRedigere = arr.opprettet_av === user.id || erAdmin

  if (!kanRedigere) redirect(`/arrangementer/${id}`)

  // Hent valg (inkluder gjeldende kobling) og finn initialKey
  const [valg, { data: gjeldendeAnsvar, error: gjeldendeAnsvarFeil }] = await Promise.all([
    hentMalValg(supabase, id),
    supabase
      .from('arrangoransvar')
      .select('aar, arrangement_navn')
      .eq('arrangement_id', id)
      .limit(1)
      .maybeSingle(),
  ])
  // Ren berikelse (forhåndsvalgt dropdown-verdi) — faller tilbake til
  // ANNET_KEY under uansett, ikke kritisk nok til å ta ned redigeringssiden.
  if (gjeldendeAnsvarFeil) {
    await logg.feil('arrangement.rediger.gjeldendeAnsvar.oppslag.feilet', gjeldendeAnsvarFeil, { ctx: { arrangement_id: id } })
  }

  let initialKey = ANNET_KEY
  if (gjeldendeAnsvar?.arrangement_navn && gjeldendeAnsvar.aar != null) {
    const key = `${gjeldendeAnsvar.arrangement_navn}::${gjeldendeAnsvar.aar}`
    if (valg.some(v => v.key === key)) initialKey = key
  }

  return (
    <RedigerSkjema
      arrangement={{
        ...arr,
        sensurerte_felt: (arr.sensurerte_felt as Record<string, boolean> | null) ?? null,
      }}
      valg={valg}
      initialKey={initialKey}
    />
  )
}
