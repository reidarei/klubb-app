'use client'

import { formatDistanceToNowStrict } from 'date-fns'
import { nb } from 'date-fns/locale'
import { symbolEmoji } from '@/lib/markering-symboler'
import { aapneVeibeskrivelse } from '@/lib/kart-navigasjon'
import { avstandM, formaterAvstand } from '@/lib/geo-avstand'
import type { Markering } from './PosisjonsKart'

// Detaljpanelet for EN valgt markering (#708/#699) — flyttet ut av
// PosisjonsKart.tsx (#732-uttrekk, ingen atferdsendring). Rene props inn,
// ingen egen state: hvilken markering som er valgt eies fortsatt av
// PosisjonsKart, fordi valget må nullstilles når markeringen forsvinner
// (fjernet eller utløpt) — den vakten bor i en effekt i PosisjonsKart.

type Props = {
  markering: Markering
  /** Over bunn-blokka (markering/timeplan-flyt) når den vises, ellers rett over safe-area. */
  loeftet: boolean
  tastaturOffset: number
  kanFjerne: boolean
  onFjern: () => void
  onLukk: () => void
  /** Kopierer en delbar lenke til stedet (#719) — se PosisjonsKart for selve clipboard-logikken. */
  onKopierLenke: () => void
  /** Din siste delte posisjon (#728) — null hvis du ikke deler. */
  megPunkt: { lat: number; lng: number } | null
  zIndex: number
}

function relativTid(iso: string): string {
  return formatDistanceToNowStrict(new Date(iso), { locale: nb, addSuffix: true })
}

const PILLE = {
  fontFamily: 'var(--font-body)',
  fontSize: 12.5,
  fontWeight: 500,
  letterSpacing: '0.1px',
  padding: '8px 14px',
  borderRadius: 'var(--radius-pill)',
  border: '0.5px solid var(--kart-kant)',
  background: 'var(--kart-flate-sterk)',
  backdropFilter: 'var(--blur-card)',
  color: 'var(--kart-tekst)',
  cursor: 'pointer',
  pointerEvents: 'auto',
  whiteSpace: 'nowrap',
  boxShadow: 'var(--shadow-popover)',
} as const

const HJELPETEKST = {
  fontFamily: 'var(--font-body)',
  fontSize: 12.5,
  color: 'var(--text-tertiary)',
  lineHeight: 1.5,
} as const

export default function MarkeringDetalj({
  markering: mk,
  loeftet,
  tastaturOffset,
  kanFjerne,
  onFjern,
  onLukk,
  onKopierLenke,
  megPunkt,
  zIndex,
}: Props) {
  return (
    <div
      data-testid="markering-panel"
      style={{
        position: 'absolute',
        left: 10,
        right: 10,
        // Over bunn-blokka når den står der, ellers på samme plass.
        bottom: `calc(${loeftet ? 110 : 10}px + env(safe-area-inset-bottom, 0px) + ${tastaturOffset}px)`,
        background: 'var(--kart-flate-sterk)',
        border: '0.5px solid var(--kart-kant)',
        borderRadius: 18,
        padding: '14px 16px',
        boxShadow: 'var(--shadow-popover)',
        backdropFilter: 'var(--blur-card)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        zIndex,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text-primary)',
            overflowWrap: 'anywhere',
          }}
        >
          <span aria-hidden="true" style={{ marginRight: 6 }}>
            {symbolEmoji(mk.symbol)}
          </span>
          {mk.tekst}
        </div>
        <div suppressHydrationWarning style={{ ...HJELPETEKST, marginTop: 2 }}>
          {mk.avNavn} · {relativTid(mk.opprettet)}
          {megPunkt && (
            <> · {formaterAvstand(avstandM(megPunkt.lat, megPunkt.lng, mk.lat, mk.lng))}</>
          )}
        </div>
        {/* Ingen avstand uten egen posisjon (#728) — vi ber ALDRI om
            navigator.geolocation uten at han har valgt å dele selv. */}
        {!megPunkt && (
          <div style={{ ...HJELPETEKST, marginTop: 2 }}>Del posisjonen din for å se avstand.</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        {/* Veibeskrivelse i Google Maps (#708). Michael spurte om dette
            allerede da kartet var nytt: «er det en gå til funksjon der eller
            naviger til? Ellers må man jo inn i Google Maps å finne det
            uansett.»

            Bevisst aapneVeibeskrivelse() og ikke appens egen router — dette
            er en EKSTERN lenke, og da er det riktig å forlate appen. */}
        <button
          type="button"
          onClick={() => aapneVeibeskrivelse({ lat: mk.lat, lng: mk.lng })}
          aria-label={`Veibeskrivelse til «${mk.tekst}» i Google Maps`}
          data-testid="markering-naviger"
          style={{ ...PILLE, color: 'var(--accent)' }}
        >
          Veibeskrivelse
        </button>
        {/* Delbar lenke til NETTOPP dette stedet (#719) — samme handling som
            langtrykk på selve boblen i kartet. */}
        <button
          type="button"
          onClick={onKopierLenke}
          aria-label={`Kopier lenke til «${mk.tekst}»`}
          data-testid="markering-kopier-lenke"
          style={PILLE}
        >
          Kopier lenke
        </button>
        {kanFjerne && (
          <button
            type="button"
            onClick={onFjern}
            data-testid="markering-panel-fjern"
            style={{ ...PILLE, color: 'var(--danger)', borderColor: 'var(--danger-border)' }}
          >
            Fjern
          </button>
        )}
        <button
          type="button"
          onClick={onLukk}
          aria-label="Lukk"
          data-testid="markering-panel-lukk"
          style={PILLE}
        >
          Lukk
        </button>
      </div>
    </div>
  )
}
