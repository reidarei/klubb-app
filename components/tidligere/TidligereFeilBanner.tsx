// Banner som viser at én eller flere kilder feilet under henting av
// /tidligere — dum server-komponent uten state. Lokal til /tidligere (ikke
// components/ui/) fordi mønsteret ennå ikke har bevist seg på flere sider
// (#492 holdes bevisst lokal, se arkitekturstyrets uttalelse).
//
// Tar IKKE «Prøv igjen»-lenka som prop — den rendres separat nederst i
// page.tsx (samme slot som «Last mer»), slik at en bruker som har scrollet
// til bunnen ser at knappen byttet ord i stedet for at den bare forsvant.

import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'

export default function TidligereFeilBanner({ tekst }: { tekst: string }) {
  return (
    <div
      data-testid="tidligere-feil"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        padding: '12px 14px',
        borderRadius: 12,
        background: 'var(--danger-soft)',
        border: '0.5px solid var(--danger-border)',
      }}
    >
      {/* Ikon i tillegg til farge — WCAG 1.4.1 (bruk av farge alene). */}
      <ExclamationTriangleIcon aria-hidden style={{ width: 18, height: 18, color: 'var(--danger)' }} />
      {/* --danger er ~3.9:1 mot --danger-soft i lyst tema, under WCAG AA
          4.5:1 — derfor kun brukt til ramme/bakgrunn/ikon. Brødteksten
          bruker --text-primary. */}
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.4, color: 'var(--text-primary)' }}>{tekst}</p>
    </div>
  )
}
