'use client'

import { type MouseEvent } from 'react'
import ReaksjonPicker, { PICKER_AVSTAND_PX } from '@/components/agenda/ReaksjonPicker'
import Treffflate, { treffflateRundt } from '@/components/ui/Treffflate'
import { MIN_TREFFMAAL_PX } from '@/lib/konstanter'
import type { ReaksjonGruppe } from '@/lib/reaksjoner'

type Props = {
  brukerId: string
  reaksjoner: ReaksjonGruppe[]
  toggle: (emoji: string) => void
  isPending: boolean
  /** Om picker-popoveren er åpen. Styres av forelderen — enten
   * MeldingReaksjoner (detaljside, egen state) eller MeldingKort (agenda,
   * long-press-styrt). */
  apen: boolean
  lukk: () => void
  /** Når satt vises en «+»-knapp som kaller denne (detaljside/uncontrolled).
   * Utelates på agenda der picker åpnes via long-press på tommelen. Se #468. */
  onPlussKlikk?: () => void
}

/**
 * Presentasjonell reaksjons-rad: badge-piller + valgfri «+»-knapp + picker.
 * Kaller ingen hook selv — reaksjons-state og toggle mates inn. Løftet ut av
 * MeldingReaksjoner (#468/F5) slik at agenda-stien (MeldingKort) kan dele
 * state med MeldingTommel uten å instansiere en ekstra, forkastet hook.
 */
export default function ReaksjonBadges({
  brukerId,
  reaksjoner,
  toggle,
  isPending,
  apen,
  lukk,
  onPlussKlikk,
}: Props) {
  function stopp(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

  // «+»-flaten vokser utvidX/utvidY inn i gapene (#700) — gap og pickerens
  // avstand må være minst like store, ellers stjeler naboen trykket.
  const pluss = treffflateRundt({ bredde: 28, hoyde: 26 })
  const pickerAvstand = onPlussKlikk ? Math.max(PICKER_AVSTAND_PX, pluss.utvidY) : PICKER_AVSTAND_PX
  // Badgene vokser usynlig vertikalt og får reell minWidth 44 (ingen X-utvidelse).
  // Radgapet dekker to nabo-rader som begge vokser (CHIP_RAD_GAP-fella).
  const badge = treffflateRundt({ hoyde: 24 })
  const maxUtvidY = Math.max(badge.utvidY, pluss.utvidY)

  return (
    <div
      onClick={stopp}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        rowGap: Math.max(6, maxUtvidY * 2),
        columnGap: Math.max(6, pluss.utvidX),
        flexWrap: 'wrap',
      }}
    >
      {reaksjoner.map(r => {
        const harReagert = r.profilIder.includes(brukerId)
        return (
          <button
            key={r.emoji}
            type="button"
            disabled={isPending}
            onClick={e => {
              stopp(e)
              toggle(r.emoji)
            }}
            style={{
              // Usynlig knapp: vokser vertikalt (padding + negativ margin), pillen inni bærer utseendet (#700).
              ...badge.stil,
              display: 'inline-flex',
              background: 'transparent',
              border: 'none',
              paddingLeft: 0,
              paddingRight: 0,
              // Bevisst ingen dimming under isPending: optimistisk visning skal
              // se ferdig ut umiddelbart — serverturen skal ikke synes (#472-oppf.).
              // disabled beholdes for å hindre dobbel-fyring.
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                minWidth: MIN_TREFFMAAL_PX,
                padding: '3px 8px',
                borderRadius: 999,
                background: harReagert ? 'var(--accent-soft)' : 'var(--bg-elevated-2)',
                border: harReagert ? '0.5px solid var(--accent)' : '0.5px solid var(--border)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-body)',
                fontSize: 12,
              }}
            >
              <span>{r.emoji}</span>
              <span style={{ fontWeight: 500 }}>{r.profilIder.length}</span>
            </span>
          </button>
        )
      })}

      {/* + knapp kun i uncontrolled mode (detaljside) */}
      {onPlussKlikk && (
        <Treffflate
          synlig={{ bredde: 28, hoyde: 26 }}
          aria-label="Legg til reaksjon"
          onClick={e => {
            stopp(e)
            onPlussKlikk()
          }}
        >
          <span
            style={{
              width: 28,
              height: 26,
              borderRadius: 999,
              border: '0.5px dashed var(--border-strong)',
              color: 'var(--text-tertiary)',
              fontSize: 14,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            +
          </span>
        </Treffflate>
      )}

      {apen && (
        <ReaksjonPicker
          isPending={isPending}
          avstand={pickerAvstand}
          onVelg={emoji => {
            lukk()
            toggle(emoji)
          }}
        />
      )}
    </div>
  )
}
