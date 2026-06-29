'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { purreAnsvarlig } from '@/lib/actions/arrangoransvar'
import { PURRING_MAKS_LENGDE } from '@/lib/konstanter'

export default function PurreKnapp({
  ansvarId,
  arrangementNavn,
}: {
  ansvarId: string
  arrangementNavn: string
}) {
  const [isPending, startTransition] = useTransition()
  const [sendt, setSendt] = useState(false)
  const [feil, setFeil] = useState('')
  const [modalAapen, setModalAapen] = useState(false)
  const [melding, setMelding] = useState('')
  // Synkron guard mot dobbeltklikk: settes før startTransition rekker å
  // markere isPending. Uten dette kan to rask-klikk gi to server-kall.
  const sendingRef = useRef(false)

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
        await purreAnsvarlig(ansvarId, melding.trim() || undefined)
        setSendt(true)
        setModalAapen(false)
      } catch (err) {
        setFeil(err instanceof Error ? err.message : 'Kunne ikke purre')
      } finally {
        sendingRef.current = false
      }
    })
  }

  // Lukk modalen med Escape og lås body-scroll mens den er åpen.
  // body-overflow forhindrer scroll-chain bak modalen, særlig på iOS.
  useEffect(() => {
    if (!modalAapen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isPending) setModalAapen(false)
    }
    document.addEventListener('keydown', onKey)
    const forrigeOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = forrigeOverflow
    }
  }, [modalAapen, isPending])

  const label = sendt ? 'Purret' : isPending ? 'Sender…' : 'Purre'

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
        <button
          type="button"
          onClick={aapneModal}
          disabled={sendt || isPending}
          style={{
            padding: '6px 12px',
            borderRadius: 999,
            background: sendt ? 'transparent' : 'var(--accent-soft)',
            border: `0.5px solid ${sendt ? 'var(--border)' : 'var(--accent)'}`,
            color: sendt ? 'var(--text-tertiary)' : 'var(--accent)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '1.4px',
            textTransform: 'uppercase',
            cursor: sendt || isPending ? 'default' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </button>
        {feil && (
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 10,
              color: 'var(--danger)',
            }}
          >
            {feil}
          </span>
        )}
      </div>

      {modalAapen && (
        // Overlay: klikk utenfor kortet lukker modalen
        <div
          onClick={lukkModal}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--overlay-soft)',
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
            aria-label={`Purre på ${arrangementNavn}`}
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
              Purre på {arrangementNavn}
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
                maxLength={PURRING_MAKS_LENGDE}
                placeholder="Valgfritt: en kort hilsen til arrangøren…"
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
                {melding.length}/{PURRING_MAKS_LENGDE}
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
                  color: 'var(--accent-foreground)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '1.4px',
                  textTransform: 'uppercase',
                  cursor: isPending ? 'default' : 'pointer',
                  opacity: isPending ? 0.7 : 1,
                }}
              >
                {isPending ? 'Sender…' : 'Send purring'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
