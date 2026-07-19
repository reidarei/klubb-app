'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import AlbumLightbox from '@/components/album/AlbumLightbox'
import type { ReaksjonGruppe } from '@/lib/reaksjoner'
import type { ChatProfil } from '@/lib/mention'

export type AlbumBildeDetalj = {
  id: string
  bilde_url: string
  thumb_url: string | null
  bredde: number | null
  hoyde: number | null
  reaksjoner: ReaksjonGruppe[]
  kommentarAntall: number
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
  profiler,
  erAdmin = false,
  initialBildeId = null,
}: {
  bilder: AlbumBildeDetalj[]
  albumId: string
  brukerId: string
  kanRedigere?: boolean
  coverBildeId?: string | null
  profiler?: ChatProfil[]
  erAdmin?: boolean
  // Deep-link fra en mention-varsel (?bilde=) — se AlbumSide. Åpner
  // lightboxen på riktig indeks og auto-åpner kommentar-sheeten (#481).
  initialBildeId?: string | null
}) {
  const router = useRouter()
  const [aktiv, setAktiv] = useState<number | null>(null)
  const [autoAapneKommentarer, setAutoAapneKommentarer] = useState(false)

  // Deep-link mount-effekt. Kjører kun én gang — album_id bæres alltid i
  // URL-en (/album/{id}?bilde=...), så selv om treffet mangler (bildet er
  // slettet siden varselet ble sendt) laster siden normalt i grid-visning.
  // Vi degraderer da til grid og stripper param-en i stedet for å late som
  // et bilde er åpent.
  useEffect(() => {
    if (!initialBildeId) return
    const idx = bilder.findIndex(b => b.id === initialBildeId)
    if (idx === -1) {
      router.replace(`/album/${albumId}`, { scroll: false })
      return
    }
    setAktiv(idx)
    setAutoAapneKommentarer(true)
    // Kjør kun ved mount — bilder/albumId er stabile for siden sin levetid,
    // og vi vil ikke re-trigge deep-link-åpningen ved senere re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
            onClick={() => {
              setAutoAapneKommentarer(false)
              setAktiv(i)
            }}
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
          bilder={bilder.map(b => ({
            id: b.id,
            bilde_url: b.bilde_url,
            reaksjoner: b.reaksjoner,
            kommentarAntall: b.kommentarAntall,
          }))}
          startIndex={aktiv}
          onLukk={() => setAktiv(null)}
          albumId={albumId}
          kanRedigere={kanRedigere}
          coverBildeId={coverBildeId}
          brukerId={brukerId}
          profiler={profiler}
          erAdmin={erAdmin}
          autoAapneKommentarer={autoAapneKommentarer}
        />
      )}
    </>
  )
}
