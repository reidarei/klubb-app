import Avatar from '@/components/ui/Avatar'
import Icon from '@/components/ui/Icon'

// Lokal wrapper rundt Avatar — viser enten medlem (med bilde + initialer)
// eller arrangement (med møte-ikon). Holder Avatar-komponenten enkel
// (jf. CLAUDE.md «Policy: Avatar») ved å pakke arrangement-varianten her.

type Props = {
  navn: string
  bildeUrl?: string | null
  rolle?: string | null
  variant: 'profil' | 'arrangement'
  size?: number
}

export default function KaaringKandidat({
  navn,
  bildeUrl,
  rolle,
  variant,
  size = 44,
}: Props) {
  if (variant === 'profil') {
    return <Avatar name={navn} src={bildeUrl} rolle={rolle} size={size} />
  }
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--bg-elevated)',
        border: '0.5px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--accent)',
        flexShrink: 0,
      }}
    >
      <Icon name="calendar" size={Math.round(size * 0.5)} color="var(--accent)" />
    </div>
  )
}
