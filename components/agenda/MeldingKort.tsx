'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Avatar from '@/components/ui/Avatar'
import Card from '@/components/ui/Card'
import Icon from '@/components/ui/Icon'
import KommentarerPaaKort, { type KommentarKortData } from '@/components/agenda/KommentarerPaaKort'
import ReaksjonBadges from '@/components/agenda/ReaksjonBadges'
import ReaksjonPicker from '@/components/agenda/ReaksjonPicker'
import MeldingTommel from '@/components/agenda/MeldingTommel'
import type { ReaksjonGruppe } from '@/lib/reaksjoner'
import { useMeldingReaksjoner } from '@/lib/reaksjoner-hook'
import { LONG_PRESS_MS, MIN_TREFFMAAL_PX } from '@/lib/konstanter'
import type { ChatProfil } from '@/lib/mention'
import type { AlbumKort } from '@/lib/melding-album'
import { formatDistanceToNowStrict } from 'date-fns'
import { nb } from 'date-fns/locale'
import { arkiverMelding, avarkiverMelding } from '@/lib/actions/meldinger'
import { Linkified } from '@/lib/linkify'
import { bildeSrc } from '@/lib/bilde-utils'
import { lesFondsrapport } from '@/lib/fondsrapport'
import FondsrapportBlokk from '@/components/fond/FondsrapportBlokk'

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
  /** Albumkort: når satt erstatter albumets omslagsbilde vanlig bilde-grid
   * og en CTA-pille lenker til albumet. Se #214, forenklet i #463. */
  albumKort: AlbumKort | null
}

