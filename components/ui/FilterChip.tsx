import type { ReactNode } from 'react'

type Props = {
  href: string
  aktiv: boolean
  children: ReactNode
}

// Delt chip-lenke for /tidligere og /innspill (#499 punkt 3). Begge sidene
// hadde nesten identisk inline-stil for filter-radene sine, men med samme feil:
// visuell høyde ~25 px, godt under iOS-minimumet på 44×44 for tap-mål.
//
// Å bare øke padding til 44 px høyde ville gjort radene klumpete — pillene
// skal se like spinkle ut som før. Løsningen er å skille *synlig* pille
// (span, uendret stil) fra *treffområdet* (Link): Link-en får usynlig
// vertikal padding pluss like stor negativ margin, slik at layouten (rad-
// høyde, gap til naboer) ikke endres, mens selve tap-flaten vokser til 44 px
// og strekker seg inn i luften over/under pillen. Samme teknikk som
// components/stedene/EuropaKart.tsx (TREFF=44, margin:-8) — der med fast
// bredde/høyde, her med padding fordi bredden allerede er god nok (teksten
// gjør pillen bredere enn 44 px i alle våre bruksteder).
const USYNLIG_PADDING = 9 // 25 (visuell høyde) + 2*9 ≈ 43–44 px treffhøyde

// VIKTIG for kallere: treffområdet vokser *ut av* layoutboksen (negativ margin
// nøytraliserer paddingen). Naboer i samme rad er upåvirket — horisontal padding
// er 0 — men når raden brytes, overlapper treffområdene mellom radene med
// 2*USYNLIG_PADDING minus radgapet, og den senere chippen i DOM vinner
// hit-testen. Samme bug-klasse som EuropaKart (#508). Kallere som kan brytes MÅ
// derfor bruke CHIP_RAD_GAP som row-gap: da møtes treffområdene eksakt uten å
// overlappe. Bruk `gap: `${CHIP_RAD_GAP}px 6px`` — ikke en hardkodet verdi, så
// koblingen ikke drifter hvis paddingen justeres.
export const CHIP_RAD_GAP = USYNLIG_PADDING * 2

export default function FilterChip({ href, aktiv, children }: Props) {
  return (
    // Vanlig <a>, ikke next/link (#659). En filter-chip peker på samme rute
    // med ny searchParam, og der forgifter Links hover-prefetch navigasjonen:
    // prefetchen svarer 200 og blir så abortert, og klikket etterpå venter for
    // alltid på den døde cache-entryen — URL-en endres aldri. Målt både i CI
    // og lokalt. `prefetch={false}` hjelper ikke; det slår bare av
    // viewport-prefetch, ikke hover (Next-dokumentert oppførsel).
    // Hard navigasjon er dessuten liten pris her: et filterbytte rendrer hele
    // lista på nytt uansett, så det er ingen delt UI å bevare.
    <a
      href={href}
      aria-current={aktiv ? 'page' : undefined}
      style={{
        display: 'inline-flex',
        padding: `${USYNLIG_PADDING}px 0`,
        margin: `-${USYNLIG_PADDING}px 0`,
        textDecoration: 'none',
      }}
    >
      <span
        style={{
          padding: '7px 12px',
          borderRadius: 999,
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '1.4px',
          fontWeight: 600,
          textTransform: 'uppercase',
          background: aktiv ? 'var(--accent-soft)' : 'transparent',
          color: aktiv ? 'var(--accent)' : 'var(--text-tertiary)',
          border: `0.5px solid ${aktiv ? 'var(--border-strong)' : 'var(--border-subtle)'}`,
        }}
      >
        {children}
      </span>
    </a>
  )
}
