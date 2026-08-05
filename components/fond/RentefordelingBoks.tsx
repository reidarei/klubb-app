'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Icon from '@/components/ui/Icon'
import { FOND_KONTOEIER } from '@/lib/klubb-config'

// Forklaring av hvordan renter fordeles mellom innskyterne.
//
// Teksten er levert ferdig og godkjent av Reidar (docs/rentefordeling-tekst.md,
// fra fond-agenten 2026-08-04) og skal stå som den er. Kun overskriftsnivåer og
// markup er tilpasset appens komponenter, slik instruksjonen i fila åpner for.
// Ikke omskriv innholdet — formuleringene er kontrollert mot hvordan
// beregningen faktisk gjøres. Publikum er innskyterne, derfor «innskyter» og
// ikke «medlem». Tallene i eksempelet er oppdiktede.
//
// Valgt som boks framfor egen side fordi den åpnes fra en utvidet innskyter-rad,
// og radens åpen/lukket-tilstand ligger i lokal state. En navigasjon bort og
// tilbake ville lukket raden, så leseren måtte åpne den igjen for å se tallet
// han lurte på.
//
// Rendres gjennom en PORTAL til <body>, ikke der den står i treet: innskyter-
// radene ligger inne i <Card>, som har backdrop-filter. En backdrop-filter som
// ikke er `none` gjør elementet til containing block for position: fixed-
// etterkommere, så overlayen ble målt mot kortet i stedet for skjermen og dimmet
// bare en stripe av siden. Samme felle gjelder transform, filter og perspective.

export default function RentefordelingBoks({ onLukk }: { onLukk: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onLukk()
    }
    document.addEventListener('keydown', onKey)
    const forrigeOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Flytt fokus inn i panelet så skjermleser og tastatur følger med hit.
    panelRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = forrigeOverflow
    }
  }, [onLukk])

  const innhold = (
    <div
      onClick={onLukk}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--overlay-backdrop)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: '24px 12px max(12px, env(safe-area-inset-bottom))',
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Slik fordeles rentene"
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 460,
          maxHeight: '85vh',
          overflowY: 'auto',
          background: 'var(--bg-elevated-2)',
          border: '0.5px solid var(--border)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow-modal)',
          padding: '22px 20px 24px',
          outline: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <h2
            style={{
              flex: 1,
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              fontWeight: 500,
              letterSpacing: '-0.3px',
              color: 'var(--text-primary)',
              lineHeight: 1.2,
            }}
          >
            Slik fordeles rentene
          </h2>
          <button
            type="button"
            onClick={onLukk}
            aria-label="Lukk"
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
              flexShrink: 0,
            }}
          >
            <Icon name="x" size={18} color="currentColor" strokeWidth={2} />
          </button>
        </div>

        <p style={avsnitt}>
          Kontoen får renter én gang i året, 31. desember. De fordeles i tre trinn.
        </p>

        <p style={{ ...avsnitt, marginTop: 16 }}>
          <strong style={ledetekst}>1. Skatten trekkes fra først.</strong>
          <br />
          Kontoen står i {FOND_KONTOEIER}s navn, så hele renteinntekten skattlegges hos
          ham privat — 22 %. Skattebeløpet trekkes derfor ut av potten før fordeling og
          godskrives ham. Det dekker nøyaktig regningen han får for alles renter, og gjør
          at ingen sitter med skatt på penger som ikke er deres.
        </p>

        <p style={{ ...avsnitt, marginTop: 16 }}>
          <strong style={ledetekst}>2. Resten fordeles etter dag-kroner.</strong>
          <br />
          Ikke etter hvor mye du har stående, men etter hvor mye <em>ganger hvor lenge</em>:
        </p>

        <div
          style={{
            margin: '12px 0',
            padding: '11px 14px',
            borderLeft: '2px solid var(--accent)',
            background: 'var(--accent-soft)',
            borderRadius: '0 10px 10px 0',
            fontFamily: 'var(--font-mono)',
            fontSize: 12.5,
            color: 'var(--text-primary)',
            lineHeight: 1.5,
          }}
        >
          dag-kroner = beløp × antall dager fram til 31. desember
        </div>

        <p style={avsnitt}>
          1 000 kroner som har stått hele året teller altså dobbelt så mye som 1 000
          kroner som kom inn i juli. Din andel av potten er dine dag-kroner delt på summen
          av alles.
        </p>

        <p style={{ ...avsnitt, marginTop: 16 }}>
          <strong style={ledetekst}>3. Rentene legges til ved årsskiftet.</strong>
          <br />
          De vises ikke løpende gjennom året. Du ser dem som «renter i fjor» når det nye
          året begynner, og da inngår de i sparepengene dine videre.
        </p>

        <h3
          style={{
            margin: '22px 0 8px',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '1.6px',
            textTransform: 'uppercase',
            color: 'var(--text-tertiary)',
          }}
        >
          Eksempel
        </h3>
        <p style={avsnitt}>
          Kontoen får 1 000 kroner i renter. 220 går til skatt, så 780 skal fordeles. Har
          du 30 % av dag-kronene, får du 234 kroner.
        </p>
      </div>
    </div>
  )

  // Under SSR finnes ingen document. Komponenten rendres riktignok bare etter et
  // klikk, men vakten koster ingenting og gjør den trygg å gjenbruke.
  return typeof document === 'undefined' ? null : createPortal(innhold, document.body)
}

const avsnitt: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-body)',
  fontSize: 14,
  lineHeight: 1.6,
  color: 'var(--text-secondary)',
}

const ledetekst: React.CSSProperties = {
  color: 'var(--text-primary)',
  fontWeight: 600,
}
