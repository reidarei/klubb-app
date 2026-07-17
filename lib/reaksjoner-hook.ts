'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { leggTilMeldingReaksjon, fjernMeldingReaksjon } from '@/lib/actions/meldinger'
import { harBrukerReagert, toggleReaksjonGrupper, type ReaksjonGruppe } from '@/lib/reaksjoner'

/**
 * Delt optimistisk reaksjons-logikk for grupperte reaksjoner (ReaksjonGruppe[]).
 * Generisk over hvilken tabell/action-par som brukes — leggTil/fjern er
 * caller-oppgitte server actions. Ekstrahert fra MeldingReaksjoner slik at
 * MeldingKort kan holde reaksjons-state ett sted og dele den mellom
 * badge-raden (MeldingReaksjoner) og tommel-knappen (MeldingTommel) — begge
 * må oppdateres i samme frame. Se #468. Parametrisert i #475 slik at
 * KommentarReaksjoner (chat_reaksjoner) kan bruke samme hook som
 * meldinger (melding_reaksjon).
 */
export function useReaksjoner({
  id,
  brukerId,
  initial,
  leggTil,
  fjern,
}: {
  id: string
  brukerId: string
  initial: ReaksjonGruppe[]
  leggTil: (id: string, emoji: string) => Promise<unknown>
  fjern: (id: string, emoji: string) => Promise<unknown>
}) {
  const [reaksjoner, setReaksjoner] = useState<ReaksjonGruppe[]>(initial)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  // Sync inn ferske server-props etter router.refresh(). Uten dette blir en
  // rollback (setReaksjoner(initial)) fanget på den *første* initial-verdien,
  // og etterfølgende server-oppdateringer ignoreres når komponent-instansen
  // ikke remountes. se #359.
  //
  // isPending-guarden lukker et race (#468/F2): en refresh fra *annen* kilde
  // (kommentar-send, toggle på annet kort) kunne lande med data hentet før vår
  // toggle committet, og overskrive den optimistiske visningen. Mens en toggle
  // er in-flight ignoreres derfor innkommende initial; når transitionen er
  // ferdig (isPending → false) re-kjører effekten og syncer ferskeste initial.
  useEffect(() => {
    if (isPending) return
    setReaksjoner(initial)
  }, [initial, isPending])

  function toggle(emoji: string) {
    const harReagert = harBrukerReagert(reaksjoner, brukerId, emoji)

    setReaksjoner(prev => toggleReaksjonGrupper(prev, brukerId, emoji))

    startTransition(async () => {
      try {
        if (harReagert) {
          await fjern(id, emoji)
        } else {
          await leggTil(id, emoji)
        }
        router.refresh()
      } catch {
        setReaksjoner(initial)
      }
    })
  }

  return { reaksjoner, toggle, isPending }
}

/**
 * Tynn wrapper rundt useReaksjoner for meldinger (melding_reaksjon-tabellen).
 * Holder kallestedene i MeldingReaksjoner.tsx og MeldingKort.tsx uendret.
 */
export function useMeldingReaksjoner({
  meldingId,
  brukerId,
  initial,
}: {
  meldingId: string
  brukerId: string
  initial: ReaksjonGruppe[]
}) {
  return useReaksjoner({
    id: meldingId,
    brukerId,
    initial,
    leggTil: leggTilMeldingReaksjon,
    fjern: fjernMeldingReaksjon,
  })
}
