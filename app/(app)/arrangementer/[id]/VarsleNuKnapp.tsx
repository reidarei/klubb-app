'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { varslOmArrangement } from '@/lib/actions/arrangementer'
import { VARSLE_MAKS_LENGDE } from '@/lib/konstanter'

// Speil av PurreKnapp.tsx (#267 + integrator-funn) — modal med valgfri
// hilsen før varselet sendes. Se #282 for bakgrunn.
export default function VarsleNuKnapp({
  arrangementId,
  arrangementTittel,
}: {
  arrangementId: string
  arrangementTittel: string
}) {
  const [isPending, startTransition] = useTransition()
  const [sendt, setSendt] = useState(false)
  const [feil, setFeil] = useState('')
  const [modalAapen, setModalAapen] = useState(false)
  const [melding, setMelding] = useState('')
  // Synkron guard mot dobbeltklikk: settes før startTransition rekker å
  // markere isPending. Uten dette kan to raske klikk gi to server-kall.
  const sendingRef = useRef(false)
  // Ref på utløser-knappen for focus-retur når modalen lukkes. Sentralt
  // håndtert i useEffect-cleanup nedenfor slik at alle lukke-veier
  // (Escape, overlay-klikk, Avbryt-knapp, suksess) treffes samtidig.
  const triggerRef = useRef<HTMLButtonElement>(null)
  // Holder siste isPending-verdi tilgjengelig inne i onKey uten å måtte
  // legge isPending i useEffect-deps (som ville trigget cleanup ved hver
  // pending-endring og dermed feilaktig focus-retur mens modalen er åpen).
  const isPendingRef = useRef(isPending)
  isPendingRef.current = isPending

  function aapneModal() {
    if (sendt || isPending) return
    setFeil('')
    setMelding('')
    setModalAapen(true)
  }

  function lukkModal() {
    if (isPending) return
    setModalAapen(false)
  }

  function handleSend() {
    if (sendingRef.current) return
    sendingRef.current = true
    startTransition(async () => {
      try {
        // Sender hilsen kun hvis den ikke er tom etter trimming
        await varslOmArrangement(arrangementId, melding.trim() || undefined)
        setSendt(true)
        setModalAapen(false)
      } catch (err) {
        setFeil(err instanceof Error ? err.message : 'Kunne ikke sende varsel')
      } finally {
        sendingRef.current = false
      }
    })
  }

  // Lukk modalen med Escape, lås body-scroll mens den er åpen, og returner
  // fokus til utløser-knappen ved lukking. Sentral cleanup dekker alle
  // lukke-veier (Escape, overlay, Avbryt, suksess) i én slag.
  useEffect(() => {
    if (!modalAapen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isPendingRef.current) setModalAapen(false)
    }
    document.addEventListener('keydown', onKey)
    const forrigeOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Snapshot trigger ved effekt-start — trigger-knappen forblir mounted
    // gjennom modalens levetid, så referansen er stabil. Snapshotting
    // tilfredsstiller react-hooks/exhaustive-deps-linteren.
    const triggerNode = triggerRef.current
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = forrigeOverflow
      // Focus-retur til trigger — viktig for tastatur- og skjermleser-
      // brukere som ellers mister fokus til <body> etter at modalen
      // forsvinner fra DOM.
      triggerNode?.focus()
    }
  }, [modalAapen])

  const tekst = sendt ? 'Varslet' : isPending ? 'Sender…' : 'Varsle'
  const len = melding.length

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={aapneModal}
        disabled={sendt || isPending}
        style={{
          padding: '8px 14px',
          borderRadius: 999,
          background: 'rgba(10,10,12,0.6)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '0.5px solid var(--border)',
          color:
            sendt
              ? 'var(--success)'
              : isPending
              ? 'var(--text-secondary)'
              : 'var(--text-primary)',
          fontFamily: 'var(--font-body)',
          fontSize: 12,
          fontWeight: 500,
          cursor: sendt || isPending ? 'default' : 'pointer',
          opacity: isPending ? 0.6 : 1,
        }}
      >
        {tekst}
      </button>

      {modalAapen && (
        // Overlay: klikk utenfor kortet lukker modalen
        <div
          onClick={lukkModal}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 20px',
          }}
        >
          {/* Stopp klikk-propagasjon slik at klikk på selve kortet ikke lukker */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Varsle om ${arrangementTittel}`}
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 360,
              background: 'var(--bg-elevated)',
              border: '0.5px solid var(--border)',
              borderRadius: 16,
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 20,
                fontWeight: 500,
                letterSpacing: '-0.2px',
                color: 'var(--text-primary)',
              }}
            >
              Varsle om {arrangementTittel}
            </div>

            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                color: 'var(--text-tertiary)',
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              Skriv en valgfri hilsen, eller bare send.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <textarea
                value={melding}
                onChange={e => setMelding(e.target.value)}
                maxLength={VARSLE_MAKS_LENGDE}
                placeholder="Valgfritt: en kort hilsen til gutta…"
                rows={3}
                autoFocus
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 14,
                  color: 'var(--text-primary)',
                  background: 'var(--bg-base)',
                  border: '0.5px solid var(--border)',
                  borderRadius: 10,
                  padding: '10px 12px',
                  resize: 'none',
                  outline: 'none',
                  width: '100%',
                  boxSizing: 'border-box',
                  lineHeight: 1.5,
                }}
              />
              {/* Tegnteller: vises alltid slik at brukeren ser grensen */}
              <span
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 11,
                  color: 'var(--text-tertiary)',
                  alignSelf: 'flex-end',
                }}
              >
                {len}/{VARSLE_MAKS_LENGDE}
              </span>
            </div>

            {/* Feilmelding inne i modalen — uten denne ble feil rendret kun
                utenfor og dermed skjult bak overlayen mens modalen sto åpen. */}
            {feil && (
              <p
                role="alert"
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 13,
                  color: 'var(--danger)',
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                {feil}
              </p>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={lukkModal}
                disabled={isPending}
                style={{
                  padding: '8px 16px',
                  borderRadius: 999,
                  background: 'transparent',
                  border: '0.5px solid var(--border)',
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '1.4px',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                Avbryt
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={isPending}
                style={{
                  padding: '8px 16px',
                  borderRadius: 999,
                  background: 'var(--accent)',
                  border: 'none',
                  color: '#0a0a0a',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '1.4px',
                  textTransform: 'uppercase',
                  cursor: isPending ? 'default' : 'pointer',
                  opacity: isPending ? 0.7 : 1,
                }}
              >
                {isPending ? 'Sender…' : 'Send varsel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
