'use client'

import { useId, useState } from 'react'
import Avatar from '@/components/ui/Avatar'
import { formaterDato } from '@/lib/dato'
import { formaterKr } from '@/lib/belop'

export type Bevegelse = { dato: string; belop: number }

type Props = {
  navn: string
  kallenavn: string
  bildeUrl: string | null
  rolle: string | null
  dato: string        // snapshot-datoen andelen gjelder
  belop: number
  oppspartAkkumulert: number
  renteandelIFjor: number
  bevegelser: Bevegelse[]
  sisteRad: boolean
}

// Én linje inne i den utvidede visningen: etikett til venstre, beløp til høyre.
function Linje({
  etikett,
  belop,
  fortegn = false,
  sterk = false,
}: {
  etikett: string
  belop: number
  fortegn?: boolean
  sterk?: boolean
}) {
  // Uttak markeres med farge, innskudd ikke. Fortegnet alene skiller dem, så
  // fargen er reservert for det som er verdt å legge merke til — penger UT.
  // (Avkastning-komponenten lenger opp på siden bruker grønt for positive tall,
  // men der betyr positivt «gevinst». Et innskudd er verken gevinst eller tap,
  // og grønt ville vært et feilsignal.)
  const negativ = belop < 0
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 12,
        padding: '5px 0',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 12,
          color: sterk ? 'var(--text-primary)' : 'var(--text-secondary)',
          fontWeight: sterk ? 600 : 400,
        }}
      >
        {etikett}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 12,
          fontWeight: sterk ? 600 : 500,
          color: negativ ? 'var(--danger)' : 'var(--text-primary)',
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}
      >
        {/* Minus-tegn (U+2212), ikke bindestrek — riktig typografi for negative tall */}
        {fortegn ? (negativ ? '−' : '+') : ''}
        {formaterKr(Math.abs(belop))}
      </span>
    </div>
  )
}

export default function InnskyterRad({
  navn,
  kallenavn,
  bildeUrl,
  rolle,
  dato,
  belop,
  oppspartAkkumulert,
  renteandelIFjor,
  bevegelser,
  sisteRad,
}: Props) {
  const [aapen, setAapen] = useState(false)
  const panelId = useId()

  // Utvidbar når det finnes noe å vise. En rad med fjorårstall men TOM
  // bevegelsesliste skal kunne utvides — «ingen bevegelser i år» er informasjon,
  // og i januar gjelder det alle. Kun rader helt uten detaljdata (importert fra
  // et eldre API-svar, eller et nytt medlem som ikke har satt inn noe ennå) er
  // uutvidbare: en accordion som åpner ingenting er verre enn ingen accordion.
  const harDetaljer =
    bevegelser.length > 0 || oppspartAkkumulert !== 0 || renteandelIFjor !== 0

  // Året bevegelsene tilhører hentes fra snapshot-datoen, aldri fra dagens dato
  // (jf. Policy: Tidshåndtering). Ellers ville etikettene skiftet år 1. januar,
  // før et nytt oppgjør faktisk er importert.
  const aar = Number(dato.slice(0, 4))

  const innhold = (
    <>
      <Avatar name={navn} size={28} src={bildeUrl} rolle={rolle} />
      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-primary)' }}>
          {kallenavn}
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-tertiary)' }}>
          {/* «Per»-formulering (ikke «Innskudd») — beløpet er et øyeblikksbilde av
              innskyterens andel, ikke et enkeltinnskudd. Reidars eksakte tekst. */}
          Per {formaterDato(dato, 'd. MMMM')}
        </div>
      </div>
      <span
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          fontWeight: 500,
          color: 'var(--text-primary)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formaterKr(belop)}
      </span>
      {harDetaljer && (
        <span
          aria-hidden="true"
          style={{
            fontSize: 9,
            color: 'var(--text-tertiary)',
            transform: aapen ? 'rotate(180deg)' : 'none',
            transition: 'transform 150ms ease',
            lineHeight: 1,
          }}
        >
          ▼
        </span>
      )}
    </>
  )

  const radStil: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 16px',
    width: '100%',
  }

  return (
    <div style={{ borderBottom: sisteRad ? 'none' : '0.5px solid var(--border-subtle)' }}>
      {harDetaljer ? (
        // Ekte <button>, ikke en div med onClick: gir tastaturfokus, Enter/Space
        // og korrekt utlesning i skjermleser gratis.
        <button
          type="button"
          onClick={() => setAapen(a => !a)}
          aria-expanded={aapen}
          aria-controls={panelId}
          style={{
            ...radStil,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            font: 'inherit',
            color: 'inherit',
            textAlign: 'left',
          }}
        >
          {innhold}
        </button>
      ) : (
        <div style={radStil}>{innhold}</div>
      )}

      {harDetaljer && aapen && (
        <div
          id={panelId}
          style={{
            padding: '4px 16px 12px 56px',
            background: 'var(--bg-elevated-2)',
          }}
        >
          <Linje etikett={`Oppspart t.o.m. ${aar - 1}`} belop={oppspartAkkumulert} />
          <Linje etikett={`Renter ${aar - 1} (din andel)`} belop={renteandelIFjor} />

          <div style={{ borderTop: '0.5px solid var(--border-subtle)', margin: '6px 0' }} />

          {bevegelser.length === 0 ? (
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                color: 'var(--text-tertiary)',
                padding: '5px 0',
              }}
            >
              Ingen inn- eller utbetalinger i {aar} ennå.
            </div>
          ) : (
            bevegelser.map((b, i) => (
              <Linje
                // dato er ikke unik — to overføringer samme dag er to hendelser
                // og skal stå som to linjer. Derfor indeks i nøkkelen.
                key={`${b.dato}-${i}`}
                etikett={formaterDato(b.dato, 'd. MMMM')}
                belop={b.belop}
                fortegn
              />
            ))
          )}

          <div style={{ borderTop: '0.5px solid var(--border-strong)', margin: '6px 0' }} />

          <Linje etikett="Andel" belop={belop} sterk />
        </div>
      )}
    </div>
  )
}
