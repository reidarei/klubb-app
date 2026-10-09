'use client'

import { useEffect, useMemo, useRef, useState, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { Map as LeafletMap, LayerGroup, Marker as LeafletMarker, LatLng } from 'leaflet'
import { formatDistanceToNowStrict } from 'date-fns'
import { nb } from 'date-fns/locale'
import { hueAv } from '@/components/ui/Avatar'
import { harGulGloed } from '@/lib/roller'
import { bildeSrc } from '@/lib/bilde-utils'
import { delPosisjon, stoppDeling, plingEtterPosisjon } from '@/lib/actions/posisjon'
import { settMarkering, slettMarkering } from '@/lib/actions/kart-markering'
import { sendFeilBeacon } from '@/lib/klient-logg'
import {
  POSISJON_FERSK_MINUTTER,
  POSISJON_KART_ZOOM,
  POSISJON_KART_FALLBACK_ZOOM,
  POSISJON_PLING_KVITTERING_SEK,
  KART_MARKERING_MAKS_LENGDE,
  KART_LENKE_KOPIERT_KVITTERING_SEK,
  KART_DELT_STED_FLY_VENT_MS,
  LONG_PRESS_MS,
  LONG_PRESS_BEVEGELSE_PX,
  MIN_TREFFMAAL_PX,
} from '@/lib/konstanter'
import { formaterDato } from '@/lib/dato'
import { useKeyboardOffset } from '@/components/chat/hooks/useKeyboardOffset'
import { trengerNyttUtsnitt } from '@/lib/kart-utsnitt'
import { velgKlyngeUtsnitt } from '@/lib/kart-klynge'
import { planleggAnkomst, foretrekkerRedusertBevegelse } from '@/lib/kart-ankomst'
import { byggStedLenke } from '@/lib/kart-lenke'
import type { PingKandidat } from '@/lib/kart-deltakere'
import {
  type KlubbSymbol,
  MARKERING_SYMBOLER,
  STANDARD_SYMBOL,
  type MarkeringSymbol,
  partisjonerSymboler,
} from '@/lib/markering-symboler'

// Chat er stor og rendres først etter et trykk — dynamic + ssr: false (#709).
const Chat = dynamic(() => import('@/components/chat/Chat'), { ssr: false })

// Statisk import, IKKE dynamic(): panelet er lite, og «Timeplan · 17:00»-pilla
// må vise neste post i FØRSTE paint (#716).
import TimeplanPanel, { type TimeplanArrangement, type TimeplanPost } from './TimeplanPanel'
import { beregnDefaultTimeplanDato } from './NyTimeplanPost'
import KartListePanel from './KartListePanel'
import MarkeringDetalj from './MarkeringDetalj'
import StedSok from './StedSok'
import type { StedTreff } from '@/lib/geokoding'
import ReisemodusBar, { KART_TOPP_MARGIN, REISEMODUS_BAR_SONE } from './ReisemodusBar'
import { PilleKnapp } from '@/components/ui/TreffPille'
// Re-eksportert så page.tsx henter alle kart-typene fra ett sted.
export type { TimeplanArrangement, TimeplanPost }

import 'leaflet/dist/leaflet.css'
import './kart.css'
import { HALE_FRA_VENSTRE, MARKOER_PX, SPOR_PRIKK_PX } from './kart-maal'

export type Punkt = {
  id: string
  lat: number
  lng: number
  noeyaktighetM: number | null
  registrert: string
}

export type Mann = {
  profilId: string
  navn: string
  bildeUrl: string | null
  rolle: string | null
  delerTil: string
  /** Eldste først. Siste element er der han er nå. */
  spor: Punkt[]
}

export type Markering = {
  id: string
  lat: number
  lng: number
  tekst: string
  /** Nøkkel fra MARKERING_SYMBOLER — det er denne som lagres i DB. */
  symbol: string
  /** Emojien for symbolet, slått opp server-side (admin kan ha tilpasset den). */
  emoji: string
  opprettet: string
  avNavn: string
  /** Styrer om fjern-knappen vises. RLS avgjør uansett om slettingen går. */
  erMin: boolean
}

type Props = {
  menn: Mann[]
  markeringer: Markering[]
  /**
   * Symbolregisteret med admin-tilpasninger (lib/kart-symbol-tilpasning.ts).
   * Uten: registeret slik det står i lib/klubb-symboler.ts.
   */
  symboler?: readonly KlubbSymbol[]
  /** Innlogget brukers profil-id — skiller «meg» fra «de andre» på kartet. */
  megId: string
  /**
   * Sant når et arrangement rammer inn sporet. Sporet VISES uansett (#698) —
   * dette styrer bare hvor lenge ruta lever, og hva vi lover brukeren om det.
   */
  underArrangement: boolean
  /** Admin kan fjerne andres markeringer — RLS tillater det allerede. */
  erAdmin: boolean
  /** Senter når ingen deler. Klubbens egen bydel, fra lib/klubb-config.ts. */
  fallbackSenter: { lat: number; lng: number }
  /** Av når admin har skrudd av chat-fanen (admin beholder tilgang selv). */
  visChat: boolean
  chatMeldinger: React.ComponentProps<typeof Chat>['initialMeldinger']
  chatProfiler: React.ComponentProps<typeof Chat>['profiler']
  /** Se finnAktuellArrangement() (#716). null = timeplan-pilla rendres ikke. */
  timeplanArrangement: TimeplanArrangement | null
  timeplanPoster: TimeplanPost[]
  /** kart.timeplan.hent.feilet traff på serveren — panelet får egen feiltilstand. */
  timeplanFeil: boolean
  /**
   * Sted delt via lenke (#719), ?lat=&lng=&tekst= parset i page.tsx. Kartet
   * sentreres her med egen markør — lenken bærer koordinatet, ikke en rad-id,
   * så det virker selv om markeringen er slettet.
   */
  deltSted: { lat: number; lng: number; tekst: string | null } | null
  /** «Ping en herre» (#725) — påmeldte (eller alle aktive) minus dem som allerede deler. */
  pingKandidater: PingKandidat[]
  /**
   * Kartmodus PÅ (reise- eller møtemodus, #723/#780): ingen TopHeader, flaten
   * fyller hele viewporten og ReisemodusBar overtar avatar+toggle. Styrer også
   * `--kart-panel-safe-top` (se stilen på kart-flaten).
   */
  reisemodus: boolean
  /** Hvilken modus som er på (#780); styrer teksten på ReisemodusBar. Kun relevant når `reisemodus`. */
  kartmodus?: 'reise' | 'moete' | null
}

function relativTid(iso: string): string {
  return formatDistanceToNowStrict(new Date(iso), { locale: nb, addSuffix: true })
}

function erFersk(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() < POSISJON_FERSK_MINUTTER * 60 * 1000
}

// For HTML-strenger Leaflet injiserer rått i DOM-en. Navn og bilde-URL er profildata.
function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
}

