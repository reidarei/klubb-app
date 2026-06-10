import { notFound, redirect } from 'next/navigation'
import { ensureLoeserTiebreak } from '@/lib/auth'
import TiebreakSkjema from './TiebreakSkjema'

type ValgRad = {
  id: string
  tekst: string
  rekkefoelge: number
  referanse_profil_id: string | null
  referanse_arrangement_id: string | null
}

export default async function TiebreakSide({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { supabase } = await ensureLoeserTiebreak()

  const { data: poll } = await supabase
    .from('poll')
    .select(
      `id, spoersmaal, aar, tiebreak_status, kaaring_mal_id,
       poll_valg (id, tekst, rekkefoelge, referanse_profil_id, referanse_arrangement_id)`,
    )
    .eq('id', id)
    .single()

  if (!poll) notFound()
  if (!poll.kaaring_mal_id) redirect(`/poll/${id}`)
  if (poll.tiebreak_status !== 'venter_paa_tiebreak') {
    redirect(`/poll/${id}`)
  }

  // Beriker profil-kandidater med navn/bilde for KaaringKandidat-visning.
  const valg = [...(poll.poll_valg as ValgRad[])].sort(
    (a, b) => a.rekkefoelge - b.rekkefoelge,
  )

  const profilIder = valg
    .map(v => v.referanse_profil_id)
    .filter((x): x is string => !!x)

  const { data: profiler } = profilIder.length
    ? await supabase
        .from('profiles')
        .select('id, navn, bilde_url, rolle')
        .in('id', profilIder)
    : { data: [] as { id: string; navn: string | null; bilde_url: string | null; rolle: string | null }[] }

  const profilMap = new Map((profiler ?? []).map(p => [p.id, p]))

  const kandidater = valg.map(v => {
    if (v.referanse_profil_id) {
      const p = profilMap.get(v.referanse_profil_id)
      return {
        id: v.id,
        navn: p?.navn ?? v.tekst,
        bildeUrl: p?.bilde_url ?? null,
        rolle: p?.rolle ?? null,
        variant: 'profil' as const,
      }
    }
    return {
      id: v.id,
      navn: v.tekst,
      bildeUrl: null,
      rolle: null,
      variant: 'arrangement' as const,
    }
  })

  return (
    <TiebreakSkjema
      pollId={poll.id}
      tittel={`${poll.spoersmaal}`}
      undertittel={`Likt antall stemmer — velg vinneren`}
      kandidater={kandidater}
    />
  )
}
