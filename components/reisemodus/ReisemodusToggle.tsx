'use client'

import { useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { settReisemodus } from '@/lib/actions/reisemodus'
import ToggleSwitch from '@/components/ui/ToggleSwitch'

type Props = {
  paa: boolean
  /**
   * 'header' — liten pille i TopHeader, ved siden av avataren (normal modus,
   * eller reisemodus PÅ men brukeren er på en annen rute enn /kart).
   * 'kart'   — mørk glass-pille i ReisemodusBar, flytende over selve kartet.
   */
  variant?: 'header' | 'kart'
}

/**
 * Bevisst valg: knappen sier «Reise» (aria-label sier «reisemodus»,
 * for skjermlesere — se CLAUDE.md). Kaller settReisemodus() med GJELDENDE
 * sti, slik at av-valget ikke river brukeren ut av siden han står på (kun
 * på/av-logikken avgjør om det faktisk redirectes — se lib/actions/reisemodus.ts).
 */
export default function ReisemodusToggle({ paa, variant = 'header' }: Props) {
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  function toggle() {
    // Actionen MÅ awaites inne i transitionen. Som løs promise floater
    // rejectionen redirect() forplanter til klienten (NEXT_REDIRECT) fritt, og
    // den globale onunhandledrejection-lytteren skriver en ERROR-rad i
    // feil_logg ved HVERT eneste toggle-trykk — navigasjonen skjer, så
    // symptomet er usynlig i UI, men alarmen fyrer. Fanget av feil_logg-vakten
    // i e2e/sider-laster.spec.ts (#723-review).
    //
    // Mønsteret er husets: rethrow NEXT_REDIRECT så Next får gjøre
    // navigasjonen ferdig, håndter alt annet selv. Se SendMeldingKnapp.tsx.
    startTransition(async () => {
      try {
        await settReisemodus(!paa, pathname)
      } catch (err) {
        if (
          typeof err === 'object' &&
          err !== null &&
          'digest' in err &&
          typeof (err as Record<string, unknown>).digest === 'string' &&
          ((err as Record<string, unknown>).digest as string).startsWith('NEXT_REDIRECT')
        ) {
          throw err
        }
        alert('Klarte ikke å bytte modus. Prøv igjen.')
      }
    })
  }

  // Glidebryter, ikke tekstpille (#744): en bryter som skyves sier «av/på»
  // uten ord, og den er smalere enn ordet «Reise» — som også løser at
  // headeren med fire faner var trang på 390 px (#723-review).
  const bryter = (
    <ToggleSwitch
      on={paa}
      onChange={toggle}
      disabled={isPending}
      testId="reisemodus-toggle"
      ariaLabel={paa ? 'Slå av reisemodus' : 'Slå på reisemodus'}
    />
  )

  if (variant === 'header') {
    return (
      <span style={{ display: 'flex', alignItems: 'center', opacity: isPending ? 0.6 : 1 }}>
        {bryter}
      </span>
    )
  }

  // Over kartflisene trenger bryteren en egen flate for å være lesbar — samme
  // glass-behandling som pillene i knapperaden.
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '6px 8px',
        borderRadius: 'var(--radius-pill)',
        background: 'var(--kart-flate-sterk)',
        border: '0.5px solid var(--kart-kant)',
        backdropFilter: 'var(--blur-card)',
        boxShadow: 'var(--shadow-popover)',
        opacity: isPending ? 0.6 : 1,
      }}
    >
      {bryter}
    </span>
  )
}
