// Innloggedes andel av fondets totalverdi, som en ring ved siden av totalen (#779).
// Ren server-komponent — ingen interaksjon, så ingen grunn til å sende JS.

const STORRELSE = 64
const STREK = 3
const RADIUS = (STORRELSE - STREK) / 2
const OMKRETS = 2 * Math.PI * RADIUS

export default function AndelSirkel({ andelPst }: { andelPst: number }) {
  // Buen klemmes til 0–100: en andel over 100 % er en datafeil, ikke noe
  // ringen skal prøve å tegne. Teksten viser likevel det faktiske tallet.
  const bue = (Math.min(Math.max(andelPst, 0), 100) / 100) * OMKRETS
  // Én desimal, samme presisjon som prosent() i lib/belop.ts — men uten
  // fortegn, fordi en andel ikke er en endring.
  const tekst = `${andelPst.toLocaleString('nb', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`

  return (
    <div
      role="img"
      aria-label={`Din andel: ${tekst}`}
      style={{ position: 'relative', width: STORRELSE, height: STORRELSE, flexShrink: 0 }}
    >
      {/* Rotert -90° så buen starter kl. 12 og går med klokka */}
      <svg
        width={STORRELSE}
        height={STORRELSE}
        viewBox={`0 0 ${STORRELSE} ${STORRELSE}`}
        style={{ transform: 'rotate(-90deg)', display: 'block' }}
        aria-hidden="true"
      >
        <circle
          cx={STORRELSE / 2}
          cy={STORRELSE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--border-subtle)"
          strokeWidth={STREK}
        />
        {/* Ingen bue ved 0 — round-linecap tegner ellers en prikk kl. 12 */}
        {bue > 0 && <circle
          cx={STORRELSE / 2}
          cy={STORRELSE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={STREK}
          strokeLinecap="round"
          strokeDasharray={`${bue} ${OMKRETS}`}
        />}
      </svg>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 14,
            color: 'var(--text-primary)',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          {tekst}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 7,
            color: 'var(--text-tertiary)',
            letterSpacing: '1px',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          Din andel
        </span>
      </div>
    </div>
  )
}
