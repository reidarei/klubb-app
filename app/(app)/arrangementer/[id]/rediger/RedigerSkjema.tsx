'use client'

import { useEffect, useMemo, useState, useTransition, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { oppdaterArrangement, slettArrangement } from '@/lib/actions/arrangementer'
import { lastOppBilde, slettBilde } from '@/lib/actions/bilde-opplasting'
import SkjemaBar from '@/components/ui/SkjemaBar'
import SkjemaSeksjon from '@/components/ui/SkjemaSeksjon'
import Segment from '@/components/ui/Segment'
import { MiniToggle } from '@/components/ui/ToggleSwitch'
import Icon from '@/components/ui/Icon'
import Placeholder from '@/components/ui/Placeholder'
import BildeBytterKnapp from '@/components/BildeBytterKnapp'
import TypeVelger, { type MalValg } from '@/components/arrangement/TypeVelger'
import { isoTilDatetimeLocal, datetimeLocalTilIso } from '@/lib/dato'
import { genererFilnavn } from '@/lib/bilde-utils'

type Arrangement = {
  id: string
  type: 'tur' | 'moete'
  tittel: string
  beskrivelse: string | null
  start_tidspunkt: string
  slutt_tidspunkt: string | null
  oppmoetested: string | null
  destinasjon: string | null
  pris_per_person: number | null
  sensurerte_felt: Record<string, boolean> | null
  bilde_url: string | null
}

const monoLabel: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 9.5,
  fontWeight: 600,
  color: 'var(--text-tertiary)',
  letterSpacing: '1.6px',
  textTransform: 'uppercase',
  marginBottom: 4,
}

const inputStil: CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: 'none',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)',
  fontSize: 14,
  outline: 'none',
  padding: 0,
}

const accentStil: CSSProperties = {
  ...inputStil,
  fontFamily: 'var(--font-display)',
  fontSize: 19,
  fontWeight: 500,
  letterSpacing: '-0.3px',
}

function Rad({
  last,
  children,
}: {
  last?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        padding: '10px 4px',
        borderBottom: last ? 'none' : '0.5px solid var(--border-subtle)',
      }}
    >
      {children}
    </div>
  )
}

