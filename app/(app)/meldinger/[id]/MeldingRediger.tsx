'use client'

import { useState, useTransition, type CSSProperties } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Linkified } from '@/lib/linkify'
import { oppdaterMeldingPost } from '@/lib/actions/meldinger'
import { INNLEGG_MAKS_LENGDE, MELDING_MAKS_BILDER } from '@/lib/konstanter'
import SlettBildeKnapp from './SlettBildeKnapp'
import LeggTilBildeKnapp from './LeggTilBildeKnapp'
import SlettMeldingKnapp from './SlettMeldingKnapp'

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
  bilder: Bilde[]
  erAlbum: boolean
  kanRedigere: boolean
  kanLeggeTilBilder: boolean
}) {
  const [redigerer, setRedigerer] = useState(false)
  const [tekst, setTekst] = useState(innhold)
  const [feil, setFeil] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const visBildeGrid = !erAlbum && bilder.length > 0
  const visLeggTil =
    redigerer && kanLeggeTilBilder && !erAlbum && bilder.length < MELDING_MAKS_BILDER

  function lagre() {
    setFeil('')
    startTransition(async () => {
      try {
        await oppdaterMeldingPost(meldingId, tekst)
        setRedigerer(false)
        router.refresh()
      } catch (err) {
        setFeil(err instanceof Error ? err.message : 'Kunne ikke lagre. Prøv igjen.')
      }
    })
  }

  function avbryt() {
    // Forkast tekst-endringer og gå tilbake til visningsmodus. Bilde-endringer
    // er allerede persistert, så de påvirkes ikke av Avbryt.
    setTekst(innhold)
    setFeil('')
    setRedigerer(false)
  }

  return (
    <>
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
          {bilder.map(b => (
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
                  src={b.bilde_url}
                  alt=""
                  fill
                  sizes="(max-width: 512px) 100vw, 512px"
                  style={{ objectFit: 'cover' }}
                  priority
                />
              </div>
              {redigerer && kanRedigere && <SlettBildeKnapp bildeId={b.id} />}
            </div>
          ))}
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
            onClick={() => setRedigerer(true)}
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
