'use client'

import { useState } from 'react'
import { useAlbumBildeReaksjoner } from '@/lib/reaksjoner-hook'
import ReaksjonBadges from '@/components/agenda/ReaksjonBadges'
import type { ReaksjonGruppe } from '@/lib/reaksjoner'

type Props = {
  bildeId: string
  brukerId: string
  initial: ReaksjonGruppe[]
}

/**
 * Reaksjonsrad for det aktive bildet i album-lightboxen (#480). Nær kopi av
 * MeldingReaksjoner — egen optimistisk state via useAlbumBildeReaksjoner og
 * egen picker-tilstand, uncontrolled «+»-knapp. Forelderen (AlbumLightbox)
 * MÅ sette `key={bildeId}` på denne — se kommentar der for hvorfor.
 */
export default function AlbumBildeReaksjoner({ bildeId, brukerId, initial }: Props) {
  const [apen, setApen] = useState(false)
  const { reaksjoner, toggle, isPending } = useAlbumBildeReaksjoner({ bildeId, brukerId, initial })

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
