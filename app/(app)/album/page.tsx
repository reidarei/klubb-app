import { createServerClient } from '@/lib/supabase/server'
import { getInnloggetBruker } from '@/lib/auth-cache'
import Link from 'next/link'
import Image from 'next/image'
import Icon from '@/components/ui/Icon'
import OpprettAlbumKnapp from '@/components/album/OpprettAlbumKnapp'

// Album-oversikt — alle album i klubben. Standalone-album og arrangement-
// koblede vises samme sted, sortert nyeste først. Kortet viser cover (eller
// første bilde som fallback), tittel, evt. arrangement-navn og bilde-antall.
export default async function AlbumOversikt() {
  const [supabase] = await Promise.all([createServerClient(), getInnloggetBruker()])

  // Henter cover-bildet via FK-join (album_cover_fk) og antall via aggregat
  // — ikke hele bildelista. Album uten cover viser placeholder-ikonet
  // (eksplisitt > implisitt).
  const { data: albumer } = await supabase
    .from('album')
    .select(
      `id, tittel, arrangement_id, opprettet,
       arrangement:arrangementer (id, tittel),
       cover:album_bilde!album_cover_fk (bilde_url, thumb_url),
       antall:album_bilde!album_bilde_album_id_fkey (count)`,
    )
    .order('opprettet', { ascending: false })

  type AlbumRad = {
    id: string
    tittel: string
    arrangement_id: string | null
    opprettet: string
    arrangement: { id: string; tittel: string } | { id: string; tittel: string }[] | null
    cover: { bilde_url: string; thumb_url: string | null } | { bilde_url: string; thumb_url: string | null }[] | null
    antall: { count: number }[] | null
  }

  const rader = ((albumer ?? []) as AlbumRad[]).map(a => {
    const arr = Array.isArray(a.arrangement) ? a.arrangement[0] : a.arrangement
    const cover = Array.isArray(a.cover) ? a.cover[0] : a.cover
    const thumb = cover?.thumb_url ?? cover?.bilde_url ?? null
    return {
      id: a.id,
      tittel: a.tittel,
      arrangement: arr,
      antall: a.antall?.[0]?.count ?? 0,
      thumb,
    }
  })

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <div style={{ padding: '12px 4px 22px' }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: 'var(--text-tertiary)',
            letterSpacing: '2.5px',
            textTransform: 'uppercase',
            marginBottom: 18,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ width: 18, height: '0.5px', background: 'var(--border-strong)' }} />
          Album
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 36,
            fontWeight: 500,
            letterSpacing: '-0.5px',
            lineHeight: 1,
            margin: 0,
            color: 'var(--text-primary)',
          }}
        >
          Bildene
        </h1>
      </div>

      <OpprettAlbumKnapp />

      {rader.length === 0 ? (
        <div
          style={{
            padding: 24,
            borderRadius: 'var(--radius-card)',
            border: '0.5px solid var(--border-subtle)',
            background: 'var(--bg-elevated)',
            textAlign: 'center',
            color: 'var(--text-tertiary)',
            fontSize: 13,
            marginTop: 16,
          }}
        >
          Ingen album opprettet ennå.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 10,
            marginTop: 14,
          }}
        >
          {rader.map(r => (
            <Link
              key={r.id}
              href={`/album/${r.id}`}
              style={{
                display: 'block',
                textDecoration: 'none',
                color: 'inherit',
                borderRadius: 'var(--radius-card)',
                overflow: 'hidden',
                background: 'var(--bg-elevated)',
                border: '0.5px solid var(--border-subtle)',
              }}
            >
              <div
                style={{
                  position: 'relative',
                  aspectRatio: '1 / 1',
                  background: 'var(--bg-elevated-2)',
                }}
              >
                {r.thumb ? (
                  <Image
                    src={r.thumb}
                    alt=""
                    fill
                    sizes="(max-width: 480px) 50vw, 240px"
                    style={{ objectFit: 'cover' }}
                  />
                ) : (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-tertiary)',
                    }}
                  >
                    <Icon name="image" size={28} color="currentColor" strokeWidth={1.25} />
                  </div>
                )}
              </div>
              <div style={{ padding: '10px 12px 12px' }}>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 16,
                    color: 'var(--text-primary)',
                    fontWeight: 500,
                    letterSpacing: '-0.2px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {r.tittel}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    color: 'var(--text-tertiary)',
                    letterSpacing: '1.2px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    marginTop: 4,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {r.antall} {r.antall === 1 ? 'bilde' : 'bilder'}
                  {r.arrangement && ` · ${r.arrangement.tittel}`}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
