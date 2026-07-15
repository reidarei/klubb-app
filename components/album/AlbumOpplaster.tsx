'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/ui/Icon'
import { komprimer, lagThumbnail } from '@/lib/bilde-utils'
import { lastOppAlbumBilde } from '@/lib/actions/album'

// Opplastingsknapp for album — brukes både i AlbumSeksjon (arrangement-siden)
// og på /album/[id]. Vises for alle medlemmer: RLS-policyen på album_bilde
// (migrasjon 064) lar alle aktive laste opp til ethvert album, så knappen
// skal ikke gates på eierskap.

// Antall opplastinger som kjører parallelt. 3 er ok kompromiss for mobildata
// — tre samtidige R2-puts metter ikke serverløsningen og holder UI responsiv.
const PARALLELL_OPPLAST = 3

async function opplastEn(albumId: string, fil: File): Promise<void> {
  const komp = await komprimer(fil)
  const thumb = await lagThumbnail(fil)

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

export default function AlbumOpplaster({ albumId }: { albumId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState<{ totalt: number; ferdig: number } | null>(null)
  const filInput = useRef<HTMLInputElement>(null)

  async function handleFiler(e: React.ChangeEvent<HTMLInputElement>) {
    const filer = Array.from(e.target.files ?? [])
    if (!filer.length) return
    e.target.value = ''
    setPending({ totalt: filer.length, ferdig: 0 })
    try {
      await opplastIBolker(albumId, filer, n => setPending({ totalt: filer.length, ferdig: n }))
      router.refresh()
    } finally {
      setPending(null)
    }
  }

  return (
    <>
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
  )
}
