import { createServerClient } from '@/lib/supabase/server'
import { getInnloggetBruker, getProfil } from '@/lib/auth-cache'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import AlbumDetalj from '@/components/album/AlbumDetalj'
import AlbumTittel from '@/components/album/AlbumTittel'
import TillatLandskap from '@/components/album/TillatLandskap'
import { kanAdministrere } from '@/lib/roller'

export default async function AlbumSide({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [supabase, user, profil] = await Promise.all([
    createServerClient(),
    getInnloggetBruker(),
    getProfil(),
  ])

  const { data: album } = await supabase
    .from('album')
    .select(
      `id, tittel, arrangement_id, opprettet_av, cover_bilde_id,
       arrangement:arrangementer (id, tittel),
       album_bilde!album_bilde_album_id_fkey (id, bilde_url, thumb_url, bredde, hoyde, opprettet, rekkefolge)`,
    )
    .eq('id', id)
    .single()

  if (!album) notFound()

  const arrangement = Array.isArray(album.arrangement) ? album.arrangement[0] : album.arrangement
  const bilder = ((album.album_bilde ?? []) as Array<{
    id: string
    bilde_url: string
    thumb_url: string | null
    bredde: number | null
    hoyde: number | null
    opprettet: string
    rekkefolge: number
  }>)
    .slice()
    .sort((a, b) => a.rekkefolge - b.rekkefolge || a.opprettet.localeCompare(b.opprettet))

  const erEier = album.opprettet_av === user!.id
  const erAdmin = kanAdministrere(profil?.rolle)
  const kanRedigere = erEier || erAdmin

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <TillatLandskap />
      <div style={{ paddingTop: 20, marginBottom: 16 }}>
        {arrangement ? (
          <Link
            href={`/arrangementer/${arrangement.id}`}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--text-tertiary)',
              letterSpacing: '1.4px',
              fontWeight: 600,
              textTransform: 'uppercase',
              textDecoration: 'none',
            }}
          >
            ← {arrangement.tittel}
          </Link>
        ) : (
          <Link
            href="/album"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--text-tertiary)',
              letterSpacing: '1.4px',
              fontWeight: 600,
              textTransform: 'uppercase',
              textDecoration: 'none',
            }}
          >
            ← Album
          </Link>
        )}
        <AlbumTittel albumId={album.id} initialTittel={album.tittel} kanRedigere={kanRedigere} />
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--text-tertiary)',
            letterSpacing: '1.4px',
            fontWeight: 600,
            textTransform: 'uppercase',
            marginTop: 4,
          }}
        >
          {bilder.length} {bilder.length === 1 ? 'bilde' : 'bilder'}
        </div>
      </div>

      <AlbumDetalj
        bilder={bilder.map(b => ({
          id: b.id,
          bilde_url: b.bilde_url,
          thumb_url: b.thumb_url,
          bredde: b.bredde,
          hoyde: b.hoyde,
        }))}
        albumId={album.id}
        kanRedigere={kanRedigere}
        coverBildeId={album.cover_bilde_id}
      />
    </div>
  )
}
