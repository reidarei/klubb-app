import type { CSSProperties } from 'react'
import { createServerClient } from '@/lib/supabase/server'
import { getInnloggetBruker } from '@/lib/auth-cache'
import { formaterDato } from '@/lib/dato'
import { projiser } from '@/lib/europa-kart-data'
import { fyllHullAar, erHullRad } from '@/lib/reiserute'
import EuropaKart, { type Sted, type AlbumKort } from '@/components/stedene/EuropaKart'

// Visuelt skjult, men lest av skjermlesere. Samme mønster som MiniKalender —
// display:none/visibility:hidden ville tatt teksten ut av tilgjengelighetstreet.
const SR_ONLY: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
}

// «Stedene» — alle turene klubben har vært på, plottet på et Europakart.
// Datagrunnlag: arrangementer med type='tur' og en destinasjon som finnes i
// geografi-oppslaget. Turer uten kjent by (f.eks. skjult blåtur) listes som
// «ikke plottet» under kartet i stedet for å forsvinne stille.
export default async function Stedene() {
  const [supabase] = await Promise.all([createServerClient(), getInnloggetBruker()])

  const { data: rader, error: raderFeil } = await supabase
    .from('arrangementer')
    .select(
      // Album embed-es på arrangementet (album.arrangement_id → arrangementer)
      // i samme round trip, så detaljkortet kan lenke til turens bildealbum.
      // Fase 1 forventer 0 eller 1 album per arrangement — vi tar det nyeste.
      `id, tittel, start_tidspunkt, destinasjon, lat, lng, sensurerte_felt,
       album (
         id,
         antall:album_bilde!album_bilde_album_id_fkey (count),
         cover:album_bilde!album_cover_fk (thumb_url, bilde_url)
       )`,
    )
    .eq('type', 'tur')
    .not('destinasjon', 'is', null)
    .order('start_tidspunkt', { ascending: true })

  if (raderFeil) throw new Error(`Kunne ikke hente turer: ${raderFeil.message}`)

  type RawCover = { thumb_url: string | null; bilde_url: string }
  type RawAlbum = {
    id: string
    antall: { count: number }[] | null
    cover: RawCover | RawCover[] | null
  }
  type Rad = {
    id: string
    tittel: string
    start_tidspunkt: string
    destinasjon: string
    lat: number | null
    lng: number | null
    sensurerte_felt: Record<string, boolean> | null
    album: RawAlbum | RawAlbum[] | null
  }
  const turer = (rader ?? []) as Rad[]

  // Normaliser album-embed (array eller enkeltobjekt avhengig av kardinalitet)
  // til en flat form kartet kan rendre. Cover-thumb først, ellers fullbilde.
  function albumKort(raw: Rad['album']): AlbumKort | null {
    const a = Array.isArray(raw) ? raw[0] : raw
    if (!a) return null
    const cover = Array.isArray(a.cover) ? a.cover[0] : a.cover
    return {
      id: a.id,
      antall: a.antall?.[0]?.count ?? 0,
      thumb: cover?.thumb_url ?? cover?.bilde_url ?? null,
    }
  }

  // Grupper de plottbare turene per by. Koordinatene ligger nå på selve
  // arrangementet (geokodet ved oppretting, se lib/geokoding.ts) — turer uten
  // coords (geokoding feilet, eller skjult blåtur) listes som «ikke plottet».
  const perBy = new Map<string, Sted>()
  const ikkePlottet: { aar: number; tittel: string; by: string }[] = []

  for (const t of turer) {
    const aar = Number(formaterDato(t.start_tidspunkt, 'yyyy'))
    // Sensurert destinasjon (blåtur): plottes ALDRI, og den ekte byen sendes
    // ikke til klienten — kun låst i tidslinja. Coords skal uansett være null
    // (geokodes ikke mens sensurert), men vi filtrerer defensivt her også slik
    // at kartet ikke kan avsløre hemmeligheten selv om en coord skulle finnes.
    const sensurert = t.sensurerte_felt?.destinasjon === true
    if (sensurert) {
      ikkePlottet.push({ aar, tittel: t.tittel, by: '' })
      continue
    }
    if (t.lat == null || t.lng == null) {
      ikkePlottet.push({ aar, tittel: t.tittel, by: t.destinasjon })
      continue
    }
    let sted = perBy.get(t.destinasjon)
    if (!sted) {
      const { x, y } = projiser(t.lng, t.lat)
      sted = { by: t.destinasjon, x, y, turer: [] }
      perBy.set(t.destinasjon, sted)
    }
    sted.turer.push({ aar, tittel: t.tittel, album: albumKort(t.album) })
  }

  const steder = [...perBy.values()]

  // Samlet tidslinje (alle turer, også ikke-plottede), eldste først. Hull-år
  // (ingen tur registrert) fylles inn av fyllHullAar, som også sorterer.
  const tidslinje = fyllHullAar([
    ...steder.flatMap(s => s.turer.map(t => ({ ...t, by: s.by, plottet: true }))),
    ...ikkePlottet.map(t => ({ ...t, plottet: false })),
  ])

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <header style={{ marginTop: 12, marginBottom: 22 }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--text-tertiary)',
            letterSpacing: '1.6px',
            textTransform: 'uppercase',
            marginBottom: 6,
          }}
        >
          Klubbinfo
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 38,
            fontWeight: 500,
            letterSpacing: '-0.5px',
            // 1.05 og ikke 1: tittelen brekker over 2–3 linjer på mobil, og
            // helt stram lineHeight lar bokstavene nesten røre hverandre (#502)
            lineHeight: 1.05,
            margin: 0,
            color: 'var(--text-primary)',
          }}
        >
          Vi har vært verden rundt, det vil si
        </h1>
        {/* Ingen undertittel: overskriften spiller på en sangtekst og skal lede
            rett ned i kartet — ikke i en teller (#502). Uten kolon (#509) */}
      </header>

      <EuropaKart steder={steder} />

      {/* Reiseruta — kronologisk tidslinje */}
      <div style={{ marginTop: 34 }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-tertiary)',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            marginBottom: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontWeight: 600,
          }}
        >
          Reiseruta
          <span style={{ flex: 1, height: '0.5px', background: 'var(--border-subtle)' }} />
        </div>
        {/* Hull-rader og tur-rader deler wrapper og årstall-span med vilje — kun
            innholds-spanen skiller dem, så en designjustering treffer begge (#508) */}
        {tidslinje.map((t, i) => (
          <div
            // Indeksen alene gjør nøkkelen unik: samme år kan ha flere turer
            key={`${t.aar}-${i}`}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 14,
              padding: '9px 2px',
              borderBottom: '0.5px solid var(--border-subtle)',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                color: 'var(--accent)',
                minWidth: 42,
              }}
            >
              {t.aar}
            </span>
            {erHullRad(t) ? (
              <>
                <span
                  aria-hidden="true"
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 17,
                    fontWeight: 500,
                    color: 'var(--text-tertiary)',
                    letterSpacing: '-0.2px',
                  }}
                >
                  —
                </span>
                {/* Streken er ren dekor. aria-label på raden ville ikke hjulpet:
                    en <div> uten role er «generic», som ikke støtter navn fra
                    forfatter — derfor sr-only-tekst, samme som MiniKalender. */}
                <span style={SR_ONLY}>ingen tur</span>
              </>
            ) : (
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 17,
                  fontWeight: 500,
                  color: t.plottet ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  letterSpacing: '-0.2px',
                }}
              >
                {t.plottet ? t.by : `${t.tittel} 🔒`}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
