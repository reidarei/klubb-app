'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import Icon from '@/components/ui/Icon'
import AlbumLightbox from '@/components/album/AlbumLightbox'
import AlbumOpplaster from '@/components/album/AlbumOpplaster'
import { opprettAlbum } from '@/lib/actions/album'

export type AlbumBildeForGrid = {
  id: string
  bilde_url: string
  thumb_url: string | null
}

export type AlbumForSeksjon = {
  id: string
  tittel: string
  bilder: AlbumBildeForGrid[]
  cover_bilde_id: string | null
}

const MAKS_FORHANDSVISNING = 8

export default function AlbumSeksjon({
  album,
  arrangementId,
  kanRedigere = false,
}: {
  album: AlbumForSeksjon | null
  arrangementId: string
  kanRedigere?: boolean
}) {
  const router = useRouter()
  const [oppretter, startOpprett] = useTransition()
  const [lightbox, setLightbox] = useState<number | null>(null)

  function handleLagAlbum() {
    startOpprett(async () => {
      try {
        await opprettAlbum({
          tittel: 'Album',
          arrangementId,
        })
        router.refresh()
      } catch (e) {
        console.error(e)
        alert('Kunne ikke opprette album')
      }
    })
  }

  return (
    <section style={{ margin: '24px 20px 0' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <h3
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--text-tertiary)',
            letterSpacing: '1.6px',
            fontWeight: 600,
            textTransform: 'uppercase',
            margin: 0,
          }}
        >
          Album
        </h3>
        {album && (
          <Link
            href={`/album/${album.id}`}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--accent)',
              letterSpacing: '1.4px',
              fontWeight: 600,
              textTransform: 'uppercase',
              textDecoration: 'none',
            }}
          >
            Se alle ({album.bilder.length})
          </Link>
        )}
      </div>

      {!album && (
        <button
          type="button"
          onClick={handleLagAlbum}
          disabled={oppretter}
          style={{
            width: '100%',
            padding: '14px 16px',
            borderRadius: 'var(--radius-card)',
            border: '0.5px dashed var(--border)',
            background: 'var(--bg-elevated)',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Icon name="image" size={16} color="var(--accent)" />
          {oppretter ? 'Lager…' : 'Lag album'}
        </button>
      )}

      {album && (
        <>
          {album.bilder.length === 0 && (
            <div
              style={{
                padding: '20px 14px',
                borderRadius: 'var(--radius-card)',
                border: '0.5px solid var(--border-subtle)',
                background: 'var(--bg-elevated)',
                fontSize: 13,
                color: 'var(--text-tertiary)',
                textAlign: 'center',
                marginBottom: 10,
              }}
            >
              Ingen bilder ennå. Last opp første bilde under.
            </div>
          )}

          {album.bilder.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 4,
                marginBottom: 10,
              }}
            >
              {album.bilder.slice(0, MAKS_FORHANDSVISNING).map((b, i) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setLightbox(i)}
                  style={{
                    position: 'relative',
                    aspectRatio: '1 / 1',
                    border: 'none',
                    padding: 0,
                    overflow: 'hidden',
                    borderRadius: 6,
                    cursor: 'zoom-in',
                    background: 'var(--bg-elevated)',
                  }}
                >
                  <Image
                    src={b.thumb_url ?? b.bilde_url}
                    alt=""
                    fill
                    sizes="120px"
                    style={{ objectFit: 'cover' }}
                  />
                </button>
              ))}
            </div>
          )}

          <AlbumOpplaster albumId={album.id} />
        </>
      )}

      {lightbox !== null && album && (
        <AlbumLightbox
          bilder={album.bilder.map(b => ({ id: b.id, bilde_url: b.bilde_url }))}
          startIndex={lightbox}
          onLukk={() => setLightbox(null)}
          albumId={album.id}
          kanRedigere={kanRedigere}
          coverBildeId={album.cover_bilde_id}
        />
      )}
    </section>
  )
}
