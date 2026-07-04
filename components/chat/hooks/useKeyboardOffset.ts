'use client'

import { useState, useEffect } from 'react'

// Tastatur-høyde via visualViewport. Når iOS-tastaturet åpner med
// interactiveWidget='overlays-content' (jf. app/layout.tsx, valgt for å
// unngå dock-bug-klassen) endrer ikke window.innerHeight seg, men
// visualViewport.height krymper. Differansen er omtrent tastatur-høyden.
// keyboardOffset brukes KUN til layout: løfter input-pillen (sticky-pill
// bottom) og vokser paddingBottom på meldingslisten. Ingen scroll-side-
// effekter — terskel-basert auto-scroll fjernet fordi bounce-quirk (#222)
// på iOS PWA var ikke robust å skille fra ekte tastatur-åpning. Se #236.
export function useKeyboardOffset(): number {
  const [keyboardOffset, setKeyboardOffset] = useState(0)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return
    const vv = window.visualViewport
    function oppdater() {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      setKeyboardOffset(offset)
    }
    vv.addEventListener('resize', oppdater)
    vv.addEventListener('scroll', oppdater)
    oppdater()
    return () => {
      vv.removeEventListener('resize', oppdater)
      vv.removeEventListener('scroll', oppdater)
    }
  }, [])
  return keyboardOffset
}
