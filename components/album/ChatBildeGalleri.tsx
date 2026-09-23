'use client'

import { useState } from 'react'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import Avatar from '@/components/ui/Avatar'
import { formaterDato } from '@/lib/dato'
import { bildeSrc } from '@/lib/bilde-utils'

// Rutenett for bildene som er lagt ut i klubbchatten (#569).
//
// Bevisst enklere enn AlbumDetalj: chat-bilder har ingen album_bilde-rad, så
// de kan ikke bære reaksjoner eller kommentarer — de hører til meldingen sin.
// Å sende dem gjennom AlbumDetalj ville gitt knapper som skriver til
// album_bilde_reaksjon med en id som ikke finnes.
//
// Hvert bilde lenker tilbake til chatten via avsender og dato, så veien til
// samtalen rundt bildet er kort.

// Dynamisk import: AlbumLightbox drar med seg BildeKommentarSheet og
// AlbumBildeReaksjoner (→ chat-hooks, mention-velger, browser-supabase-klienten).
// Ingenting av det kan rendre her — vi sender verken albumId, brukerId eller
// profiler — så statisk import ville lagt ~76 kB død JS i initial bundle for
// denne ruta. Overlayet vises uansett først etter et klikk, så det er ingen
// fossefall-kostnad ved å hente det da.
const AlbumLightbox = dynamic(() => import('@/components/album/AlbumLightbox'), { ssr: false })

export type ChatBilde = {
  id: string
  bilde_url: string
  opprettet: string
  navn: string
  bildeUrl: string | null
  rolle: string | null
}

export default function ChatBildeGalleri({ bilder }: { bilder: ChatBilde[] }) {
  const [lightbox, setLightbox] = useState<number | null>(null)

  // Filtrer én gang, og la rutenettet og lightboxen dele nøyaktig samme liste.
  // Da er indeksen fra et miniatyr-klikk trivielt gyldig i lightboxen — ellers
  // kunne et bilde uten src blitt sveipet inn, og AlbumLightbox' `if (!bilde)
  // return null` ville unmontert overlayet mens `lightbox`-staten sto uendret
  // (se CLAUDE.md § Policy: Bildevisning).
  const synlige = bilder.filter(b => bildeSrc(b.bilde_url) !== null)

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
        {synlige.map((b, i) => {
          // Non-null: `synlige` er allerede filtrert på at bildeSrc() gir en verdi.
          const bilde = bildeSrc(b.bilde_url)!
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => setLightbox(i)}
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
                  src={bilde}
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
          )
        })}
      </div>

      {/* lightbox !== null, ikke `lightbox &&` — indeks 0 (første bilde) er falsy. */}
      {/* albumId/brukerId/profiler/kanRedigere utelates bevisst: chat-bilder har
          ingen album_bilde-rad, så reaksjons- og kommentarknappene i AlbumLightbox
          (gated bak disse valgfrie propsene) ville skrevet mot en id som ikke finnes. */}
      {lightbox !== null && (
        <AlbumLightbox
          bilder={synlige.map(b => ({ id: b.id, bilde_url: b.bilde_url }))}
          startIndex={lightbox}
          onLukk={() => setLightbox(null)}
        />
      )}
    </>
  )
}
