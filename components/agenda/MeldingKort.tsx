'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Avatar from '@/components/ui/Avatar'
import Card from '@/components/ui/Card'
import Icon from '@/components/ui/Icon'
import KommentarerPaaKort, { type KommentarKortData } from '@/components/agenda/KommentarerPaaKort'
import MeldingReaksjoner, { type ReaksjonGruppe } from '@/components/agenda/MeldingReaksjoner'
import type { ChatProfil } from '@/lib/mention'
import type { AlbumSpotlight } from '@/lib/melding-spotlight'
import { formatDistanceToNowStrict } from 'date-fns'
import { nb } from 'date-fns/locale'
import { arkiverMelding, avarkiverMelding } from '@/lib/actions/meldinger'
import { Linkified } from '@/lib/linkify'

export type MeldingKortData = {
  id: string
  innhold: string | null
  opprettet: string
  sist_aktivitet: string
  // Flat liste over bilde-URL-er, sortert på rekkefoelge fra DB.
  // Erstatter bilde_url + tilleggsbilder (issue #174).
  bilder: string[]
  fraFacebook?: boolean
  forfatter: {
    id: string
    navn: string
    bilde_url: string | null
    rolle: string | null
  }
  reaksjoner: ReaksjonGruppe[]
  antallKommentarer: number
  /** Visuell dempning når kortet ligger i Tidligere-seksjonen */
  tidligere: boolean
  /** Album-spotlight: når satt erstatter spotlight-bildet vanlig bilde-grid
   * og en CTA-pille lenker til albumet. Se #214. */
  albumSpotlight: AlbumSpotlight | null
}

function relativTid(iso: string): string {
  return formatDistanceToNowStrict(new Date(iso), { locale: nb, addSuffix: true })
}

// 350 ms vinner kappløpet mot iOS sin innebygde link-preview (~500 ms).
// Hadde vi ligget på 500 ms ville Safari-menyen kunne dukke opp først.
const LONG_PRESS_MS = 350

type Props = {
  melding: MeldingKortData
  brukerId: string
  kommentarer?: KommentarKortData[]
  /** Aktive profiler for @mention-forslag i inline kommentar-felt. */
  profiler?: ChatProfil[]
  /** Brukes til å vise arkiver/av-arkiver-knappen. Admin kan flytte alle,
   * ellers vises knappen kun for forfatter — og aldri på FB-importerte
   * innlegg. */
  erAdmin?: boolean
}

/**
 * Fjerde type element på agendaen — innlegg à la Facebook-status.
 * Plasseres øverst på agenda i MELDING_LEVENDE_DAGER (3.5) dager fra
 * siste kommentar (reaksjoner teller ikke), eller inntil forfatter/admin
 * arkiverer innlegget manuelt. Etter det faller den ned i
 * Tidligere-seksjonen. Se lib/agenda-sortering.ts for regelverket.
 *
 * Long-press på selve innlegget åpner reaksjons-picker — samme mønster
 * som chat-bobler bruker. Vanlig click navigerer til detaljsiden.
 */
