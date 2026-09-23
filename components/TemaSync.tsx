'use client'

import { useEffect } from 'react'
import { lesTemaFraStorage, resolveTema, settDataTheme, lyttPaaSystemEndring } from '@/lib/tema-klient'
import { TEMA_EVENT, TEMA_VALG, type TemaValg } from '@/lib/konstanter'

// Montert av layout.tsx — binder localStorage og system-mq til data-theme
// etter hydration. Pre-hydration-scriptet i <head> gjør den første sync synkront;
// denne komponenten tar over og lytter på endringer (system-mq + CustomEvent fra UtseendeValg).
//
// `initial` er cookie-verdien resolvert av serveren — brukes som fallback når
// localStorage er tom. Uten dette ville første besøk (tom storage) overstyre
// en gyldig cookie-verdi med 'dark' og bryte 'system'-valget.
export default function TemaSync({ initial }: { initial: TemaValg }) {
  useEffect(() => {
    const valg = lesTemaFraStorage() ?? initial
    settDataTheme(resolveTema(valg))

    let unsub: (() => void) | null = null
    if (valg === 'system') {
      unsub = lyttPaaSystemEndring((mode) => settDataTheme(mode))
    }

    // Lytt på tema-endring fra UtseendeValg-komponenten.
    // Validerer detail mot TEMA_VALG før bruk — ignorer ugyldige events
    // (defensiv mot tredjeparts-kode som måtte dispatche samme event-navn).
    const handler = (e: Event) => {
      const v = (e as CustomEvent<unknown>).detail
      if (typeof v !== 'string' || !(TEMA_VALG as readonly string[]).includes(v)) return
      const valid = v as TemaValg
      if (valid === 'system') {
        if (!unsub) unsub = lyttPaaSystemEndring((mode) => settDataTheme(mode))
        settDataTheme(resolveTema('system'))
      } else {
        unsub?.(); unsub = null
        settDataTheme(valid)
      }
    }
    window.addEventListener(TEMA_EVENT, handler)
    return () => { unsub?.(); window.removeEventListener(TEMA_EVENT, handler) }
  }, [initial])
  return null
}
