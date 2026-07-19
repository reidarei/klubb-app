'use client'

import { useState } from 'react'
import Image from 'next/image'
import AlbumLightbox from '@/components/album/AlbumLightbox'
import type { ReaksjonGruppe } from '@/lib/reaksjoner'

export type AlbumBildeDetalj = {
  id: string
  bilde_url: string
  thumb_url: string | null
  bredde: number | null
  hoyde: number | null
  reaksjoner: ReaksjonGruppe[]
}

// Grid med 3 kolonner. Klikk på en thumb åpner lightbox med fullt bilde.
// Reaksjoner per bilde vises i lightboxen (#480) — ingen tellere på
// thumbnails, grid-rendringen under er uendret.
export default function AlbumDetalj({
  bilder,
  albumId,
  brukerId,
  kanRedigere = false,
  coverBildeId = null,
}: {
  bilder: AlbumBildeDetalj[]
  albumId: string
  brukerId: string
  kanRedigere?: boolean
  coverBildeId?: string | null
}) {
  const [aktiv, setAktiv] = useState<number | null>(null)

  if (bilder.length === 0) {
    return (
      <div
        style={{
          padding: 24,
          borderRadius: 'var(--radius-card)',
          border: '0.5px solid var(--border-subtle)',
          background: 'var(--bg-elevated)',
          textAlign: 'center',
          color: 'var(--text-tertiary)',
          fontSize: 13,
        }}
      >
        Ingen bilder i albumet ennå. Last opp første bilde under.
      </div>
    )
  }

  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 4,
        }}
      >
        {bilder.map((b, i) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setAktiv(i)}
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
              sizes="(max-width: 480px) 33vw, 160px"
              style={{ objectFit: 'cover' }}
            />
          </button>
        ))}
      </div>

      {aktiv !== null && (
        <AlbumLightbox
          bilder={bilder.map(b => ({ id: b.id, bilde_url: b.bilde_url, reaksjoner: b.reaksjoner }))}
          startIndex={aktiv}
          onLukk={() => setAktiv(null)}
          albumId={albumId}
          kanRedigere={kanRedigere}
          coverBildeId={coverBildeId}
          brukerId={brukerId}
        />
      )}
    </>
  )
}
