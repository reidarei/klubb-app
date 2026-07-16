'use client'

import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import Icon from '@/components/ui/Icon'
import ReaksjonPicker from '@/components/agenda/ReaksjonPicker'
import { LONG_PRESS_MS, LONG_PRESS_BEVEGELSE_PX } from '@/lib/konstanter'
import type { ReaksjonGruppe } from '@/lib/reaksjoner'

type Props = {
  brukerId: string
  reaksjoner: ReaksjonGruppe[]
  toggle: (emoji: string) => void
  isPending: boolean
}

/**
 * Rund 36 px tommel opp-knapp til venstre for kommentar-input-pillen på
 * meldingskort. Trykk toggler 👍 (eller fjerner brukerens eksisterende
 * reaksjon), hold åpner emoji-velgeren forankret over tommelen. Se #468.
 */
export default function MeldingTommel({ brukerId, reaksjoner, toggle, isPending }: Props) {
  const [pickerApen, setPickerApen] = useState(false)
  const [pressetAktiv, setPressetAktiv] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Fyrer long-press → true. Hindrer at click-eventet rett etter holdet
  // også toggler reaksjonen — samme mønster som MeldingKort. se #468.
  const longPressFired = useRef(false)
  const startKoordinat = useRef<{ x: number; y: number } | null>(null)
  const rotRef = useRef<HTMLDivElement | null>(null)

  const minReaksjon = reaksjoner.find(r => r.profilIder.includes(brukerId))
  const minEmoji = minReaksjon?.emoji ?? null
  const harReagert = minEmoji !== null

  function stopp(e: MouseEvent | PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

  function clearLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    startKoordinat.current = null
    setPressetAktiv(false)
  }

  // Long-press dekker touch OG mus (i motsetning til KommentarerPaaKort som
  // skipper mus fordi den bruker hover der) — desktop-brukere har ingen
  // hover-inngang til emoji-velgeren på tommelen, så mus må også kunne holde. se #468.
  function startLongPress(e: PointerEvent) {
    e.stopPropagation()
    longPressFired.current = false
    startKoordinat.current = { x: e.clientX, y: e.clientY }
    setPressetAktiv(true)
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true
      setPickerApen(true)
      setPressetAktiv(false)
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate?.(15)
      }
    }, LONG_PRESS_MS)
  }

  // Cancel timeren hvis pekeren beveger seg mer enn LONG_PRESS_BEVEGELSE_PX —
  // tolkes som scroll-intensjon, ikke long-press. Samme terskel som
  // KommentarerPaaKort.
  function sjekkBevegelse(e: PointerEvent) {
    const start = startKoordinat.current
    if (!start || longPressTimer.current === null) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (dx * dx + dy * dy > LONG_PRESS_BEVEGELSE_PX ** 2) {
      clearLongPress()
    }
  }

  // Selve tap-toggle skjer i onClick, ikke onPointerUp — Space/Enter fra
  // tastatur/skjermleser genererer et click-event, ikke en pointer-sekvens,
  // så knappen må aktiveres via click for å være AT-opererbar. se #468.
  function handleClick(e: MouseEvent) {
    // Selv-innkapsling: stopp navigasjon uten å være avhengig av at forelderen
    // har onClick={stopp} rundt oss. stopPropagation på pointerup rekker ikke
    // det etterfølgende click-eventet, så det må gjøres her. se #468.
    stopp(e)
    if (longPressFired.current) {
      // Long-press åpnet nettopp pickeren — dette click-eventet er halen av
      // holdet, ikke et selvstendig trykk. Ikke toggle.
      longPressFired.current = false
      return
    }
    if (pickerApen) {
      // Nytt trykk mens pickeren står åpen lukker den i stedet for å toggle
      // reaksjonen — gir en vei ut uten å måtte velge. se #468.
      setPickerApen(false)
      return
    }
    toggle(minEmoji ?? '👍')
  }

  // Rydd opp evt. verserende long-press-timer ved unmount, så setState ikke
  // kjører på en avmontert komponent. Vi klarer kun timeren her (ikke
  // clearLongPress som også kaller setState) — komponenten er på vei bort. se #468.
  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current)
    }
  }, [])

  // Når pickeren lukkes (uansett vei: outside-click, emoji-valg eller nytt
  // trykk) nullstiller vi long-press-flagget. Uten dette ville et hold som
  // lukkes uten et etterfølgende «tail»-click på selve knappen la flagget stå
  // true — og da svelger guarden i handleClick neste aktivering, spesielt
  // tastatur (Enter/Space genererer click uten pointerdown). se #468.
  useEffect(() => {
    if (!pickerApen) longPressFired.current = false
  }, [pickerApen])

  // Trykk utenfor tommel+picker lukker pickeren. Listeneren monteres først
  // etter at pickeren er åpen, så pointerdown-en som åpnet den (long-press)
  // rekker aldri å lukke den igjen. se #468.
  useEffect(() => {
    if (!pickerApen) return
    function handleUtenfor(e: Event) {
      if (rotRef.current && !rotRef.current.contains(e.target as Node)) {
        setPickerApen(false)
      }
    }
    document.addEventListener('pointerdown', handleUtenfor)
    return () => document.removeEventListener('pointerdown', handleUtenfor)
  }, [pickerApen])

  return (
    <div ref={rotRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        disabled={isPending}
        aria-label={harReagert ? 'Fjern reaksjonen din' : 'Lik innlegget — hold for flere reaksjoner'}
        onPointerDown={startLongPress}
        onPointerMove={sjekkBevegelse}
        onPointerUp={clearLongPress}
        onPointerCancel={clearLongPress}
        onPointerLeave={clearLongPress}
        onClick={handleClick}
        onContextMenu={e => {
          // Knappen har ingen legitim kontekstmeny — preventDefault ubetinget.
          // (pressetAktiv-guarden var i praksis død for ekte long-press: iOS-
          // callouten kommer etter at holdet har fyrt og nullstilt flagget;
          // iOS dekkes uansett av WebkitTouchCallout: 'none'.) se #468.
          e.preventDefault()
        }}
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: harReagert ? 'var(--accent-soft)' : 'var(--bg-elevated)',
          border: harReagert ? '0.5px solid var(--accent)' : '0.5px solid var(--border)',
          cursor: isPending ? 'default' : 'pointer',
          opacity: isPending ? 0.6 : 1,
          transform: pressetAktiv ? 'scale(0.92)' : 'scale(1)',
          transition: 'transform 120ms ease-out',
          padding: 0,
          WebkitUserSelect: 'none',
          userSelect: 'none',
          WebkitTouchCallout: 'none',
        }}
      >
        {harReagert && minEmoji !== '👍'
          ? <span style={{ fontSize: 17, lineHeight: 1 }}>{minEmoji}</span>
          : (
            <Icon
              name="thumbsUp"
              size={17}
              color={harReagert ? 'var(--accent)' : 'var(--text-tertiary)'}
              strokeWidth={1.8}
              fill={harReagert ? 'var(--accent)' : 'none'}
            />
          )}
      </button>

      {pickerApen && (
        <ReaksjonPicker
          isPending={isPending}
          onVelg={emoji => {
            setPickerApen(false)
            toggle(emoji)
          }}
        />
      )}
    </div>
  )
}
