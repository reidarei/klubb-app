'use client'

import { useEffect, useRef, useState, useTransition, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { opprettMelding } from '@/lib/actions/meldinger'
import { lastOppBilde, slettBilde } from '@/lib/actions/bilde-opplasting'
import SkjemaBar from '@/components/ui/SkjemaBar'
import SkjemaSeksjon from '@/components/ui/SkjemaSeksjon'
import Icon from '@/components/ui/Icon'
import { komprimer } from '@/lib/bilde-utils'
import { INNLEGG_MAKS_LENGDE, MELDING_MAKS_BILDER, DATO_FORSLAG_MIN_TEGN } from '@/lib/konstanter'
import { iDagOslo } from '@/lib/dato'
import { foreslaaAktuellDato } from '@/lib/actions/dato-forslag'

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

type Props = {
  albumer: AlbumValg[]
}

export default function NyMeldingSkjema({ albumer }: Props) {
  const [innhold, setInnhold] = useState('')
  const [aktuellDato, setAktuellDato] = useState('')
  const [bilder, setBilder] = useState<BildeItem[]>([])
  const [feil, setFeil] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Auto-dato: appen trekker stille ut en festedato fra teksten mens brukeren
  // skriver — ingen knapp, datofeltet fylles ut av seg selv. Så snart brukeren
  // selv rører datofeltet slutter vi å overstyre valget hans.
  const [datoManueltSatt, setDatoManueltSatt] = useState(false)
  // Generasjons-token mot stale forslag. En server action kan ikke avbrytes
  // via AbortSignal, så vi kan ikke «kansellere» et kall i flukt. Debounce-
  // effekten bumper telleren ved hver ny henting; et svar som lander med
  // utdatert gen droppes (teksten er endret siden kallet startet).
  const forslagGenRef = useRef(0)
  // Sentralt register over aktive blob-URL-er. Bruker ref + Set fordi
  // cleanup-funksjonen i useEffect ellers lukker over et tomt snapshot
  // av `bilder` (deps=[]). Settet holder seg "levende" mellom rendere.
  const blobUrlerRef = useRef<Set<string>>(new Set())

  // Albumkobling: enten/eller mot egne opplastede bilder. Når valgtAlbum
  // er satt, skjules opplaster-seksjonen og motsatt. Innlegget viser da
  // alltid albumets omslagsbilde — ingen egen bilde-velger her (#463).
  const [valgtAlbum, setValgtAlbum] = useState<AlbumValg | null>(null)
  const [albumModusApen, setAlbumModusApen] = useState(false)

  // Revokér alle gjenværende blob-URL-er ved unmount
  useEffect(() => {
    const settet = blobUrlerRef.current
    return () => {
      settet.forEach(url => URL.revokeObjectURL(url))
      settet.clear()
    }
  }, [])

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
  }

  // Stille bakgrunns-uttrekk av festedato mens brukeren skriver. Debounces slik
  // at vi ikke kaller AI-en på hvert tastetrykk — først 1 sek etter siste
  // endring. Overstyrer aldri en dato brukeren selv har satt (datoManueltSatt).
  // forslagGenRef dropper svar som lander etter at teksten er endret på nytt.
  useEffect(() => {
    if (datoManueltSatt) return
    if (innhold.trim().length < DATO_FORSLAG_MIN_TEGN) return
    const gen = ++forslagGenRef.current
    const timer = setTimeout(async () => {
      try {
        const r = await foreslaaAktuellDato(innhold)
        // Teksten er endret siden kallet startet, eller brukeren har tatt over
        // datofeltet i mellomtiden — forkast dette svaret.
        if (gen !== forslagGenRef.current || datoManueltSatt) return
        if (r.dato !== null) {
          setAktuellDato(r.dato)
        } else if (r.grunn === 'ingen_dato') {
          // Teksten refererer ikke lenger til noen dato — fjern en auto-satt
          // dato. Ved teknisk feil ('feil') beholder vi gjeldende verdi.
          setAktuellDato('')
        }
      } catch {
        // Nettverks-/auth-feil: helt stille. Dette er en bakgrunns-
        // bekvemmelighet, ikke noe brukeren venter på.
      }
    }, 1000)
    return () => clearTimeout(timer)
  }, [innhold, datoManueltSatt])

  // Beregn festedato idet vi publiserer. Normalt har bakgrunns-effekten over
  // allerede fylt aktuellDato, så dette er en ren retur uten AI-kall. Har
  // brukeren skrevet og publisert raskere enn debouncen (< 1 sek), gjør vi ett
  // siste forsøk her slik at innlegget likevel blir festet. Har brukeren
  // bevisst rørt/tømt datofeltet, respekterer vi det og hopper over uttrekk.
  async function beregnAktuellDato(): Promise<string | null> {
    if (aktuellDato) return aktuellDato
    if (datoManueltSatt) return null
    if (innhold.trim().length < DATO_FORSLAG_MIN_TEGN) return null
    try {
      const r = await foreslaaAktuellDato(innhold)
      return r.dato ?? null
    } catch {
      return null
    }
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

    // Albumkobling: ingen opplasting trengs. Bare send album_id.
    if (harAlbum) {
      startTransition(async () => {
        try {
          await opprettMelding({
            innhold,
            album_id: valgtAlbum!.id,
            aktuell_dato: await beregnAktuellDato(),
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
        // Beregn festedato før opplasting, slik at et evt. siste AI-forsøk
        // overlapper med bilde-komprimeringen i stedet for å legge på tid.
        const aktuell_dato = await beregnAktuellDato()
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
          fd.append('kategori', 'meldinger')
          const res = await lastOppBilde(fd)
          opplastede.push(res.url)
        }

        await opprettMelding({ innhold, bilde_urls: opplastede, aktuell_dato })
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

      {/* Albumkobling: enten/eller mot egne bilder. Hvis bruker har valgt
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
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 15,
                    color: 'var(--text-primary)',
                    fontWeight: 500,
                    minWidth: 0,
                  }}
                >
                  {valgtAlbum.tittel}
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
                    flexShrink: 0,
                  }}
                >
                  Bytt
                </button>
              </div>
            )}
          </div>
        </SkjemaSeksjon>
      )}

      <SkjemaSeksjon label="Aktuell dato (valgfritt)">
        <div style={{ padding: '10px 4px' }}>
          <input
            type="date"
            value={aktuellDato}
            onChange={e => {
              setAktuellDato(e.target.value)
              // Brukeren har tatt over datofeltet — stopp auto-uttrekket fra å
              // overstyre valget hans (gjelder også når han tømmer feltet).
              setDatoManueltSatt(true)
            }}
            disabled={isPending}
            // Sperr for fortidsdatoer i velgeren. Må bruke norsk kalenderdato
            // (ikke UTC), ellers kan «i dag» bli «i går» rundt midnatt norsk tid
            // og skjemaet slipper gjennom en fortidsdato. Se tidssone-policyen.
            min={iDagOslo()}
            style={{ ...inputStil, colorScheme: 'dark' }}
          />

          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--text-tertiary)',
              letterSpacing: '1.2px',
              textTransform: 'uppercase',
              marginTop: 6,
            }}
          >
            Fylles ut fra teksten — holder innlegget festet øverst til datoen er passert
          </div>
        </div>
      </SkjemaSeksjon>

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
