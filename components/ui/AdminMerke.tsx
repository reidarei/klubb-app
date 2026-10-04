type Props = {
  /** Diameter på sirkelen i px. Skjoldet skaleres til under halvparten. */
  size?: number
}

/**
 * Admin-merket: skjold i aksent-sirkel. Samme merke på /innstillinger (stort, i
 * «Kun for admin»-boksen) og på Kontrollpanel-raden på /klubbinfo (lite), så
 * man kjenner igjen at raden fører til en admin-flate.
 */
export default function AdminMerke({ size = 26 }: Props) {
  const ikon = Math.round(size * 0.46)
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--accent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <svg
        width={ikon}
        height={ikon}
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--accent-foreground)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4z" />
      </svg>
    </div>
  )
}
