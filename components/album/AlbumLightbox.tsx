'use client'

import { useEffect, useState, useRef, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Icon from '@/components/ui/Icon'
import { settOmslagsbilde, slettAlbumBilde } from '@/lib/actions/album'
import AlbumBildeReaksjoner from '@/components/album/AlbumBildeReaksjoner'
import type { ReaksjonGruppe } from '@/lib/reaksjoner'

// Fullskjerm-galleri for album. Pil-knapper, swipe, tastatur og X for å lukke.
// Krysser mellom bilder uten å unmounte hele overlayet — det gir en stabil
// følelse selv om bildene tar tid å laste.
//
// Touch-håndtering: vi måler horisontalt drag og bytter bilde hvis terskelen
// er passert. Vertikal scroll fanges ikke (bildet fyller skjermen).
export default function AlbumLightbox({
  bilder,
  startIndex,
  onLukk,
  albumId,
  kanRedigere = false,
  coverBildeId = null,
  brukerId,
}: {
  // reaksjoner er valgfri: AlbumSeksjon (arrangement-forhåndsvisning) sender
  // ikke reaksjonsdata og bruker denne lightboxen kun til rask forhåndsvisning
  // — reaksjonsraden er scopet til album/[id]-siden (#480). brukerId er derfor
  // også valgfri; raden rendres kun når begge er til stede.
  bilder: { id: string; bilde_url: string; reaksjoner?: ReaksjonGruppe[] }[]
  startIndex: number
  onLukk: () => void
  albumId?: string
  kanRedigere?: boolean
  coverBildeId?: string | null
  brukerId?: string
}) {
  const router = useRouter()
  const [index, setIndex] = useState(startIndex)
  const [montert, setMontert] = useState(false)
  const [pending, startTransition] = useTransition()
  const dragStartX = useRef<number | null>(null)
  const dragDeltaX = useRef(0)

  // Mount-flag for portal — createPortal kan ikke kalles på server
  useEffect(() => {
    setMontert(true)
  }, [])

  function neste() {
    setIndex(i => (i + 1) % bilder.length)
  }
  function forrige() {
    setIndex(i => (i - 1 + bilder.length) % bilder.length)
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onLukk()
      else if (e.key === 'ArrowRight') neste()
      else if (e.key === 'ArrowLeft') forrige()
    }
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    document.documentElement.classList.add('tillat-landskap')
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
      document.documentElement.classList.remove('tillat-landskap')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bilder.length])

  function onTouchStart(e: React.TouchEvent) {
    dragStartX.current = e.touches[0].clientX
    dragDeltaX.current = 0
  }
  function onTouchMove(e: React.TouchEvent) {
    if (dragStartX.current === null) return
    dragDeltaX.current = e.touches[0].clientX - dragStartX.current
  }
  function onTouchEnd() {
    const TERSKEL = 50
    if (Math.abs(dragDeltaX.current) > TERSKEL) {
      if (dragDeltaX.current < 0) neste()
      else forrige()
    }
    dragStartX.current = null
    dragDeltaX.current = 0
  }

  const aktiv = bilder[index]
  if (!aktiv || !montert) return null

  function handleSettOmslag() {
    if (!albumId || !aktiv) return
    startTransition(async () => {
      try {
        await settOmslagsbilde(albumId, aktiv.id)
        router.refresh()
      } catch (e) {
        console.error(e)
        alert('Kunne ikke sette omslag')
      }
    })
  }

  function handleSlett() {
    if (!aktiv) return
    if (!confirm('Slett dette bildet?')) return
    const bildeId = aktiv.id
    const erSiste = bilder.length === 1
    startTransition(async () => {
      try {
        await slettAlbumBilde(bildeId)
        if (erSiste) onLukk()
        else if (index >= bilder.length - 1) setIndex(Math.max(0, index - 1))
        router.refresh()
      } catch (e) {
        console.error(e)
        alert('Kunne ikke slette bildet')
      }
    })
  }

  const erOmslag = coverBildeId === aktiv.id

  // Portal til <body> så fixed-positioning ikke begrenses av layout-
  // containeren (maxWidth 480, position: relative). Uten portal havner
  // overlayet inn i den smale kolonnen og bildet i ovenkanten av den.
  const innhold = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Bilde i full skjerm"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100dvh',
        background: 'var(--overlay-backdrop)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Bilde — klikk midt på lukker, klikk på pil-soner navigerer */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={aktiv.bilde_url}
        alt=""
        style={{
          maxWidth: '95vw',
          maxHeight: '95vh',
          objectFit: 'contain',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      />

      {/* Lukk-knapp */}
      <button
        type="button"
        onClick={onLukk}
        aria-label="Lukk"
        style={{
          position: 'absolute',
          top: 'max(16px, env(safe-area-inset-top))',
          right: 16,
          width: 44,
          height: 44,
          borderRadius: '50%',
          border: 'none',
          background: 'var(--overlay-control-bg)',
          color: 'var(--text-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 0 0 1px var(--overlay-control-ring)',
        }}
      >
        <Icon name="x" size={20} color="currentColor" strokeWidth={2.5} />
      </button>

      {/* Teller */}
      {bilder.length > 1 && (
        <div
          style={{
            position: 'absolute',
            top: 'max(24px, calc(env(safe-area-inset-top) + 8px))',
            left: '50%',
            transform: 'translateX(-50%)',
            color: 'var(--text-primary)',
            opacity: 0.85,
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            letterSpacing: '1.4px',
            fontWeight: 600,
          }}
        >
          {index + 1} / {bilder.length}
        </div>
      )}

      {/* Pil-knapper (synlig på desktop, swipe brukes på mobil) */}
      {bilder.length > 1 && (
        <>
          <button
            type="button"
            onClick={forrige}
            aria-label="Forrige bilde"
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 44,
              height: 44,
              borderRadius: '50%',
              border: 'none',
              // glass-effekt på fotografisk bakgrunn — ingen passende token
              background: 'rgba(255,255,255,0.12)',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              backdropFilter: 'blur(8px)',
            }}
          >
            <span style={{ display: 'flex', transform: 'rotate(180deg)' }}>
              <Icon name="chevron" size={22} color="currentColor" strokeWidth={2.5} />
            </span>
          </button>
          <button
            type="button"
            onClick={neste}
            aria-label="Neste bilde"
            style={{
              position: 'absolute',
              right: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 44,
              height: 44,
              borderRadius: '50%',
              border: 'none',
              // glass-effekt på fotografisk bakgrunn — ingen passende token
              background: 'rgba(255,255,255,0.12)',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              backdropFilter: 'blur(8px)',
            }}
          >
            <Icon name="chevron" size={22} color="currentColor" strokeWidth={2.5} />
          </button>
        </>
      )}

      {/* Reaksjoner på det aktive bildet — kun når brukerId er oppgitt (album/[id]-
          siden). key={aktiv.id} er KRITISK: lightboxen unmounter ikke ved
          bildebytte (samme <AlbumBildeReaksjoner>-instans ville ellers beholde
          forrige bildes optimistiske state) — key tvinger React til å remounte
          komponenten når aktivt bilde endres, slik at useAlbumBildeReaksjoner
          re-initialiseres med riktig `initial`. */}
      {brukerId && (
        <div
          // Stopp touchstart her: swipe-handlerne ligger på ytre container og
          // navigerer ved drag >50px. Uten dette ville en horisontal drag som
          // starter på en badge både toggle reaksjon og bytte bilde. Å stoppe
          // touchstart hindrer at container-dragen i det hele tatt initieres
          // (onTouchMove early-returner når dragStartX aldri ble satt).
          onTouchStart={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            // Løftes over admin-kontrollbaren (samme bottom-offset + ~48px høyde)
            // når den vises, ellers samme bunnavstand som baren ville hatt.
            bottom: kanRedigere && albumId
              ? 'calc(max(20px, env(safe-area-inset-bottom)) + 52px)'
              : 'max(20px, env(safe-area-inset-bottom))',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '6px 10px',
            borderRadius: 999,
            background: 'var(--overlay-control-bg)',
            boxShadow: '0 0 0 1px var(--overlay-control-ring)',
          }}
        >
          <AlbumBildeReaksjoner key={aktiv.id} bildeId={aktiv.id} brukerId={brukerId} initial={aktiv.reaksjoner ?? []} />
        </div>
      )}

      {/* Handlinger (kun synlig for admin/eier) */}
      {kanRedigere && albumId && (
        <div
          style={{
            position: 'absolute',
            bottom: 'max(20px, env(safe-area-inset-bottom))',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: 10,
            padding: '8px 10px',
            borderRadius: 999,
            background: 'var(--overlay-control-bg)',
            boxShadow: '0 0 0 1px var(--overlay-control-ring)',
          }}
        >
          <button
            type="button"
            onClick={handleSettOmslag}
            disabled={pending || erOmslag}
            style={{
              border: 'none',
              padding: '8px 14px',
              borderRadius: 999,
              background: erOmslag ? 'var(--accent-soft)' : 'transparent',
              color: erOmslag ? 'var(--accent)' : 'var(--text-primary)',
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              fontWeight: 600,
              cursor: erOmslag || pending ? 'default' : 'pointer',
              opacity: pending && !erOmslag ? 0.6 : 1,
            }}
          >
            {erOmslag ? 'Omslag' : 'Sett som omslag'}
          </button>
          <button
            type="button"
            onClick={handleSlett}
            disabled={pending}
            aria-label="Slett bilde"
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              border: 'none',
              background: 'transparent',
              color: 'var(--danger-alt)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: pending ? 'default' : 'pointer',
              opacity: pending ? 0.6 : 1,
            }}
          >
            <Icon name="x" size={18} color="currentColor" strokeWidth={2.5} />
          </button>
        </div>
      )}
    </div>
  )

  return createPortal(innhold, document.body)
}
