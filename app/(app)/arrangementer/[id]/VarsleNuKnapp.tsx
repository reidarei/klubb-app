'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { varslOmArrangement } from '@/lib/actions/arrangementer'
import { VARSLE_MAKS_LENGDE } from '@/lib/konstanter'
import { PilleKnapp } from '@/components/ui/TreffPille'
import { SkjemaGruppe, TekstRad } from '@/components/ui/Skjema'

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
  // (overlay-klikk, Avbryt-knapp, suksess) treffes samtidig.
  const triggerRef = useRef<HTMLButtonElement>(null)

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

  // Lås body-scroll mens modalen er åpen, og returner fokus til
  // utløser-knappen ved lukking. Sentral cleanup dekker alle lukke-veier
  // (overlay, Avbryt, suksess) i én slag.
  useEffect(() => {
    if (!modalAapen) return
    const forrigeOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Snapshot trigger ved effekt-start — trigger-knappen forblir mounted
    // gjennom modalens levetid, så referansen er stabil. Snapshotting
    // tilfredsstiller react-hooks/exhaustive-deps-linteren.
    const triggerNode = triggerRef.current
    return () => {
      document.body.style.overflow = forrigeOverflow
      // Focus-retur til trigger — viktig for skjermleser-brukere som
      // ellers mister fokus til <body> etter at modalen forsvinner fra DOM.
      triggerNode?.focus()
    }
  }, [modalAapen])

  // «Varsle om endring», ikke «Varsle»: gutta ble allerede varslet da
  // arrangementet ble opprettet, og en knapp som bare sier «Varsle» leser som
  // et gjøremål som gjenstår. Se #554.
  const tekst = sendt ? 'Varslet' : isPending ? 'Sender…' : 'Varsle om endring'
  const len = melding.length

  return (
    <>
      <PilleKnapp
        ref={triggerRef}
        type="button"
        onClick={aapneModal}
        disabled={sendt || isPending}
        pilleStil={{
          padding: '8px 14px',
          borderRadius: 999,
          background: 'var(--overlay-control-bg)',
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
          opacity: isPending ? 0.6 : 1,
        }}
        synligHoyde={34}
      >
        {tekst}
      </PilleKnapp>

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
            aria-label={`Varsle om endring på ${arrangementTittel}`}
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
              Varsle om endring
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
              Gutta ble varslet om {arrangementTittel} da det ble lagt ut. Bruk
              denne hvis noe har endret seg — skriv gjerne hva.
            </p>

            {/* Tegnteller (hjelp) vises alltid slik at brukeren ser grensen.
                Feilmeldingen står i selve gruppen — uten den ble feil rendret
                kun utenfor og dermed skjult bak overlayen mens modalen sto åpen. */}
            <SkjemaGruppe hjelp={`${len}/${VARSLE_MAKS_LENGDE}`} feil={feil}>
              <TekstRad
                value={melding}
                onChange={e => setMelding(e.target.value)}
                maxLength={VARSLE_MAKS_LENGDE}
                placeholder="Valgfritt: hva har endret seg?"
                aria-label="Hilsen"
                autoFocus
              />
            </SkjemaGruppe>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <PilleKnapp
                type="button"
                onClick={lukkModal}
                disabled={isPending}
                pilleStil={{
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
                }}
                synligHoyde={31}
              >
                Avbryt
              </PilleKnapp>
              <PilleKnapp
                type="button"
                onClick={handleSend}
                disabled={isPending}
                pilleStil={{
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
                  opacity: isPending ? 0.7 : 1,
                }}
                synligHoyde={29}
              >
                {isPending ? 'Sender…' : 'Send varsel'}
              </PilleKnapp>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
