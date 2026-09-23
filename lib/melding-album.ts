// Hjelpere for album-kobling på meldinger (#214, forenklet i #463).
// Normaliserer PostgREST-embed-data til en flat AlbumKort-struktur klienten
// kan rendre uten å gjette på om embed-objektet er en array eller et enkelt
// objekt (PostgREST returnerer ett av to avhengig av kardinalitet og om vi
// har FK-disambig).
//
// `bildeUrl` er albumets omslagsbilde (cover). Cover settes automatisk til
// første opplastede bilde (se lastOppAlbumBilde i lib/actions/album.ts + #463
// backfill i migrasjon 113), så album med bilder har alltid et cover — vi
// trenger ikke read-time-fallback her (som ville gjort agenda-spørringen
// dyrere). Er cover null (tomt album), viser klienten pille uten bilde men
// beholder lenken til albumet.

export type AlbumKort = {
  albumId: string
  albumTittel: string
  bildeUrl: string | null
  antallBilder: number
}

type CoverObj = { bilde_url: string; thumb_url: string | null }

type RawAlbumEmbed =
  | {
      id: string
      tittel: string
      cover: CoverObj | CoverObj[] | null
      antall: { count: number }[] | null
    }
  | null

export function tilAlbumKort(
  albumEmbed: RawAlbumEmbed | RawAlbumEmbed[],
): AlbumKort | null {
  const album = Array.isArray(albumEmbed) ? albumEmbed[0] : albumEmbed
  if (!album) return null
  const cover = Array.isArray(album.cover) ? album.cover[0] : album.cover
  const bildeUrl = cover?.thumb_url ?? cover?.bilde_url ?? null
  const antallBilder = album.antall?.[0]?.count ?? 0
  return {
    albumId: album.id,
    albumTittel: album.tittel,
    bildeUrl,
    antallBilder,
  }
}

// Felles select-fragment for album-kort i meldinger-spørringer. Holdes her
// så alle tre callsites (forsiden, /tidligere, /meldinger/[id]) er i synk.
// FK-navn er eksplisitt for å unngå PostgREST-ambiguitet (vi har to FK-er
// fra meldinger inn i album-relaterte tabeller).
export const ALBUM_KORT_SELECT =
  `album:album!meldinger_album_id_fkey (
     id, tittel,
     cover:album_bilde!album_cover_fk (bilde_url, thumb_url),
     antall:album_bilde!album_bilde_album_id_fkey (count)
   )`
