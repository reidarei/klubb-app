'use client'

// Per-admin toggle for automatisk bursdagsgratulasjon i klubb-chat.
// Vises kun for admins (sjekkes i parent — profil/page.tsx).
// Skriver til profiles.bursdagsgratulasjon_aktiv via server action.

import { useTransition } from 'react'
import { oppdaterBursdagsgratulasjon } from '@/app/(app)/innstillinger/actions'
import { ToggleRad } from '@/components/ui/ToggleSwitch'
import { ProfilRad } from '@/components/profil/ProfilRad'

export default function BursdagsgratulasjonToggle({ aktiv }: { aktiv: boolean }) {
  const [isPending, startTransition] = useTransition()

  function toggle() {
    // MÅ awaites inne i transitionen. Som løs promise avsluttes transitionen
    // med én gang, isPending faller tilbake til false før serveren har svart,
    // og React tegner på nytt med den GAMLE verdien — bryteren ser død ut selv
    // om skrivingen gikk fint. Produkteieren traff dette på reisemodus-
    // bryteren og trykket flere ganger (#742); den skrev hver gang.
    startTransition(async () => {
      await oppdaterBursdagsgratulasjon(!aktiv)
    })
  }

  return (
    <ProfilRad etikett="Automatisk bursdagsgratulasjon i chatten" undertekst="Gjelder bare deg">
      <ToggleRad
        on={aktiv}
        onChange={toggle}
        disabled={isPending}
        ariaLabel={
          aktiv
            ? 'Slå av automatisk bursdagsgratulasjon'
            : 'Slå på automatisk bursdagsgratulasjon'
        }
      />
    </ProfilRad>
  )
}
