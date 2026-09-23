'use client'

import { useId, useState } from 'react'
import { formaterKr } from '@/lib/belop'
import Avkastning from '@/components/fond/Avkastning'

// Ekspanderbar rad for en enkelt post i fondet — en eiendom eller et
// verdipapir. Speiler InnskyterRad sitt mønster (ekte <button>, chevron,
// aria-expanded/-controls, detaljpanel på --bg-elevated-2) slik at de tre
// seksjonene på /fond oppfører seg likt. Se #555.
//
// Radens hovedlinje viser VERDI (hva posten er verdt) og urealisert gevinst.
// Panelet viser hva posten har KASTET AV SEG i år — to ulike spørsmål, og
// grunnen til at det siste ikke får plass på hovedlinja.

export type Avkastningslinje = {
  etikett: string
  belop: number
  /** Trekkes fra i netto og vises med minus. Brukes for kostnader. */
  erKostnad?: boolean
}

type Props = {
  navn: string
  /** Undertekst på hovedlinja — «Anskaffelsesverdi 1 200 000» e.l. */
  undertekst: string
  verdi: number
  anskaffelsesverdi: number
  /** Postens løpende avkastning i år. Tom liste = raden er ikke utvidbar. */
  linjer: Avkastningslinje[]
  /** Året linjene gjelder — kommer fra postens oppdatert-dato, ikke dagens. */
  aar: number
  sisteRad: boolean
}

function Linje({ etikett, belop, negativ }: { etikett: string; belop: number; negativ: boolean }) {
  // Null er verken positivt eller negativt: «−0 kr» i rødt leser som en
  // kostnad som ikke finnes. Fortegn og farge henger derfor på beløpet, ikke
  // bare på om linja ER en kostnad.
  const nullbelop = belop === 0
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
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-secondary)' }}>
        {etikett}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 12,
          fontWeight: 500,
          color: negativ && !nullbelop ? 'var(--danger)' : 'var(--text-primary)',
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}
      >
        {/* Minus-tegn (U+2212), ikke bindestrek — riktig typografi for negative tall */}
        {nullbelop ? '' : negativ ? '−' : '+'}
        {formaterKr(Math.abs(belop))}
      </span>
    </div>
  )
}

export default function FondPostRad({
  navn,
  undertekst,
  verdi,
  anskaffelsesverdi,
  linjer,
  aar,
  sisteRad,
}: Props) {
  const [aapen, setAapen] = useState(false)
  const panelId = useId()

  // En post der alt er null har ikke kastet av seg noe i år — men det ER
  // informasjon, og «0 kr i husleie» er noe man vil kunne se. Vi krever
  // derfor bare at det FINNES linjer å vise, ikke at de er ulik null.
  // (Samme resonnement som harDetaljer i InnskyterRad.)
  const harDetaljer = linjer.length > 0

  const netto = linjer.reduce((sum, l) => sum + (l.erKostnad ? -l.belop : l.belop), 0)
  const gevinst = verdi - anskaffelsesverdi

  const innhold = (
    <>
      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 15,
            fontWeight: 500,
            color: 'var(--text-primary)',
            marginBottom: 2,
          }}
        >
          {navn}
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-tertiary)' }}>
          {undertekst}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--text-primary)',
            fontVariantNumeric: 'tabular-nums',
            marginBottom: 2,
          }}
        >
          {formaterKr(verdi)}
        </div>
        <Avkastning
          kroner={gevinst}
          pst={anskaffelsesverdi > 0 ? (gevinst / anskaffelsesverdi) * 100 : 0}
          size={11}
        />
      </div>
      {harDetaljer && (
        <span
          aria-hidden="true"
          style={{
            fontSize: 9,
            color: 'var(--text-tertiary)',
            transform: aapen ? 'rotate(180deg)' : 'none',
            transition: 'transform 150ms ease',
            lineHeight: 1,
            alignSelf: 'center',
            marginLeft: -2,
            flexShrink: 0,
          }}
        >
          ▼
        </span>
      )}
    </>
  )

  const radStil: React.CSSProperties = {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    padding: '14px 16px',
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
        <div id={panelId} style={{ padding: '4px 16px 12px', background: 'var(--bg-elevated-2)' }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              color: 'var(--text-tertiary)',
              padding: '6px 0 2px',
            }}
          >
            Avkastning {aar}
          </div>

          {linjer.map(l => (
            <Linje key={l.etikett} etikett={l.etikett} belop={l.belop} negativ={Boolean(l.erKostnad)} />
          ))}

          {/* Netto-linja er poenget med panelet: husleie alene sier lite når
              driftskostnadene spiser halvparten. Skjules når det bare er én
              linje — da ville den bare gjentatt tallet over. */}
          {linjer.length > 1 && (
            <>
              <div style={{ borderTop: '0.5px solid var(--border-strong)', margin: '6px 0' }} />
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
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}
                >
                  Netto
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 12,
                    fontWeight: 600,
                    color: netto < 0 ? 'var(--danger)' : 'var(--text-primary)',
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {netto === 0 ? '' : netto < 0 ? '−' : '+'}
                  {formaterKr(Math.abs(netto))}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
