'use client'

import { useRef, useState } from 'react'
import { komprimer } from '@/lib/bilde-utils'

// "Bytt bilde"-kontroll. Åpner mobilens galleri direkte, komprimerer i
// nettleseren og leverer den komprimerte File-en til forelderen via
// onBildeFil. Selve opplastingen til R2 skjer FØRST når forelderen
// lagrer skjemaet — på den måten blir ingen bilder orphans i R2 hvis
// brukeren angrer eller bytter bilde før save.
//
// Forelderen lager preview via URL.createObjectURL(file) og lagrer File i
// skjema-state til submit.
export default function BildeBytterKnapp({
  onBildeFil,
  label = 'Bytt bilde',
  style,
}: {
  onBildeFil: (fil: File) => void
  label?: string
  style?: React.CSSProperties
}) {
  const [laster, setLaster] = useState(false)
  const [feil, setFeil] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFil(e: React.ChangeEvent<HTMLInputElement>) {
    const fil = e.target.files?.[0]
    if (!fil) return
    setFeil('')
    setLaster(true)

    try {
      const komprimert = await komprimer(fil)
      onBildeFil(komprimert)
    } catch (err) {
      setFeil(err instanceof Error ? err.message : 'Kunne ikke lese bildet')
    } finally {
      setLaster(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={laster}
        style={{
          background: 'var(--overlay-soft)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          color: 'var(--text-primary)',
          border: '0.5px solid var(--border)',
          padding: '7px 14px',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 500,
          fontFamily: 'var(--font-body)',
          cursor: laster ? 'wait' : 'pointer',
          opacity: laster ? 0.7 : 1,
          ...style,
        }}
      >
        {laster ? 'Klargjør…' : label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFil}
      />
      {feil && (
        <p
          style={{
            fontSize: 11,
            color: 'var(--danger)',
            marginTop: 6,
            fontFamily: 'var(--font-body)',
          }}
        >
          {feil}
        </p>
      )}
    </>
  )
}
