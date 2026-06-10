'use client'

import { useState, useTransition, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import Icon from '@/components/ui/Icon'
import AlbumLightbox from '@/components/album/AlbumLightbox'
import { komprimer, lagThumbnail, genererFilnavn } from '@/lib/bilde-utils'
import { opprettAlbum, lastOppAlbumBilde } from '@/lib/actions/album'

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
// Antall opplastinger som kjører parallelt. 3 er ok kompromiss for mobildata
// — tre samtidige R2-puts metter ikke serverløsningen og holder UI responsiv.
const PARALLELL_OPPLAST = 3

async function opplastEn(albumId: string, fil: File): Promise<void> {
  const komp = await komprimer(fil)
  const thumb = await lagThumbnail(fil)
  const filnavn = genererFilnavn(komp)

  // Hent dimensjoner fra det komprimerte bildet for layout uten skift
  const dims = await new Promise<{ bredde: number; hoyde: number }>(resolve => {
    const img = new window.Image()
    const url = URL.createObjectURL(komp)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ bredde: img.naturalWidth, hoyde: img.naturalHeight })
    }
    img.onerror = () => resolve({ bredde: 0, hoyde: 0 })
    img.src = url
  })

  const fd = new FormData()
  fd.set('albumId', albumId)
  fd.set('fil', komp)
  fd.set('thumb', thumb)
  fd.set('filnavn', filnavn)
  fd.set('bredde', String(dims.bredde))
  fd.set('hoyde', String(dims.hoyde))
  await lastOppAlbumBilde(fd)
}

async function opplastIBolker(albumId: string, filer: File[], onProgress: (n: number) => void) {
  let i = 0
  let ferdig = 0
  async function neste(): Promise<void> {
    while (i < filer.length) {
      const idx = i++
      try {
        await opplastEn(albumId, filer[idx])
      } catch (e) {
        console.error('Opplasting feilet for', filer[idx].name, e)
      }
      ferdig++
      onProgress(ferdig)
    }
  }
  const arbeidere = Array.from({ length: Math.min(PARALLELL_OPPLAST, filer.length) }, () => neste())
  await Promise.all(arbeidere)
}

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
  const [pending, setPending] = useState<{ totalt: number; ferdig: number } | null>(null)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const filInput = useRef<HTMLInputElement>(null)

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

  async function handleFiler(e: React.ChangeEvent<HTMLInputElement>) {
    if (!album) return
    const filer = Array.from(e.target.files ?? [])
    if (!filer.length) return
    e.target.value = ''
    setPending({ totalt: filer.length, ferdig: 0 })
    try {
      await opplastIBolker(album.id, filer, n => setPending({ totalt: filer.length, ferdig: n }))
      router.refresh()
    } finally {
      setPending(null)
    }
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

          <input
            ref={filInput}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={handleFiler}
          />
          <button
            type="button"
            onClick={() => filInput.current?.click()}
            disabled={!!pending}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: 'var(--radius-card)',
              border: '0.5px solid var(--border)',
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              cursor: pending ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <Icon name="image" size={14} color="var(--accent)" />
            {pending
              ? `Laster opp ${pending.ferdig}/${pending.totalt}…`
              : 'Last opp bilder'}
          </button>
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
