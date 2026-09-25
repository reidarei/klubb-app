'use client'

import { useRef, useState } from 'react'
import { sokSted } from '@/lib/actions/sted-sok'
import type { StedTreff } from '@/lib/geokoding'
import { STED_SOK_MAKS_LENGDE } from '@/lib/konstanter'
import { meldKlientfeil } from '@/lib/klient-logg'

type Koordinat = { lat: number; lng: number }

// Interaktivt stedssøk (#757) — eget steg ('sok') i PosisjonsKarts stegmaskin,
// rendret inn i den samme bunn-blokka som markerings- og timeplanflyten. Ren
// props-komponent: PosisjonsKart eier kart-siden av flyten (flyTo, treffnål,
// stedKilde, timeplan-utkast) — denne komponenten eier bare selve søket og
// hvilket treff man har valgt fra listen.
//
// KUN søk på eksplisitt Enter/knapp — ALDRI i en onChange-handler. Nominatims
// bruksvilkår forbyr autocomplete-søk (typisk 1 req/s for hele appen), og et
// søk-mens-du-skriver ville brutt det på første tastetrykk.
type Status = 'klar' | 'soker' | 'treff' | 'ingen' | 'tidsavbrudd' | 'feil' | 'ugyldig'

type Props = {
  /** Kartets senter NÅ — lest ved innsending, ikke bufret, så søket vekter mot der man faktisk ser. */
  hentNaer: () => Koordinat | null
  /** Timeplan-knappen vises kun når det finnes et arrangement å legge posten på, og det ikke er en blåtur. */
  kanTimeplan: boolean
  /** Et treff er valgt fra listen — parent flyr dit og tegner treffnåla. */
  onVelg: (treff: StedTreff) => void
  /** «Sett markering her» — går videre via siktet/«Her er det», ikke rett i databasen. */
  onMarkering: (treff: StedTreff) => void
  /** «Legg i timeplanen» — fyller punktet (og teksten, hvis tom) i timeplan-utkastet. */
  onTimeplan: (treff: StedTreff) => void
  /** «Nytt søk» — parent nullstiller sitt valgte treff, så den gamle treffnåla forsvinner. */
  onNyttSok: () => void
  onAvbryt: () => void
}