function relativTid(iso: string): string {
  return formatDistanceToNowStrict(new Date(iso), { locale: nb, addSuffix: true })
}

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
  const [pickerY, setPickerY] = useState(0)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFired = useRef(false)
  const fingerY = useRef(0)
  // Hold på reaksjons-badgene viser hvem som har reagert (ikke picker — den
  // ligger på innlegget og tommelen).
  const [hvemApen, setHvemApen] = useState(false)
  const hvemTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hvemFired = useRef(false)
  const linkRef = useRef<HTMLAnchorElement | null>(null)
  const pickerRef = useRef<HTMLDivElement | null>(null)
  const hvemRef = useRef<HTMLDivElement | null>(null)
  // Satt når et trykk lukket en åpen popover — da skal det samme trykket ikke
  // også navigere til innlegget.
  const lukketVedTrykk = useRef(false)
  const router = useRouter()
  const [, startTransition] = useTransition()

  // Reaksjons-state eies her (single source of truth) og deles med både
  // MeldingReaksjoner (badge-raden) og MeldingTommel (like-knappen), slik at
  // begge oppdateres i samme frame ved optimistisk toggle. se #468
  const meldingReaksjoner = useMeldingReaksjoner({
    meldingId: melding.id,
    brukerId,
    initial: melding.reaksjoner,
  })

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

  function startLongPress(e: React.TouchEvent<HTMLDivElement>) {
    if (melding.tidligere) return
    // Husk hvor fingeren er, så picker-pillen åpner der — ikke nederst på et langt kort.
    const touch = e.touches[0]
    if (touch) fingerY.current = touch.clientY - e.currentTarget.getBoundingClientRect().top
    longPressFired.current = false
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true
      setPickerY(fingerY.current)
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
    // Hvis long-press fikk åpnet picker, eller trykket lukket en popover,
    // hindre at samme tap navigerer
    if (longPressFired.current || lukketVedTrykk.current) {
      e.preventDefault()
      e.stopPropagation()
      longPressFired.current = false
      lukketVedTrykk.current = false
    }
  }

  function startHvem(e: React.TouchEvent) {
    // Ikke la holdet boble opp til kortets long-press (som åpner picker).
    e.stopPropagation()
    hvemFired.current = false
    if (hvemTimer.current) clearTimeout(hvemTimer.current)
    hvemTimer.current = setTimeout(() => {
      hvemFired.current = true
      setPickerApen(false)
      setHvemApen(true)
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate?.(15)
      }
    }, LONG_PRESS_MS)
  }

  function stoppHvem(e: React.TouchEvent) {
    e.stopPropagation()
    if (hvemTimer.current) {
      clearTimeout(hvemTimer.current)
      hvemTimer.current = null
    }
  }

  // Trykk utenfor en åpen popover (picker eller hvem-liste) lukker den. Lytteren
  // monteres først når popoveren er åpen, så holdet som åpnet den ikke lukker den.
  const popoverApen = pickerApen || hvemApen
  useEffect(() => {
    if (!popoverApen) return
    function handleUtenfor(e: Event) {
      const mål = e.target as Node
      if (pickerRef.current?.contains(mål) || hvemRef.current?.contains(mål)) return
      setPickerApen(false)
      setHvemApen(false)
      if (linkRef.current?.contains(mål)) lukketVedTrykk.current = true
    }
    document.addEventListener('pointerdown', handleUtenfor)
    return () => document.removeEventListener('pointerdown', handleUtenfor)
  }, [popoverApen])

  useEffect(() => {
    return () => {
      if (hvemTimer.current) clearTimeout(hvemTimer.current)
    }
  }, [])

  function navnFor(id: string) {
    if (id === brukerId) return 'Deg'
    return profiler?.find(p => p.id === id)?.navn ?? 'Ukjent'
  }

  // Bilde-grid-logikk:
  //   0 bilder → ingenting
  //   1 bilde  → full bredde, 4:3
  //   2–4      → 2×2-grid (kvadratiske celler)
  //   5+       → de 4 første i 2×2 med «+N»-overlay på 4. celle
  // Hvis melding.albumKort er satt overstyres dette helt — vi viser
  // albumets omslagsbilde + CTA-pille i stedet for grid.
  const wrapperBunn =
    !melding.tidligere && meldingReaksjoner.reaksjoner.length > 0 ? 10 : 0
  // Pillen legges over fingeren (ikke under, der fingeren dekker den). Card har
  // overflow: hidden, så toppen klemmes slik at hele pillen (44 px) står inni kortet.
  const pickerTopp = Math.max(pickerY - 16, MIN_TREFFMAAL_PX + 16)
  // Fondsrapport (#785): tegnes fra teksten selv, uansett forfatterens rolle
  // — bindende ramme fra issue #785, IKKE en admin-sjekk her.
  const fondsrapport = lesFondsrapport(melding.innhold)
  const albumKort = melding.albumKort
  const albumBilde = albumKort ? bildeSrc(albumKort.bildeUrl) : null
  const antallBilder = albumKort ? 0 : melding.bilder.length
  const visOverlay = antallBilder > 4
  const bildeGrid = melding.bilder.slice(0, 4) // maks 4 vises
  const foersteBilde = bildeSrc(melding.bilder[0])

  // iOS sin link-preview på <a> slås av globalt i globals.css (a { -webkit-touch-callout }).
  // Vi unngår user-select: none på Link siden det vil blokkere tekst-seleksjon
  // i kommentar-inputen lenger nede.
  return (
    <Link
      ref={linkRef}
      href={`/meldinger/${melding.id}`}
      onClick={handleLinkClick}
      style={{
        textDecoration: 'none',
        color: 'inherit',
        display: 'block',
      }}
    >
      <Card
        padding={false}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          opacity: melding.tidligere ? 'var(--tidligere-opacity)' : 1,
          borderRadius: 'var(--radius-card)',
        }}
      >
        <div
          onTouchStart={startLongPress}
          onTouchEnd={clearLongPress}
          onTouchMove={clearLongPress}
          onTouchCancel={clearLongPress}
          style={{
            position: 'relative',
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
              {/* suppressHydrationWarning: relativ tid kan krysse minutt-grense mellom server-render
                  og hydrering, se #466 */}
              <span
                suppressHydrationWarning
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
                  {/* Kort merkelapp for seende, full forklaring for skjermleser (#796:
                      title-tooltip finnes ikke på touch). */}
                  <span aria-hidden="true">Facebook</span>
                  <span className="sr-only">Importert fra Facebook</span>
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
                aria-label="Flytt innlegget til Tidligere"
                onClick={e => {
                  e.preventDefault()
                  e.stopPropagation()
                  arkiver()
                }}
                style={{
                  background: 'none',
                  border: 'none',
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
                aria-label="Hent innlegget tilbake fra Tidligere"
                onClick={e => {
                  e.preventDefault()
                  e.stopPropagation()
                  avarkiver()
                }}
                style={{
                  background: 'none',
                  border: 'none',
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

          {/* Innhold — fondsrapport (#785) erstatter vanlig tekstvisning med
              hilsen (kun hvis skrevet) + kortet tegnet fra teksten. */}
          {fondsrapport ? (
            <div style={{ marginBottom: wrapperBunn }}>
              {fondsrapport.hilsen && (
                <div
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 14,
                    color: 'var(--text-primary)',
                    lineHeight: 1.4,
                    whiteSpace: 'pre-wrap',
                    wordWrap: 'break-word',
                  }}
                >
                  <Linkified text={fondsrapport.hilsen} inneILenke />
                </div>
              )}
              <FondsrapportBlokk rapport={fondsrapport.rapport} brukerId={brukerId} />
            </div>
          ) : (
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 14,
                color: 'var(--text-primary)',
                lineHeight: 1.4,
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
                marginBottom: antallBilder > 0 || albumKort
                  ? 10
                  : !melding.tidligere && (meldingReaksjoner.reaksjoner.length > 0 || pickerApen)
                    ? 8
                    : 0,
              }}
            >
              {/* inneILenke: kortet er en <a>, ekte lenker i teksten ville nøstet <a>-i-<a> (#465) */}
              <Linkified text={melding.innhold ?? ''} inneILenke />
            </div>
          )}

          {/* Albumkort: albumets omslagsbilde + CTA-pille som lenker til
              hele albumet. Erstatter vanlig bilde-grid. Se #214, #463. */}
          {albumKort && (
            <div style={{ marginBottom: wrapperBunn }}>
              {albumBilde && (
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
                    src={albumBilde}
                    alt=""
                    fill
                    sizes="100vw"
                    style={{ objectFit: 'cover' }}
                  />
                </div>
              )}
              {/* CTA-pille — <span role="link"> og ikke <Link>: hele kortet er
                  allerede en <a>, og <a>-i-<a> er ugyldig HTML. Parseren
                  auto-lukker da den ytre i server-HTML-en og hydreringen
                  krasjer med React #418 (se #465). Samme mønster som
                  KommentarMiniatyr. preventDefault + stopPropagation hindrer
                  at trykket også trigger kort-Link-en (→ /meldinger/[id]). */}
              <span
                role="link"
                tabIndex={0}
                onClick={e => {
                  e.preventDefault()
                  e.stopPropagation()
                  router.push(`/album/${albumKort.albumId}`)
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    e.stopPropagation()
                    router.push(`/album/${albumKort.albumId}`)
                  }
                }}
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
                    {albumKort.albumTittel}
                    {albumKort.antallBilder > 0 && ` (${albumKort.antallBilder})`}
                  </span>
                </span>
              </span>
            </div>
          )}

          {/* Bilde-grid. 1 bilde: full bredde 4:3. 2-4: 2×2-grid.
              5+: 4 første i grid med «+N»-overlay på siste celle. */}
          {antallBilder === 1 && foersteBilde && (
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
                src={foersteBilde}
                alt=""
                fill
                sizes="100vw"
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
                const bilde = bildeSrc(url)
                if (!bilde) return null
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
                      src={bilde}
                      alt=""
                      fill
                      sizes="50vw"
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

          {/* Reaksjons-rad — vises kun hvis det finnes reaksjoner. Bruker
              ReaksjonBadges direkte med state delt fra meldingReaksjoner-hooken
              (samme som MeldingTommel) — ingen «+»-knapp på agenda. Se #468/F5. */}
          {!melding.tidligere && meldingReaksjoner.reaksjoner.length > 0 && (
            <div
              onTouchStart={startHvem}
              onTouchEnd={stoppHvem}
              onTouchMove={stoppHvem}
              onTouchCancel={stoppHvem}
              onClickCapture={e => {
                // Halen av holdet er et click på en badge — den skal ikke toggle reaksjonen.
                if (hvemFired.current) {
                  e.preventDefault()
                  e.stopPropagation()
                  hvemFired.current = false
                }
              }}
              style={{ position: 'relative' }}
            >
              <ReaksjonBadges
                brukerId={brukerId}
                reaksjoner={meldingReaksjoner.reaksjoner}
                toggle={meldingReaksjoner.toggle}
                isPending={meldingReaksjoner.isPending}
                apen={false}
                lukk={() => setPickerApen(false)}
              />

              {/* Hvem har reagert — over badge-raden, samme popover-uttrykk som pickeren. */}
              {hvemApen && (
                <div
                  ref={hvemRef}
                  role="dialog"
                  aria-label="Hvem har reagert"
                  onClick={e => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                  style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 6px)',
                    left: 0,
                    right: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    padding: '10px 14px',
                    background: 'var(--bg-elevated-2)',
                    border: '0.5px solid var(--border)',
                    borderRadius: 14,
                    boxShadow: 'var(--shadow-popover)',
                    zIndex: 10,
                  }}
                >
                  {meldingReaksjoner.reaksjoner.map(r => (
                    <div
                      key={r.emoji}
                      style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}
                    >
                      <span style={{ fontSize: 16, lineHeight: 1 }}>{r.emoji}</span>
                      <span
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: 13,
                          color: 'var(--text-primary)',
                          lineHeight: 1.4,
                        }}
                      >
                        {r.profilIder.map(navnFor).join(', ')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Picker fra long-press: forankret der fingeren holdt, ikke ved
              reaksjons-raden nederst (lange innlegg). Høyde-0-anker — pickeren
              legger seg selv over ankeret (bottom: 100% + avstand). */}
          {!melding.tidligere && pickerApen && (
            <div
              ref={pickerRef}
              onClick={e => {
                e.preventDefault()
                e.stopPropagation()
              }}
              style={{ position: 'absolute', top: pickerTopp, left: 14, height: 0 }}
            >
              <ReaksjonPicker
                isPending={meldingReaksjoner.isPending}
                onVelg={emoji => {
                  setPickerApen(false)
                  meldingReaksjoner.toggle(emoji)
                }}
              />
            </div>
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
            tommel={
              <MeldingTommel
                brukerId={brukerId}
                reaksjoner={meldingReaksjoner.reaksjoner}
                toggle={meldingReaksjoner.toggle}
                isPending={meldingReaksjoner.isPending}
              />
            }
          />
        )}
      </Card>
    </Link>
  )
}
