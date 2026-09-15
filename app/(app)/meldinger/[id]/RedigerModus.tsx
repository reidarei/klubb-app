'use client'

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

type RedigerModusVerdi = {
  redigerer: boolean
  setRedigerer: (v: boolean) => void
}

// Default-verdien gjør komponenten trygg å bruke utenfor provideren: en
// MeldingRediger uten ramme rundt oppfører seg som før (aldri i redigerings-
// modus sett utenfra), i stedet for å kaste.
const Ctx = createContext<RedigerModusVerdi>({
  redigerer: false,
  setRedigerer: () => {},
})

export function useRedigerModus() {
  return useContext(Ctx)
}

/**
 * Holder «redigerer»-flagget for ett innlegg, slik at søsken-seksjoner kan
 * vike mens skjemaet står åpent. Children er server-rendret innhold som
 * sendes gjennom uendret — provideren er bare en state-bærer.
 */
export default function RedigerModus({ children }: { children: ReactNode }) {
  const [redigerer, setRedigerer] = useState(false)
  const verdi = useMemo(() => ({ redigerer, setRedigerer }), [redigerer])
  return <Ctx.Provider value={verdi}>{children}</Ctx.Provider>
}

/**
 * Skjuler innholdet sitt mens innlegget redigeres. Bruker `hidden`-attributtet
 * framfor å unmontere: Chat-komponenten har egen state (utkast, realtime-
 * abonnement) som ikke skal rives ned fordi forfatteren retter en skrivefeil.
 */
export function SkjulUnderRedigering({ children }: { children: ReactNode }) {
  const { redigerer } = useRedigerModus()
  return <div hidden={redigerer}>{children}</div>
}
