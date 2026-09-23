'use client'

import { useState, useTransition, type CSSProperties } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Linkified } from '@/lib/linkify'
import { oppdaterMeldingPost } from '@/lib/actions/meldinger'
import { foreslaaAktuellDato } from '@/lib/actions/dato-forslag'
import { INNLEGG_MAKS_LENGDE, MELDING_MAKS_BILDER, DATO_FORSLAG_MIN_TEGN } from '@/lib/konstanter'
import { formaterDato } from '@/lib/dato'
import Icon from '@/components/ui/Icon'
import { useRedigerModus } from './RedigerModus'
import SlettBildeKnapp from './SlettBildeKnapp'
import LeggTilBildeKnapp from './LeggTilBildeKnapp'
import SlettMeldingKnapp from './SlettMeldingKnapp'
import { bildeSrc } from '@/lib/bilde-utils'

type Bilde = { id: string; bilde_url: string }

// Samler tekst + bilder for et innlegg bak én eksplisitt «Rediger»-knapp.
// I visningsmodus er alt rent (ingen slett-X på bildene, ingen legg-til-knapp);
// i redigeringsmodus kan forfatteren endre tekst, slette/legge til bilder og
// slette hele innlegget. Løser «midt i mellom»-følelsen der bilde-knappene lå
// framme men teksten ikke kunne redigeres.
//
// Bilde-operasjoner (slett/legg til) persisterer umiddelbart via egne actions
// + router.refresh() — teksten lagres separat med «Lagre». Det speiler hvordan
// slett/legg-til allerede fungerte, og router.refresh beholder klient-staten
// (du forblir i redigeringsmodus med uendrede tekst-endringer i behold).
export default function MeldingRediger({
  meldingId,
  innhold,
  aktuellDato,
  aiPaa,
  bilder,
  erAlbum,
  // (forfatter || admin) og ikke FB-importert: styrer tekst-redigering,
  // bilde-sletting, sletting av innlegget og selve Rediger-knappen.
  kanRedigere,
  // forfatter, ikke FB, ikke album-koblet: styrer legg-til-bilde.
  kanLeggeTilBilder,
}: {
  meldingId: string
  innhold: string
  /** Festedato på innlegget (YYYY-MM-DD) — null når det ikke er festet. */
  aktuellDato: string | null
  /** Om KI-dato-uttrekket er tilgjengelig (ANTHROPIC_API_KEY satt). */
  aiPaa: boolean
  bilder: Bilde[]
  erAlbum: boolean
  kanRedigere: boolean
  kanLeggeTilBilder: boolean
}) {
  const [redigerer, setRedigererLokal] = useState(false)
  const [tekst, setTekst] = useState(innhold)
  const [dato, setDato] = useState(aktuellDato ?? '')
  // Skiller «brukeren tømte datoen bevisst» fra «datoen er bare ikke satt».
  // Bare i det siste tilfellet slipper vi KI-en til ved lagring.
  const [datoRoert, setDatoRoert] = useState(false)
  const [feil, setFeil] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  // Rammen rundt (RedigerModus) trenger å vite om skjemaet står åpent, så
  // kommentarfeltet kan vike. Lokal state beholdes som sannhet slik at
  // komponenten fortsatt virker uten provider.
  const { setRedigerer: meldTilRamme } = useRedigerModus()

  function settRedigerer(v: boolean) {
    setRedigererLokal(v)
    meldTilRamme(v)
  }

  const visBildeGrid = !erAlbum && bilder.length > 0
  const visLeggTil =
    redigerer && kanLeggeTilBilder && !erAlbum && bilder.length < MELDING_MAKS_BILDER

  // Tomt datofelt som brukeren ikke har rørt betyr «finn den for meg»: vi gjør
  // ett uttrekk fra teksten ved lagring. Har han tømt feltet selv, respekterer
  // vi det og lagrer null. Feilende uttrekk gir null — datoen er en
  // bekvemmelighet, ikke noe som skal blokkere at teksten blir lagret.
  async function bestemDato(): Promise<string | null> {
    if (dato) return dato
    if (datoRoert || !aiPaa) return null
    if (tekst.trim().length < DATO_FORSLAG_MIN_TEGN) return null
    try {
      const r = await foreslaaAktuellDato(tekst)
      return r.dato ?? null
    } catch {
      return null
    }
  }

  function lagre() {
    setFeil('')
    startTransition(async () => {
      try {
        await oppdaterMeldingPost(meldingId, tekst, await bestemDato())
        settRedigerer(false)
        setDatoRoert(false)
        router.refresh()
      } catch (err) {
        setFeil(err instanceof Error ? err.message : 'Kunne ikke lagre. Prøv igjen.')
      }
    })
  }

  function avbryt() {
    // Forkast tekst- og dato-endringer og gå tilbake til visningsmodus.
    // Bilde-endringer er allerede persistert, så de påvirkes ikke av Avbryt.
    setTekst(innhold)
    setDato(aktuellDato ?? '')
    setDatoRoert(false)
    setFeil('')
    settRedigerer(false)
  }

  return (
    <>
      {/* AKTUELL DATO — lesevisning. Datoen styrer om innlegget festes øverst
          på agenda, så den skal være synlig uten å gå i redigeringsmodus.
          `aktuell_dato` er en ren date-kolonne; formaterDato tolker den som
          UTC-midnatt og konverterer til Oslo (alltid positiv offset), så
          dagen blir den samme. */}
      {!redigerer && aktuellDato && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 14,
            padding: '5px 10px',
            borderRadius: 999,
            background: 'var(--accent-soft)',
            border: '0.5px solid var(--accent)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '1.2px',
            textTransform: 'uppercase',
            color: 'var(--text-primary)',
          }}
        >
          <Icon name="calendar" size={12} color="var(--accent)" strokeWidth={1.8} />
          Aktuell {formaterDato(aktuellDato, 'd. MMMM')}
        </div>
      )}

      {/* TEKST — lesevisning eller redigerbar textarea */}
      {redigerer ? (
        <div style={{ marginBottom: 16 }}>
          <textarea
            value={tekst}
            onChange={e => setTekst(e.target.value.slice(0, INNLEGG_MAKS_LENGDE))}
            disabled={isPending}
            placeholder="Skriv her…"
            style={tekstStil}
          />
          <div style={tellerStil}>{INNLEGG_MAKS_LENGDE - tekst.length} tegn igjen</div>

          {/* AKTUELL DATO — redigerbar. Ingen `min` her (til forskjell fra
              /meldinger/ny): et eldre innlegg kan ha en passert dato, og en
              min-grense som ligger etter feltets egen verdi gjør feltet
              ugyldig i Safari. En passert dato er uansett harmløs — den
              fester ikke innlegget. */}
          <div style={{ marginTop: 18 }}>
            <div style={tellerStil_venstre}>Aktuell dato</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="date"
                value={dato}
                onChange={e => {
                  setDato(e.target.value)
                  setDatoRoert(true)
                }}
                disabled={isPending}
                style={datoStil}
              />
              {dato && (
                <button
                  type="button"
                  onClick={() => {
                    setDato('')
                    setDatoRoert(true)
                  }}
                  disabled={isPending}
                  style={{ ...sekundaerKnapp, padding: '6px 12px', fontSize: 12 }}
                >
                  Fjern
                </button>
              )}
            </div>
            <div style={{ ...tellerStil_venstre, marginTop: 6, textTransform: 'none', letterSpacing: '0.2px' }}>
              {/* Sier eksplisitt at det er en maskin som leser teksten —
                  samme konservative lesning av AI Act art. 50(1) som på
                  /meldinger/ny. Se docs/ai-act-vurdering.md § G2. */}
              {aiPaa
                ? 'Lar du feltet stå tomt, foreslår KI en dato ut fra teksten når du lagrer. Holder innlegget festet øverst til datoen er passert.'
                : 'Holder innlegget festet øverst til datoen er passert.'}
            </div>
          </div>
        </div>
      ) : (
        innhold && (
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 16,
              color: 'var(--text-primary)',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordWrap: 'break-word',
              marginBottom: 16,
            }}
          >
            <Linkified text={innhold} />
          </div>
        )
      )}

      {/* BILDER — slett-X kun i redigeringsmodus */}
      {visBildeGrid && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginBottom: 16,
          }}
        >
          {bilder.map(b => {
            const bilde = bildeSrc(b.bilde_url)
            if (!bilde) return null
            return (
              <div key={b.id} style={{ position: 'relative' }}>
                <div
                  style={{
                    position: 'relative',
                    width: '100%',
                    aspectRatio: '4/3',
                    borderRadius: 'var(--radius-card)',
                    overflow: 'hidden',
                  }}
                >
                  <Image
                    src={bilde}
                    alt=""
                    fill
                    sizes="(max-width: 512px) 100vw, 512px"
                    style={{ objectFit: 'cover' }}
                    priority
                  />
                </div>
                {redigerer && kanRedigere && <SlettBildeKnapp bildeId={b.id} />}
              </div>
            )
          })}
        </div>
      )}

      {/* LEGG TIL BILDE — kun i redigeringsmodus */}
      {visLeggTil && (
        <LeggTilBildeKnapp
          meldingId={meldingId}
          gjenstaaende={MELDING_MAKS_BILDER - bilder.length}
        />
      )}

      {feil && (
        <div
          style={{
            color: 'var(--danger)',
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            marginBottom: 12,
          }}
        >
          {feil}
        </div>
      )}

      {/* KONTROLLER — Rediger i visning, Lagre/Avbryt (+ Slett) i redigering */}
      {kanRedigere && (
        redigerer ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 4 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={lagre} disabled={isPending} style={primaerKnapp}>
                {isPending ? 'Lagrer…' : 'Lagre'}
              </button>
              <button type="button" onClick={avbryt} disabled={isPending} style={sekundaerKnapp}>
                Avbryt
              </button>
            </div>
            <SlettMeldingKnapp meldingId={meldingId} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => settRedigerer(true)}
            style={sekundaerKnapp}
          >
            Rediger
          </button>
        )
      )}
    </>
  )
}

