const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'lokal'
const bygget = process.env.BUILD_TIMESTAMP ?? 'ukjent'
const versjon = process.env.APP_VERSION ?? 'v?'

// Liten luft over deploy-info så den ikke klistrer seg på sideinnholdet,
// uten å skape ekstra scrollhøyde. (Tidligere -96px var kompensasjon for
// pb-24 på <main>, som ble fjernet da bottom-dock-en gikk ut.)
export default function DeployInfo() {
  return (
    <p
      className="text-center text-[10px] select-none"
      style={{
        color: 'var(--text-tertiary)',
        opacity: 0.5,
        marginTop: 24,
        paddingBottom: 4,
      }}
    >
      {versjon} · {sha} · {bygget}
    </p>
  )
}
