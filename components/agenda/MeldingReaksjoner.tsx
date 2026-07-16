'use client'

import { useState } from 'react'
import { useMeldingReaksjoner } from '@/lib/reaksjoner-hook'
import ReaksjonBadges from '@/components/agenda/ReaksjonBadges'
import type { ReaksjonGruppe } from '@/lib/reaksjoner'

// Re-eksport for bakoverkompatibilitet — flere komponenter importerte typen
// herfra før den ble flyttet til lib/reaksjoner.ts. se #359.
export type { ReaksjonGruppe }

type Props = {
  meldingId: string
  brukerId: string
  reaksjoner: ReaksjonGruppe[]
}

/**
 * Uncontrolled reaksjons-rad for detaljsiden (meldinger/[id]): eier egen
 * optimistiske state via useMeldingReaksjoner og egen picker-tilstand, og
 * viser en «+»-knapp. Agenda-stien bruker i stedet ReaksjonBadges direkte
 * med state delt fra MeldingKort — se #468/F5 for hvorfor hooken ikke lenger
 * kalles i to instanser her.
 */
export default function MeldingReaksjoner({ meldingId, brukerId, reaksjoner: initial }: Props) {
  const [apen, setApen] = useState(false)
  const { reaksjoner, toggle, isPending } = useMeldingReaksjoner({ meldingId, brukerId, initial })

  return (
    <ReaksjonBadges
      brukerId={brukerId}
      reaksjoner={reaksjoner}
      toggle={toggle}
      isPending={isPending}
      apen={apen}
      lukk={() => setApen(false)}
      onPlussKlikk={() => setApen(v => !v)}
    />
  )
}
