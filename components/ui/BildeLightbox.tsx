'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from '@/components/ui/Icon'

// Enkel fullskjerm-visning av et bilde. Klikk hvor som helst eller Escape
// lukker visningen. Rendres via createPortal i document.body slik at
// stacking-context fra parent-komponenter (som chat-feed) ikke kan dempe
// z-index — uten dette havner lightbox under bottom-nav.
export default function BildeLightbox({
  src,
  onLukk,
}: {
  src: string
  onLukk: () => void
}) {
  const [montert, setMontert] = useState(false)

  useEffect(() => {
    setMontert(true)
  }, [])

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onLukk()
    }
    document.addEventListener('keydown', handleEsc)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleEsc)
      document.body.style.overflow = ''
    }
  }, [onLukk])

  if (!montert) return null

  return createPortal(
    <div
      onClick={onLukk}
      role="dialog"
      aria-modal="true"
      aria-label="Bilde i full skjerm"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--overlay-backdrop)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'zoom-out',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        style={{
          maxWidth: '95vw',
          maxHeight: '95vh',
          objectFit: 'contain',
          borderRadius: 4,
        }}
      />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onLukk()
        }}
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
    </div>,
    document.body,
  )
}
