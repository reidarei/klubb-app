'use client'

import { useEffect, useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { opprettArrangement } from '@/lib/actions/arrangementer'
import { lastOppBilde } from '@/lib/actions/bilde-opplasting'
import SkjemaBar from '@/components/ui/SkjemaBar'
import { SkjemaGruppe, SkjemaRad, RadInput, DatoFelt, ValgFelt, TekstRad } from '@/components/ui/Skjema'
import { MiniToggle } from '@/components/ui/ToggleSwitch'
import Placeholder from '@/components/ui/Placeholder'
import BildeBytterKnapp from '@/components/BildeBytterKnapp'
import TypeVelger, { type MalValg } from '@/components/arrangement/TypeVelger'
import { formaterDato, datetimeLocalTilIso } from '@/lib/dato'

function defaultStart(purredato: string | null): string {
  const basis = purredato ? `${purredato}T19:00:00Z` : new Date().toISOString()
  return `${formaterDato(basis, 'yyyy-MM-dd')}T17:00`
}

type Props = {
  valg: MalValg[]
  initialKey: string
  initialAnnetType?: 'moete' | 'tur'
}

export default function NyttArrangementSkjema({
  valg,
  initialKey,
  initialAnnetType = 'moete',
}: Props) {
  const [valgtKey, setValgtKey] = useState(initialKey)
  const valgt = useMemo(
    () => valg.find(v => v.key === valgtKey) ?? valg[valg.length - 1],
    [valg, valgtKey],
  )

  // Type: hvis malen har type → bruk den. Ellers (Annet) → bruker velger.
  const [annetType, setAnnetType] = useState<'moete' | 'tur'>(initialAnnetType)
  const effektivType: 'moete' | 'tur' = valgt.type ?? annetType
  const erTur = effektivType === 'tur'

  // Tittel forhåndsutfylles fra arrangement_navn, men kan overstyres
  const [tittel, setTittel] = useState(valgt.mal_navn === 'Annet' ? '' : valgt.mal_navn)
  const [tittelBerørt, setTittelBerørt] = useState(false)

  const [beskrivelse, setBeskrivelse] = useState('')
  const [start, setStart] = useState(defaultStart(valgt.purredato))
  const [slutt, setSlutt] = useState('')
  const [oppmoetested, setOppmoetested] = useState('')
  const [destinasjon, setDestinasjon] = useState('')
  const [pris, setPris] = useState('')
  const [sensurert, setSensurert] = useState<Record<string, boolean>>({})
  // Holder File-objektet til submit. Forhåndsvises via blob: URL — ingen
  // R2-opplasting før brukeren faktisk lagrer.
  const [bildeFil, setBildeFil] = useState<File | null>(null)
  const previewUrl = useMemo(
    () => (bildeFil ? URL.createObjectURL(bildeFil) : null),
    [bildeFil],
  )
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])
  const [feil, setFeil] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleValgtMal(v: MalValg) {
    setValgtKey(v.key)
    // Oppdater tittel/dato-defaults hvis bruker ikke har rørt tittelen
    if (!tittelBerørt) {
      setTittel(v.mal_navn === 'Annet' ? '' : v.mal_navn)
    }
    setStart(defaultStart(v.purredato))
  }

  function toggleSensurert(felt: string) {
    setSensurert(prev => ({ ...prev, [felt]: !prev[felt] }))
  }

  function handlePubliser() {
    setFeil('')
    if (!tittel.trim()) {
      setFeil('Tittel må fylles ut.')
      return
    }
    if (!start) {
      setFeil(erTur ? 'Avreise må fylles ut.' : 'Dato og tid må fylles ut.')
      return
    }

    startTransition(async () => {
      try {
        // Last opp bilde til R2 først hvis valgt — så har vi URL til DB-raden
        let bildeUrl: string | null = null
        if (bildeFil) {
          const fd = new FormData()
          fd.append('fil', bildeFil)
          fd.append('kategori', 'arrangementer')
          const res = await lastOppBilde(fd)
          bildeUrl = res.url
        }

        await opprettArrangement({
          type: effektivType,
          tittel,
          beskrivelse: beskrivelse || null,
          start_tidspunkt: datetimeLocalTilIso(start),
          // Tur-felt settes null på møter pga CHECK-constraint tur_felt_kun_for_tur
          slutt_tidspunkt: erTur ? (slutt ? datetimeLocalTilIso(slutt) : null) : null,
          oppmoetested: oppmoetested || null,
          destinasjon: erTur ? (destinasjon || null) : null,
          pris_per_person: erTur ? (pris ? parseInt(pris) : null) : null,
          sensurerte_felt: erTur ? sensurert : {},
          bilde_url: bildeUrl,
          mal_navn: valgt.mal_navn === 'Annet' ? null : valgt.mal_navn,
          aar: valgt.aar ?? null,
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
        setFeil('Noe gikk galt. Prøv igjen.')
      }
    })
  }

  const typeOptions = [
    { verdi: 'tur', etikett: 'Tur' },
    { verdi: 'moete', etikett: 'Møte' },
  ]

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <SkjemaBar
        overtittel="Nytt"
        tittel={tittel || 'Arrangement'}
        onAvbryt={() => router.back()}
        onLagre={handlePubliser}
        lagreLabel="Publiser"
        laster={isPending}
      />

      {/* Hero-bilde med bytt-knapp */}
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
            {/* Blob-URL for forhåndsvisning — unoptimized fordi den ikke kan optimaliseres serverside */}
            <Image
              src={previewUrl}
              alt=""
              fill
              unoptimized
              style={{ objectFit: 'cover' }}
              sizes="100vw"
            />
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

      <SkjemaGruppe tittel="Velg arrangement">
        <TypeVelger valg={valg} valgtKey={valgtKey} onValg={handleValgtMal} />
        {/* Når "Annet" er valgt må brukeren velge møte/tur selv */}
        {valgt.type === null && (
          <SkjemaRad etikett="Format">
            <ValgFelt
              value={annetType}
              onChange={e => setAnnetType(e.target.value as 'moete' | 'tur')}
              aria-label="Format"
              valg={typeOptions}
            />
          </SkjemaRad>
        )}
      </SkjemaGruppe>

      <SkjemaGruppe tittel="Detaljer" feil={feil}>
        <SkjemaRad etikett="Tittel">
          <RadInput
            type="text"
            value={tittel}
            onChange={e => {
              setTittel(e.target.value)
              setTittelBerørt(true)
            }}
            placeholder="Navn på arrangementet"
          />
        </SkjemaRad>
        <SkjemaRad etikett={erTur ? 'Oppmøte' : 'Start'}>
          <DatoFelt
            type="datetime-local"
            value={start}
            onChange={e => setStart(e.target.value)}
            aria-label={erTur ? 'Oppmøte' : 'Start'}
          />
        </SkjemaRad>
        {erTur && (
          <SkjemaRad etikett="Hjemkomst">
            <DatoFelt
              type="datetime-local"
              value={slutt}
              onChange={e => setSlutt(e.target.value)}
              aria-label="Hjemkomst"
            />
          </SkjemaRad>
        )}
        <SkjemaRad etikett="Oppmøtested">
          <RadInput
            type="text"
            value={oppmoetested}
            onChange={e => setOppmoetested(e.target.value)}
            placeholder="—"
          />
        </SkjemaRad>
        {erTur && (
          <SkjemaRad etikett="Destinasjon">
            <RadInput
              type="text"
              value={destinasjon}
              onChange={e => setDestinasjon(e.target.value)}
              placeholder="—"
            />
            <MiniToggle
              on={!!sensurert['destinasjon']}
              onChange={() => toggleSensurert('destinasjon')}
              ariaLabel="Sladd destinasjon"
            />
          </SkjemaRad>
        )}
      </SkjemaGruppe>

      {/* Kostnad — kun for tur */}
      {erTur && (
        <SkjemaGruppe tittel="Kostnad">
          <SkjemaRad etikett="Pris per person">
            <RadInput
              type="number"
              value={pris}
              onChange={e => setPris(e.target.value)}
              placeholder="0"
              inputMode="numeric"
            />
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--text-tertiary)' }}>kr</span>
            <MiniToggle
              on={!!sensurert['pris_per_person']}
              onChange={() => toggleSensurert('pris_per_person')}
              ariaLabel="Sladd pris"
            />
          </SkjemaRad>
        </SkjemaGruppe>
      )}

      <SkjemaGruppe tittel="Beskrivelse">
        <TekstRad
          value={beskrivelse}
          onChange={e => setBeskrivelse(e.target.value)}
          placeholder="Skriv noe om arrangementet…"
          aria-label="Beskrivelse"
        />
      </SkjemaGruppe>

      {/* Setter forventningen FØR publisering. Uten den tror arrangøren at
          han må varsle manuelt etterpå, og trykker «Varsle om endring» på et
          arrangement ingen ennå har rukket å glemme — se #554. */}
      <p
        style={{
          fontSize: 12.5,
          lineHeight: 1.5,
          color: 'var(--text-tertiary)',
          margin: 0,
          paddingTop: 4,
        }}
      >
        Alle gutta blir varslet med én gang du publiserer. Du trenger ikke
        gjøre noe mer.
      </p>
    </div>
  )
}
