'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { nb } from 'date-fns/locale'
import { parseTimeplanTekst } from '@/lib/timeplan-parse'
import { norskDag, norskDatoNaa } from '@/lib/dato'
import { TIMEPLAN_ADRESSE_MAKS_LENGDE } from '@/lib/konstanter'
import type { TimeplanArrangement, TimeplanUtkast } from './TimeplanPanel'

type Props = {
  arrangement: TimeplanArrangement
  utkast: TimeplanUtkast
  onEndreUtkast: (patch: Partial<TimeplanUtkast>) => void
  onStartPunktvalg: () => void
  onLeggInn: () => void
}

function datoNoekkel(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Dag-chips for en flerdagerstur. Rendres KUN når arrangementet har
 * slutt_tidspunkt på en senere KALENDERDATO enn start — en endagstur eller
 * et møte trenger ingen dagvelger (#716).
 *
 * Kappet til 10 dager: en defensiv grense mot en feilregistrert tur, ikke en
 * brukervendt begrensning — reelle turer er 2–4 dager.
 */
function beregnDagAlternativer(
  arr: TimeplanArrangement,
): { key: string; label: string }[] {
  const start = norskDag(arr.startTidspunkt)
  if (!arr.sluttTidspunkt) return []
  const slutt = norskDag(arr.sluttTidspunkt)
  if (slutt.getTime() <= start.getTime()) return []

  const dager: { key: string; label: string }[] = []
  const cursor = new Date(start)
  for (let i = 0; i < 10 && cursor.getTime() <= slutt.getTime(); i++) {
    dager.push({ key: datoNoekkel(cursor), label: format(cursor, 'EEE d.', { locale: nb }) })
    cursor.setDate(cursor.getDate() + 1)
  }
  return dager
}

/** Startdatoen hvis turen ikke har begynt ennå, ellers dagens dato (#716). */
export function beregnDefaultTimeplanDato(arr: TimeplanArrangement): string {
  const harBegynt = new Date(arr.startTidspunkt).getTime() <= Date.now()
  return datoNoekkel(harBegynt ? norskDatoNaa() : norskDag(arr.startTidspunkt))
}

export default function NyTimeplanPost({
  arrangement,
  utkast,
  onEndreUtkast,
  onStartPunktvalg,
  onLeggInn,
}: Props) {
  const [tidsvelgerAapen, setTidsvelgerAapen] = useState(false)

  const dagAlternativer = beregnDagAlternativer(arrangement)
  const parsed = parseTimeplanTekst(utkast.tekst)
  const effektivKlokke = utkast.manuellKlokke ?? parsed.klokke

  function forsokSubmit() {
    if (!effektivKlokke) {
      // Ikke avvis — åpne tidschipen med teksten intakt (#716). Mannen har
      // skrevet noe appen ikke klarte å tolke klokkeslettet av; det er en
      // reparasjonsvei, ikke en feilmelding.
      setTidsvelgerAapen(true)
      return
    }
    onLeggInn()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {dagAlternativer.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Dag">
          {dagAlternativer.map(d => {
            const valgt = utkast.dato === d.key
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => onEndreUtkast({ dato: d.key })}
                aria-pressed={valgt}
                data-testid={`timeplan-dag-${d.key}`}
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  padding: '5px 10px',
                  borderRadius: 'var(--radius-pill)',
                  border: valgt ? '1px solid var(--accent)' : '0.5px solid var(--border)',
                  background: valgt ? 'var(--accent-soft)' : 'transparent',
                  color: valgt ? 'var(--text-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                {d.label}
              </button>
            )
          })}
        </div>
      )}

      <input
        type="text"
        value={utkast.tekst}
        onChange={e => onEndreUtkast({ tekst: e.target.value })}
        placeholder="17:00 Middag på Lorry"
        data-testid="timeplan-tekst"
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            forsokSubmit()
          }
        }}
        style={{
          fontFamily: 'var(--font-body)',
          // 16px og ikke mindre: iOS zoomer inn på et tekstfelt med mindre
          // skrift.
          fontSize: 16,
          padding: '10px 14px',
          borderRadius: 'var(--radius-small)',
          border: '0.5px solid var(--border)',
          background: 'var(--bg-elevated)',
          color: 'var(--text-primary)',
          width: '100%',
        }}
      />

      {/* Live-ekko: tolkningen er aldri magi. Trykkbar chip — reparasjonsvei
          når parsingen bommet, eller når ingen klokke ble skrevet i det hele
          tatt. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setTidsvelgerAapen(a => !a)}
          data-testid="timeplan-klokke-chip"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            padding: '4px 10px',
            borderRadius: 'var(--radius-pill)',
            border: '0.5px solid var(--border)',
            background: effektivKlokke ? 'var(--accent-soft)' : 'transparent',
            color: effektivKlokke ? 'var(--text-primary)' : 'var(--text-tertiary)',
            cursor: 'pointer',
          }}
        >
          {effektivKlokke
            ? `${effektivKlokke} · ${parsed.tekst || '…'}`
            : `Sett klokkeslett${parsed.tekst ? ` · ${parsed.tekst}` : ''}`}
        </button>
        {tidsvelgerAapen && (
          <input
            type="time"
            autoFocus
            value={effektivKlokke ?? ''}
            data-testid="timeplan-klokke-input"
            onChange={e => {
              onEndreUtkast({ manuellKlokke: e.target.value })
              if (e.target.value) setTidsvelgerAapen(false)
            }}
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 16,
              padding: '6px 10px',
              borderRadius: 'var(--radius-small)',
              border: '0.5px solid var(--border)',
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
            }}
          />
        )}
      </div>

      {/* Adresse som alternativ til å velge punkt i kartet (#732). Samme
          blåtur-gate som punkt-knappen under — vakten som faktisk holder er
          triggeren i migrasjon 149 (den stripper adressen også for en klient
          som går utenom UI-et); dette er bekvemmelighet, akkurat som for
          punktet. */}
      {!arrangement.blaatur && (
        <input
          type="text"
          value={utkast.adresse ?? ''}
          onChange={e => onEndreUtkast({ adresse: e.target.value || null })}
          maxLength={TIMEPLAN_ADRESSE_MAKS_LENGDE}
          placeholder="Adresse (valgfritt)"
          data-testid="timeplan-adresse"
          style={{
            fontFamily: 'var(--font-body)',
            // 16px og ikke mindre: iOS zoomer inn på et tekstfelt med mindre
            // skrift.
            fontSize: 16,
            padding: '10px 14px',
            borderRadius: 'var(--radius-small)',
            border: '0.5px solid var(--border)',
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            width: '100%',
          }}
        />
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {/* Blåtur: nålen SKJULES her. Vakten som faktisk holder er triggeren
            i migrasjon 148 (den stripper lat/lng også for en klient som går
            utenom UI-et); dette er bekvemmelighet — man skal slippe å sette
            et punkt som uansett blir kastet. En halvsensurert timeplan ville
            uansett lekket via fritekst ingen maskin kan sensurere. */}
        {!arrangement.blaatur &&
          (utkast.punkt ? (
            <button
              type="button"
              onClick={() => onEndreUtkast({ punkt: null })}
              data-testid="timeplan-punkt-fjern"
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                padding: '6px 10px',
                borderRadius: 'var(--radius-pill)',
                border: '0.5px solid var(--kart-kant)',
                background: 'var(--accent-soft)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
            >
              📍 Punkt satt ✕
            </button>
          ) : (
            <button
              type="button"
              onClick={onStartPunktvalg}
              data-testid="timeplan-sett-punkt"
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                padding: '6px 10px',
                borderRadius: 'var(--radius-pill)',
                border: '0.5px solid var(--border)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              Sett punkt
            </button>
          ))}
        <button
          type="button"
          onClick={forsokSubmit}
          // Ikke låst av «pågår en lagring»: en timeplan skrives i serie
          // (#716) — han skal kunne sende linje 2 før linje 1 sin lagring er
          // ferdig. Hver optimistisk rad dempes for seg i TimeplanPanel.
          disabled={!parsed.tekst.trim()}
          data-testid="timeplan-legg-inn"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            fontWeight: 600,
            padding: '8px 16px',
            borderRadius: 'var(--radius-pill)',
            border: 'none',
            background: 'var(--kart-sol)',
            color: 'var(--kart-sol-tekst)',
            cursor: 'pointer',
            opacity: parsed.tekst.trim() ? 1 : 0.5,
            marginLeft: 'auto',
          }}
        >
          Legg inn
        </button>
      </div>
    </div>
  )
}
