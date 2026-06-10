import { createServerClient } from '@/lib/supabase/server'
import NyttArrangementSkjema from './NyttArrangementSkjema'
import { hentMalValg } from '@/lib/mal-valg'
import { ANNET_KEY } from '@/components/arrangement/mal-valg-typer'
import { getInnloggetBruker } from '@/lib/auth-cache'

type Props = {
  searchParams: Promise<{ mal?: string; aar?: string; type?: string }>
}

export default async function NyttArrangement({ searchParams }: Props) {
  const [supabase, sp, user] = await Promise.all([
    createServerClient(),
    searchParams,
    getInnloggetBruker(),
  ])

  const valg = await hentMalValg(supabase)

  // Default: hvis innlogget bruker har et uoppfylt ansvar, forhåndsvelg det
  // første. Ellers default til "Annet". Query-params overstyrer.
  const egetAnsvar = user
    ? valg.find(v => v.ansvarligeIds.includes(user.id))
    : undefined
  let initialKey = egetAnsvar?.key ?? ANNET_KEY

  if (sp.mal) {
    const kandidat =
      sp.mal === 'Annet'
        ? ANNET_KEY
        : sp.aar
          ? `${sp.mal}::${sp.aar}`
          : null
    if (kandidat && valg.some(v => v.key === kandidat)) {
      initialKey = kandidat
    }
  }

  // ?type=moete|tur (fra NyFAB på agenda) → forhåndsvelg Annet + type
  const initialAnnetType: 'moete' | 'tur' = sp.type === 'tur' ? 'tur' : 'moete'
  if (sp.type === 'moete' || sp.type === 'tur') {
    initialKey = ANNET_KEY
  }

  return (
    <NyttArrangementSkjema
      valg={valg}
      initialKey={initialKey}
      initialAnnetType={initialAnnetType}
    />
  )
}