export default function RedigerSkjema({
  arrangement: arr,
  valg,
  initialKey,
}: {
  arrangement: Arrangement
  valg: MalValg[]
  initialKey: string
}) {
  const [valgtKey, setValgtKey] = useState(initialKey)
  const valgt = useMemo(
    () => valg.find(v => v.key === valgtKey) ?? valg[valg.length - 1]!,
    [valg, valgtKey],
  )

  // Når Annet er valgt, må bruker kunne styre type. Init fra arrangementets type.
  const [annetType, setAnnetType] = useState<'moete' | 'tur'>(arr.type)
  const effektivType: 'moete' | 'tur' = valgt.type ?? annetType
  const erTur = effektivType === 'tur'

  const [sensurert, setSensurert] = useState<Record<string, boolean>>(arr.sensurerte_felt ?? {})
  // bildeUrl = nåværende lagrede URL i DB. bildeFil = ventende ny upload.
  // Når bildeFil er satt, vises blob-URL. Ved submit lastes filen opp,
  // og det gamle R2-bildet (hvis det er R2) slettes etter vellykket
  // oppdatering.
  const [bildeUrl] = useState<string | null>(arr.bilde_url)
  const [bildeFil, setBildeFil] = useState<File | null>(null)
  const previewUrl = useMemo(
    () => (bildeFil ? URL.createObjectURL(bildeFil) : bildeUrl),
    [bildeFil, bildeUrl],
  )
  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])
  const [tittel, setTittel] = useState(arr.tittel)
  // Hvis nåværende tittel avviker fra mal-navnet, regnes den som tilpasset.
  const [tittelBerørt, setTittelBerørt] = useState(
    () => arr.tittel !== (valg.find(v => v.key === initialKey)?.mal_navn ?? ''),
  )
  const [beskrivelse, setBeskrivelse] = useState(arr.beskrivelse ?? '')
  const [start, setStart] = useState(isoTilDatetimeLocal(arr.start_tidspunkt))
  const [slutt, setSlutt] = useState(isoTilDatetimeLocal(arr.slutt_tidspunkt))
  const [oppmoetested, setOppmoetested] = useState(arr.oppmoetested ?? '')
  const [destinasjon, setDestinasjon] = useState(arr.destinasjon ?? '')
  const [pris, setPris] = useState<string>(arr.pris_per_person?.toString() ?? '')
  const [visSlett, setVisSlett] = useState(false)
  const [feil, setFeil] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleValgtMal(v: MalValg) {
    setValgtKey(v.key)
    // Auto-utfyll tittel hvis ikke manuelt redigert og vi har et mal-navn
    if (!tittelBerørt && v.mal_navn && v.mal_navn !== 'Annet') {
      setTittel(v.mal_navn)
    }
  }

  function toggleSensurert(felt: string) {
    setSensurert(prev => ({ ...prev, [felt]: !prev[felt] }))
  }

  function handleLagre() {
    setFeil('')
    startTransition(async () => {
      try {
        // Last opp ny fil (hvis valgt) før vi rører DB-raden
        let nyBildeUrl = bildeUrl
        if (bildeFil) {
          const fd = new FormData()
          fd.append('fil', bildeFil)
          fd.append('filnavn', genererFilnavn(bildeFil))
          fd.append('kategori', 'arrangementer')
          const res = await lastOppBilde(fd)
          nyBildeUrl = res.url
        }

        await oppdaterArrangement(arr.id, {
          type: effektivType,
          tittel,
          beskrivelse: beskrivelse || null,
          start_tidspunkt: start ? datetimeLocalTilIso(start) : undefined,
          // Tur-felt settes null på møter pga CHECK-constraint tur_felt_kun_for_tur
          slutt_tidspunkt: erTur ? (slutt ? datetimeLocalTilIso(slutt) : null) : null,
          oppmoetested: oppmoetested || null,
          destinasjon: erTur ? (destinasjon || null) : null,
          pris_per_person: erTur ? (pris ? parseInt(pris) : null) : null,
          sensurerte_felt: erTur ? sensurert : {},
          bilde_url: nyBildeUrl,
          mal_navn: valgt.mal_navn,
          aar: valgt.aar,
        })

        // Slett gammel R2-fil hvis vi byttet (best effort — orphan i R2 er
        // ikke kritisk hvis det skulle feile)
        if (bildeFil && arr.bilde_url && arr.bilde_url !== nyBildeUrl) {
          slettBilde(arr.bilde_url).catch(() => {})
        }

        router.push(`/arrangementer/${arr.id}`)
      } catch (err) {
        // Redirect/notFound fra server action skal boble videre
        if (
          err &&
          typeof err === 'object' &&
          'digest' in err &&
          typeof (err as { digest?: string }).digest === 'string' &&
          ((err as { digest: string }).digest.startsWith('NEXT_REDIRECT') ||
            (err as { digest: string }).digest.startsWith('NEXT_NOT_FOUND'))
        ) {
          throw err
        }
        console.error('[rediger arrangement] feilet:', err)
        const melding = err instanceof Error ? err.message : String(err)
        const digest =
          err && typeof err === 'object' && 'digest' in err
            ? String((err as { digest: unknown }).digest)
            : ''
        setFeil(
          melding
            ? digest
              ? `${melding} (digest: ${digest})`
              : melding
            : digest
              ? `Serverfeil (digest: ${digest})`
              : 'Noe gikk galt. Prøv igjen.',
        )
        // Scroll til topp så brukeren ser feil-meldingen
        if (typeof window !== 'undefined') {
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }
      }
    })
  }

  function handleSlett() {
    startTransition(async () => {
      await slettArrangement(arr.id)
    })
  }

  const formatOptions = [
    { value: 'moete' as const, label: 'Møte' },
    { value: 'tur' as const, label: 'Tur' },
  ]

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <SkjemaBar
        overtittel="Rediger"
        tittel={arr.tittel}
        onAvbryt={() => router.back()}
        onLagre={handleLagre}
        laster={isPending}
      />

      {feil && (
        <div
          style={{
            background: 'var(--danger-soft)',
            border: '0.5px solid var(--danger-border)',
            borderRadius: 12,
            padding: '12px 14px',
            marginBottom: 16,
            color: 'var(--danger)',
            fontSize: 13,
            fontFamily: 'var(--font-body)',
            lineHeight: 1.45,
          }}
        >
          {feil}
        </div>
      )}

      {/* Hero-bilde med bytt-knapp — trigger galleri direkte */}
      <div
        style={{
          position: 'relative',
          marginBottom: 20,
          borderRadius: 'var(--radius)',
          overflow: 'hidden',
        }}
      >
        {previewUrl ? (
          <div style={{ position: 'relative', aspectRatio: '16/9' }}>
            {previewUrl.startsWith('blob:') ? (
              // Lokal forhåndsvisning før upload — unoptimized fordi blob-URL-er ikke kan optimaliseres serverside
              <Image
                src={previewUrl}
                alt=""
                fill
                unoptimized
                style={{ objectFit: 'cover' }}
                sizes="(max-width: 512px) 100vw, 512px"
              />
            ) : (
              <Image
                src={previewUrl}
                alt=""
                fill
                style={{ objectFit: 'cover' }}
                sizes="(max-width: 512px) 100vw, 512px"
              />
            )}
          </div>
        ) : (
          <Placeholder label="Arrangement bilde" aspectRatio="16/9" type={erTur ? 'tur' : 'møte'} />
        )}
        <div style={{ position: 'absolute', bottom: 12, right: 12 }}>
          <BildeBytterKnapp
            onBildeFil={setBildeFil}
            label={previewUrl ? 'Bytt bilde' : 'Legg til bilde'}
          />
        </div>
      </div>

      {/* Velg arrangement (mal) */}
      <SkjemaSeksjon label="Velg arrangement">
        <Rad last={valgt.type !== null}>
          <TypeVelger valg={valg} valgtKey={valgtKey} onValg={handleValgtMal} />
        </Rad>
        {valgt.type === null && (
          <Rad last>
            <div style={monoLabel}>Format</div>
            <Segment value={annetType} options={formatOptions} onChange={setAnnetType} />
          </Rad>
        )}
      </SkjemaSeksjon>

      {/* Detaljer */}
      <SkjemaSeksjon label="Detaljer">
        <Rad>
          <div style={monoLabel}>Tittel</div>
          <input
            type="text"
            value={tittel}
            onChange={e => {
              setTittel(e.target.value)
              setTittelBerørt(true)
            }}
            style={accentStil}
          />
        </Rad>

        <Rad>
          <div style={monoLabel}>{erTur ? 'Avreise' : 'Start'}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="datetime-local"
              value={start}
              onChange={e => setStart(e.target.value)}
              style={{ ...inputStil, flex: 1 }}
            />
            <Icon name="calendar" size={15} color="var(--text-tertiary)" />
          </div>
        </Rad>

        {erTur && (
          <Rad>
            <div style={monoLabel}>Hjemkomst</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="datetime-local"
                value={slutt}
                onChange={e => setSlutt(e.target.value)}
                style={{ ...inputStil, flex: 1 }}
              />
              <Icon name="calendar" size={15} color="var(--text-tertiary)" />
            </div>
          </Rad>
        )}

        <Rad last={!erTur}>
          <div style={monoLabel}>Oppmøtested</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="text"
              value={oppmoetested}
              onChange={e => setOppmoetested(e.target.value)}
              style={{ ...inputStil, flex: 1 }}
              placeholder="—"
            />
            <Icon name="mapPin" size={15} color="var(--text-tertiary)" />
          </div>
        </Rad>

        {erTur && (
          <Rad last>
            <div style={monoLabel}>Destinasjon</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="text"
                value={destinasjon}
                onChange={e => setDestinasjon(e.target.value)}
                style={{ ...inputStil, flex: 1 }}
                placeholder="—"
              />
              <MiniToggle
                on={!!sensurert['destinasjon']}
                onChange={() => toggleSensurert('destinasjon')}
                ariaLabel="Sladd destinasjon"
              />
            </div>
          </Rad>
        )}
      </SkjemaSeksjon>

      {/* Kostnad */}
      {erTur && (
        <SkjemaSeksjon label="Kostnad">
          <Rad last>
            <div style={monoLabel}>Pris per person</div>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flex: 1 }}>
                <input
                  type="number"
                  value={pris}
                  onChange={e => setPris(e.target.value)}
                  style={{ ...accentStil, flex: 1 }}
                  placeholder="0"
                  inputMode="numeric"
                />
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    color: 'var(--text-tertiary)',
                    letterSpacing: '1.4px',
                    textTransform: 'uppercase',
                  }}
                >
                  kr
                </span>
              </div>
              <MiniToggle
                on={!!sensurert['pris_per_person']}
                onChange={() => toggleSensurert('pris_per_person')}
                ariaLabel="Sladd pris"
              />
            </div>
          </Rad>
        </SkjemaSeksjon>
      )}

      {/* Beskrivelse */}
      <SkjemaSeksjon label="Beskrivelse">
        <textarea
          value={beskrivelse}
          onChange={e => setBeskrivelse(e.target.value)}
          rows={4}
          style={{
            ...inputStil,
            padding: '4px 0',
            lineHeight: 1.6,
            color: 'var(--text-secondary)',
            resize: 'vertical',
            minHeight: 88,
            fontFamily: 'var(--font-body)',
          }}
          placeholder="Skriv noe om arrangementet…"
        />
      </SkjemaSeksjon>

      {/* Faresone */}
      <SkjemaSeksjon label="Faresone">
        {!visSlett ? (
          <div style={{ padding: '16px 4px' }}>
            <button
              type="button"
              onClick={() => setVisSlett(true)}
              style={{
                width: '100%',
                padding: '14px 0',
                borderRadius: 999,
                border: '1px solid var(--danger)',
                background: 'transparent',
                color: 'var(--danger)',
                fontFamily: 'var(--font-body)',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Slett arrangement
            </button>
          </div>
        ) : (
          <div style={{ padding: '16px 4px' }}>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                color: 'var(--text-secondary)',
                marginBottom: 14,
                textAlign: 'center',
              }}
            >
              Er du sikker? Dette kan ikke angres.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => setVisSlett(false)}
                style={{
                  flex: 1,
                  padding: '12px 0',
                  borderRadius: 999,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Avbryt
              </button>
              <button
                type="button"
                onClick={handleSlett}
                disabled={isPending}
                style={{
                  flex: 1,
                  padding: '12px 0',
                  borderRadius: 999,
                  border: 'none',
                  background: 'var(--danger)',
                  color: 'var(--accent-foreground)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  opacity: isPending ? 0.7 : 1,
                }}
              >
                {isPending ? 'Sletter…' : 'Ja, slett'}
              </button>
            </div>
          </div>
        )}
      </SkjemaSeksjon>
    </div>
  )
}
