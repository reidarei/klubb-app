import { formaterDato } from '@/lib/dato'
import { heleKr, andelTekst, kontantEndring, fargeToken, refFor, type Fondsrapport } from '@/lib/fondsrapport'

type Props = {
  rapport: Fondsrapport
  /** Innloggedes egen profil_id — brukes til å utheve hans egen linje (via refFor, samme ref som i teksten). */
  brukerId: string
}

// Samme tusenskille-logikk som lib/fondsrapport.ts sin (private) grupperTusen,
// men for VISNING — bruker U+2212 som minustegn, ikke ASCII «-». Teksten som
// lagres i innlegget (lib/fondsrapport.ts) og teksten som vises her er bevisst
// to ulike tegnsett for samme fortegn: lagringsformatet må parse's tilbake
// identisk på tvers av miljøer (ASCII), kortet skal se riktig typografisk ut.
function tusenvis(n: number): string {
  return Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

function endringVisning(endring: number | 'ny'): { tekst: string; farge: string } {
  if (endring === 'ny') return { tekst: 'NY', farge: 'var(--accent)' }
  if (endring === 0) return { tekst: '±0', farge: 'var(--text-tertiary)' }
  if (endring > 0) return { tekst: `+${tusenvis(endring)}`, farge: 'var(--success)' }
  return { tekst: `−${tusenvis(endring)}`, farge: 'var(--danger)' }
}

/**
 * Fondsrapport-kortet — tegnes fra teksten i innlegget (lesFondsrapport()),
 * ALDRI fra en egen tabell (bindende ramme, issue #785). Rent presentasjonelt:
 * ingen actions, ingen state, ingen <a> (kortet selv er allerede en Link i
 * MeldingKort/meldingssiden — <a>-i-<a> er ugyldig HTML, se #465).
 */
export default function FondsrapportBlokk({ rapport, brukerId }: Props) {
  const perDatoTekst = formaterDato(rapport.perDato, 'd. MMM').replace(/\.$/, '')

  const endring = kontantEndring(rapport.kontanter, rapport.forrige.kontanter, rapport.forrige.kvartal)
  // Uendret saldo er nøytral: dempet tekst, ingen success/danger-farge, ingen pil.
  const pill =
    endring.retning === 'opp'
      ? { farge: 'var(--success)', bakgrunn: 'var(--success-soft)', border: 'var(--success-border)', pil: '▲' }
      : endring.retning === 'ned'
        ? { farge: 'var(--danger)', bakgrunn: 'var(--danger-soft)', border: 'var(--danger-border)', pil: '▼' }
        : { farge: 'var(--text-tertiary)', bakgrunn: 'transparent', border: 'var(--border-subtle)', pil: null }

  const totalLinjer = rapport.linjer.reduce((s, l) => s + l.belop, 0)

  // Donut-teknikken: r=15.9155 i en 0..42-viewBox gir en omkrets på nøyaktig
  // 100 — stroke-dasharray kan da uttrykkes direkte i prosentpoeng. Hvert
  // segment starter der forrige sluttet (kumulativ), forskjøvet 25 (kvart
  // omkrets) for å starte kl. 12 — og et lite gap spises av segmentlengden
  // (ikke av et ekte mellomrom) for luft mellom fargene.
  const GAP_PP = 1.2
  let kumulativ = 0
  const segmenter = rapport.linjer.map((l, i) => {
    const andelPst = totalLinjer > 0 ? (l.belop / totalLinjer) * 100 : 0
    const start = kumulativ
    kumulativ += andelPst
    const lengde = Math.max(0, andelPst - GAP_PP)
    return {
      ref: l.ref,
      farge: fargeToken(i),
      dasharray: `${lengde} ${100 - lengde}`,
      dashoffset: 25 - start,
    }
  })

  return (
    <div
      style={{
        marginTop: 10,
        padding: '16px 16px 18px',
        borderRadius: 'var(--radius-card)',
        background: 'var(--bg-elevated-2)',
        border: '0.5px solid var(--border-subtle)',
      }}
    >
      {/* Topplinje: kvartal + år, og dato for siste oppgjør */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 6 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>
          Fondsrapport <span style={{ color: 'var(--accent)' }}>Q{rapport.kvartal}</span> {rapport.aar}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-tertiary)',
            letterSpacing: '1px',
            textTransform: 'uppercase',
          }}
        >
          Per {perDatoTekst}
        </div>
      </div>

      {/* Saldo og endring til venstre, smultring til høyre. Endringen står på to
          linjer nettopp for at sirkelen skal få plass ved siden av på mobilbredde. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Hovedtall */}
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--text-tertiary)',
              letterSpacing: '1.4px',
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
          >
            Kontanter på konto
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 40,
              fontWeight: 400,
              color: 'var(--text-primary)',
              letterSpacing: '-1px',
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap',
              marginBottom: 12,
            }}
          >
            {heleKr(rapport.kontanter)}
          </div>

          {/* Endring siden forrige kvartal — beløp og prosent på hver sin linje */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'baseline',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 14,
              background: pill.bakgrunn,
              border: `0.5px solid ${pill.border}`,
              color: pill.farge,
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              fontWeight: 600,
              lineHeight: 1.35,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {pill.pil && <span aria-hidden="true">{pill.pil}</span>}
            <span>
              <span style={{ display: 'block' }}>{endring.belop}</span>
              <span style={{ display: 'block', fontWeight: 500 }}>{endring.sammenligning}</span>
            </span>
          </div>
        </div>

        {/* Smultring */}
        <div style={{ position: 'relative', width: 112, height: 112, flexShrink: 0 }}>
          {/* Dekorativ — samme info står i eierlista under (som AndelSirkel) */}
          <svg viewBox="0 0 42 42" width="100%" height="100%" aria-hidden="true">
            <circle cx="21" cy="21" r="15.9155" fill="transparent" stroke="var(--border-subtle)" strokeWidth="5" />
            {segmenter.map(s => (
              <circle
                key={s.ref}
                cx="21"
                cy="21"
                r="15.9155"
                fill="transparent"
                stroke={s.farge}
                strokeWidth="5"
                strokeDasharray={s.dasharray}
                strokeDashoffset={s.dashoffset}
              />
            ))}
          </svg>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--text-primary)', lineHeight: 1 }}>
              {rapport.linjer.length}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 8,
                color: 'var(--text-tertiary)',
                letterSpacing: '1px',
                textTransform: 'uppercase',
                marginTop: 2,
              }}
            >
              eiere
            </div>
          </div>
        </div>
      </div>

      {/* Hårstrek */}
      <div style={{ height: 1, background: 'var(--border-subtle)', margin: '18px 0 14px' }} />

      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--text-tertiary)',
          letterSpacing: '1.4px',
          textTransform: 'uppercase',
          marginBottom: 12,
        }}
      >
        Hvem eier kontantene
      </div>

      {/* Liste */}
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rapport.linjer.map((l, i) => {
          const andelPst = totalLinjer > 0 ? (l.belop / totalLinjer) * 100 : 0
          const egen = refFor(brukerId) === l.ref
          const e = endringVisning(l.endring)
          return (
            <div
              key={l.ref}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 8,
                fontFamily: 'var(--font-body)',
                fontSize: 12,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: fargeToken(i),
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: egen ? 'var(--accent)' : 'var(--text-primary)',
                  fontWeight: egen ? 600 : 500,
                }}
              >
                {l.navn}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: e.farge,
                  flexShrink: 0,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {e.tekst}
              </span>
              <span
                style={{
                  fontVariantNumeric: 'tabular-nums',
                  color: 'var(--text-secondary)',
                  flexShrink: 0,
                  minWidth: 58,
                  textAlign: 'right',
                }}
              >
                {heleKr(l.belop)}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'var(--text-tertiary)',
                  flexShrink: 0,
                  minWidth: 30,
                  textAlign: 'right',
                }}
              >
                {andelTekst(andelPst)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
