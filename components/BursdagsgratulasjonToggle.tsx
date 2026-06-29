'use client'

// Per-admin toggle for automatisk bursdagsgratulasjon i klubb-chat.
// Vises kun for admins (sjekkes i parent — innstillinger/page.tsx).
// Skriver til profiles.bursdagsgratulasjon_aktiv via server action.

import { useTransition } from 'react'
import { oppdaterBursdagsgratulasjon } from '@/app/(app)/innstillinger/actions'
import { ToggleRad } from '@/components/ui/ToggleSwitch'

export default function BursdagsgratulasjonToggle({ aktiv }: { aktiv: boolean }) {
  const [isPending, startTransition] = useTransition()

  function toggle() {
    startTransition(() => oppdaterBursdagsgratulasjon(!aktiv))
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 4px',
      }}
    >
      <div
        style={{
          flex: 1,
          minWidth: 0,
          fontFamily: 'var(--font-body)',
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--text-primary)',
          lineHeight: 1.3,
        }}
      >
        Send automatisk bursdagsgratulasjon i chatten fra meg
      </div>
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
    </div>
  )
}