// Markør-HTML for SISTE punkt: profilbilde, ellers initialer.
//
// BEVISST UNNTAK fra Policy: Avatar (det eneste): divIcon tar en HTML-STRENG,
// ikke en React-node, og en createPortal per markør er ikke verdt det. Reglene
// deles likevel via `bildeSrc()` og `harGulGloed()` — kun oppmerkingen er egen.
function markoerHtml(
  navn: string,
  bildeUrl: string | null,
  rolle: string | null,
  fersk: boolean,
  erMeg: boolean,
): string {
  const klasser = ['kart-markoer']
  if (!fersk) klasser.push('kart-markoer-gammel')
  if (erMeg) klasser.push('kart-markoer-meg')
  // Taper mot «meg»-ringen hvis begge gjelder — du skal finne deg selv først.
  if (!erMeg && harGulGloed(rolle)) klasser.push('kart-markoer-gs')

  const bilde = bildeSrc(bildeUrl)
  if (bilde) {
    // Ikke next/image: løs HTML-streng utenfor Reacts tre.
    return `<div class="${klasser.join(' ')}"><img src="${esc(bilde)}" alt="${esc(navn)}" loading="lazy" /></div>`
  }

  const init = navn
    .split(' ')
    .map(p => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
  klasser.push('avatar-initialer')
  return `<div class="${klasser.join(' ')}" style="--avatar-hue:${hueAv(navn)}">${esc(init)}</div>`
}

// Markering (#708): ÉN snakkeboble med symbolet, halen peker på stedet. Bobla
// ER tooltipen, ikke et divIcon: den må vokse med teksten, og `L.divIcon`
// krever fast `iconSize` (#702). `interactive: true` fordi bobla er hele markeringen.

// De TIDLIGERE punktene i sporet: små prikker, så det synes hvilken som gjelder nå.
function sporPrikkHtml(navn: string): string {
  return `<div class="kart-spor-prikk" style="--avatar-hue:${hueAv(navn)}"></div>`
}

export default function PosisjonsKart({
  menn,
  markeringer: markeringerFraServer,
  symboler = MARKERING_SYMBOLER,
  megId,
  fallbackSenter,
  underArrangement,
  erAdmin,
  visChat,
  chatMeldinger,
  chatProfiler,
  timeplanArrangement,
  timeplanPoster,
  timeplanFeil,
  deltSted,
  pingKandidater,
  reisemodus,
  kartmodus = null,
}: Props) {
  const kartRef = useRef<HTMLDivElement>(null)
  const kartetRef = useRef<LeafletMap | null>(null)
  const lagRef = useRef<LayerGroup | null>(null)

  // Markeringer jeg selv har fjernet — svaret fra actionen er nok; vi venter
  // ikke på RSC-revalideringen, som i blant aldri ble committet (#800).
  // Idene blir liggende: en slettet id kommer aldri tilbake fra serveren.
  const [fjernedeMarkeringer, setFjernedeMarkeringer] = useState<ReadonlySet<string>>(new Set())
  const markeringer = useMemo(
    () => markeringerFraServer.filter(m => !fjernedeMarkeringer.has(m.id)),
    [markeringerFraServer, fjernedeMarkeringer],
  )

  const [jobber, setJobber] = useState(false)
  const [feil, setFeil] = useState<string | null>(null)
  const [plinget, setPlinget] = useState<string | null>(null)
  // Hvem som nettopp er plinget (låst, grå knapp) — knappen er eneste sted
  // mannen ser at plinget gikk ut.
  const [nyligPlinget, setNyligPlinget] = useState<Record<string, boolean>>({})
  // Ryddes ved unmount, ellers setState på en avmontert komponent.
  const plingTimere = useRef<number[]>([])
  // Kopier-lenke-kvittering (#719) — her og ikke i MarkeringDetalj fordi både
  // knappen der og langtrykk på bobla trigger den. `lenkeFallback` er satt KUN
  // når clipboard feilet (Safari nekter utenfor ekte brukergest) — da vises
  // lenken i et forhåndsselektert felt i stedet for en stille feil.
  const [lenkeKopiert, setLenkeKopiert] = useState(false)
  const [lenkeFallback, setLenkeFallback] = useState<string | null>(null)
  const lenkeKopiertTimer = useRef<number | null>(null)
  // Markeringsflyten har to steg — sikte FØR tekst, ellers dekker tastaturet
  // krysset man sikter med (#702).
  //
  //   'av'             — ingenting på gang
  //   'sted'           — krysset står på kartet, kartet er fritt å flytte
  //   'tekst'          — stedet er låst, nå skriver man hva det er
  //   'timeplan-punkt' — samme sikte for en timeplan-post (#716); ÉN sikte-
  //                      tilstand for hele kartet. Panelet glir ut imens.
  //   'sok'            — stedssøk (#757), ingen sikte. Et treff går videre til
  //                      'sted' eller rett i timeplan-utkastet.
  const [steg, setSteg] = useState<'av' | 'sted' | 'tekst' | 'timeplan-punkt' | 'sok'>('av')
  // Langtrykk-lytterne (#762) registreres ÉN gang og leser steg via ref —
  // re-binding ved stegskifte ville drept timeren til en pågående gest.
  const stegRef = useRef(steg)
  useEffect(() => {
    stegRef.current = steg
  }, [steg])
  // Langtrykk-ringens punkt relativt til kartcontaineren (#762). null = ingen gest.
  const [presseRing, setPresseRing] = useState<{ x: number; y: number } | null>(null)
  // Styrer hjelpeteksten i 'sted' (#762, #757): via langtrykk/søk står krysset
  // allerede over stedet, så «Flytt kartet» er feil oppfordring.
  const [stedKilde, setStedKilde] = useState<'knapp' | 'langtrykk' | 'sok'>('knapp')
  // Valgt søketreff (#757) — treffnåla tegnes her så lenge steg === 'sok'.
  const [sokValgt, setSokValgt] = useState<StedTreff | null>(null)
  const [markeringTekst, setMarkeringTekst] = useState('')
  const [markeringSymbol, setMarkeringSymbol] = useState<MarkeringSymbol>(STANDARD_SYMBOL)
  // Låses ved bekreftelse, så panorering mens tastaturet er oppe ikke flytter markeringen.
  const [valgtSted, setValgtSted] = useState<{ lat: number; lng: number } | null>(null)
  // Markeringen man har trykket på i kartet (#699).
  const [valgtMarkering, setValgtMarkering] = useState<string | null>(null)
  // Ett panel om gangen, som én union (#716). De tre boolske under er avledet
  // per render, ikke egen state.
  const [aapentPanel, setAapentPanel] = useState<'ingen' | 'liste' | 'chat' | 'timeplan'>('ingen')
  const panelAapent = aapentPanel === 'liste'
  const chatAapent = aapentPanel === 'chat'
  const timeplanAapent = aapentPanel === 'timeplan'
  const chatPanelRef = useRef<HTMLElement>(null)

  // Timeplan-utkastet bor HER, ikke i TimeplanPanel: panelet glir ut under
  // punktvelging ('timeplan-punkt') og skal komme tilbake med utkastet intakt (#716).
  const [timeplanDato, setTimeplanDato] = useState(() =>
    timeplanArrangement ? beregnDefaultTimeplanDato(timeplanArrangement) : '',
  )
  const [timeplanTekst, setTimeplanTekst] = useState('')
  const [timeplanManuellKlokke, setTimeplanManuellKlokke] = useState<string | null>(null)
  const [timeplanPunkt, setTimeplanPunkt] = useState<{ lat: number; lng: number } | null>(null)
  // Adresse (#732) — alternativ til punkt.
  const [timeplanAdresse, setTimeplanAdresse] = useState<string | null>(null)

  // Nullstill utkastet når serveren peker på et ANNET arrangement (#716): en
  // RSC-revalidering kan bytte arrangement uten remount, og lazy-init over
  // kjører kun ved mount. Sammenlign på ID i en ref — props-objektet er nytt
  // ved hver RSC-render og ville tømt utkastet ved enhver revalidering.
  const forrigeTimeplanId = useRef<string | null>(timeplanArrangement?.id ?? null)
  useEffect(() => {
    const id = timeplanArrangement?.id ?? null
    if (id === forrigeTimeplanId.current) return
    forrigeTimeplanId.current = id
    setTimeplanDato(timeplanArrangement ? beregnDefaultTimeplanDato(timeplanArrangement) : '')
    setTimeplanTekst('')
    setTimeplanManuellKlokke(null)
    setTimeplanPunkt(null)
    setTimeplanAdresse(null)
  }, [timeplanArrangement])

  // KUN for å løfte den forankrede bunn-blokka (#714) over tastaturet. Den
  // ustabile hooken er ok her fordi siden er scroll-låst (effekten under).
  // Chat-panelet ligger i flyt og bruker den ikke (se CLAUDE.md § Policy:
  // Skrivefelt og iOS-tastatur).
  const tastaturOffset = useKeyboardOffset()

  // Kartsiden låser sidescroll så lenge den er montert (#706): layoutens
  // 100vh er større enn kartflatens 100dvh på iOS, og tomrommet lot siden
  // scrolle bak kartet så knappene forsvant ut av skjermen.
  useEffect(() => {
    // BÅDE <html> og <body>: <html> er scroll-containeren, så body alene holdt
    // ikke. overscrollBehavior i tillegg fordi `hidden` alene ikke stopper
    // iOS' rubber-band.
    const html = document.documentElement
    const body = document.body
    const forrige = {
      htmlOverflow: html.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
    }
    html.style.overflow = 'hidden'
    html.style.overscrollBehavior = 'none'
    body.style.overflow = 'hidden'
    body.style.overscrollBehavior = 'none'
    // Skjuler DeployInfo under kartet, som ga 44 px overflyt å rubber-bande i (se globals.css).
    body.classList.add('fullskjerm-side')
    return () => {
      // MÅ ryddes, ellers blir resten av appen uscrollbar. Pinnet i e2e.
      html.style.overflow = forrige.htmlOverflow
      html.style.overscrollBehavior = forrige.htmlOverscroll
      body.style.overflow = forrige.bodyOverflow
      body.style.overscrollBehavior = forrige.bodyOverscroll
      body.classList.remove('fullskjerm-side')
    }
  }, [])
  // Leaflet lastes asynkront. Uten flagget leser markør-effekten en lagRef som
  // ennå er null og kjører aldri igjen (punktene er uendret) — tomt kart.
  const [kartKlar, setKartKlar] = useState(false)

  const meg = menn.find(m => m.profilId === megId) ?? null
  const megDeler = meg !== null

  // Grunnlag for avstand-visning (#728). null når du ikke deler.
  const megPunkt = meg ? { lat: meg.spor.at(-1)!.lat, lng: meg.spor.at(-1)!.lng } : null

  // Til den optimistiske timeplan-raden (#716). Fra chatProfiler, ikke `meg`,
  // som krever aktiv deling.
  const megProfil = chatProfiler.find(p => p.id === megId) ?? null
  const megNavn = megProfil?.navn || 'Deg'
  const megBildeUrl = megProfil?.bilde_url ?? null
  const megRolle = megProfil?.rolle ?? null

  // Ett panel om gangen — to på 390 px ville latt igjen en stripe kart.
  const aapneListe = useCallback(() => {
    setAapentPanel(p => (p === 'liste' ? 'ingen' : 'liste'))
  }, [])

  const aapneChat = useCallback(() => {
    setAapentPanel(p => (p === 'chat' ? 'ingen' : 'chat'))
  }, [])

  const aapneTimeplan = useCallback(() => {
    setAapentPanel(p => (p === 'timeplan' ? 'ingen' : 'timeplan'))
  }, [])

  const endreTimeplanUtkast = useCallback(
    (patch: {
      dato?: string
      tekst?: string
      manuellKlokke?: string | null
      punkt?: { lat: number; lng: number } | null
      adresse?: string | null
    }) => {
      if (patch.dato !== undefined) setTimeplanDato(patch.dato)
      if (patch.tekst !== undefined) setTimeplanTekst(patch.tekst)
      if (patch.manuellKlokke !== undefined) setTimeplanManuellKlokke(patch.manuellKlokke)
      if (patch.punkt !== undefined) setTimeplanPunkt(patch.punkt)
      if (patch.adresse !== undefined) setTimeplanAdresse(patch.adresse)
    },
    [],
  )

  const senterPaa = useCallback((lat: number, lng: number) => {
    kartetRef.current?.flyTo([lat, lng], POSISJON_KART_ZOOM)
  }, [])

  // Egen posisjon oppdatert (#726): flytt kartet KUN hvis punktet er utenfor
  // utsnittet — ellers står det stille (ikke senterPaa()). maxZoom: getZoom()
  // hindrer at fitBounds zoomer INN.
  const taMedPosisjon = useCallback((lat: number, lng: number) => {
    const kart = kartetRef.current
    if (!kart) return
    const b = kart.getBounds()
    const bounds = { nord: b.getNorth(), syd: b.getSouth(), ost: b.getEast(), vest: b.getWest() }
    if (!trengerNyttUtsnitt(bounds, { lat, lng })) return
    kart.fitBounds(b.extend([lat, lng]), { padding: [50, 50], maxZoom: kart.getZoom() })
  }, [])

  // Fra en timeplan-rad: lukk panelet, ellers sentreres punktet bak det (#716).
  // Panelet er et overlegg, så sentreringen treffer uten å vente på utglidningen.
  const senterPaaFraTimeplan = useCallback(
    (lat: number, lng: number) => {
      setAapentPanel('ingen')
      senterPaa(lat, lng)
    },
    [senterPaa],
  )

  // Stedslenke til utklippstavlen (#719) — se lenkeKopiert-state over.
  const visLenkeKvittering = useCallback(() => {
    setLenkeFallback(null)
    setLenkeKopiert(true)
    if (lenkeKopiertTimer.current) window.clearTimeout(lenkeKopiertTimer.current)
    lenkeKopiertTimer.current = window.setTimeout(
      () => setLenkeKopiert(false),
      KART_LENKE_KOPIERT_KVITTERING_SEK * 1000,
    )
  }, [])

  const kopierLenke = useCallback((lat: number, lng: number, tekst: string) => {
    const lenke = byggStedLenke(window.location.origin, lat, lng, tekst)
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(lenke).then(visLenkeKvittering).catch(() => setLenkeFallback(lenke))
    } else {
      // Ingen Clipboard API (eldre WebKit, usikker kontekst) — rett til fallback.
      setLenkeFallback(lenke)
    }
  }, [visLenkeKvittering])

  const router = useRouter()
  const [friskerOpp, startFriskOpp] = useTransition()

  // Erstatter pull-to-refresh, som er av på den scroll-låste kartsiden (#718,
  // `draNedForOppdaterAv()` i lib/navigasjon.ts).
  const friskOppKartet = useCallback(() => {
    startFriskOpp(() => {
      router.refresh()
    })
  }, [router])

  // Lås på BEGGE ventetidene: flere feilgrener nullstiller (eller setter aldri)
  // `jobber` før friskOppKartet() er ferdig (#718).
  const opptatt = jobber || friskerOpp

  // `stille` = automatisk oppdatering ved sidelast: aldri feilmelding, aldri
  // flytte kartet — bare fylle på sporet.
  const hentOgLagre = useCallback(
    (stille: boolean) => {
      if (!stille) setFeil(null)
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        if (!stille) {
          setFeil('Denne telefonen gir ikke appen tilgang til posisjon.')
          // Ingen delPosisjon ⇒ ingen revalidatePath — frisk opp eksplisitt (#718).
          friskOppKartet()
        }
        return
      }
      if (!stille) setJobber(true)
      navigator.geolocation.getCurrentPosition(
        async pos => {
          // Async callback utenfor Reacts tre: et kast (f.eks. utløpt sesjon)
          // ville blitt en unhandled rejection i stedet for en beskjed.
          try {
            const svar = await delPosisjon(
              pos.coords.latitude,
              pos.coords.longitude,
              pos.coords.accuracy ?? null,
            )
            if (!stille) {
              setJobber(false)
              if (!svar.ok) {
                setFeil(svar.melding)
                // Feilet før revalidatePath — frisk opp eksplisitt (#718).
                friskOppKartet()
                return
              }
              taMedPosisjon(pos.coords.latitude, pos.coords.longitude)
            }
          } catch {
            if (!stille) {
              setJobber(false)
              setFeil('Klarte ikke lagre posisjonen. Prøv igjen.')
              friskOppKartet()
            }
          }
        },
        posFeil => {
          if (!stille) setJobber(false)
          // Tre ulike råd: en felles melding ville sendt ham til
          // innstillingene for en timeout han bare kunne prøvd på nytt.
          const klasse =
            posFeil.code === posFeil.PERMISSION_DENIED
              ? 'nektet'
              : posFeil.code === posFeil.TIMEOUT
                ? 'timeout'
                : 'utilgjengelig'
          if (!stille) {
            setFeil(
              klasse === 'nektet'
                ? 'Du må gi appen tilgang til posisjon i Innstillinger for å dele.'
                : klasse === 'timeout'
                  ? 'Fant ikke posisjonen i tide. Prøv igjen — gjerne utendørs.'
                  : 'Telefonen fant ingen posisjon akkurat nå. Prøv igjen om litt.',
            )
          }
          // Warn, ikke error: et nei er ingen programfeil, men raden avslører om
          // iOS-PWA-en glemmer tillatelsen mellom økter — derfor `auto-`-prefikset
          // på den stille oppdateringen.
          sendFeilBeacon(
            'klient.posisjon.nektet',
            posFeil.message || klasse,
            undefined,
            { fingerprint: stille ? `auto-${klasse}` : klasse },
            'warn',
          )
          // Ingen revalidatePath her heller — «Oppdater» skal likevel hente
          // andres bevegelser (#718).
          if (!stille) friskOppKartet()
        },
        // GPS, ikke mast/wifi: ±1500 m er ubrukelig for å finne hverandre i en gate.
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      )
    },
    [taMedPosisjon, friskOppKartet],
  )

  // Automatisk oppdatering ved sidelast, KUN for den som allerede deler (ingen
  // uventet tillatelsesdialog). Uten den blir sporet bare de få knappetrykkene,
  // og pling-varselet virker fordi det å åpne appen ER oppdateringen.
  useEffect(() => {
    if (!megDeler) return
    hentOgLagre(true)
    // Kun ved montering, ikke en løpende puls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Leaflet importeres i effekten: den rører `window` ved import (kaster under
  // SSR), og resten av appen slipper å bære den.
  useEffect(() => {
    let avbrutt = false
    // Utenfor .then(), så cleanup kan rydde den før Leaflet er lastet.
    let ventId: number | undefined
    const node = kartRef.current
    if (!node) return

    import('leaflet').then(mod => {
      if (avbrutt || kartetRef.current) return
      const L = mod.default

      // Startutsnittet rammer inn HOVEDTYNGDEN, ikke alt (#735). Posisjoner og
      // markeringer sendes HVER FOR SEG — se lib/kart-klynge.ts.
      const posisjonspunkter: [number, number][] = menn.flatMap(m => {
        const siste = m.spor[m.spor.length - 1]
        return siste ? [[siste.lat, siste.lng] as [number, number]] : []
      })
      const markeringspunkter: [number, number][] = markeringer.map(
        mk => [mk.lat, mk.lng] as [number, number],
      )
      // Et delt sted (#719, #753) vinner startutsnittet: mannen trykket lenken
      // for å se DET stedet, så klynging og fitBounds hoppes over.
      const punkterIUtsnittet: [number, number][] = deltSted
        ? []
        : velgKlyngeUtsnitt(posisjonspunkter, markeringspunkter)

      // Ankomst via delt lenke (#753): kartet FØDES vidt og flys synlig inn.
      // Planlagt før konstruksjon fordi startZoom brukes i options.
      const ankomst = deltSted ? planleggAnkomst(foretrekkerRedusertBevegelse()) : null
      // Målet denne ankomsten gjelder; post-mount-effekten stempler samme ref
      // når den overtar med et nytt mål (#753).
      const ankomstKey = deltStedKey

      const kart = L.map(node, {
        center: deltSted ? [deltSted.lat, deltSted.lng] : (punkterIUtsnittet[0] ?? [fallbackSenter.lat, fallbackSenter.lng]),
        zoom: deltSted
          ? ankomst!.startZoom
          : punkterIUtsnittet.length > 0
            ? POSISJON_KART_ZOOM
            : POSISJON_KART_FALLBACK_ZOOM,
        // Mobil-PWA: man kniper.
        zoomControl: false,
        attributionControl: true,
      })

      // maxZoom: to punkter i samme kvartal skal ikke zoome inn på husnummer.
      if (!deltSted && punkterIUtsnittet.length > 1) {
        kart.fitBounds(L.latLngBounds(punkterIUtsnittet), {
          padding: [50, 50],
          maxZoom: POSISJON_KART_ZOOM,
        })
      }

      // Ankomstflyvningen venter på at DENNE flisrunden er tegnet (#753).
      const flisLag = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        // Attribusjon er et VILKÅR for OSMs fliser.
        attribution: '&copy; OpenStreetMap',
      }).addTo(kart)

      // Trykk på kartflaten lukker et åpent panel (#721, #722). INGEN scrim-div:
      // den ville svelget panorering (vaktet i e2e). Interaktive markører/
      // tooltips stopper propagering selv, så dette griper kun flaten.
      kart.on('click', () => setAapentPanel('ingen'))

      lagRef.current = L.layerGroup().addTo(kart)
      kartetRef.current = kart
      setKartKlar(true)
      // Leaflet måler ved init, mens layouten (fonter, safe-area) kan være
      // uferdig — da dekker flisene bare deler av ruta.
      requestAnimationFrame(() => kart.invalidateSize())

      // Innzooming mot delt sted (#753): 'load' (startfliser tegnet, ikke zoom
      // over grå flate) eller timeout som fail-open — én guard.
      let harFlydd = false
      if (ankomst?.animer) {
        const start = () => {
          if (avbrutt || harFlydd || !kartetRef.current) return
          // En NY steds-lenke trykket mens vi ventet (#753) er alt håndtert av
          // post-mount-effekten — ikke dra ham tilbake til det gamle målet.
          if (forrigeDeltStedKey.current !== ankomstKey) return
          harFlydd = true
          window.clearTimeout(ventId)
          // Samme grunn som invalidateSize over.
          kart.invalidateSize()
          kart.flyTo([deltSted!.lat, deltSted!.lng], ankomst.sluttZoom, {
            duration: ankomst.varighetSek,
          })
        }
        flisLag.once('load', start)
        ventId = window.setTimeout(start, KART_DELT_STED_FLY_VENT_MS)
      }
    })

    return () => {
      avbrutt = true
      window.clearTimeout(ventId)
      kartetRef.current?.remove()
      kartetRef.current = null
      lagRef.current = null
      setKartKlar(false)
    }
    // Én gang: props leses kun for STARTutsnittet; endringer tegnes av effekten under.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Langtrykk på kartflaten (#762): punktet panoreres inn under siktet og steg
  // 'sted' startes — er siktet alt oppe, panoreres det bare.
  //
  // Egne DOM-lyttere, ikke map.on('contextmenu'): Leaflets tapHold har
  // hardkodet forsinkelse og er kun på for iOS Safari. Samme terskler som
  // boble-gesten (#719) gir lik oppførsel på iOS og Android.
  //
  // deps [kartKlar], ikke [steg]: se stegRef.
  useEffect(() => {
    if (!kartKlar) return
    const node = kartRef.current
    const kart = kartetRef.current
    if (!node || !kart) return

    let holdTimer: number | null = null
    let klar = false
    let start = { x: 0, y: 0 }
    // Telles selv, IKKE via e.isPrimary — jsdom setter den false som default,
    // og en isPrimary-vakt ville gjort testene grønne uten å bevise noe.
    let aktivPeker: number | null = null

    const avbrytHold = () => {
      if (holdTimer !== null) {
        window.clearTimeout(holdTimer)
        holdTimer = null
      }
      klar = false
      setPresseRing(null)
    }

    const pointerDown = (e: PointerEvent) => {
      // Ingen pointerType-sil (#796): touch er eneste målflate, og et drag
      // (også e2e-ens mus-drag) passerer bevegelsesterskelen lenge før timeren.
      if (aktivPeker !== null) {
        // En ANDRE peker = knipe-gest, ikke langtrykk.
        avbrytHold()
        return
      }
      // 'tekst': koordinatet er låst (#702). 'sok': eget panel, ingen
      // parallell markeringsflyt (#757).
      if (stegRef.current === 'tekst' || stegRef.current === 'sok') return
      // Langtrykk på en markering/kontroll skal ikke OGSÅ starte en ny (#719).
      // Eksplisitt sil, ikke avhengig av boblas stopPropagation(). Ikke
      // '.leaflet-marker-icon' (#700): den står også på ikke-interaktive ansikter.
      const target = e.target as HTMLElement
      if (
        target.closest(
          '.leaflet-tooltip, .leaflet-popup, .leaflet-control, .leaflet-interactive',
        )
      ) {
        return
      }
      aktivPeker = e.pointerId
      start = { x: e.clientX, y: e.clientY }
      klar = false
      holdTimer = window.setTimeout(() => {
        klar = true
        const rect = node.getBoundingClientRect()
        setPresseRing({ x: e.clientX - rect.left, y: e.clientY - rect.top })
      }, LONG_PRESS_MS)
    }

    const pointerMove = (e: PointerEvent) => {
      // Under panorering ryddes timeren etter de første pikslene — tidlig retur deretter.
      if (holdTimer === null) return
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      if (dx * dx + dy * dy > LONG_PRESS_BEVEGELSE_PX ** 2) avbrytHold()
    }

    const pointerUp = (e: PointerEvent) => {
      const varKlar = klar
      avbrytHold()
      aktivPeker = null
      if (!varKlar) return
      // PointerEvent arver MouseEvent, så Leaflets hjelper virker direkte.
      startMarkeringFraLangtrykk(kart.mouseEventToLatLng(e))
    }

    const pointerCancel = () => {
      avbrytHold()
      aktivPeker = null
    }

    // Android-benet av det -webkit-touch-callout løser på iOS (se kart.css).
    const kontekstmeny = (e: Event) => e.preventDefault()

    // Touch har implisitt pointer capture — pointerup kommer hit selv utenfor
    // containeren, så ingen document-lyttere trengs.
    node.addEventListener('pointerdown', pointerDown, { passive: true })
    node.addEventListener('pointermove', pointerMove, { passive: true })
    node.addEventListener('pointerup', pointerUp, { passive: true })
    node.addEventListener('pointercancel', pointerCancel, { passive: true })
    node.addEventListener('contextmenu', kontekstmeny)

    return () => {
      node.removeEventListener('pointerdown', pointerDown)
      node.removeEventListener('pointermove', pointerMove)
      node.removeEventListener('pointerup', pointerUp)
      node.removeEventListener('pointercancel', pointerCancel)
      node.removeEventListener('contextmenu', kontekstmeny)
      if (holdTimer !== null) window.clearTimeout(holdTimer)
      setPresseRing(null)
    }
    // Registreres ÉN gang; steg via stegRef, startMarkeringFraLangtrykk er stabil.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kartKlar])

  // Modus-toggelen endrer flatens høyde uten remount, og Leaflet merker ikke
  // en ren CSS-høydeendring — ellers en stripe uten fliser i bunnen.
  useEffect(() => {
    if (!kartetRef.current) return
    requestAnimationFrame(() => kartetRef.current?.invalidateSize())
  }, [reisemodus])

  useEffect(() => {
    if (!kartKlar) return
    const lag = lagRef.current
    if (!lag) return
    let avbrutt = false

    import('leaflet').then(mod => {
      if (avbrutt) return
      const L = mod.default
      lag.clearLayers()

      // Markeringene FØRST, så personmarkørene (ferskere info) legger seg oppå.
      for (const mk of markeringer) {
        const markoer = L.marker([mk.lat, mk.lng], {
          // Usynlig 1×1-anker; bobla er det man ser og trykker på (#708).
          icon: L.divIcon({ html: '', className: 'kart-markering-anker', iconSize: [1, 1] }),
          alt: mk.tekst,
          title: `${mk.tekst} — ${mk.avNavn}, ${relativTid(mk.opprettet)}`,
          // Klikket er bundet til bobla — ellers en umulig-å-treffe 1×1-trykkflate (#700).
          interactive: false,
        })
          .bindTooltip(
            // Halen er et eget element (se .kart-boble-hale i kart.css).
            `<span class="kart-boble-symbol" aria-hidden="true">${esc(mk.emoji)}</span><span class="kart-boble-tekst">${esc(mk.tekst)}</span><span class="kart-boble-hale" aria-hidden="true"></span>`,
            {
              permanent: true,
              // Bobla over punktet; offset løfter den så halen lander på koordinatet.
              direction: 'top',
              offset: [0, -4],
              className: 'kart-markering-etikett',
              interactive: true,
            },
          )
          .on('click', () => setValgtMarkering(mk.id))
          .addTo(lag)

        // Halen står mot venstre ende (#708), mens Leaflet sentrerer tooltipen —
        // forskyv bobla tilsvarende. MÅLT, fordi bredden følger teksten.
        // getTooltip().getElement(): markoer.getElement() er 1×1-ankeret.
        const boble = markoer.getTooltip()?.getElement()
        if (boble) {
          boble.style.marginLeft = `${boble.offsetWidth / 2 - HALE_FRA_VENSTRE}px`

          // Langtrykk kopierer stedslenken (#719); DOM-lyttere fordi bobla er
          // utenfor Reacts tre.
          //
          // KRITISK: timeren setter KUN `klar`. Clipboard-skrivingen skjer i
          // pointerup — Safari avviser den fra en setTimeout-callback.
          let holdTimer: number | null = null
          let klar = false
          let start = { x: 0, y: 0 }

          const avbrytHold = () => {
            if (holdTimer !== null) {
              window.clearTimeout(holdTimer)
              holdTimer = null
            }
            klar = false
          }

          boble.addEventListener('pointerdown', (e: PointerEvent) => {
            start = { x: e.clientX, y: e.clientY }
            klar = false
            holdTimer = window.setTimeout(() => {
              klar = true
            }, LONG_PRESS_MS)
          })
          boble.addEventListener('pointermove', (e: PointerEvent) => {
            if (holdTimer === null) return
            const dx = e.clientX - start.x
            const dy = e.clientY - start.y
            if (dx * dx + dy * dy > LONG_PRESS_BEVEGELSE_PX ** 2) avbrytHold()
          })
          boble.addEventListener('pointerup', (e: PointerEvent) => {
            const varKlar = klar
            avbrytHold()
            if (!varKlar) return
            // Ikke også Leaflets 'click' (detaljpanelet) — langtrykk er ÉN handling.
            e.preventDefault()
            e.stopPropagation()
            kopierLenke(mk.lat, mk.lng, mk.tekst)
          })
          boble.addEventListener('pointercancel', avbrytHold)
          boble.addEventListener('pointerleave', avbrytHold)
        }
      }

      for (const m of menn) {
        const erMeg = m.profilId === megId
        const siste = m.spor.at(-1)
        if (!siste) continue

        // Linja FØRST, ellers går streken tvers over ansiktene.
        if (m.spor.length > 1) {
          L.polyline(
            m.spor.map(p => [p.lat, p.lng] as [number, number]),
            {
              className: erMeg ? 'kart-rute kart-rute-meg' : 'kart-rute',
              weight: 3,
              opacity: 0.55,
              // SVG-attributtet overstyrer klassen; var() virker der og følger temaet.
              color: erMeg ? 'var(--accent)' : 'var(--text-tertiary)',
              interactive: false,
            },
          ).addTo(lag)
        }

        for (const p of m.spor.slice(0, -1)) {
          L.marker([p.lat, p.lng], {
            icon: L.divIcon({
              html: sporPrikkHtml(m.navn),
              className: '',
              iconSize: [SPOR_PRIKK_PX, SPOR_PRIKK_PX],
              iconAnchor: [SPOR_PRIKK_PX / 2, SPOR_PRIKK_PX / 2],
            }),
            alt: `${m.navn} var her`,
            title: `${m.navn} — ${relativTid(p.registrert)}`,
            interactive: false,
          }).addTo(lag)
        }

        // ±1500 m og ±10 m ser like ut som prikker. Kun siste punkt, og kun når
        // usikkerheten betyr noe på gatenivå.
        if (siste.noeyaktighetM != null && siste.noeyaktighetM > 50) {
          L.circle([siste.lat, siste.lng], {
            radius: siste.noeyaktighetM,
            className: 'kart-usikkerhet',
            stroke: false,
            fillOpacity: 0,
            interactive: false,
          }).addTo(lag)
        }

        L.marker([siste.lat, siste.lng], {
          icon: L.divIcon({
            html: markoerHtml(m.navn, m.bildeUrl, m.rolle, erFersk(siste.registrert), erMeg),
            className: '',
            iconSize: [MARKOER_PX, MARKOER_PX],
            iconAnchor: [MARKOER_PX / 2, MARKOER_PX / 2],
          }),
          alt: m.navn,
          title: `${m.navn} — ${relativTid(siste.registrert)}`,
          // Ingen handling: trykk og langtrykk virker som på tom kartflate (#700).
          interactive: false,
          keyboard: false,
        }).addTo(lag)
      }
    })

    return () => {
      avbrutt = true
    }
  }, [menn, markeringer, megId, kartKlar, kopierLenke])

  // Nøkkelen, ikke objektet, er dep-en (#719): `deltSted` er nytt ved hver RSC-render.
  const deltStedKey = deltSted ? `${deltSted.lat},${deltSted.lng},${deltSted.tekst ?? ''}` : null

  // Markør for det delte stedet (#719). Egen ref, IKKE lagRef — den tømmes
  // hver gang menn/markeringer tegnes på nytt.
  const deltStedMarkerRef = useRef<LeafletMarker | null>(null)
  useEffect(() => {
    if (!kartKlar || !deltSted) return
    let avbrutt = false
    import('leaflet').then(mod => {
      if (avbrutt) return
      const L = mod.default
      const kart = kartetRef.current
      if (!kart) return
      const markoer = L.marker([deltSted.lat, deltSted.lng], {
        icon: L.divIcon({
          html: '<div class="kart-delt-sted-naal" aria-hidden="true">📍</div>',
          className: '',
          iconSize: [30, 30],
          iconAnchor: [15, 28],
        }),
        alt: deltSted.tekst ?? 'Delt sted',
        title: deltSted.tekst ?? 'Delt sted',
        // Ingen handling, som person-markøren (#700).
        interactive: false,
        keyboard: false,
      }).addTo(kart)
      const el = markoer.getElement()
      if (el) el.setAttribute('data-testid', 'delt-sted')
      deltStedMarkerRef.current = markoer
    })
    return () => {
      avbrutt = true
      deltStedMarkerRef.current?.remove()
      deltStedMarkerRef.current = null
    }
    // Dep-en er nøkkelen, ikke deltSted — se deltStedKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kartKlar, deltStedKey])

  // Treffnåla for et valgt søketreff (#757): privat og midlertidig, kun mens
  // steg === 'sok'. Egen LayerGroup, ikke lagRef (som tømmes ved hver tegning).
  const sokLagRef = useRef<LayerGroup | null>(null)
  useEffect(() => {
    if (!kartKlar) return
    let avbrutt = false
    import('leaflet').then(mod => {
      if (avbrutt) return
      const L = mod.default
      const kart = kartetRef.current
      if (!kart) return
      if (!sokLagRef.current) sokLagRef.current = L.layerGroup().addTo(kart)
      const lag = sokLagRef.current
      lag.clearLayers()
      if (steg !== 'sok' || !sokValgt) return
      const markoer = L.marker([sokValgt.lat, sokValgt.lng], {
        icon: L.divIcon({
          html: '<div class="kart-sok-naal" aria-hidden="true">📍</div>',
          className: '',
          iconSize: [30, 30],
          iconAnchor: [15, 28],
        }),
        alt: sokValgt.navn,
        title: sokValgt.navn,
        // Ren visning, i motsetning til en ekte markeringsboble.
        interactive: false,
        keyboard: false,
      }).addTo(lag)
      const el = markoer.getElement()
      if (el) el.setAttribute('data-testid', 'sted-sok-naal')
    })
    return () => {
      avbrutt = true
    }
  }, [kartKlar, steg, sokValgt])

  // Flyr til et NYTT delt sted etter mount (#719, #753) — lenke trykket i
  // chat-panelet mens man står på /kart (ingen remount). Startutsnittet tas av
  // init-effekten. Ingen flis-venting: kartet er alt tegnet, kun målet er nytt.
  const forrigeDeltStedKey = useRef<string | null>(deltStedKey)
  useEffect(() => {
    if (deltStedKey === forrigeDeltStedKey.current) return

    // Lenken fjernet: stemple likevel, så samme sted delt på nytt teller som endring.
    if (!deltStedKey || !deltSted) {
      forrigeDeltStedKey.current = deltStedKey
      return
    }

    // Kartet ikke bygget ennå: IKKE stemple — effekten kjører igjen når
    // `kartKlar` slår om. Nøkkelen konsumeres når flyvningen har LYKTES.
    if (!kartKlar) return
    const kart = kartetRef.current
    if (!kart) return

    forrigeDeltStedKey.current = deltStedKey
    const ankomst = planleggAnkomst(foretrekkerRedusertBevegelse())
    if (ankomst.animer) {
      kart.flyTo([deltSted.lat, deltSted.lng], ankomst.sluttZoom, {
        duration: ankomst.varighetSek,
      })
    } else {
      kart.setView([deltSted.lat, deltSted.lng], ankomst.sluttZoom, { animate: false })
    }
  }, [deltStedKey, kartKlar, deltSted])

  const stoppNaa = useCallback(async () => {
    setFeil(null)
    setJobber(true)
    const svar = await stoppDeling()
    setJobber(false)
    if (!svar.ok) setFeil(svar.melding)
  }, [])

  useEffect(() => {
    const timere = plingTimere
    return () => {
      for (const id of timere.current) window.clearTimeout(id)
      timere.current = []
    }
  }, [])

  useEffect(() => {
    return () => {
      if (lenkeKopiertTimer.current) window.clearTimeout(lenkeKopiertTimer.current)
    }
  }, [])

  // Markeringen fjernet eller utløpt: lukk detaljpanelet.
  useEffect(() => {
    if (valgtMarkering && !markeringer.some(m => m.id === valgtMarkering)) {
      setValgtMarkering(null)
    }
  }, [markeringer, valgtMarkering])

  // Markeringen settes der SIKTET står (kartsenteret), ikke der GPS-en sier du
  // er (#700): stedet er synlig før lagring, og man kan markere et sted man
  // ikke står. Steg 1 → 2: lås stedet og gå til teksten.
  const bekreftSted = useCallback(() => {
    const kart = kartetRef.current
    if (!kart) {
      setFeil('Kartet er ikke klart ennå. Prøv igjen om et øyeblikk.')
      return
    }
    const senter = kart.getCenter()
    setValgtSted({ lat: senter.lat, lng: senter.lng })
    setFeil(null)
    setStedKilde('knapp')
    setSteg('tekst')
  }, [])

  // Langtrykk-commit (#762): punktet panoreres inn under siktet i sentrum, så
  // bekreftSted() sin getCenter() forblir eneste sannhetskilde.
  //
  // SYNKRONT (animate: false): animert ville et raskt «Her er det» låst et
  // koordinat midt i animasjonen. Vaktet av «bekreft umiddelbart etter slipp»
  // i __tests__/kart-langtrykk.test.tsx.
  const startMarkeringFraLangtrykk = useCallback((latlng: LatLng) => {
    const kart = kartetRef.current
    if (!kart) return
    setPresseRing(null)
    setAapentPanel('ingen')
    setValgtMarkering(null)
    kart.panTo(latlng, { animate: false })
    setFeil(null)
    setStedKilde('langtrykk')
    // 'av' → 'sted'. 'sted'/'timeplan-punkt': bare panorer. 'tekst'/'sok' er
    // silt bort i pointerdown.
    setSteg(gjeldende => (gjeldende === 'av' ? 'sted' : gjeldende))
  }, [])

  const avbrytMarkering = useCallback(() => {
    setSteg('av')
    setMarkeringTekst('')
    setMarkeringSymbol(STANDARD_SYMBOL)
    setValgtSted(null)
    setFeil(null)
    setStedKilde('knapp')
  }, [])

  // Punktvalg for en timeplan-post (#716) — samme sikte, steg 'timeplan-punkt'.
  // Panelet glir ut og inn igjen; utkastet overlever i egen state.
  const startTimeplanPunktvalg = useCallback(() => {
    setAapentPanel('ingen')
    setFeil(null)
    setSteg('timeplan-punkt')
  }, [])

  const bekreftTimeplanPunkt = useCallback(() => {
    const kart = kartetRef.current
    if (!kart) {
      setFeil('Kartet er ikke klart ennå. Prøv igjen om et øyeblikk.')
      return
    }
    const senter = kart.getCenter()
    setTimeplanPunkt({ lat: senter.lat, lng: senter.lng })
    setFeil(null)
    // Langtrykk/søk under punktvalget satte stedKilde — nullstill, ellers får
    // neste «Sett markering» feil hjelpetekst.
    setStedKilde('knapp')
    setSteg('av')
    setAapentPanel('timeplan')
  }, [])

  const avbrytTimeplanPunkt = useCallback(() => {
    setFeil(null)
    setStedKilde('knapp')
    setSteg('av')
    setAapentPanel('timeplan')
  }, [])

  // ── Stedssøk (#757) ────────────────────────────────────────────────────
  const startStedSok = useCallback(() => {
    setAapentPanel('ingen')
    setValgtMarkering(null)
    setFeil(null)
    setSokValgt(null)
    setSteg('sok')
  }, [])

  // Ren visning — ingenting lagres før markerFraSokTreff/leggSokTreffITimeplan.
  const velgSokTreff = useCallback((treff: StedTreff) => {
    setSokValgt(treff)
    const kart = kartetRef.current
    if (!kart) return
    if (foretrekkerRedusertBevegelse()) {
      kart.setView([treff.lat, treff.lng], POSISJON_KART_ZOOM, { animate: false })
    } else {
      kart.flyTo([treff.lat, treff.lng], POSISJON_KART_ZOOM)
    }
  }, [])

  // Via SAMME sikte/«Her er det» som knappen og langtrykket (#757) — kun
  // bekreftSted() lager en delt markering. Synkron panTo, se startMarkeringFraLangtrykk.
  const markerFraSokTreff = useCallback((treff: StedTreff) => {
    const kart = kartetRef.current
    if (kart) kart.panTo([treff.lat, treff.lng], { animate: false })
    setSokValgt(null)
    setFeil(null)
    setStedKilde('sok')
    setSteg('sted')
  }, [])

  // Fyller punktet, og teksten KUN hvis den er tom. Adressen NULLSTILLES:
  // adresse vinner over punkt ved navigering, så en gammel adresse ville
  // sendt folk feil sted (#757).
  const leggSokTreffITimeplan = useCallback((treff: StedTreff) => {
    setTimeplanPunkt({ lat: treff.lat, lng: treff.lng })
    setTimeplanAdresse(null)
    setTimeplanTekst(t => (t.trim() ? t : treff.navn))
    setSokValgt(null)
    setFeil(null)
    setSteg('av')
    setAapentPanel('timeplan')
  }, [])

  const nyttStedSok = useCallback(() => {
    setSokValgt(null)
  }, [])

  const avbrytStedSok = useCallback(() => {
    setSokValgt(null)
    setFeil(null)
    setSteg('av')
  }, [])

  const lagreMarkering = useCallback(async () => {
    const tekst = markeringTekst.trim()
    if (!tekst) {
      setFeil('Skriv hva markeringen gjelder.')
      return
    }
    if (!valgtSted) {
      setFeil('Velg stedet på kartet først.')
      setSteg('sted')
      return
    }
    setFeil(null)
    setJobber(true)
    try {
      const svar = await settMarkering(valgtSted.lat, valgtSted.lng, tekst, markeringSymbol)
      setJobber(false)
      if (!svar.ok) {
        setFeil(svar.melding)
        return
      }
      setMarkeringTekst('')
      setMarkeringSymbol(STANDARD_SYMBOL)
      setValgtSted(null)
      setSteg('av')
    } catch {
      setJobber(false)
      setFeil('Klarte ikke lagre markeringen. Prøv igjen.')
    }
  }, [markeringTekst, valgtSted, markeringSymbol])

  const fjernMarkering = useCallback(async (id: string) => {
    setFeil(null)
    try {
      const svar = await slettMarkering(id)
      if (!svar.ok) {
        setFeil(svar.melding)
        return
      }
      setFjernedeMarkeringer(f => new Set(f).add(id))
      setValgtMarkering(null)
    } catch {
      setFeil('Klarte ikke fjerne markeringen. Prøv igjen.')
    }
  }, [])

  const pling = useCallback(async (profilId: string, navn: string) => {
    setFeil(null)

    // OPTIMISTISK: knappen reagerer på trykket, ikke serveren — sendVarsel()
    // er treg nok til at knappen ellers ser død ut (#705).
    const rullTilbake = () => {
      setPlinget(null)
      setNyligPlinget(f => {
        const neste = { ...f }
        delete neste[profilId]
        return neste
      })
    }

    setPlinget(navn)
    setNyligPlinget(f => ({ ...f, [profilId]: true }))
    const id = window.setTimeout(rullTilbake, POSISJON_PLING_KVITTERING_SEK * 1000)
    plingTimere.current.push(id)

    try {
      await plingEtterPosisjon(profilId)
    } catch {
      // Varselet ER handlingen — ingen grønn kvittering på noe som ikke ble
      // sendt (se CLAUDE.md § Policy: Varsler).
      window.clearTimeout(id)
      rullTilbake()
      setFeil(`Fikk ikke sendt pling til ${navn}. Prøv igjen.`)
    }
  }, [])

  const antallPaaKartet = menn.length + markeringer.length

  // «Timeplan · 17:00» (#716): neste post fra SERVERENS liste. Bevisst: en
  // post lagt til optimistisk i denne økten vises ikke her før neste sidelast.
  const nesteTimeplanKlokke = (() => {
    const kommende = timeplanPoster
      .filter(p => new Date(p.tidspunkt).getTime() >= Date.now())
      .sort((a, b) => new Date(a.tidspunkt).getTime() - new Date(b.tidspunkt).getTime())
    return kommende[0] ? formaterDato(kommende[0].tidspunkt, 'HH:mm') : null
  })()

  // Samme knapp for stille symboler og Alert zone (#763). KlubbSymbol, ikke
  // register-unionen — se lib/markering-symboler.ts.
  const { stille: symbolerStille, varsler: symbolerVarsler } = partisjonerSymboler(symboler)
  function symbolKnapp(sym: KlubbSymbol) {
    const valgt = markeringSymbol === sym.id
    return (
      <button
        key={sym.id}
        type="button"
        onClick={() => setMarkeringSymbol(sym.id)}
        aria-pressed={valgt}
        // Rammen sier ingenting til skjermleser; etiketten først holder «label in name».
        aria-label={sym.varsel ? `${sym.etikett} — varsler alle i klubben` : undefined}
        data-testid={`symbol-${sym.id}`}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          // Sonens padding gjør raden høyere og strekker de stille knappene;
          // center holder emojiene på linje (forutsetter symmetrisk SONE_PAD).
          justifyContent: 'center',
          gap: 2,
          padding: '8px 4px',
          borderRadius: 'var(--radius-small)',
          // Ramme OG bakgrunn — ramme alene er lett å overse over et kart.
          border: valgt ? '1px solid var(--accent)' : '0.5px solid var(--border)',
          background: valgt ? 'var(--accent-soft)' : 'transparent',
          color: valgt ? 'var(--text-primary)' : 'var(--text-secondary)'
        }}
      >
        <span style={{ fontSize: 20, lineHeight: 1 }} aria-hidden="true">
          {sym.emoji}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
          }}
        >
          {sym.etikett}
        </span>
      </button>
    )
  }

  return (
    <div
      data-testid="kart-flate"
      style={{
        // `relative`, IKKE `fixed` (#706): `.page-enter` i layouten har en
        // transform, som blir containing block for fixed — kartet forsvant.
        // Med siden scroll-låst (effekten over) er absolute-overlays like faste.
        position: 'relative',
        // TopHeader er `--top-header-h` PLUSS topp-innsettet i padding — begge
        // må trekkes fra, ellers stikker bunn-knappene ut av skjermen (#707).
        // I kartmodus (#723) er TopHeader ikke montert.
        height: reisemodus
          ? '100dvh'
          : 'calc(100dvh - var(--top-header-h) - var(--safe-top, 0px))',
        width: '100%',
        overflow: 'hidden',
        // Stopper iOS' rubber-band, som ellers drar overlayene ut av skjermen.
        overscrollBehavior: 'none',
        background: 'var(--bg-elevated)',
        // Eneste kilde til topp-innsett for kart-panelene (#723). Med header
        // har flaten alt rykket under notchen (0px, ellers telles den dobbelt);
        // i kartmodus må panelene legge det inn selv. Invariant: se CLAUDE.md
        // § Policy: Navigasjon.
        '--kart-panel-safe-top': reisemodus ? 'var(--safe-top, 0px)' : '0px',
        // ReisemodusBar sin reserverte høyde; verdien eies av ReisemodusBar (#723).
        '--kart-topp-sone': reisemodus ? `${REISEMODUS_BAR_SONE}px` : '0px',
      } as React.CSSProperties}
    >
      <div ref={kartRef} data-testid="posisjonskart" style={{ position: 'absolute', inset: 0 }} />

      {/* ── Reisemodus-bar ───────────────────────────────────────────────────
          Erstatter TopHeader i kartmodus: avatar + ulest-prikk + toggle,
          samme hjørne som i vanlig modus (#723). */}
      {reisemodus && kartmodus && (
        <ReisemodusBar zIndex={Z.KNAPPER} modus={kartmodus} />
      )}

      {/* ── Knapperad, oppå kartet ───────────────────────────────────────────
          Små piller (#704). pointerEvents:none på wrapperen så kartet kan
          panoreres mellom pillene. */}
      <div
        style={{
          position: 'absolute',
          // --kart-topp-sone: i kartmodus deler raden hjørnet med ReisemodusBar,
          // og en wrappet pille la seg ellers oppå togglen (#723).
          top: `calc(${KART_TOPP_MARGIN}px + var(--kart-topp-sone, 0px) + var(--kart-panel-safe-top, 0px))`,
          left: KART_TOPP_MARGIN,
          right: KART_TOPP_MARGIN,
          display: 'flex',
          flexWrap: 'wrap',
          // Radgap 8: pillene har 4 px usynlig treffflate opp/ned som ikke skal overlappe (#700)
          columnGap: 6,
          rowGap: 8,
          pointerEvents: 'none',
          zIndex: Z.KNAPPER,
        }}
      >
        {meg ? (
          <>
            <KartPille
              onClick={() => hentOgLagre(false)}
              disabled={opptatt}
              data-testid="del-knapp"
              pilleStil={{ ...PILLE_PRIMAER, opacity: opptatt ? 0.6 : 1 }}
            >
              {/* Teksten sier hvilken ventetid som pågår; GPS kommer før refresh. */}
              {jobber ? 'Henter …' : friskerOpp ? 'Oppdaterer …' : 'Oppdater'}
            </KartPille>
            <KartPille
              onClick={stoppNaa}
              disabled={opptatt}
              data-testid="stopp-knapp"
              pilleStil={{ ...PILLE, opacity: opptatt ? 0.6 : 1 }}
            >
              Slutt å dele
            </KartPille>
          </>
        ) : (
          <>
            <KartPille
              onClick={() => hentOgLagre(false)}
              disabled={opptatt}
              data-testid="del-knapp"
              pilleStil={{ ...PILLE_PRIMAER, opacity: opptatt ? 0.6 : 1 }}
            >
              {jobber ? 'Henter posisjon …' : 'Del posisjonen min'}
            </KartPille>
            {/* Eneste vei til friske data for den som ikke deler — pull-to-refresh
                er av på kartet (#718). Deler han, gjør «Oppdater» over jobben. */}
            <KartPille
              onClick={friskOppKartet}
              disabled={opptatt}
              data-testid="oppdater-kart-knapp"
              pilleStil={{ ...PILLE, opacity: opptatt ? 0.6 : 1 }}
            >
              {/* Bevisst: LÅSEN følger `opptatt` (ellers refresh i kappløp med
                  GPS-hentingen ved siden av), TEKSTEN kun `friskerOpp` («Henter …»
                  hører til naboen). Ikke «rett» det til én av delene (#718). */}
              {friskerOpp ? 'Oppdaterer …' : 'Oppdater'}
            </KartPille>
          </>
        )}

        {steg === 'av' && (
          <KartPille
            onClick={() => setSteg('sted')}
            data-testid="markering-start"
            pilleStil={PILLE}
          >
            Sett markering
          </KartPille>
        )}

        {/* Søk (#757): rund 44×44-ikonknapp, ikke tekstpille — raden wrapper
            allerede på 390 px. */}
        {steg === 'av' && (
          <button
            type="button"
            onClick={startStedSok}
            aria-label="Søk etter et sted"
            data-testid="sted-sok-start"
            style={{
              ...PILLE,
              width: 44,
              height: 44,
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              fontSize: 17,
            }}
          >
            <span aria-hidden="true">🔍</span>
          </button>
        )}

        {/* Timeplan-pilla (#716) viser KLOKKESLETT, ikke tekst — variabel
            lengde ville skjøvet de andre pillene ned over kartet. */}
        {timeplanArrangement && steg === 'av' && (
          <KartPille
            onClick={aapneTimeplan}
            aria-expanded={timeplanAapent}
            aria-label={timeplanAapent ? 'Lukk timeplanen' : 'Vis timeplanen'}
            data-testid="timeplan-pille"
            pilleStil={PILLE}
          >
            {nesteTimeplanKlokke ? `Timeplan · ${nesteTimeplanKlokke}` : 'Timeplan'}
          </KartPille>
        )}

      </div>

      {/* ── Ringen under et pågående langtrykk (#762) ───────────────────────
          Søsken av kartdiven (begge inset:0), så koordinatene fra pointerdown
          stemmer med og uten TopHeader. */}
      {presseRing && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: Z.SIKTE,
          }}
        >
          <span
            className="kart-presse-ring"
            data-testid="kart-presse-ring"
            style={{ position: 'absolute', left: presseRing.x, top: presseRing.y }}
          />
        </div>
      )}

      {/* ── Siktet ───────────────────────────────────────────────────────── */}
      {(steg === 'sted' || steg === 'timeplan-punkt') && (
        <div
          data-testid="markering-sikte"
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: Z.SIKTE,
          }}
        >
          <span className="kart-sikte" />
        </div>
      )}

      {/* ── Bunn-blokk: markeringsflyt, kvittering og feil ───────────────────
          Oppå kartet, kun når det er noe å si. */}
      {(steg !== 'av' || feil || plinget) && (
        <div
          data-testid="kart-steg-flate"
          style={{
            position: 'absolute',
            left: 10,
            right: 10,
            // Løftes over tastaturet (se tastaturOffset).
            bottom: `calc(10px + env(safe-area-inset-bottom, 0px) + ${tastaturOffset}px)`,
            background: 'var(--kart-flate-sterk)',
            border: '0.5px solid var(--kart-kant)',
            borderRadius: 18,
            padding: '14px 16px',
            boxShadow: 'var(--shadow-popover)',
            backdropFilter: 'var(--blur-card)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            zIndex: Z.BUNN,
          }}
        >
          {steg === 'sted' && (
            <>
              <div style={HJELPETEKST}>
                {stedKilde === 'langtrykk'
                  ? 'Krysset står der du holdt. Flytt kartet hvis det skal justeres.'
                  : stedKilde === 'sok'
                    ? 'Krysset står på treffet du valgte. Flytt kartet hvis det skal justeres.'
                    : 'Flytt kartet så krysset står der markeringen skal.'}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={bekreftSted}
                  // Låst til Leaflet er klar — bekreftSted() trenger kartsenteret (rutine i CI).
                  disabled={!kartKlar}
                  data-testid="markering-bekreft-sted"
                  style={{
                    ...PILLE_PRIMAER,
                    flex: 1,
                    pointerEvents: 'auto',
                    opacity: kartKlar ? 1 : 0.6,
                  }}
                >
                  Her er det
                </button>
                <button
                  type="button"
                  onClick={avbrytMarkering}
                  data-testid="markering-avbryt"
                  style={{ ...PILLE, pointerEvents: 'auto' }}
                >
                  Avbryt
                </button>
              </div>
            </>
          )}

          {steg === 'timeplan-punkt' && (
            <>
              <div style={HJELPETEKST}>Flytt kartet så krysset står der posten skal.</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={bekreftTimeplanPunkt}
                  disabled={!kartKlar}
                  data-testid="timeplan-punkt-bekreft"
                  style={{
                    ...PILLE_PRIMAER,
                    flex: 1,
                    pointerEvents: 'auto',
                    opacity: kartKlar ? 1 : 0.6,
                  }}
                >
                  Her er det
                </button>
                <button
                  type="button"
                  onClick={avbrytTimeplanPunkt}
                  data-testid="timeplan-punkt-avbryt"
                  style={{ ...PILLE, pointerEvents: 'auto' }}
                >
                  Avbryt
                </button>
              </div>
            </>
          )}

          {steg === 'tekst' && (
            <>
              <div style={HJELPETEKST}>Stedet er valgt. Hva er det som er der?</div>
              {/* Symbolet FØR teksten: det er symbolet man ser på avstand. */}
              {/* Stille knapper først, så Alert zone rundt de varslende (#763). */}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }} role="group" aria-label="Symbol">
                {symbolerStille.map(symbolKnapp)}
                {symbolerVarsler.length > 0 && (
                  <div
                    data-testid="alert-zone"
                    role="group"
                    aria-labelledby="alert-zone-etikett"
                    style={{
                      position: 'relative',
                      boxSizing: 'border-box',
                      display: 'flex',
                      gap: 8,
                      padding: SONE_PAD,
                      border: '1px solid var(--warning-border)',
                      borderRadius: 'var(--radius-small)',
                      // Basis = sonens egen breddekostnad (soneEkstra()), grow =
                      // antall knapper — så alle knapper i raden blir like brede.
                      flex: `${symbolerVarsler.length} 1 ${soneEkstra(symbolerVarsler.length)}px`,
                    }}
                  >
                    {/* Legend-effekt uten <fieldset>, som har WebKit-quirks med
                        display: flex. Versalene kommer fra textTransform. */}
                    <span
                      id="alert-zone-etikett"
                      style={{
                        position: 'absolute',
                        top: -7,
                        left: 8,
                        padding: '0 4px',
                        background: 'var(--kart-flate-sterk)',
                        color: 'var(--warning)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9,
                        letterSpacing: '0.5px',
                        textTransform: 'uppercase',
                        lineHeight: 1,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Alert zone
                    </span>
                    {symbolerVarsler.map(symbolKnapp)}
                  </div>
                )}
              </div>
              <input
                type="text"
                value={markeringTekst}
                onChange={e => setMarkeringTekst(e.target.value)}
                maxLength={KART_MARKERING_MAKS_LENGDE}
                placeholder="For eksempel: Vi sitter her"
                data-testid="markering-tekst"
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    lagreMarkering()
                  }
                }}
                style={{
                  fontFamily: 'var(--font-body)',
                  // Under 16px zoomer iOS inn og etterlater kartet forskjøvet.
                  fontSize: 16,
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-small)',
                  border: '0.5px solid var(--border)',
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  width: '100%',
                }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={lagreMarkering}
                  disabled={jobber}
                  data-testid="markering-lagre"
                  style={{ ...PILLE_PRIMAER, flex: 1, opacity: jobber ? 0.6 : 1 }}
                >
                  {jobber ? 'Lagrer …' : 'Lagre markering'}
                </button>
                <button
                  type="button"
                  onClick={() => setSteg('sted')}
                  data-testid="markering-tilbake"
                  style={PILLE}
                >
                  Tilbake
                </button>
              </div>
            </>
          )}

          {steg === 'sok' && (
            <StedSok
              hentNaer={() => {
                const senter = kartetRef.current?.getCenter()
                return senter ? { lat: senter.lat, lng: senter.lng } : null
              }}
              kanTimeplan={!!timeplanArrangement && !timeplanArrangement.blaatur}
              onVelg={velgSokTreff}
              onMarkering={markerFraSokTreff}
              onTimeplan={leggSokTreffITimeplan}
              onNyttSok={nyttStedSok}
              onAvbryt={avbrytStedSok}
            />
          )}

          {plinget && (
            <div role="status" style={{ ...HJELPETEKST, color: 'var(--success)' }}>
              Plinget {plinget}.
            </div>
          )}

          {feil && (
            <div role="alert" data-testid="kart-feil" style={{ ...HJELPETEKST, color: 'var(--danger)' }}>
              {feil}
            </div>
          )}
        </div>
      )}

      {/* ── Detaljpanel for en valgt markering ───────────────────────────── */}
      {valgtMarkering &&
        (() => {
          const mk = markeringer.find(m => m.id === valgtMarkering)
          if (!mk) return null
          return (
            <MarkeringDetalj
              markering={mk}
              loeftet={steg !== 'av' || feil !== null || plinget !== null}
              tastaturOffset={tastaturOffset}
              kanFjerne={mk.erMin || erAdmin}
              onFjern={() => fjernMarkering(mk.id)}
              onLukk={() => setValgtMarkering(null)}
              onKopierLenke={() => kopierLenke(mk.lat, mk.lng, mk.tekst)}
              megPunkt={megPunkt}
              zIndex={Z.DETALJ}
            />
          )
        })()}

      {/* ── Kvittering for kopiert stedslenke (#719) ────────────────────────
          Felles for «Kopier lenke» og langtrykk på en boble. */}
      {(lenkeKopiert || lenkeFallback) && (
        <div
          role="status"
          data-testid="lenke-kopiert-toast"
          style={{
            position: 'absolute',
            left: 10,
            right: 10,
            bottom: `calc(10px + env(safe-area-inset-bottom, 0px) + ${tastaturOffset}px)`,
            background: 'var(--kart-flate-sterk)',
            border: '0.5px solid var(--kart-kant)',
            borderRadius: 18,
            padding: '14px 16px',
            boxShadow: 'var(--shadow-popover)',
            backdropFilter: 'var(--blur-card)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            zIndex: Z.KOPIERT,
          }}
        >
          {lenkeKopiert && (
            <div style={{ ...HJELPETEKST, color: 'var(--success)' }}>Lenke kopiert.</div>
          )}
          {lenkeFallback && (
            <>
              <div style={HJELPETEKST}>
                Klarte ikke kopiere automatisk — marker og kopier lenken selv:
              </div>
              <input
                type="text"
                value={lenkeFallback}
                data-testid="lenke-fallback-felt"
                // IKKE readOnly: iOS Safari lar seg ikke markere i et readonly-felt
                // (#737). inputMode="none" holder tastaturet nede.
                inputMode="none"
                onChange={() => {}}
                ref={el => {
                  if (!el) return
                  el.focus()
                  // setSelectionRange, ikke select() — kun den virker i WebKit.
                  el.setSelectionRange(0, el.value.length)
                }}
                onFocus={e => e.currentTarget.setSelectionRange(0, e.currentTarget.value.length)}
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 16,
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-small)',
                  border: '0.5px solid var(--border)',
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  width: '100%',
                }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                {/* Et ekte click er den sikreste clipboard-gesten i WebKit —
                    sikrere enn pointerup etter langtrykk, som feilet hit (#737). */}
                <button
                  type="button"
                  onClick={() => {
                    const v = lenkeFallback
                    if (!v) return
                    navigator.clipboard
                      ?.writeText(v)
                      .then(visLenkeKvittering)
                      .catch(() => {
                        /* Fortsatt nektet — feltet over er eneste vei. */
                      })
                  }}
                  data-testid="lenke-fallback-kopier"
                  style={{ ...PILLE_PRIMAER, alignSelf: 'flex-start' }}
                >
                  Kopier
                </button>
                <button
                  type="button"
                  onClick={() => setLenkeFallback(null)}
                  data-testid="lenke-fallback-lukk"
                  style={{ ...PILLE, alignSelf: 'flex-start' }}
                >
                  Lukk
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Chat-panel på venstre side (#709) ────────────────────────────────
          Speiler listepanelet til høyre: «vi er her» uten å bytte fane. */}
      {/* Håndtakene skjules mens et annet panel er ute (#716). */}
      {visChat && !panelAapent && !timeplanAapent && (
        <>
          {/* Usynlig 44 px knapp, håndtaket flush venstre (#700) — speiler KartListePanel;
              overflow:hidden klipper vekst forbi left:0 (Treffflate.tsx, unntak c). */}
          <button
            type="button"
            onClick={aapneChat}
            aria-expanded={chatAapent}
            aria-label={chatAapent ? 'Lukk chatten' : 'Vis chatten'}
            data-testid="chat-handtak"
            style={{
              position: 'absolute',
              left: chatAapent ? 'min(320px, 88%)' : 0,
              top: '50%',
              transform: 'translateY(-50%)',
              width: MIN_TREFFMAAL_PX,
              height: 76,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              background: 'transparent',
              border: 'none',
              padding: 0,
              zIndex: Z.HANDTAK,
              transition: 'left 220ms ease',
            }}
          >
            <span
              style={{
                width: 30,
                height: 76,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '0.5px solid var(--kart-kant)',
                borderLeft: chatAapent ? '0.5px solid var(--kart-kant)' : 'none',
                borderRadius: '0 14px 14px 0',
                background: 'var(--kart-flate-sterk)',
                backdropFilter: 'var(--blur-card)',
                color: 'var(--text-secondary)',
              }}
            >
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1 }}>
                {chatAapent ? '‹' : '›'}
              </span>
            </span>
          </button>

          <aside
            ref={chatPanelRef}
            data-testid="chat-panel"
            className="kart-chat-panel"
            aria-hidden={!chatAapent}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: 'min(320px, 88%)',
              transform: chatAapent ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 220ms ease',
              background: 'var(--kart-flate)',
              backdropFilter: 'var(--blur-card)',
              borderRight: '0.5px solid var(--kart-kant)',
              overflowY: 'auto',
              // EKSPLISITT: `overflow-y: auto` gjør ellers `overflow-x` til auto,
              // og panelet lot seg dra sidelengs (#710).
              overflowX: 'hidden',
              // Panelets rubber-band skal ikke forplante seg og flytte visual
              // viewport — det løser ikke skrivefeltet-i-flyt av seg selv (#714).
              overscrollBehaviorY: 'contain',
              pointerEvents: chatAapent ? 'auto' : 'none',
              zIndex: Z.PANEL,
              padding: `calc(10px + var(--kart-panel-safe-top, 0px)) 10px calc(10px + env(safe-area-inset-bottom, 0px))`,
            }}
          >
            <div style={{ ...SEKSJON, marginBottom: 10 }}>Klubbchat</div>
            {/* KUN når åpent, så chunken hentes først ved første åpning. */}
            {chatAapent && (
              <Chat
                scope={{ type: 'klubb' }}
                brukerId={megId}
                initialMeldinger={chatMeldinger}
                profiler={chatProfiler}
                visSeksjonsLabel={false}
                autoScrollTilBunn
                // Panelet, ikke vinduet — kartsiden låser vindusscroll (#711).
                scrollContainer={() => chatPanelRef.current}
              />
            )}
          </aside>
        </>
      )}

      {/* ── Sidepanel med lista ──────────────────────────────────────────────
          Håndtakene skjuler hverandre — med begge synlige var det uklart
          hvilket som lukket hva. Deler høyre kant med timeplan-panelet (#716). */}
      <KartListePanel
        visHandtak={!chatAapent && !timeplanAapent}
        panelAapent={panelAapent}
        onToggle={aapneListe}
        antallPaaKartet={antallPaaKartet}
        meg={meg}
        underArrangement={underArrangement}
        menn={menn}
        markeringer={markeringer}
        megId={megId}
        erAdmin={erAdmin}
        nyligPlinget={nyligPlinget}
        onSenterPaa={senterPaa}
        onPling={pling}
        onFjernMarkering={fjernMarkering}
        handtakZIndex={Z.HANDTAK}
        panelZIndex={Z.PANEL}
        megPunkt={megPunkt}
        pingKandidater={pingKandidater}
      />

      {/* ── Timeplan-panelet ──────────────────────────────────────────────
          Ingen eget håndtak (#716) — pilla i knapperaden åpner, panelet har
          egen lukkeknapp. */}
      {timeplanArrangement && (
        <TimeplanPanel
          // `poster` seedes kun ved mount — remount når arrangementet byttes (#716).
          key={timeplanArrangement.id}
          arrangement={timeplanArrangement}
          initialPoster={timeplanPoster}
          feilVedHenting={timeplanFeil}
          erAapent={timeplanAapent}
          onLukk={() => setAapentPanel('ingen')}
          megId={megId}
          megNavn={megNavn}
          megBildeUrl={megBildeUrl}
          megRolle={megRolle}
          erAdmin={erAdmin}
          utkast={{
            dato: timeplanDato,
            tekst: timeplanTekst,
            manuellKlokke: timeplanManuellKlokke,
            punkt: timeplanPunkt,
            adresse: timeplanAdresse,
          }}
          onEndreUtkast={endreTimeplanUtkast}
          onStartPunktvalg={startTimeplanPunktvalg}
          onSenterPaa={senterPaaFraTimeplan}
          megPunkt={megPunkt}
        />
      )}
    </div>
  )
}

