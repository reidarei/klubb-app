// Egen loading-fallback for /kart (#723) — uten denne brukte Next den
// generiske app/(app)/loading.tsx (kortliste med padding for en vanlig
// agenda-side), som så synlig feil ut over et kart som selv fyller hele
// flaten under headeren (og HELE viewporten i reisemodus, uten header i det
// hele tatt). `height: '100%'` er nok: `<main>` i AppLayout er allerede
// riktig størrelse via flex-1, uansett om TopHeader er montert eller ikke.
export default function KartLoading() {
  return (
    <div
      style={{
        height: '100%',
        minHeight: '50vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-elevated)',
      }}
    >
      <div
        className="animate-pulse"
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          color: 'var(--text-tertiary)',
        }}
      >
        Laster kartet …
      </div>
    </div>
  )
}
