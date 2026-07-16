'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
// #469 (reaksjoner på arrangement/poll) bør parametrisere disse to inn som
// { leggTil, fjern } i stedet for å klone hele hooken — ~5-8 linjer. Ikke gjort
// nå fordi generaliteten ennå ikke trengs (YAGNI); denne noten hindrer at
// #469-koderen kloner uten å vurdere parametrisering.
import { leggTilMeldingReaksjon, fjernMeldingReaksjon } from '@/lib/actions/meldinger'
import type { ReaksjonGruppe } from '@/lib/reaksjoner'

/**
 * Delt optimistisk reaksjons-logikk for et innlegg (melding). Ekstrahert fra
 * MeldingReaksjoner slik at MeldingKort kan holde reaksjons-state ett sted
 * og dele den mellom badge-raden (MeldingReaksjoner) og tommel-knappen
 * (MeldingTommel) — begge må oppdateres i samme frame. Se #468.
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
  const [reaksjoner, setReaksjoner] = useState<ReaksjonGruppe[]>(initial)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  // Sync inn ferske server-props etter router.refresh(). Uten dette blir en
  // rollback (setReaksjoner(initial)) fanget på den *første* initial-verdien,
  // og etterfølgende server-oppdateringer ignoreres når komponent-instansen
  // ikke remountes. se #359.
  //
  // Kjent, akseptert race (pre-eksisterende): hvis en router.refresh() fra en
  // *annen* kilde (kommentar-send, arkivering, toggle på et annet kort) lander
  // mens en toggle her er in-flight, gir ny initial-ref en kort glitch før
  // neste refresh selvkorrigerer. Smal timing + selvhelende → bevisst ikke
  // adressert. se #468/F2.
  useEffect(() => {
    setReaksjoner(initial)
  }, [initial])

  function toggle(emoji: string) {
    const finnes = reaksjoner.find(r => r.emoji === emoji)
    const harReagert = finnes?.profilIder.includes(brukerId) ?? false

    setReaksjoner(prev => {
      // Én reaksjon per bruker: fjern brukeren fra alle grupper før en
      // eventuell ny legges til.
      const utenBruker = prev.map(r => ({
        ...r,
        profilIder: r.profilIder.filter(p => p !== brukerId),
      }))
      const ferdig = harReagert
        ? utenBruker
        : utenBruker.map(r => r.emoji === emoji ? { ...r, profilIder: [...r.profilIder, brukerId] } : r)

      const harGruppe = ferdig.some(r => r.emoji === emoji)
      const utvidet = !harReagert && !harGruppe
        ? [...ferdig, { emoji, profilIder: [brukerId] }]
        : ferdig

      return utvidet.filter(r => r.profilIder.length > 0)
    })

    startTransition(async () => {
      try {
        if (harReagert) {
          await fjernMeldingReaksjon(meldingId, emoji)
        } else {
          await leggTilMeldingReaksjon(meldingId, emoji)
        }
        router.refresh()
      } catch {
        setReaksjoner(initial)
      }
    })
  }

  return { reaksjoner, toggle, isPending }
}