// Samme duplisering som MarkeringDetalj.tsx: kart-komponentene deler ikke
// stilkonstanter på tvers av filer, se kommentaren der. minHeight: 44 lagt
// til her (fraværende i søsknene) — nye trykkflater skal være minst 44 px på
// kortsiden.
const PILLE = {
  fontFamily: 'var(--font-body)',
  fontSize: 12.5,
  fontWeight: 500,
  letterSpacing: '0.1px',
  padding: '8px 14px',
  minHeight: 44,
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

const PILLE_PRIMAER = {
  ...PILLE,
  background: 'var(--kart-sol)',
  color: 'var(--kart-sol-tekst)',
  border: 'none',
  fontWeight: 600,
} as const

const HJELPETEKST = {
  fontFamily: 'var(--font-body)',
  fontSize: 12.5,
  color: 'var(--text-tertiary)',
  lineHeight: 1.5,
} as const

export default function StedSok({
  hentNaer,
  kanTimeplan,
  onVelg,
  onMarkering,
  onTimeplan,
  onNyttSok,
  onAvbryt,
}: Props) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<Status>('klar')
  const [kandidater, setKandidater] = useState<StedTreff[]>([])
  const [valgt, setValgt] = useState<StedTreff | null>(null)
  const [ugyldigMelding, setUgyldigMelding] = useState<string | null>(null)
  // Søketeksten SPØRRINGEN faktisk brukte — «ingen treff»-meldingen skal
  // referere til det man søkte på, ikke det man har rukket å skrive videre
  // i feltet mens svaret var underveis.
  const [sisteSok, setSisteSok] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const soker = status === 'soker'

  async function kjorSok() {
    if (soker) return
    const sok = query.trim()
    setSisteSok(sok)
    setStatus('soker')
    setUgyldigMelding(null)
    let svar: Awaited<ReturnType<typeof sokSted>>
    try {
      svar = await sokSted(sok, hentNaer())
    } catch (err: unknown) {
      // Avvist action (utløpt sesjon, nettverksbrudd): uten denne sto status
      // fast på 'soker' og knappen forble låst. Samme tekst som 'feil'.
      meldKlientfeil('klient.kart.sok.feilet', err)
      setKandidater([])
      setStatus('feil')
      return
    }
    if (svar.utfall === 'ugyldig') {
      setStatus('ugyldig')
      setUgyldigMelding(svar.melding)
      return
    }
    if (svar.utfall === 'treff') {
      setStatus('treff')
      setKandidater(svar.treff)
      return
    }
    setKandidater([])
    setStatus(svar.utfall)
  }

  function velgKandidat(treff: StedTreff) {
    setValgt(treff)
    // Blurrer feltet: tastaturet skal ikke stå og dekke kartet mens man ser
    // hvor treffet havnet og tar stilling til hva man vil gjøre med det.
    inputRef.current?.blur()
    onVelg(treff)
  }

  function nyttSok() {
    setValgt(null)
    setKandidater([])
    setStatus('klar')
    setQuery('')
    setSisteSok('')
    onNyttSok()
    inputRef.current?.focus()
  }

  if (valgt) {
    return (
      <>
        <div style={{ ...HJELPETEKST, color: 'var(--text-primary)', fontWeight: 500 }}>
          {valgt.navn}
        </div>
        <div
          style={{
            ...HJELPETEKST,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {valgt.beskrivelse}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => onMarkering(valgt)}
            data-testid="sted-sok-marker"
            style={{ ...PILLE_PRIMAER, flex: 1 }}
          >
            Sett markering her
          </button>
          {kanTimeplan && (
            <button
              type="button"
              onClick={() => onTimeplan(valgt)}
              data-testid="sted-sok-timeplan"
              style={{ ...PILLE, flex: 1 }}
            >
              Legg i timeplanen
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={nyttSok} data-testid="sted-sok-nytt" style={PILLE}>
            Nytt søk
          </button>
          <button type="button" onClick={onAvbryt} data-testid="sted-sok-avbryt" style={PILLE}>
            Avbryt
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <form
        onSubmit={e => {
          e.preventDefault()
          kjorSok()
        }}
        style={{ display: 'flex', gap: 8 }}
      >
        {/* type="search" + enterKeyHint="search": telefonens eget tastatur får
            en «Søk»-knapp — men innsendingen skjer uansett kun via denne
            onSubmit-en (Enter ELLER knappen under), aldri fra onChange. */}
        <input
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          maxLength={STED_SOK_MAKS_LENGDE}
          placeholder="Søk etter et sted"
          data-testid="sted-sok-felt"
          autoFocus
          style={{
            fontFamily: 'var(--font-body)',
            // 16px og ikke mindre: iOS zoomer inn på et tekstfelt med mindre
            // skrift, og etterlater kartet forskjøvet (samme regel som
            // markering-tekst i PosisjonsKart).
            fontSize: 16,
            padding: '10px 14px',
            borderRadius: 'var(--radius-small)',
            border: '0.5px solid var(--border)',
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            flex: 1,
            minWidth: 0,
          }}
        />
        <button
          type="submit"
          disabled={soker}
          data-testid="sted-sok-knapp"
          style={{ ...PILLE_PRIMAER, opacity: soker ? 0.6 : 1 }}
        >
          {soker ? 'Søker …' : 'Søk'}
        </button>
      </form>

      {status === 'treff' && (
        <div
          role="listbox"
          aria-label="Treff"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            maxHeight: 200,
            overflowY: 'auto',
          }}
        >
          {kandidater.map(treff => (
            <button
              key={treff.id}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => velgKandidat(treff)}
              data-testid="sted-sok-kandidat"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 2,
                padding: '10px 12px',
                minHeight: 44,
                // Uten dette krymper flexbox kandidatene når lista når maxHeight, og teksten kappes (#757).
                flexShrink: 0,
                borderRadius: 'var(--radius-small)',
                border: '0.5px solid var(--kart-kant)',
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                textAlign: 'left',
                cursor: 'pointer',
                width: '100%',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 13.5,
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  width: '100%',
                }}
              >
                {treff.navn}
              </span>
              <span
                style={{
                  ...HJELPETEKST,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  width: '100%',
                }}
              >
                {treff.beskrivelse}
              </span>
            </button>
          ))}
        </div>
      )}

      {status === 'ingen' && (
        <div role="status" data-testid="sted-sok-ingen" style={HJELPETEKST}>
          Fant ingenting på «{sisteSok}». Prøv et annet navn eller legg til byen.
        </div>
      )}

      {(status === 'tidsavbrudd' || status === 'feil') && (
        <div role="alert" data-testid="sted-sok-feil" style={{ ...HJELPETEKST, color: 'var(--danger)' }}>
          Søket svarer ikke akkurat nå. Prøv igjen.
        </div>
      )}

      {status === 'ugyldig' && ugyldigMelding && (
        <div role="alert" data-testid="sted-sok-ugyldig" style={{ ...HJELPETEKST, color: 'var(--danger)' }}>
          {ugyldigMelding}
        </div>
      )}

      {/* Avbryt skal alltid finnes, også mens søket pågår — ellers er man
          fanget i søke-steget til et treff er valgt (#757-review). */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onAvbryt} data-testid="sted-sok-avbryt" style={PILLE}>
          Avbryt
        </button>
      </div>
    </>
  )
}
