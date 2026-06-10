import { createServerClient } from '@/lib/supabase/server'
import NyMeldingSkjema, { type AlbumValg } from './NyMeldingSkjema'

// Henter en lett oversikt over album så brukeren kan lage en album-spotlight
// (#214 — første case). Detaljerte bildelister lastes lazyt fra klienten når
// brukeren faktisk velger et album — vi vil ikke dra inn alle bilder fra
// alle album på serveren bare for å åpne ny-melding-siden.
export default async function NyMelding() {
  const supabase = await createServerClient()

  const { data: albumer } = await supabase
    .from('album')
    .select(
      `id, tittel,
       cover:album_bilde!album_cover_fk (bilde_url, thumb_url),
       antall:album_bilde!album_bilde_album_id_fkey (count)`,
    )
    .order('opprettet', { ascending: false })

  type Rad = {
    id: string
    tittel: string
    cover: { bilde_url: string; thumb_url: string | null } | { bilde_url: string; thumb_url: string | null }[] | null
    antall: { count: number }[] | null
  }

  const albumValg: AlbumValg[] = ((albumer ?? []) as Rad[]).map(a => {
    const cover = Array.isArray(a.cover) ? a.cover[0] : a.cover
    return {
      id: a.id,
      tittel: a.tittel,
      thumb: cover?.thumb_url ?? cover?.bilde_url ?? null,
      antall: a.antall?.[0]?.count ?? 0,
    }
  })

  return <NyMeldingSkjema albumer={albumValg} />
}
