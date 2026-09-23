// Liten visuell markør på chat-bobler som er importert fra Messenger.
// Bevisst ikke Meta sin offisielle Messenger-logo (varemerke-beskyttet) —
// vi tegner en stilisert chat-boble med et lyn inni for å antyde
// «kommer fra et annet sted, men er en melding». Plasseres absolutt i
// hjørnet av bobla via wrapper-divens position: relative (.chat-boble).
// Plassering: top-corner motsatt slett-knappen (slett er top: -6, samme
// side som boblas «egen-side»). Badgen havner derfor i motsatt
// top-hjørne, så den ikke overlapper hverken slett-knapp eller
// reaksjons-chips som ligger nederst.

type Props = {
  erEgen: boolean
}

export default function MessengerBadge({ erEgen }: Props) {
  return (
    <div
      role="img"
      title="Importert fra Messenger"
      aria-label="Importert fra Messenger"
      style={{
        position: 'absolute',
        top: -6,
        [erEgen ? 'right' : 'left']: -6,
        width: 16,
        height: 16,
        borderRadius: '50%',
        background: 'var(--bg-elevated)',
        border: '0.5px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: 0.6,
        zIndex: 2,
      }}
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: 'var(--text-secondary)' }}
        aria-hidden="true"
      >
        {/* Stilisert chat-boble */}
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        {/* Lyn inni */}
        <polyline points="13 8 9 13 12 13 11 16" />
      </svg>
    </div>
  )
}
