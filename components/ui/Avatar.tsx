import Image from 'next/image'
import { harGulGloed } from '@/lib/roller'

type Props = {
  name: string
  size?: number
  src?: string | null
  /** Medlemmets rolle — bestemmer evt. særegenskaper som gul ring. */
  rolle?: string | null
}

function initialerAv(navn: string): string {
  return navn
    .split(' ')
    .map(p => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function hueAv(navn: string): number {
  let h = 0
  for (let i = 0; i < navn.length; i++) {
    h = (h * 31 + navn.charCodeAt(i)) & 0xffff
  }
  return (h % 60) + 40
}

export default function Avatar({ name, size = 32, src, rolle }: Props) {
  const init = initialerAv(name || '?')
  const hue = hueAv(name || '')
  // Gul solid ring markerer generalsekretæren. Vi bruker border (ikke box-shadow)
  // fordi box-shadow på avatar inni fixed+backdrop-filter-kontekst trigger en
  // WebKit-compositing-bug som fikk bottom-nav til å følge med scroll i PWA.
  const glod = harGulGloed(rolle ?? null)

  const felles = {
    width: size,
    height: size,
    borderRadius: '50%',
    border: glod ? '1.5px solid #e8d9b5' : '0.5px solid var(--border)',
    flexShrink: 0,
  } as const

  if (src) {
    // Bruk next/image så profilbilder leveres i riktig størrelse
    // (Vercel-optimalisering med WebP/AVIF, DPR-aware). Tidligere ble
    // full Supabase-URL lastet direkte — 100–200 KB per avatar uansett
    // om den ble rendret som 18 px eller 64 px.
    return (
      <Image
        src={src}
        alt={name}
        width={size}
        height={size}
        sizes={`${size * 2}px`}
        style={{ ...felles, objectFit: 'cover' }}
      />
    )
  }

  return (
    <div
      style={{
        ...felles,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `linear-gradient(135deg, oklch(0.28 0.04 ${hue}), oklch(0.18 0.03 ${hue}))`,
        color: 'var(--text-primary)',
        fontSize: size * 0.36,
        fontWeight: 600,
        fontFamily: 'var(--font-body)',
      }}
      aria-label={name}
    >
      {init}
    </div>
  )
}
