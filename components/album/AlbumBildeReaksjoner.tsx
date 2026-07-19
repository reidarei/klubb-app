'use client'

import { useAlbumBildeReaksjoner } from '@/lib/reaksjoner-hook'
import ReaksjonBadges from '@/components/agenda/ReaksjonBadges'
import MeldingTommel from '@/components/agenda/MeldingTommel'
import type { ReaksjonGruppe } from '@/lib/reaksjoner'

type Props = {
  bildeId: string
  brukerId: string
  initial: ReaksjonGruppe[]
}

/**
 * Reaksjonsrad for det aktive bildet i album-lightboxen (#480). Følger
 * MeldingKort-mønsteret fra #468: synlig tommel opp-knapp (trykk = 👍,
 * hold = emoji-velger) + badge-rad for eksisterende reaksjoner — ikke en
 * anonym «+»-knapp (Reidars tilbakemelding 19. juli). Hook-staten eies her
 * og deles mellom tommelen og badgene så begge oppdateres i samme frame.
 * Forelderen (AlbumLightbox) MÅ sette `key={bildeId}` — se kommentar der.
 */
export default function AlbumBildeReaksjoner({ bildeId, brukerId, initial }: Props) {
  const { reaksjoner, toggle, isPending } = useAlbumBildeReaksjoner({ bildeId, brukerId, initial })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <MeldingTommel
        brukerId={brukerId}
        reaksjoner={reaksjoner}
        toggle={toggle}
        isPending={isPending}
      />
      {/* Badges kun når noen har reagert — pickeren bor i tommelen (long-press),
          så ingen onPlussKlikk og dermed ingen «+»-knapp her. */}
      {reaksjoner.length > 0 && (
        <ReaksjonBadges
          brukerId={brukerId}
          reaksjoner={reaksjoner}
          toggle={toggle}
          isPending={isPending}
          apen={false}
          lukk={() => {}}
        />
      )}
    </div>
  )
}
