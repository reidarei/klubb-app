'use client'

// Minimal toast: én melding av gangen, auto-fjerner seg etter `varighet` ms.
// Portal til document.body slik at sticky-headere / fixed-elementer ikke skjuler den.
// Bevisst enkel — vi har ikke behov for kø, varianter eller global state ennå.
// Hvis vi senere trenger toast flere steder, vurder Context-provider i (app)/layout.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export default function Toast({
  melding,
  varighet = 3000,
  onSkjul,
}: {
  melding: string | null
  varighet?: number
  onSkjul: () => void
}) {
  const [mounted, setMounted] = useState(false)

  // createPortal krever document — bare tilgjengelig etter mount på klient.
  useEffect(() => setMounted(true), [])

  // Hold onSkjul i ref slik at timeouten ikke nullstilles hver gang parent
  // re-rendrer med en ny inline-callback (vanlig mønster i RsvpInline m.fl.).
  // Uten dette resettes setTimeout på hver render og toasten forsvinner aldri.
  const onSkjulRef = useRef(onSkjul)
  useEffect(() => {
    onSkjulRef.current = onSkjul
  }, [onSkjul])

  useEffect(() => {
    if (!melding) return
    const t = setTimeout(() => onSkjulRef.current(), varighet)
    return () => clearTimeout(t)
  }, [melding, varighet])

  if (!mounted || !melding) return null

  return createPortal(
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 24,
        transform: 'translateX(-50%)',
        // Over sticky-header (~50) og modaler (vi har ingen z=2000+ i dag)
        zIndex: 9999,
        background: 'var(--accent-soft)',
        border: '1px solid var(--accent)',
        color: 'var(--text-primary)',
        padding: '10px 16px',
        borderRadius: 10,
        fontFamily: 'var(--font-body)',
        fontSize: 14,
        fontWeight: 500,
        boxShadow: 'var(--shadow-floating)',
        maxWidth: 'calc(100vw - 32px)',
        textAlign: 'center',
      }}
    >
      {melding}
    </div>,
    document.body,
  )
}