const tekstStil: CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: 'none',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)',
  fontSize: 16,
  lineHeight: 1.5,
  outline: 'none',
  padding: 0,
  resize: 'none',
  minHeight: 120,
}

// Samme mono-etikett som teller, men venstrestilt — brukes til felt-labels.
const tellerStil_venstre: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  color: 'var(--text-tertiary)',
  letterSpacing: '1.2px',
  textTransform: 'uppercase',
  marginBottom: 8,
}

const datoStil: CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: 'var(--bg-elevated)',
  border: '0.5px solid var(--border)',
  borderRadius: 10,
  padding: '9px 12px',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)',
  fontSize: 14,
  outline: 'none',
}

const tellerStil: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  color: 'var(--text-tertiary)',
  letterSpacing: '1.2px',
  textTransform: 'uppercase',
  marginTop: 8,
  textAlign: 'right',
}

const primaerKnapp: CSSProperties = {
  padding: '9px 20px',
  background: 'var(--accent)',
  border: 'none',
  borderRadius: 999,
  color: 'var(--bg)',
  fontFamily: 'var(--font-body)',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}

const sekundaerKnapp: CSSProperties = {
  padding: '9px 20px',
  background: 'transparent',
  border: '0.5px solid var(--border)',
  borderRadius: 999,
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-body)',
  fontSize: 13,
  cursor: 'pointer',
}
