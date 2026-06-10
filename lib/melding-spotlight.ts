// Hjelpere for album-spotlight på meldinger (#214). Normaliserer PostgREST-
// embed-data til en flat AlbumSpotlight-struktur klienten kan rendre uten å
// gjette på om embed-objektet er en array eller et enkelt objekt (PostgREST
// returnerer ett av to avhengig av kardinalitet og om vi har FK-disambig).
//
// `bildeUrl` faller fra spotlight → album-cover → null. Klienten viser ikke
// bilde-grid hvis null, men beholder lenken til albumet.

export type AlbumSpotlight = {
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

type RawSpotlightEmbed = CoverObj | CoverObj[] | null

export function tilAlbumSpotlight(
  albumEmbed: RawAlbumEmbed | RawAlbumEmbed[],
  spotlightEmbed: RawSpotlightEmbed,
): AlbumSpotlight | null {
  const album = Array.isArray(albumEmbed) ? albumEmbed[0] : albumEmbed
  if (!album) return null
  const spotlight = Array.isArray(spotlightEmbed) ? spotlightEmbed[0] : spotlightEmbed
  const cover = Array.isArray(album.cover) ? album.cover[0] : album.cover
  const bildeUrl =
    spotlight?.thumb_url ??
    spotlight?.bilde_url ??
    cover?.thumb_url ??
    cover?.bilde_url ??
    null
  const antallBilder = album.antall?.[0]?.count ?? 0
  return {
    albumId: album.id,
    albumTittel: album.tittel,
    bildeUrl,
    antallBilder,
  }
}

// Felles select-fragment for album-spotlight i meldinger-spørringer. Holdes
// her så alle tre callsites (forsiden, /tidligere, /meldinger/[id]) er i
// synk. FK-navn er eksplisitt for å unngå PostgREST-ambiguitet (vi har to
// FK-er fra meldinger inn i album-relaterte tabeller).
export const ALBUM_SPOTLIGHT_SELECT =
  `album:album!meldinger_album_id_fkey (
     id, tittel,
     cover:album_bilde!album_cover_fk (bilde_url, thumb_url),
     antall:album_bilde!album_bilde_album_id_fkey (count)
   ),
   spotlight:album_bilde!meldinger_album_spotlight_bilde_id_fkey (bilde_url, thumb_url)`
