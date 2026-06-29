'use client'

import { useEffect, useRef, useState, useTransition, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { opprettMelding } from '@/lib/actions/meldinger'
import { lastOppBilde, slettBilde } from '@/lib/actions/bilde-opplasting'
import SkjemaBar from '@/components/ui/SkjemaBar'
import SkjemaSeksjon from '@/components/ui/SkjemaSeksjon'
import Icon from '@/components/ui/Icon'
import { createClient } from '@/lib/supabase/client'
import { komprimer, genererFilnavn } from '@/lib/bilde-utils'
import { INNLEGG_MAKS_LENGDE, MELDING_MAKS_BILDER } from '@/lib/konstanter'

const inputStil: CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: 'none',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)',
  fontSize: 15,
  lineHeight: 1.5,
  outline: 'none',
  padding: 0,
  resize: 'none',
  minHeight: 180,
}

type BildeStatus = 'klar' | 'laster' | 'feil'

type BildeItem = {
  fil: File
  // Lokal blob-URL for forhåndsvisning — revokeres ved opprydding
  previewUrl: string
  status: BildeStatus
}

export type AlbumValg = {
  id: string
  tittel: string
  thumb: string | null
  antall: number
}

type AlbumBilde = {
  id: string
  bilde_url: string
  thumb_url: string | null
}

type Props = {
  albumer: AlbumValg[]
}