// Lagdeling over kartet. Leaflets egne paner går opp til 700 (tile 200,
// overlay 400, shadow 500, marker 600, tooltip 650, popup 700), så alt vårt
// starter over — ellers begraves det (#704).
const Z = {
  SIKTE: 720,
  KNAPPER: 730,
  BUNN: 740,
  DETALJ: 750,
  KOPIERT: 755,
  PANEL: 760,
  HANDTAK: 770,
} as const

// ── Delte stiler ────────────────────────────────────────────────────────────
// Små piller med vilje (#704, #713). PilleKnapp gir ~37 px pille 44 px treffflate
// (#700). pointerEvents: auto på det ytre elementet — raden har none, som den
// usynlige utvidelsen ellers ville arvet.
function KartPille({ pilleStil, children, ...rest }: { pilleStil: React.CSSProperties; children: React.ReactNode } & Omit<React.ComponentProps<'button'>, 'style' | 'children'>) {
  return <PilleKnapp synligHoyde={37} style={{ pointerEvents: 'auto' }} pilleStil={pilleStil} {...rest}>{children}</PilleKnapp>
}

const PILLE = {
  fontFamily: 'var(--font-body)',
  fontSize: 12.5,
  fontWeight: 500,
  letterSpacing: '0.1px',
  padding: '8px 14px',
  borderRadius: 'var(--radius-pill)',
  border: '0.5px solid var(--kart-kant)',
  background: 'var(--kart-flate-sterk)',
  backdropFilter: 'var(--blur-card)',
  color: 'var(--kart-tekst)',
  pointerEvents: 'auto',
  whiteSpace: 'nowrap',
  boxShadow: 'var(--shadow-popover)',
} as const

const PILLE_PRIMAER = {
  ...PILLE,
  // Sol, ikke sand-aksenten: primærhandlingen skal være det varmeste punktet.
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

// Alert zone-padding (#763). Layout-tall, bevisst ikke i lib/konstanter.ts.
const SONE_PAD = 5

// Sonens breddekostnad: indre gaps à 8px + padding begge sider + 2×1px ramme.
const soneEkstra = (antall: number) => (antall - 1) * 8 + 2 * SONE_PAD + 2

const SEKSJON = {
  fontFamily: 'var(--font-display)',
  fontSize: 15,
  color: 'var(--kart-tekst)',
  letterSpacing: '-0.1px',
  marginBottom: 8,
  fontWeight: 500,
} as const