export default function MeldingKort({ melding, brukerId, kommentarer = [], profiler, erAdmin = false }: Props) {
  const [pickerApen, setPickerApen] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFired = useRef(false)
  const router = useRouter()
  const [, startTransition] = useTransition()

  // Forfatter eller admin kan flytte innlegget mellom levende og Tidligere.
  // FB-importerte innlegg har ingen ekte forfatter i klubben og kan ikke flyttes.
  const kanFlytte = !melding.fraFacebook && (brukerId === melding.forfatter.id || erAdmin)

  function arkiver() {
    if (!confirm('Flytte innlegget til Tidligere?')) return
    // Optimistisk feilhåndtering via transition + refresh — samme mønster som
    // MeldingReaksjoner/KommentarerPaaKort. router.refresh() henter ny
    // server-render slik at kortet faktisk flytter seg etter klikk. (#312)
    startTransition(async () => {
      try {
        await arkiverMelding(melding.id)
        router.refresh()
      } catch {
        alert('Klarte ikke å flytte innlegget. Prøv igjen.')
      }
    })
  }

  function avarkiver() {
    if (!confirm('Hente innlegget tilbake fra Tidligere?')) return
    startTransition(async () => {
      try {
        await avarkiverMelding(melding.id)
        router.refresh()
      } catch {
        alert('Klarte ikke å hente innlegget tilbake. Prøv igjen.')
      }
    })
  }

  function startLongPress() {
    if (melding.tidligere) return
    longPressFired.current = false
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true
      setPickerApen(true)
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate?.(15)
      }
    }, LONG_PRESS_MS)
  }

  function clearLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  function handleLinkClick(e: React.MouseEvent) {
    // Hvis long-press fikk åpnet picker, hindre at samme tap navigerer
    if (longPressFired.current) {
      e.preventDefault()
      e.stopPropagation()
      longPressFired.current = false
    }
  }

  // Bilde-grid-logikk:
  //   0 bilder → ingenting
  //   1 bilde  → full bredde, 4:3
  //   2–4      → 2×2-grid (kvadratiske celler)
  //   5+       → de 4 første i 2×2 med «+N»-overlay på 4. celle
  // Hvis melding.albumSpotlight er satt overstyres dette helt — vi viser
  // spotlight-bildet + CTA-pille i stedet for grid.
  const wrapperBunn =
    !melding.tidligere && (melding.reaksjoner.length > 0 || pickerApen) ? 10 : 0
  const spotlight = melding.albumSpotlight
  const antallBilder = spotlight ? 0 : melding.bilder.length
  const visOverlay = antallBilder > 4
  const bildeGrid = melding.bilder.slice(0, 4) // maks 4 vises

  // iOS sin link-preview trigges på selve <a>-tagen — touch-callout
  // settes derfor på Link. Vi unngår user-select: none på Link siden
  // det vil blokkere tekst-seleksjon i kommentar-inputen lenger nede.
  return (
    <Link
      href={`/meldinger/${melding.id}`}
      onClick={handleLinkClick}
      style={{
        textDecoration: 'none',
        color: 'inherit',
        display: 'block',
        WebkitTouchCallout: 'none',
      }}
    >
      <Card
        padding={false}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          opacity: melding.tidligere ? 0.62 : 1,
          borderRadius: 'var(--radius-card)',
        }}
      >
        <div
          onTouchStart={startLongPress}
          onTouchEnd={clearLongPress}
          onTouchMove={clearLongPress}
          onTouchCancel={clearLongPress}
          onMouseDown={startLongPress}
          onMouseUp={clearLongPress}
          onMouseLeave={clearLongPress}
          style={{
            padding: '10px 14px',
            WebkitUserSelect: 'none',
            userSelect: 'none',
          }}
        >
          {/* Forfatter-rad */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 6,
            }}
          >
            <Avatar
              name={melding.forfatter.navn}
              size={26}
              src={melding.forfatter.bilde_url}
              rolle={melding.forfatter.rolle}
            />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                }}
              >
                {melding.forfatter.navn}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  color: 'var(--text-tertiary)',
                  letterSpacing: '0.8px',
                  textTransform: 'uppercase',
                }}
              >
                {relativTid(melding.opprettet)}
              </span>
              {melding.fraFacebook && (
                <span
                  title="Importert fra Facebook"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    color: 'var(--text-tertiary)',
                    letterSpacing: '0.8px',
                    textTransform: 'uppercase',
                    border: '0.5px solid var(--border)',
                    borderRadius: 3,
                    padding: '1px 5px',
                    opacity: 0.7,
                  }}
                >
                  Facebook
                </span>
              )}
            </div>

            {/* Arkiver / av-arkiver — symmetrisk par. Begge kun for forfatter
                eller admin, aldri på FB-importerte innlegg.
                  - Levende kort  → chevronDown «send ned til Tidligere»
                  - Tidligere kort → chevronUp «hent tilbake»
                e.stopPropagation() hindrer at klikket trigger Link-navigasjon
                til meldingssiden. (#312) */}
            {kanFlytte && !melding.tidligere && (
              <button
                type="button"
                title="Flytt til Tidligere"
                aria-label="Flytt innlegget til Tidligere"
                onClick={e => {
                  e.preventDefault()
                  e.stopPropagation()
                  arkiver()
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 4,
                  color: 'var(--text-tertiary)',
                  flexShrink: 0,
                  lineHeight: 0,
                }}
              >
                <Icon name="chevronDown" size={16} />
              </button>
            )}
            {kanFlytte && melding.tidligere && (
              <button
                type="button"
                title="Hent tilbake fra Tidligere"
                aria-label="Hent innlegget tilbake fra Tidligere"
                onClick={e => {
                  e.preventDefault()
                  e.stopPropagation()
                  avarkiver()
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 4,
                  color: 'var(--text-tertiary)',
                  flexShrink: 0,
                  lineHeight: 0,
                }}
              >
                <Icon name="chevronUp" size={16} />
              </button>
            )}
          </div>

          {/* Innhold */}
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              color: 'var(--text-primary)',
              lineHeight: 1.4,
              whiteSpace: 'pre-wrap',
              wordWrap: 'break-word',
              marginBottom: antallBilder > 0 || spotlight
                ? 10
                : !melding.tidligere && (melding.reaksjoner.length > 0 || pickerApen)
                  ? 8
                  : 0,
            }}
          >
            <Linkified text={melding.innhold ?? ''} />
          </div>

          {/* Album-spotlight: én stort bilde + CTA-pille som lenker til
              hele albumet. Erstatter vanlig bilde-grid. Se #214. */}
          {spotlight && (
            <div style={{ marginBottom: wrapperBunn }}>
              {spotlight.bildeUrl && (
                <div
                  style={{
                    position: 'relative',
                    width: '100%',
                    aspectRatio: '4/3',
                    borderRadius: 'var(--radius-card)',
                    overflow: 'hidden',
                    marginBottom: 8,
                  }}
                >
                  <Image
                    src={spotlight.bildeUrl}
                    alt=""
                    fill
                    sizes="(max-width: 512px) 100vw, 512px"
                    style={{ objectFit: 'cover' }}
                  />
                </div>
              )}
              {/* CTA-pille — stopPropagation hindrer at trykk på pillen også
                  trigger Link-en rundt hele kortet (Link → /meldinger/[id]). */}
              <Link
                href={`/album/${spotlight.albumId}`}
                onClick={e => e.stopPropagation()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  background: 'var(--accent-soft)',
                  border: '0.5px solid var(--accent)',
                  borderRadius: 999,
                  color: 'var(--text-primary)',
                  textDecoration: 'none',
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >
                <Icon name="image" size={13} color="var(--accent)" strokeWidth={1.8} />
                <span>
                  Se hele albumet
                  <span style={{ color: 'var(--text-tertiary)' }}>
                    {' · '}
                    {spotlight.albumTittel}
                    {spotlight.antallBilder > 0 && ` (${spotlight.antallBilder})`}
                  </span>
                </span>
              </Link>
            </div>
          )}

          {/* Bilde-grid. 1 bilde: full bredde 4:3. 2-4: 2×2-grid.
              5+: 4 første i grid med «+N»-overlay på siste celle. */}
          {antallBilder === 1 && (
            <div
              style={{
                position: 'relative',
                width: '100%',
                aspectRatio: '4/3',
                borderRadius: 'var(--radius-card)',
                overflow: 'hidden',
                marginBottom: wrapperBunn,
              }}
            >
              <Image
                src={melding.bilder[0]}
                alt=""
                fill
                sizes="(max-width: 512px) 100vw, 512px"
                style={{ objectFit: 'cover' }}
              />
            </div>
          )}

          {antallBilder >= 2 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 4,
                marginBottom: wrapperBunn,
              }}
            >
              {bildeGrid.map((url, i) => {
                const erSiste = i === 3
                return (
                  <div
                    key={i}
                    style={{
                      position: 'relative',
                      width: '100%',
                      aspectRatio: '1/1',
                      borderRadius: 'var(--radius-card)',
                      overflow: 'hidden',
                    }}
                  >
                    <Image
                      src={url}
                      alt=""
                      fill
                      sizes="(max-width: 512px) 50vw, 256px"
                      style={{ objectFit: 'cover' }}
                    />
                    {/* Overlay på 4. celle når det finnes flere enn 4 bilder */}
                    {visOverlay && erSiste && (
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          background: 'var(--overlay-soft)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--text-primary)',
                          fontFamily: 'var(--font-display)',
                          fontSize: 22,
                          fontWeight: 500,
                        }}
                      >
                        +{antallBilder - 4}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Reaksjons-rad — vises kun hvis det finnes reaksjoner eller
              picker er åpen. Picker styres av long-press over. */}
          {!melding.tidligere && (
            <MeldingReaksjoner
              meldingId={melding.id}
              brukerId={brukerId}
              reaksjoner={melding.reaksjoner}
              pickerApen={pickerApen}
              lukkPicker={() => setPickerApen(false)}
            />
          )}
        </div>

        {/* Kommentarer — kun på levende meldinger */}
        {!melding.tidligere && (
          <KommentarerPaaKort
            kommentarer={kommentarer}
            scope={{ type: 'melding', id: melding.id }}
            totaltAntall={melding.antallKommentarer}
            profiler={profiler}
            brukerId={brukerId}
          />
        )}
      </Card>
    </Link>
  )
}