export default function NyMeldingSkjema({ albumer }: Props) {
  const [innhold, setInnhold] = useState('')
  const [bilder, setBilder] = useState<BildeItem[]>([])
  const [feil, setFeil] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Sentralt register over aktive blob-URL-er. Bruker ref + Set fordi
  // cleanup-funksjonen i useEffect ellers lukker over et tomt snapshot
  // av `bilder` (deps=[]). Settet holder seg "levende" mellom rendere.
  const blobUrlerRef = useRef<Set<string>>(new Set())

  // Album-spotlight: enten/eller mot egne opplastede bilder. Når valgtAlbum
  // er satt, skjules opplaster-seksjonen og motsatt.
  const [valgtAlbum, setValgtAlbum] = useState<AlbumValg | null>(null)
  const [valgtSpotlightId, setValgtSpotlightId] = useState<string | null>(null)
  const [albumModusApen, setAlbumModusApen] = useState(false)
  const [albumBilder, setAlbumBilder] = useState<AlbumBilde[]>([])
  const [henterAlbumBilder, setHenterAlbumBilder] = useState(false)

  // Revokér alle gjenværende blob-URL-er ved unmount
  useEffect(() => {
    const settet = blobUrlerRef.current
    return () => {
      settet.forEach(url => URL.revokeObjectURL(url))
      settet.clear()
    }
  }, [])

  // Når et album er valgt, hent bildelisten lazyt fra klienten. Vi vil ikke
  // sende ALLE bilder for ALLE album til hver bruker som åpner skjemaet —
  // for klubben er volumet håndterbart, men prinsippet skalerer dårlig.
  useEffect(() => {
    if (!valgtAlbum) {
      setAlbumBilder([])
      setValgtSpotlightId(null)
      return
    }
    let cancelled = false
    setHenterAlbumBilder(true)
    const supabase = createClient()
    supabase
      .from('album_bilde')
      .select('id, bilde_url, thumb_url')
      .eq('album_id', valgtAlbum.id)
      .order('rekkefolge', { ascending: true })
      .order('opprettet', { ascending: true })
      .then(({ data }) => {
        if (cancelled) return
        setAlbumBilder(data ?? [])
        // Default-spotlight = første bilde
        if (data && data.length > 0) setValgtSpotlightId(data[0].id)
        setHenterAlbumBilder(false)
      })
    return () => {
      cancelled = true
    }
  }, [valgtAlbum])

  function velgAlbum(album: AlbumValg) {
    // Bytt til album-modus: kast eventuelle valgte egne bilder
    bilder.forEach(b => {
      URL.revokeObjectURL(b.previewUrl)
      blobUrlerRef.current.delete(b.previewUrl)
    })
    setBilder([])
    setValgtAlbum(album)
    setAlbumModusApen(false)
  }

  function fjernAlbumvalg() {
    setValgtAlbum(null)
    setValgtSpotlightId(null)
    setAlbumBilder([])
  }

  function fjernBilde(idx: number) {
    setBilder(prev => {
      const url = prev[idx].previewUrl
      URL.revokeObjectURL(url)
      blobUrlerRef.current.delete(url)
      return prev.filter((_, i) => i !== idx)
    })
  }

  function handleFilvalg(e: React.ChangeEvent<HTMLInputElement>) {
    const valgte = Array.from(e.target.files ?? [])
    // Ta kun så mange som gjenstår til cap
    const maks = MELDING_MAKS_BILDER - bilder.length
    const nye = valgte.slice(0, maks).map(fil => {
      const previewUrl = URL.createObjectURL(fil)
      blobUrlerRef.current.add(previewUrl)
      return {
        fil,
        previewUrl,
        status: 'klar' as BildeStatus,
      }
    })
    setBilder(prev => [...prev, ...nye])
    // Nullstill input så samme fil kan legges til på nytt etter fjerning
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handlePubliser() {
    setFeil('')
    const harTekst = innhold.trim().length > 0
    const harBilder = bilder.length > 0
    const harAlbum = !!valgtAlbum

    if (!harTekst && !harBilder && !harAlbum) {
      setFeil('Skriv noe, legg til et bilde, eller velg et album før du publiserer.')
      return
    }

    // Album-spotlight: ingen opplasting trengs. Bare send album_id + spotlight.
    if (harAlbum) {
      startTransition(async () => {
        try {
          await opprettMelding({
            innhold,
            album_id: valgtAlbum!.id,
            album_spotlight_bilde_id: valgtSpotlightId,
          })
        } catch (err) {
          if (
            typeof err === 'object' &&
            err !== null &&
            'digest' in err &&
            typeof (err as Record<string, unknown>).digest === 'string' &&
            ((err as Record<string, unknown>).digest as string).startsWith('NEXT_REDIRECT')
          ) {
            throw err
          }
          setFeil(err instanceof Error ? err.message : 'Noe gikk galt. Prøv igjen.')
        }
      })
      return
    }

    // Heves ut av try-blokken slik at catch faktisk når URL-ene som
    // allerede er lastet opp før feilen oppstod.
    const opplastede: string[] = []

    startTransition(async () => {
      try {
        // Last opp bilder SEKVENSIELT for å spare iOS-minne (Canvas API er
        // single-threaded og multiple parallelle kanvasoperasjoner kan krasje
        // på eldre iPhones med lite RAM).
        for (const bilde of bilder) {
          setBilder(prev => prev.map(b =>
            b.previewUrl === bilde.previewUrl ? { ...b, status: 'laster' } : b,
          ))
          const komprimert = await komprimer(bilde.fil)
          const fd = new FormData()
          fd.append('fil', komprimert)
          fd.append('filnavn', genererFilnavn(komprimert))
          fd.append('kategori', 'meldinger')
          const res = await lastOppBilde(fd)
          opplastede.push(res.url)
        }

        await opprettMelding({ innhold, bilde_urls: opplastede })
      } catch (err) {
        // NEXT_REDIRECT er ikke en ekte feil — la Next.js håndtere redirect
        if (
          typeof err === 'object' &&
          err !== null &&
          'digest' in err &&
          typeof (err as Record<string, unknown>).digest === 'string' &&
          ((err as Record<string, unknown>).digest as string).startsWith('NEXT_REDIRECT')
        ) {
          throw err
        }

        // Compensating delete: slett allerede opplastede bilder fra R2 slik at
        // vi ikke etterlater orphan-objekter hvis opprettMelding kaster. Feil
        // her ignores — orphan-rydding er best-effort. allSettled gjør at én
        // mislykket slett ikke avbryter resten.
        if (opplastede.length > 0) {
          await Promise.allSettled(opplastede.map(url => slettBilde(url)))
        }
        setFeil(err instanceof Error ? err.message : 'Noe gikk galt. Prøv igjen.')
        setBilder(prev => prev.map(b => ({ ...b, status: 'klar' })))
      }
    })
  }

  const tegnIgjen = INNLEGG_MAKS_LENGDE - innhold.length
  const kanLeggeTilFlere = bilder.length < MELDING_MAKS_BILDER
  const visUploadSeksjon = !valgtAlbum
  const visAlbumvelger = bilder.length === 0

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <SkjemaBar
        overtittel="Ny"
        tittel={innhold.slice(0, 40) || 'Melding'}
        onAvbryt={() => router.back()}
        onLagre={handlePubliser}
        lagreLabel="Publiser"
        laster={isPending}
      />

      <SkjemaSeksjon label="Hva vil du dele?">
        <div style={{ padding: '10px 4px' }}>
          <textarea
            value={innhold}
            onChange={e => setInnhold(e.target.value.slice(0, INNLEGG_MAKS_LENGDE))}
            placeholder="Skriv her…"
            style={inputStil}
          />
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--text-tertiary)',
              letterSpacing: '1.2px',
              textTransform: 'uppercase',
              marginTop: 8,
              textAlign: 'right',
            }}
          >
            {tegnIgjen} tegn igjen
          </div>
        </div>
      </SkjemaSeksjon>

      {visUploadSeksjon && (
        <SkjemaSeksjon label={`Bilder (valgfritt, maks ${MELDING_MAKS_BILDER})`}>
          <div style={{ padding: '10px 4px' }}>
            {/* Miniatyrer med X-knapp */}
            {bilder.length > 0 && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                {bilder.map((bilde, idx) => (
                  <div key={bilde.previewUrl} style={{ position: 'relative' }}>
                    <div
                      style={{
                        position: 'relative',
                        width: '100%',
                        aspectRatio: '1/1',
                        borderRadius: 'var(--radius-card)',
                        overflow: 'hidden',
                        opacity: bilde.status === 'laster' ? 0.5 : 1,
                      }}
                    >
                      <Image
                        src={bilde.previewUrl}
                        alt={`Bilde ${idx + 1}`}
                        fill
                        unoptimized
                        style={{ objectFit: 'cover' }}
                        sizes="33vw"
                      />
                    </div>
                    {bilde.status === 'laster' && (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--text-primary)',
                          fontSize: 11,
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        Laster…
                      </div>
                    )}
                    {/* X-knapp for å fjerne bildet */}
                    <button
                      type="button"
                      onClick={() => fjernBilde(idx)}
                      disabled={isPending}
                      aria-label="Fjern bilde"
                      style={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        background: 'var(--overlay-control-bg)',
                        border: 'none',
                        color: 'var(--text-primary)',
                        fontSize: 13,
                        lineHeight: 1,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Fil-input — hidden, trigges av knapp nedenfor */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFilvalg}
              disabled={isPending || !kanLeggeTilFlere}
              style={{ display: 'none' }}
            />

            {kanLeggeTilFlere && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isPending}
                style={{
                  padding: '7px 14px',
                  background: 'transparent',
                  border: '0.5px solid var(--border)',
                  borderRadius: 999,
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {bilder.length === 0 ? 'Legg til bilder' : `Legg til flere (${bilder.length}/${MELDING_MAKS_BILDER})`}
              </button>
            )}
          </div>
        </SkjemaSeksjon>
      )}

      {/* Album-spotlight: enten/eller mot egne bilder. Hvis bruker har valgt
          egne bilder allerede, skjules denne — og motsatt. */}
      {(visAlbumvelger || valgtAlbum) && albumer.length > 0 && (
        <SkjemaSeksjon label="Eller lenk til et album">
          <div style={{ padding: '10px 4px' }}>
            {!valgtAlbum && (
              <button
                type="button"
                onClick={() => setAlbumModusApen(true)}
                disabled={isPending}
                style={{
                  padding: '7px 14px',
                  background: 'transparent',
                  border: '0.5px solid var(--border)',
                  borderRadius: 999,
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Icon name="image" size={14} color="currentColor" strokeWidth={1.6} />
                Velg album
              </button>
            )}

            {valgtAlbum && (
              <div
                style={{
                  border: '0.5px solid var(--border)',
                  borderRadius: 'var(--radius-card)',
                  padding: 12,
                  background: 'var(--bg-elevated)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 10,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 15,
                        color: 'var(--text-primary)',
                        fontWeight: 500,
                      }}
                    >
                      {valgtAlbum.tittel}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        color: 'var(--text-tertiary)',
                        letterSpacing: '1.2px',
                        textTransform: 'uppercase',
                        marginTop: 2,
                      }}
                    >
                      Velg spotlight-bilde
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={fjernAlbumvalg}
                    disabled={isPending}
                    style={{
                      background: 'transparent',
                      border: '0.5px solid var(--border)',
                      borderRadius: 999,
                      padding: '4px 10px',
                      color: 'var(--text-secondary)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      letterSpacing: '1.2px',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                    }}
                  >
                    Bytt
                  </button>
                </div>

                {henterAlbumBilder && (
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: 'var(--text-tertiary)',
                    }}
                  >
                    Henter bilder…
                  </div>
                )}

                {!henterAlbumBilder && albumBilder.length > 0 && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: 6,
                    }}
                  >
                    {albumBilder.map(b => {
                      const valgt = valgtSpotlightId === b.id
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setValgtSpotlightId(b.id)}
                          disabled={isPending}
                          style={{
                            position: 'relative',
                            padding: 0,
                            aspectRatio: '1/1',
                            borderRadius: 'var(--radius-card)',
                            overflow: 'hidden',
                            background: 'var(--bg-elevated-2)',
                            border: valgt
                              ? '2px solid var(--accent)'
                              : '0.5px solid var(--border-subtle)',
                            cursor: 'pointer',
                          }}
                          aria-label="Velg som spotlight"
                        >
                          <Image
                            src={b.thumb_url ?? b.bilde_url}
                            alt=""
                            fill
                            sizes="33vw"
                            style={{ objectFit: 'cover' }}
                          />
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </SkjemaSeksjon>
      )}

      {/* Modal-aktig album-liste — enkel inline overlay. Lukke ved klikk på
          backdrop eller på et album. Vi bruker ingen <dialog>-tag for å unngå
          iOS-quirks med fokus/scroll. */}
      {albumModusApen && (
        <div
          onClick={() => setAlbumModusApen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            // original var litt tyngre backdrop — konsolidert til felles overlay-soft-token
            background: 'var(--overlay-soft)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'flex-end',
            padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg)',
              border: '0.5px solid var(--border)',
              borderRadius: 'var(--radius-card)',
              padding: 16,
              width: '100%',
              maxHeight: '70vh',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--text-tertiary)',
                letterSpacing: '1.4px',
                textTransform: 'uppercase',
                marginBottom: 14,
              }}
            >
              Velg album
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 10,
              }}
            >
              {albumer.map(a => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => velgAlbum(a)}
                  style={{
                    padding: 0,
                    background: 'var(--bg-elevated)',
                    border: '0.5px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-card)',
                    overflow: 'hidden',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      aspectRatio: '1/1',
                      background: 'var(--bg-elevated-2)',
                    }}
                  >
                    {a.thumb && (
                      <Image
                        src={a.thumb}
                        alt=""
                        fill
                        sizes="50vw"
                        style={{ objectFit: 'cover' }}
                      />
                    )}
                  </div>
                  <div style={{ padding: '8px 10px' }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 14,
                        color: 'var(--text-primary)',
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {a.tittel}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9,
                        color: 'var(--text-tertiary)',
                        letterSpacing: '1.2px',
                        textTransform: 'uppercase',
                        marginTop: 2,
                      }}
                    >
                      {a.antall} {a.antall === 1 ? 'bilde' : 'bilder'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {feil && (
        <div
          style={{
            color: 'var(--danger)',
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            padding: '12px 4px',
          }}
        >
          {feil}
        </div>
      )}
    </div>
  )
}
