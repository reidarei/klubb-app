'use client'

import { useState } from 'react'
import Image from 'next/image'
import BildeLightbox from '@/components/ui/BildeLightbox'
import Avatar from '@/components/ui/Avatar'
import { formaterDato } from '@/lib/dato'

// Rutenett for bildene som er lagt ut i klubbchatten (#569).
//
// Bevisst enklere enn AlbumDetalj: chat-bilder har ingen album_bilde-rad, så
// de kan ikke bære reaksjoner eller kommentarer — de hører til meldingen sin.
// Å sende dem gjennom AlbumDetalj ville gitt knapper som skriver til
// album_bilde_reaksjon med en id som ikke finnes.
//
// Hvert bilde lenker tilbake til chatten via avsender og dato, så veien til
// samtalen rundt bildet er kort.

export type ChatBilde = {
  id: string
  bilde_url: string
  opprettet: string
  navn: string
  bildeUrl: string | null
  rolle: string | null
}

export default function ChatBildeGalleri({ bilder }: { bilder: ChatBilde[] }) {
  const [lightbox, setLightbox] = useState<string | null>(null)

  if (bilder.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '16px 0 0' }}>
        Ingen bilder er lagt ut i chatten ennå.
      </p>
    )
  }

  return (
    <>
      <div
        style={{
          display: 'grid',
          // minmax(0, 1fr), ikke 1fr — samme grunn som album-oversikten:
          // auto-minimum ville latt innholdet presse kolonnene forbi viewporten.
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 10,
          marginTop: 16,
        }}
      >
        {bilder.map(b => (
          <button
            key={b.id}
            type="button"
            onClick={() => setLightbox(b.bilde_url)}
            style={{
              padding: 0,
              border: '0.5px solid var(--border-subtle)',
              borderRadius: 'var(--radius-small)',
              overflow: 'hidden',
              background: 'var(--bg-elevated)',
              cursor: 'pointer',
              display: 'block',
              textAlign: 'left',
            }}
          >
            <div style={{ position: 'relative', aspectRatio: '1', background: 'var(--bg-elevated-2)' }}>
              <Image
                src={b.bilde_url}
                alt=""
                fill
                style={{ objectFit: 'cover' }}
                sizes="(max-width: 480px) 50vw, 240px"
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 8px' }}>
              <Avatar name={b.navn} src={b.bildeUrl} size={18} rolle={b.rolle} />
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {b.navn}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  color: 'var(--text-tertiary)',
                  flexShrink: 0,
                }}
              >
                {formaterDato(b.opprettet, 'd. MMM yy')}
              </span>
            </div>
          </button>
        ))}
      </div>

      {lightbox && <BildeLightbox src={lightbox} onLukk={() => setLightbox(null)} />}
    </>
  )
}
