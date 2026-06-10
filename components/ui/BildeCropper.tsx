'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type Props = {
  fil: File
  onFerdig: (blob: Blob) => void
  onAvbryt: () => void
}

const VIEW_SIZE = 300
const OUTPUT_SIZE = 800
const MIN_ZOOM = 1
const MAX_ZOOM = 3

/**
 * Full-screen crop + zoom-overlay. Viser valgt bilde bak en sirkel-maske,
 * lar brukeren dra bildet rundt og zoome (slider + pinch). Ved "Bruk"
 * rendres crop-området til 800×800 JPEG og returneres som Blob.
 */
export default function BildeCropper({ fil, onFerdig, onAvbryt }: Props) {
  const [bildeUrl, setBildeUrl] = useState('')
  const [bildeNat, setBildeNat] = useState({ w: 0, h: 0 })
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [working, setWorking] = useState(false)

  const imgRef = useRef<HTMLImageElement>(null)
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map())
  const dragStartRef = useRef({ x: 0, y: 0, px: 0, py: 0 })
  const pinchStartRef = useRef<{ dist: number; zoom: number } | null>(null)
  const [dragger, setDragger] = useState(false)

  useEffect(() => {
    const url = URL.createObjectURL(fil)
    setBildeUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [fil])

  // Escape lukker
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onAvbryt()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onAvbryt])

  // Lås scroll mens modal er oppe
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const { baseScale, displayW, displayH, maxX, maxY } = useMemo(() => {
    if (!bildeNat.w || !bildeNat.h) {
      return { baseScale: 1, displayW: 0, displayH: 0, maxX: 0, maxY: 0 }
    }
    // Fyll viewet slik at kortsiden dekker VIEW_SIZE (så sirkelen alltid er fylt)
    const bs = Math.max(VIEW_SIZE / bildeNat.w, VIEW_SIZE / bildeNat.h)
    const dw = bildeNat.w * bs * zoom
    const dh = bildeNat.h * bs * zoom
    return {
      baseScale: bs,
      displayW: dw,
      displayH: dh,
      maxX: Math.max(0, (dw - VIEW_SIZE) / 2),
      maxY: Math.max(0, (dh - VIEW_SIZE) / 2),
    }
  }, [bildeNat, zoom])

  const clampedX = Math.max(-maxX, Math.min(maxX, pos.x))
  const clampedY = Math.max(-maxY, Math.min(maxY, pos.y))

  function handlePointerDown(e: React.PointerEvent) {
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values())
      const dist = Math.hypot(b.x - a.x, b.y - a.y)
      pinchStartRef.current = { dist, zoom }
      setDragger(false)
    } else {
      setDragger(true)
      dragStartRef.current = { x: e.clientX, y: e.clientY, px: clampedX, py: clampedY }
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!pointersRef.current.has(e.pointerId)) return
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointersRef.current.size === 2 && pinchStartRef.current) {
      const [a, b] = Array.from(pointersRef.current.values())
      const dist = Math.hypot(b.x - a.x, b.y - a.y)
      const ratio = dist / pinchStartRef.current.dist
      const nyZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinchStartRef.current.zoom * ratio))
      setZoom(nyZoom)
      return
    }

    if (dragger) {
      const dx = e.clientX - dragStartRef.current.x
      const dy = e.clientY - dragStartRef.current.y
      setPos({ x: dragStartRef.current.px + dx, y: dragStartRef.current.py + dy })
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    try {
      ;(e.currentTarget as Element).releasePointerCapture(e.pointerId)
    } catch {
      // ignorer
    }
    pointersRef.current.delete(e.pointerId)

    if (pointersRef.current.size < 2) {
      pinchStartRef.current = null
    }

    if (pointersRef.current.size === 0) {
      setDragger(false)
      setPos({ x: clampedX, y: clampedY })
    }
  }

  async function handleBruk() {
    const img = imgRef.current
    if (!img || !bildeNat.w || !bildeNat.h) return

    setWorking(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = OUTPUT_SIZE
      canvas.height = OUTPUT_SIZE
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas ikke tilgjengelig')

      // Hvor mye av bildet (i naturlige piksler) som er synlig i sirkelen
      const natVisible = VIEW_SIZE / (baseScale * zoom)
      const natOffsetX = -clampedX / (baseScale * zoom)
      const natOffsetY = -clampedY / (baseScale * zoom)
      const sx = (bildeNat.w - natVisible) / 2 + natOffsetX
      const sy = (bildeNat.h - natVisible) / 2 + natOffsetY

      ctx.drawImage(img, sx, sy, natVisible, natVisible, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)

      const blob: Blob | null = await new Promise(resolve =>
        canvas.toBlob(b => resolve(b), 'image/jpeg', 0.85)
      )
      if (!blob) throw new Error('Kunne ikke generere bilde')
      onFerdig(blob)
    } catch {
      setWorking(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tilpass profilbilde"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(6, 6, 8, 0.88)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '2px',
          textTransform: 'uppercase',
          color: 'var(--accent)',
          marginBottom: 10,
          fontWeight: 600,
        }}
      >
        Tilpass
      </div>
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 26,
          color: 'var(--text-primary)',
          margin: 0,
          marginBottom: 6,
          letterSpacing: '-0.4px',
          fontWeight: 500,
        }}
      >
        Flytt og zoom
      </h2>
      <p
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 12,
          color: 'var(--text-tertiary)',
          margin: 0,
          marginBottom: 24,
          textAlign: 'center',
        }}
      >
        Dra bildet, bruk slideren eller klyp for å zoome
      </p>

      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          position: 'relative',
          width: VIEW_SIZE,
          height: VIEW_SIZE,
          touchAction: 'none',
          cursor: dragger ? 'grabbing' : 'grab',
          userSelect: 'none',
          overflow: 'hidden',
          borderRadius: 4,
        }}
      >
        {/* Bilde-lag */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {bildeUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              ref={imgRef}
              src={bildeUrl}
              alt=""
              crossOrigin="anonymous"
              draggable={false}
              onLoad={e => {
                const im = e.currentTarget
                setBildeNat({ w: im.naturalWidth, h: im.naturalHeight })
              }}
              style={{
                width: displayW || 'auto',
                height: displayH || 'auto',
                maxWidth: 'none',
                transform: `translate(${clampedX}px, ${clampedY}px)`,
                userSelect: 'none',
                pointerEvents: 'none',
                display: 'block',
              }}
            />
          )}
        </div>

        {/* Sirkel-maske og ring */}
        <svg
          width={VIEW_SIZE}
          height={VIEW_SIZE}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        >
          <defs>
            <mask id="sirkel-maske">
              <rect width={VIEW_SIZE} height={VIEW_SIZE} fill="white" />
              <circle cx={VIEW_SIZE / 2} cy={VIEW_SIZE / 2} r={VIEW_SIZE / 2 - 2} fill="black" />
            </mask>
          </defs>
          <rect
            width={VIEW_SIZE}
            height={VIEW_SIZE}
            fill="rgba(6,6,8,0.72)"
            mask="url(#sirkel-maske)"
          />
          <circle
            cx={VIEW_SIZE / 2}
            cy={VIEW_SIZE / 2}
            r={VIEW_SIZE / 2 - 2}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.5"
            opacity="0.9"
          />
        </svg>
      </div>

      {/* Zoom-kontroll */}
      <div
        style={{
          width: VIEW_SIZE,
          marginTop: 26,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--text-tertiary)',
            width: 14,
            textAlign: 'center',
          }}
        >
          −
        </span>
        <input
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={e => setZoom(parseFloat(e.target.value))}
          style={{
            flex: 1,
            accentColor: 'var(--accent)',
            cursor: 'pointer',
          }}
          aria-label="Zoom"
        />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--text-tertiary)',
            width: 14,
            textAlign: 'center',
          }}
        >
          +
        </span>
      </div>

      {/* Handlinger */}
      <div style={{ display: 'flex', gap: 12, marginTop: 30, width: VIEW_SIZE }}>
        <button
          type="button"
          onClick={onAvbryt}
          style={{
            flex: 1,
            padding: '13px 0',
            borderRadius: 999,
            background: 'transparent',
            border: '0.5px solid var(--border)',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Avbryt
        </button>
        <button
          type="button"
          onClick={handleBruk}
          disabled={working || !bildeNat.w}
          style={{
            flex: 1,
            padding: '13px 0',
            borderRadius: 999,
            background: 'var(--accent)',
            border: 'none',
            color: '#0a0a0a',
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            fontWeight: 600,
            cursor: working ? 'wait' : 'pointer',
            opacity: working ? 0.7 : 1,
          }}
        >
          {working ? 'Lagrer…' : 'Bruk'}
        </button>
      </div>
    </div>
  )
}
