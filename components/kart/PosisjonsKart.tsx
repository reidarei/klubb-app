'use client'

import { useEffect, useRef, useState, useCallback, useTransition } from 'react'
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
  SYMBOLER_STILLE,
  SYMBOLER_VARSLER,
  STANDARD_SYMBOL,
  symbolEmoji,
  type MarkeringSymbol,
} from '@/lib/markering-symboler'

// Chat-komponenten er stor, og de fleste som åpner kartet er der for kartet.
// ssr: false fordi den uansett bare rendres etter et klikk — og da slipper
// serveren å bygge markup ingen ser (#709).
const Chat = dynamic(() => import('@/components/chat/Chat'), { ssr: false })

// Timeplan-panelet (#716) — statisk import, IKKE dynamic(): panelet er en
// liten liste og et skjema (noen få kB gz), og «Timeplan · 17:00»-pilla må
// kunne vise neste post i FØRSTE paint uten en chunk-hent midt i trykket.
import TimeplanPanel, { type TimeplanArrangement, type TimeplanPost } from './TimeplanPanel'
import { beregnDefaultTimeplanDato } from './NyTimeplanPost'
import KartListePanel from './KartListePanel'
import MarkeringDetalj from './MarkeringDetalj'
import StedSok from './StedSok'
import type { StedTreff } from '@/lib/geokoding'
import ReisemodusBar, { KART_TOPP_MARGIN, REISEMODUS_BAR_SONE } from './ReisemodusBar'
// Re-eksportert slik at page.tsx kan importere ALLE kart-typene fra ett sted
// (samme mønster som Mann/Markering/Punkt under).
export type { TimeplanArrangement, TimeplanPost }

import 'leaflet/dist/leaflet.css'
import './kart.css'

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
  /** Nøkkel fra MARKERING_SYMBOLER — emojien slås opp i koden, ikke i DB. */
  symbol: string
  opprettet: string
  avNavn: string
  /** Styrer om fjern-knappen vises. RLS avgjør uansett om slettingen går. */
  erMin: boolean
}

type Props = {
  menn: Mann[]
  markeringer: Markering[]
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
  /**
   * Arrangementet timeplan-knappen skal peke til (#716) — pågående med
   * senest start, ellers nærmeste framtidige, uansett hvor langt fram. null
   * betyr «ingen aktuelt arrangement», og da rendres pilla ikke i det hele
   * tatt.
   */
  timeplanArrangement: TimeplanArrangement | null
  timeplanPoster: TimeplanPost[]
  /** kart.timeplan.hent.feilet traff på serveren — panelet får egen feiltilstand. */
  timeplanFeil: boolean
  /**
   * Et sted delt via lenke (#719) — ?lat=&lng=&tekst= i URL-en, parset
   * server-side i page.tsx (lib/kart-lenke.ts). null når ingen slik
   * parameter finnes. Kartet sentreres på dette punktet ved åpning, og en
   * egen markør vises der — uavhengig av om noen `kart_markering`-rad
   * fortsatt finnes (lenken bærer koordinatet, ikke en rad-id).
   */
  deltSted: { lat: number; lng: number; tekst: string | null } | null
  /** «Ping en herre» (#725) — påmeldte (eller alle aktive) minus dem som allerede deler. */
  pingKandidater: PingKandidat[]
  /**
   * Reisemodus PÅ (#723) — TopHeader er ikke montert, så flaten fyller HELE
   * viewporten (ikke bare det som er igjen under headeren) og en egen,
   * flytende bar (ReisemodusBar) overtar avatar+togglejobben headeren
   * ellers gjorde. Styrer også `--kart-panel-safe-top` — se stilen på
   * kart-flaten under.
   */
  reisemodus: boolean
}

function relativTid(iso: string): string {
  return formatDistanceToNowStrict(new Date(iso), { locale: nb, addSuffix: true })
}

function erFersk(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() < POSISJON_FERSK_MINUTTER * 60 * 1000
}

// Escaper tekst som skal inn i en HTML-streng Leaflet injiserer rått i DOM-en.
// Navn og bilde-URL kommer begge fra profildata og må gjennom denne.
function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
}

// Markør-HTML for SISTE punkt: profilbildet når mannen har ett, initialer når
// han ikke har det.
//
// BEVISST UNNTAK fra Policy: Avatar, og eneste stedet i appen som er det.
// Leaflet sin divIcon tar en HTML-STRENG, ikke en React-node, så <Avatar> kan
// ikke brukes her. Alternativet — å montere React i markørnoden via createPortal
// etter at Leaflet har tegnet den — ville krevd portal-state og opprydding per
// markør for å rendre 34 px. Dupliseringen holdes derfor nede ved å dele de to
// tingene som faktisk bærer regler: `bildeSrc()` (Policy: Bildevisning, eneste
// trakt inn i et src-attributt) og `harGulGloed()` (Policy: Roller, aldri en
// rolle-streng sammenlignet direkte). Kun selve oppmerkingen er egen.
//
// Opprinnelig var dette initialer med vilje — et ansikt på 34 px er smått. Endret
// etter en brukertest der «1R» ikke sa noe om hvem som sto der — et lite
// ansikt gjenkjennes raskere enn to bokstaver når man vet hvem som er med.
// Størrelsen er samtidig hevet fra 34 til 40 px for å gi ansiktet en sjanse.
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
  // Gul ring for generalsekretæren, som overalt ellers i appen. Taper mot
  // «meg»-ringen hvis begge gjelder — står du på kartet selv, er det viktigste
  // å finne deg selv først.
  if (!erMeg && harGulGloed(rolle)) klasser.push('kart-markoer-gs')

  const bilde = bildeSrc(bildeUrl)
  if (bilde) {
    // Ikke next/image: dette er en løs HTML-streng utenfor Reacts tre, så det
    // finnes ingen komponent å rendre. Avatarene er allerede små filer.
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

// Markering på kartet (#708): ÉN snakkeboble som starter med symbolet og
// peker ned på stedet.
//
// Tidligere sto symbolet to steder — på en egen nål OG først i etiketten ved
// siden av. Det leste som to markeringer, og man måtte nesten bare velge.
// Bobla er nå hele markeringen, og halen under den er det som peker på
// selve punktet.
//
// Bobla ER tooltipen, ikke et eget ikon: den må vokse med teksten, og
// `L.divIcon` krever en fast `iconSize` (default 12×12 — se #702). En tooltip
// får naturlig bredde av innholdet. `interactive: true` gjør den trykkbar, som
// den må være når den er hele markeringen — motsatt av før, da den var ren
// pynt ved siden av en nål som tok trykket.

// De TIDLIGERE punktene i sporet — små prikker uten initialer. De skal leses som
// «her var han», ikke konkurrere med markøren som sier «her er han». Uten
// størrelsesforskjellen blir en rute gjennom byen til et kart fullt av like
// prikker der man ikke ser hvilken som gjelder nå.
function sporPrikkHtml(navn: string): string {
  return `<div class="kart-spor-prikk" style="--avatar-hue:${hueAv(navn)}"></div>`
}

export default function PosisjonsKart({
  menn,
  markeringer,
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
}: Props) {
  const kartRef = useRef<HTMLDivElement>(null)
  const kartetRef = useRef<LeafletMap | null>(null)
  const lagRef = useRef<LayerGroup | null>(null)

  const [jobber, setJobber] = useState(false)
  const [feil, setFeil] = useState<string | null>(null)
  const [plinget, setPlinget] = useState<string | null>(null)
  // Hvem som nettopp er plinget, og derfor har en låst, grå knapp. Uten denne
  // sto knappen helt uendret etter trykket, og mannen som trykket visste ikke
  // om plinget faktisk hadde gått ut — knappen var eneste stedet han så etter svar.
  const [nyligPlinget, setNyligPlinget] = useState<Record<string, boolean>>({})
  // Timer-IDene ryddes ved unmount. Uten det fyrer en setState på en komponent
  // som er borte hvis man forlater kartet innen vinduet er ute.
  const plingTimere = useRef<number[]>([])
  // Kopier-lenke-kvittering (#719) — trigges av BÅDE «Kopier lenke»-knappen i
  // MarkeringDetalj og et langtrykk rett på boblen i kartet, derfor ligger
  // den her og ikke i detaljpanelet: ett feedback-sted for to inngangar.
  // `lenkeFallback` er IKKE null KUN når clipboard-skrivingen feilet — da
  // vises lenken i et readonly, forhåndsselektert felt i stedet for en
  // stille feil (Safari nekter clipboard-skriving utenfor et ekte
  // brukergestvindu i noen kontekster).
  const [lenkeKopiert, setLenkeKopiert] = useState(false)
  const [lenkeFallback, setLenkeFallback] = useState<string | null>(null)
  const lenkeKopiertTimer = useRef<number | null>(null)
  // Markeringsskjemaet er lukket til man trykker «Sett markering». Å la
  // tekstfeltet stå åpent hele tiden ville tatt plass fra kartet, som er det
  // man er der for.
  // Markeringsflyten har to steg (#702). Ett steg var feil rekkefølge: å åpne
  // tekstfeltet med én gang sprang opp tastaturet, som dekket kartet — og
  // dermed krysset man skulle sikte med. Man skrev inn teksten uten å ha sett
  // hvor nåla havnet.
  //
  //   'av'             — ingenting på gang
  //   'sted'           — krysset står på kartet, kartet er fritt å flytte, ingen tekst
  //   'tekst'          — stedet er låst, nå skriver man hva det er
  //   'timeplan-punkt' — samme sikte, men for en timeplan-post (#716): ÉN
  //                      sikte-tilstand for hele kartet, aldri to parallelle
  //                      sikte-flagg. Panelet glir helt ut mens dette står på.
  //   'sok'            — interaktivt stedssøk (#757): eget panel i bunn-blokka,
  //                      ingen sikte. Et valgt treff går VIDERE til 'sted' (via
  //                      «Sett markering her») eller rett i timeplan-utkastet —
  //                      se onMarkeringFraSok/onTimeplanFraSok under.
  const [steg, setSteg] = useState<'av' | 'sted' | 'tekst' | 'timeplan-punkt' | 'sok'>('av')
  // Lytterne i langtrykk-effekten under (#762) registreres ÉN gang (deps
  // [kartKlar]), og leser derfor steg via en REF, ikke via closure over
  // React-state: leste de `steg` direkte, måtte de re-bindes ved hvert
  // stegskifte, og en gest som pågår akkurat idet steget endres ville miste
  // timeren sin i cleanup.
  const stegRef = useRef(steg)
  useEffect(() => {
    stegRef.current = steg
  }, [steg])
  // Punktet ringen under et pågående langtrykk tegnes på (#762), relativt
  // til kartcontainerens rect. null = ingen gest pågår.
  const [presseRing, setPresseRing] = useState<{ x: number; y: number } | null>(null)
  // Styrer hjelpeteksten i steg 'sted' (#762, utvidet #757): kom man dit via
  // langtrykk eller via et valgt søketreff, står krysset allerede over
  // stedet — «Flytt kartet» er da feil oppfordring. Nullstilles ('knapp') i
  // bekreftSted og avbrytMarkering — begge avslutter steget.
  const [stedKilde, setStedKilde] = useState<'knapp' | 'langtrykk' | 'sok'>('knapp')
  // Valgt kandidat fra StedSok (#757) — treffnåla tegnes for dette punktet
  // så lenge steg === 'sok'. null utenfor et aktivt søk eller før noe er valgt.
  const [sokValgt, setSokValgt] = useState<StedTreff | null>(null)
  const [markeringTekst, setMarkeringTekst] = useState('')
  const [markeringSymbol, setMarkeringSymbol] = useState<MarkeringSymbol>(STANDARD_SYMBOL)
  // Koordinatet låses når man bekrefter stedet, slik at en utilsiktet
  // panorering mens tastaturet er oppe ikke flytter markeringen.
  const [valgtSted, setValgtSted] = useState<{ lat: number; lng: number } | null>(null)
  // Markeringen man har trykket på KARTET. Fram til #699 var nålene
  // `interactive: false` — du så dem, trykket på dem, og ingenting skjedde.
  // Fjern-knappen lå i en liste langt under kartet, som man må scrolle forbi
  // hele kartet og mannelista for å nå. Det er ikke der man leter.
  const [valgtMarkering, setValgtMarkering] = useState<string | null>(null)
  // Ett panel om gangen, samlet i én union (#716) — tre booleans ga 8
  // tilstander hvorav 5 var ulovlige. panelAapent/chatAapent/timeplanAapent
  // under er avledet LOKALT per render, ikke egen state, slik at all
  // eksisterende JSX (aria-expanded, transform, betingelser lenger ned)
  // kan stå UENDRET: e2e (kart-markering.spec.ts, kart-markorer.spec.ts)
  // leser disse testid-ene og verdiene, og skal ikke måtte endres av denne
  // refaktoreringen.
  const [aapentPanel, setAapentPanel] = useState<'ingen' | 'liste' | 'chat' | 'timeplan'>('ingen')
  const panelAapent = aapentPanel === 'liste'
  const chatAapent = aapentPanel === 'chat'
  const timeplanAapent = aapentPanel === 'timeplan'
  const chatPanelRef = useRef<HTMLElement>(null)

  // Timeplan-utkast (#716). Bor HER, ikke i TimeplanPanel/NyTimeplanPost —
  // bindende arkitekturbeslutning: panelet glir helt ut mens man velger et
  // punkt på kartet (steg 'timeplan-punkt' under), og skal glide inn igjen
  // med utkastet intakt. dato initialiseres lazy til arrangementets
  // startdato hvis turen ikke har begynt, ellers dagens dato.
  const [timeplanDato, setTimeplanDato] = useState(() =>
    timeplanArrangement ? beregnDefaultTimeplanDato(timeplanArrangement) : '',
  )
  const [timeplanTekst, setTimeplanTekst] = useState('')
  const [timeplanManuellKlokke, setTimeplanManuellKlokke] = useState<string | null>(null)
  const [timeplanPunkt, setTimeplanPunkt] = useState<{ lat: number; lng: number } | null>(null)
  // Adresse (#732) — alternativ til punkt, samme «bor her»-begrunnelse som
  // punktet over: skal overleve at panelet glir ut under en punktvelging.
  const [timeplanAdresse, setTimeplanAdresse] = useState<string | null>(null)

  // Arrangement-bundet state nullstilles når serveren peker på et ANNET
  // arrangement (#716 review). En RSC-revalidering et annet sted i komponenten
  // (settMarkering() e.l.) kan bytte aktuelt arrangement uten at noe
  // remonteres, og den lazy useState-initialiseringen over kjører kun ved
  // mount — uten dette ble gammel dato, gammel tekst og gammelt punkt stående
  // under tittelen til en helt annen tur. Dekker samtidig overgangen
  // null → satt, som denne effekten håndterte alene før.
  //
  // Sammenligningen står på ID-en i en ref, ikke på objektidentiteten:
  // props-objektet er nytt ved hver RSC-render, så en ren deps-sammenligning
  // ville tømt utkastet hans hver gang en vilkårlig action revaliderte siden.
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

  // Tastatur-høyden. Brukes KUN til å løfte bunn-blokka (absolute, #714)
  // når man skriver markeringsteksten — uten det havner tekstfeltet bak
  // tastaturet. Hooken lytter på visualViewport-scroll, som i chatten ga en
  // «dansende» pille (#222/#236); her er siden låst mot scroll (se effekten
  // under), så offsetTop holder seg i ro. Chat-panelet under bruker ikke
  // lenger denne hooken — skrivefeltet der ligger i normal flyt.
  const tastaturOffset = useKeyboardOffset()

  // Kartsiden låser sidescroll så lenge den er montert.
  //
  // Uten dette kan siden scrolle bak det fastlåste kartet: layoutens
  // `min-h-screen` er 100vh, mens kartflaten er 100dvh — på iOS er vh større
  // enn dvh når adresselinja er synlig, så det ble et par hundre piksler
  // tomrom å scrolle ned i. Da flyttet knappene seg ut av skjermen når man
  // dro rundt på kartet, og bunn-blokka havnet delvis utenfor for så å komme
  // til syne igjen senere (#706). position: fixed på selve flaten løser
  // plasseringen; denne låsen fjerner tomrommet som gjorde det mulig i det
  // hele tatt.
  useEffect(() => {
    // BÅDE <html> og <body>. `overflow: hidden` på body alene holdt ikke —
    // målt til 44 px scroll igjen, fordi <html> er scroll-containeren og
    // body-verdien bare propagerer til viewporten når html står på `visible`.
    // De 44 pikslene kom fra DeployInfo, som ligger i <main> under kartflaten;
    // den blir klippet bort her, og det er riktig: kartsiden er fullskjerm.
    //
    // overscrollBehavior i tillegg til overflow: på iOS hindrer ikke `hidden`
    // alene rubber-band-effekten, og det var den som dro overlayene ut av
    // skjermen mens man panorerte kartet.
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
    // Skjuler DeployInfo, som ligger i <main> under kartet og la 44 px ekstra
    // høyde på dokumentet. Overflyten var det rubber-band-effekten hadde å dra
    // i; uten den er det ingenting å skli på. Se regelen i globals.css.
    body.classList.add('fullskjerm-side')
    return () => {
      // Låsen ligger på elementer hele appen deler. Ryddes den ikke, blir
      // resten av appen uscrollbar etter et besøk på kartet — en langt verre
      // feil enn den vi fikset. Pinnet i e2e.
      html.style.overflow = forrige.htmlOverflow
      html.style.overscrollBehavior = forrige.htmlOverscroll
      body.style.overflow = forrige.bodyOverflow
      body.style.overscrollBehavior = forrige.bodyOverscroll
      body.classList.remove('fullskjerm-side')
    }
  }, [])
  // Leaflet lastes asynkront, mens markør-effekten kjører rett etter den
  // synkrone delen av init-effekten. Uten dette flagget leser markør-effekten
  // en lagRef som ennå er null, returnerer tomhendt, og kjører ALDRI igjen —
  // punktene er jo uendret. Det var bugen i første versjon: tomt kart, full
  // liste under, men kun ved fersh sidelast.
  const [kartKlar, setKartKlar] = useState(false)

  const meg = menn.find(m => m.profilId === megId) ?? null
  const megDeler = meg !== null

  // Din siste posisjon (#728) — grunnlaget for avstand-visning på
  // markeringer og timeplan-rader. null når du ikke deler: da vises ingen
  // avstand, kun linja «Del posisjonen din for å se avstand.»
  const megPunkt = meg ? { lat: meg.spor.at(-1)!.lat, lng: meg.spor.at(-1)!.lng } : null

  // Navn/bilde til MEG selv til den optimistiske timeplan-raden (#716) —
  // chatProfiler dekker alle aktive medlemmer uansett om jeg deler posisjon,
  // til forskjell fra `meg` over (som krever aktiv deling).
  const megProfil = chatProfiler.find(p => p.id === megId) ?? null
  const megNavn = megProfil?.navn || 'Deg'
  const megBildeUrl = megProfil?.bilde_url ?? null
  const megRolle = megProfil?.rolle ?? null

  // Ett panel om gangen. To åpne paneler på en 390 px skjerm ville latt igjen
  // en stripe kart i midten — da er man like langt som før kartet ble
  // fullskjerm.
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

  // Egen posisjon oppdateres (#726): flytt kartet KUN hvis punktet havner
  // utenfor det utsnittet mannen faktisk ser på. Har han zoomet inn for å
  // se seg selv og trykker «Oppdater» mens han fortsatt står i samme rute,
  // skal kartet stå musestille — ikke zoome ut til POSISJON_KART_ZOOM som
  // senterPaa() ville gjort. maxZoom: kart.getZoom() er selve garantien mot
  // at kartet zoomer INN når punktet ER utenfor: fitBounds() zoomer aldri
  // nærmere enn det du allerede sto på.
  const taMedPosisjon = useCallback((lat: number, lng: number) => {
    const kart = kartetRef.current
    if (!kart) return
    const b = kart.getBounds()
    const bounds = { nord: b.getNorth(), syd: b.getSouth(), ost: b.getEast(), vest: b.getWest() }
    if (!trengerNyttUtsnitt(bounds, { lat, lng })) return
    kart.fitBounds(b.extend([lat, lng]), { padding: [50, 50], maxZoom: kart.getZoom() })
  }, [])

  // «Vis stedet på kartet» fra en timeplan-rad: lukk panelet FØRST (#716
  // review). Panelet dekker 88 % av flaten, så punktet ble sentrert rett bak
  // det — knappen flyttet kartet uten at man så noe som helst. Kartflaten
  // beholder full størrelse (panelet er et overlegg, ikke en kolonne), så
  // sentreringen treffer riktig med en gang; flyTo-animasjonen og panelets
  // utglidning går side om side.
  const senterPaaFraTimeplan = useCallback(
    (lat: number, lng: number) => {
      setAapentPanel('ingen')
      senterPaa(lat, lng)
    },
    [senterPaa],
  )

  // Bygger stedslenken og forsøker å legge den på utklippstavlen (#719).
  // Delt mellom «Kopier lenke»-knappen i MarkeringDetalj og langtrykket på
  // selve boblen i kartet — se kommentaren ved state-deklarasjonen.
  // Kvitteringen deles av langtrykket og av Kopier-knappen i fallback-panelet.
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
      // Ingen Clipboard API i det hele tatt (eldre WebKit, usikker kontekst)
      // — rett til fallback-feltet i stedet for et garantert avvist forsøk.
      setLenkeFallback(lenke)
    }
  }, [visLenkeKvittering])

  const router = useRouter()
  const [friskerOpp, startFriskOpp] = useTransition()

  // Erstatningen for pull-to-refresh på kartsiden (#718): siden er
  // scroll-låst (#706), så en dra-ned-gest der alltid leses som panorering —
  // `draNedForOppdaterAv()` i lib/navigasjon.ts slår derfor av gesten helt
  // her, og «friskt kart» må hentes eksplisitt i stedet.
  const friskOppKartet = useCallback(() => {
    startFriskOpp(() => {
      router.refresh()
    })
  }, [router])

  // Pillene som trigger hentOgLagre må låses av BEGGE ventetidene, ikke bare
  // GPS-hentingen: flere av feilgrenene under nullstiller `jobber` FØR
  // friskOppKartet() starter, og «ingen Geolocation API»-grenen setter `jobber`
  // aldri. Med bare `jobber` i disabled ble knappen klikkbar igjen — eller
  // aldri låst i det hele tatt — mens RSC-refreshen fortsatt pågikk (#718).
  const opptatt = jobber || friskerOpp

  // Kjernen i innmeldingen. `stille` skiller den automatiske oppdateringen ved
  // sidelast fra et bevisst knappetrykk: den automatiske skal aldri vise en
  // feilmelding eller flytte kartet under føttene på deg — den bare fyller på
  // sporet hvis den får lov.
  const hentOgLagre = useCallback(
    (stille: boolean) => {
      if (!stille) setFeil(null)
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        if (!stille) {
          setFeil('Denne telefonen gir ikke appen tilgang til posisjon.')
          // Ingen GPS i det hele tatt — vi får aldri en delPosisjon-kvittering
          // (og dermed aldri revalidatePath('/kart')) for denne mannen, så
          // kartet friskes opp eksplisitt her i stedet (#718).
          friskOppKartet()
        }
        return
      }
      if (!stille) setJobber(true)
      navigator.geolocation.getCurrentPosition(
        async pos => {
          // try/catch fordi dette er en async callback UTENFOR Reacts tre:
          // kaster delPosisjon (utløpt sesjon er rutine i en PWA, og
          // ensureInnlogget kaster da), har ingen noe å fange den, og den blir
          // en unhandled rejection i stedet for en beskjed til mannen.
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
                // delPosisjon feilet før den nådde revalidatePath('/kart') —
                // uten dette blir kartet stående med gamle data selv om han
                // trykte «Oppdater» (#718).
                friskOppKartet()
                return
              }
              taMedPosisjon(pos.coords.latitude, pos.coords.longitude)
            }
          } catch {
            if (!stille) {
              setJobber(false)
              setFeil('Klarte ikke lagre posisjonen. Prøv igjen.')
              // Samme begrunnelse som svar.ok-grenen over: delPosisjon kastet
              // før revalideringen, så kartet må friskes opp eksplisitt.
              friskOppKartet()
            }
          }
        },
        posFeil => {
          if (!stille) setJobber(false)
          // Tre ulike ting for brukeren: han har sagt nei, telefonen fikk ikke
          // fix, eller det tok for lang tid. Én felles «noe gikk galt» ville
          // sendt ham til innstillingene for en timeout han bare kunne prøvd
          // på nytt.
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
          // Warn og ikke error: at en mann sier nei er ikke en programfeil. Men
          // uten raden kan vi ikke svare på om iOS-PWA-en glemmer tillatelsen
          // mellom økter, som fortsatt er det åpne spørsmålet. `auto-`-prefikset
          // skiller den stille oppdateringen fra et bevisst trykk — det er
          // nettopp den stille som avslører en glemt tillatelse.
          sendFeilBeacon(
            'klient.posisjon.nektet',
            posFeil.message || klasse,
            undefined,
            { fingerprint: stille ? `auto-${klasse}` : klasse },
            'warn',
          )
          // Nektet, timeout eller utilgjengelig — GPS ga aldri en posisjon å
          // sende til delPosisjon, så ingen revalidatePath('/kart') skjer.
          // Kartet friskes opp likevel her, slik at «Oppdater» også henter
          // inn andres bevegelser selv når din egen posisjon feiler (#718).
          if (!stille) friskOppKartet()
        },
        // enableHighAccuracy slår på GPS i stedet for mast/wifi. Det koster
        // batteri og noen sekunder, men et punkt med ±1500 m er ubrukelig til
        // nettopp det kartet er til for: å finne hverandre i en gate.
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      )
    },
    [taMedPosisjon, friskOppKartet],
  )

  // Automatisk oppdatering ved sidelast for den som ALLEREDE deler.
  //
  // To grunner til at dette hører med, og ikke er en snikende utvidelse: (1)
  // uten det ville sporet bestått av de 2–3 gangene noen husket å trykke på en
  // knapp, og et spor med tre punkter er ikke en rute. (2) pling-varselet er
  // verdiløst hvis mottakeren må gjøre noe mer enn å åpne appen — hele poenget
  // er at trykket hans ER oppdateringen.
  //
  // Gated på aktiv deling: har du ikke sagt ja, henter vi ingenting, og
  // getCurrentPosition kalles aldri. Ingen uventet tillatelsesdialog.
  useEffect(() => {
    if (!megDeler) return
    hentOgLagre(true)
    // Kun ved montering: dette er «da du åpnet siden», ikke en løpende puls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Leaflet importeres inne i effekten, ikke på modulnivå. Biblioteket rører
  // `window` ved import, så et toppnivå-import ville kastet under SSR. Dette
  // laster også kartkoden først når noen faktisk åpner /kart, som er hele
  // grunnen til at resten av appen ikke blir tyngre av Leaflet (jf. ytelseskravet).
  useEffect(() => {
    let avbrutt = false
    // Deklarert her (ikke inni .then()) slik at cleanup-funksjonen under
    // kan rydde den selv om Leaflet-modulen ikke er ferdig lastet ennå.
    let ventId: number | undefined
    const node = kartRef.current
    if (!node) return

    import('leaflet').then(mod => {
      if (avbrutt || kartetRef.current) return
      const L = mod.default

      // Startutsnittet rammer inn HOVEDTYNGDEN av punktene, ikke automatisk
      // ALT som finnes (#735). Uten dette drar én mann som fortsatt står på
      // avreisestedet (flyet ikke landet, eller bare ikke delt posisjon siden)
      // utsnittet over et helt hav — kartet må da spenne fra Gardermoen til
      // Lisboa i stedet for å vise byen turen faktisk foregår i.
      //
      // Posisjoner og markeringer sendes inn HVER FOR SEG: kun mennene stemmer
      // over hvor utsnittet havner, mens markeringene blir med hvis de ligger
      // der gjengen er. En markering langt unna skal verken dra utsnittet dit
      // eller kunne stemme ned mennene (se lib/kart-klynge.ts). Finnes det
      // ingen posisjoner i det hele tatt, rammes samtlige markeringer inn som
      // før denne funksjonen fantes (#699) — det håndterer funksjonen selv.
      const posisjonspunkter: [number, number][] = menn.flatMap(m => {
        const siste = m.spor[m.spor.length - 1]
        return siste ? [[siste.lat, siste.lng] as [number, number]] : []
      })
      const markeringspunkter: [number, number][] = markeringer.map(
        mk => [mk.lat, mk.lng] as [number, number],
      )
      // Et delt sted (#753) trenger ingen klynge-vurdering — utsnittet skal
      // treffe PRESIS det koordinatet, ikke et snitt av annet på kartet.
      // Regnestykket i velgKlyngeUtsnitt() hopper vi derfor over når det uansett
      // ikke skal brukes.
      const punkterIUtsnittet: [number, number][] = deltSted
        ? []
        : velgKlyngeUtsnitt(posisjonspunkter, markeringspunkter)

      // Ankomsten via en delt lenke (#753): kartet skal FØDES vidt og flys
      // synlig inn mot koordinatet, ikke stå der ferdig innzoomet. Planlagt
      // FØR kartet konstrueres, slik at startZoom kan brukes i options under.
      const ankomst = deltSted ? planleggAnkomst(foretrekkerRedusertBevegelse()) : null
      // Nøkkelen denne ankomsten er planlagt FOR. Post-mount-effekten lenger
      // nede stempler samme ref når den overtar med et nytt mål (#753).
      const ankomstKey = deltStedKey

      // Et delt sted (#719) vinner startutsnittet: mannen trykket på nettopp
      // DEN lenken for å se DET stedet, ikke gjennomsnittet av alt annet på
      // kartet. fitBounds-grenen under kjøres derfor ikke når deltSted er
      // satt — presis sentrering slår «få alt med».
      const kart = L.map(node, {
        center: deltSted ? [deltSted.lat, deltSted.lng] : (punkterIUtsnittet[0] ?? [fallbackSenter.lat, fallbackSenter.lng]),
        zoom: deltSted
          ? ankomst!.startZoom
          : punkterIUtsnittet.length > 0
            ? POSISJON_KART_ZOOM
            : POSISJON_KART_FALLBACK_ZOOM,
        // Zoom-knappene er museflate. Målplattformen er en telefon der man
        // kniper, og knappene ville bare spist skjermplass.
        zoomControl: false,
        attributionControl: true,
      })

      // Med flere punkter zoomer vi ut til alt får plass. maxZoom hindrer at to
      // punkter i samme kvartal zoomer helt inn på husnummer; padding holder
      // markørene unna kanten, der de ville vært halvt avskåret.
      if (!deltSted && punkterIUtsnittet.length > 1) {
        kart.fitBounds(L.latLngBounds(punkterIUtsnittet), {
          padding: [50, 50],
          maxZoom: POSISJON_KART_ZOOM,
        })
      }

      // Referansen tas vare på: ankomstflyvningen venter på at DENNE
      // flisrunden er tegnet (#753) før den zoomer videre inn.
      const flisLag = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        // Attribusjon er et VILKÅR for å bruke OSMs fliser, ikke en høflighet.
        attribution: '&copy; OpenStreetMap',
      }).addTo(kart)

      // Trykk på selve kartet lukker et åpent panel (#721, #722) — chat,
      // liste og timeplan er én union (aapentPanel), så dette dekker alle
      // tre. INGEN scrim-div: et inset:0-overlegg ville svelget panorering,
      // som e2e (kart-markorer.spec.ts m.fl.) allerede vokter. Leaflet fyrer
      // ikke 'click' for et trykk som traff en interaktiv markør/tooltip
      // (de stopper propagering selv), så dette griper kun kartFLATEN.
      kart.on('click', () => setAapentPanel('ingen'))

      lagRef.current = L.layerGroup().addTo(kart)
      kartetRef.current = kart
      setKartKlar(true)
      // Leaflet måler containeren ved init. Åpnes siden mens layouten fortsatt
      // setter seg (fonter, safe-area), blir målingen for liten og flisene
      // dekker bare deler av ruta. invalidateSize etter første paint retter opp.
      requestAnimationFrame(() => kart.invalidateSize())

      // Innzoomingen mot et delt sted (#753). To triggere, én guard:
      // 'load' er den normale veien (flisene som dekker STARTutsnittet er
      // tegnet — å zoome inn over en grå flate hadde mistet halve poenget),
      // timeout-en er fail-open hvis en flis feiler eller nettet henger —
      // ankomsten må aldri kunne bli hengende for godt.
      let harFlydd = false
      if (ankomst?.animer) {
        const start = () => {
          if (avbrutt || harFlydd || !kartetRef.current) return
          // Han kan ha trykket en NY steds-lenke i chat-panelet mens vi ventet
          // på fliser (#753). Post-mount-effekten har da alt flydd til det nye
          // målet og stemplet nøkkelen — denne planlagte flyvningen ville dratt
          // ham tilbake til det gamle stedet.
          if (forrigeDeltStedKey.current !== ankomstKey) return
          harFlydd = true
          window.clearTimeout(ventId)
          // Containeren kan ha fått endelig størrelse først etter at
          // startutsnittet ble tegnet (samme grunn som invalidateSize over) —
          // uten denne kan flyTo regne på feil dimensjoner.
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
    // Kjøres én gang: menn/fallbackSenter leses kun for STARTutsnittet, og
    // senere endringer tegnes av effekten under i stedet for å bygge kartet på nytt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Langtrykk på kartflaten (#762): holder man fingeren et sted, panoreres
  // det punktet inn under siktet og steg 'sted' startes — eller, er siktet
  // allerede oppe, panoreres det bare, uten å endre steg (regissørens
  // beslutninger #1 og #2 for #762).
  //
  // Native DOM-lyttere på Leaflet-containeren, ikke React og ikke
  // map.on('contextmenu'): Leaflets egen tapHold har tapHoldDelay hardkodet
  // som en modul-lokal variabel — ikke en option, kan ikke settes til
  // LONG_PRESS_MS — og handleren er som default kun på for iOS Safari.
  // Android ville dermed fått en annen (fraværende) gest. Egne lyttere med
  // de samme terskelkonstantene boble-gesten (#719, lenger ned i fila) bruker
  // gir lik oppførsel på begge plattformer.
  //
  // deps [kartKlar], ikke [steg]: se stegRef over for hvorfor.
  useEffect(() => {
    if (!kartKlar) return
    const node = kartRef.current
    const kart = kartetRef.current
    if (!node || !kart) return

    let holdTimer: number | null = null
    let klar = false
    let start = { x: 0, y: 0 }
    // Aktive pekere telles selv, IKKE via e.isPrimary — jsdom setter
    // isPrimary til false som default på et syntetisk PointerEvent, så en
    // isPrimary-vakt ville gjort hele testfila «grønn» uten å bevise noe.
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
      if (e.pointerType === 'mouse') return
      if (aktivPeker !== null) {
        // Pinch-vakt: en ANDRE peker ned mens den første holder er en
        // knipe-gest, ikke et langtrykk.
        avbrytHold()
        return
      }
      // Koordinatet er låst i steg 'tekst' (#702) — hele poenget med
      // to-stegs-flyten er at teksten ikke skal kunne flytte nåla.
      // Steg 'sok' (#757) har sitt eget panel og ingen sikte — et langtrykk
      // der skal ikke starte en parallell markeringsflyt.
      if (stegRef.current === 'tekst' || stegRef.current === 'sok') return
      // Kollisjonsvakten mot boble-gesten (#719): et langtrykk på en
      // eksisterende markering/kontroll skal IKKE i tillegg starte en ny
      // markering. Eksplisitt target-sil — ikke avhengig av at boblas egen
      // stopPropagation() i pointerup rekker først (den lytteren rører vi
      // ikke — se boble-gesten lenger ned i denne effekten som tegner
      // markørene, merket #719).
      // Ikke '.leaflet-marker-icon' (#700): den står på alle markører, også
      // interactive:false-ansiktene der langtrykk skal starte en markering.
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
      // Samme mønster som boble-gesten (#719, lenger ned i fila): under
      // panorering ryddes timeren bort etter de første ~10 pikslene — hele
      // ytelsessvaret.
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
      // PointerEvent arver MouseEvent, så Leaflets egen hjelper kan brukes
      // direkte — ingen manuell omregning av koordinater.
      startMarkeringFraLangtrykk(kart.mouseEventToLatLng(e))
    }

    const pointerCancel = () => {
      avbrytHold()
      aktivPeker = null
    }

    // Android Chrome åpner sin egen bilde-kontekstmeny på langtrykk over en
    // flis (<img>) — Android-benet av samme problem -webkit-touch-callout
    // løser på iOS (se kart.css).
    const kontekstmeny = (e: Event) => e.preventDefault()

    // Touch-pekere har IMPLISITT pointer capture på noden som fikk
    // pointerdown, så pointerup kommer tilbake hit selv om fingeren dras
    // utenfor containeren — ingen document-lyttere, ingen pointerleave.
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
    // Lytterne skal registreres ÉN gang; steg leses via stegRef (se over), og
    // startMarkeringFraLangtrykk er stabil (useCallback med tomme deps).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kartKlar])

  // Reisemodus-toggelen endrer FLATENS høyde (header borte/tilbake) uten at
  // kartet remountes. Leaflet måler kun containeren ved init og reagerer ikke
  // selv på en ren CSS-høydeendring — uten denne sto kartet med feil utsnitt
  // (stripe uten fliser i bunnen) til neste resize eller rotasjon.
  useEffect(() => {
    if (!kartetRef.current) return
    requestAnimationFrame(() => kartetRef.current?.invalidateSize())
  }, [reisemodus])

  // Tegner spor og markører på nytt når dataene endrer seg.
  useEffect(() => {
    if (!kartKlar) return
    const lag = lagRef.current
    if (!lag) return
    let avbrutt = false

    import('leaflet').then(mod => {
      if (avbrutt) return
      const L = mod.default
      lag.clearLayers()

      // Markeringene tegnes FØRST, så personmarkørene legger seg oppå. Det er
      // riktig prioritet: en mann som beveger seg er ferskere informasjon enn
      // en nål som har stått en stund.
      for (const mk of markeringer) {
        const markoer = L.marker([mk.lat, mk.lng], {
          // Ankeret er USYNLIG og 1×1: bobla (tooltipen under) er det man ser
          // og trykker på. En synlig markør her ville vært symbolet en gang
          // for mye — nøyaktig det #708 fjerner.
          icon: L.divIcon({ html: '', className: 'kart-markering-anker', iconSize: [1, 1] }),
          alt: mk.tekst,
          title: `${mk.tekst} — ${mk.avNavn}, ${relativTid(mk.opprettet)}`,
        })
          .bindTooltip(
            // Halen er et EGET element, ikke Leaflets ::before. Den innebygde
            // pila lot seg ikke få fram her uansett border-verdier — bobla ble
            // stående som et avrundet rektangel (#708-oppfølging). Et eget
            // element gir full kontroll over form, farge og hvor spissen lander.
            `<span class="kart-boble-symbol" aria-hidden="true">${esc(symbolEmoji(mk.symbol))}</span><span class="kart-boble-tekst">${esc(mk.tekst)}</span><span class="kart-boble-hale" aria-hidden="true"></span>`,
            {
              permanent: true,
              // `top` gir Leaflets innebygde pil som peker NED mot punktet —
              // akkurat snakkeboble-formen som var ønsket. Offset løfter bobla
              // så halen lander på selve koordinatet.
              direction: 'top',
              offset: [0, -4],
              className: 'kart-markering-etikett',
              // Bobla ER markeringen nå, så den må ta imot trykk.
              interactive: true,
            },
          )
          .on('click', () => setValgtMarkering(mk.id))
          .addTo(lag)

        // Halen står mot VENSTRE ende av bobla, ikke midt på (#708). Leaflet
        // sentrerer tooltipen over punktet, så uten en motvekt ville halen
        // pekt et stykke til venstre for stedet den gjelder.
        //
        // Forskyvningen må måles, ikke gjettes: bobla er like bred som teksten
        // i den, og en fast offset ville bommet med halve differansen for hver
        // markering som ikke tilfeldigvis hadde «riktig» lengde.
        // getTooltip().getElement(), ikke markoer.getElement(): sistnevnte gir
        // det usynlige 1×1-ankeret. Det er BOBLA som skal forskyves.
        const boble = markoer.getTooltip()?.getElement()
        if (boble) {
          boble.style.marginLeft = `${boble.offsetWidth / 2 - HALE_FRA_VENSTRE}px`

          // Langtrykk kopierer lenken til stedet (#719) — native DOM-lyttere,
          // ikke React, fordi boble er en Leaflet-tegnet node utenfor Reacts
          // tre (samme begrunnelse som markoerHtml over).
          //
          // KRITISK: timeren setter KUN et flagg (`klar`). Selve
          // navigator.clipboard.writeText()-kallet skjer i pointerup, inne i
          // det ekte brukergestvinduet — Safari avviser clipboard-skriving
          // fra en setTimeout-callback som ligger UTENFOR det vinduet, selv
          // om timeren ble startet av en ekte pekerhendelse.
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
            if (e.pointerType === 'mouse') return
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
            // Hindrer at løftet i tillegg utløser Leaflets 'click' (som ville
            // åpnet detaljpanelet) — et langtrykk er ÉN handling, ikke to.
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

        // Linja gjennom sporet tegnes FØRST, så prikker og markør legger seg
        // oppå den. Motsatt rekkefølge ville lagt en strek tvers over ansiktene.
        if (m.spor.length > 1) {
          L.polyline(
            m.spor.map(p => [p.lat, p.lng] as [number, number]),
            {
              className: erMeg ? 'kart-rute kart-rute-meg' : 'kart-rute',
              weight: 3,
              opacity: 0.55,
              // Leaflet setter farge som SVG-attributt og overstyrer klassen,
              // så color må settes her. var() er gyldig i SVG-attributtet og
              // plukker opp tema-tokenet som alt annet.
              color: erMeg ? 'var(--accent)' : 'var(--text-tertiary)',
              interactive: false,
            },
          ).addTo(lag)
        }

        // Alle punkter UNNTATT det siste: små prikker som viser hvor han var.
        for (const p of m.spor.slice(0, -1)) {
          L.marker([p.lat, p.lng], {
            icon: L.divIcon({
              html: sporPrikkHtml(m.navn),
              className: '',
              iconSize: [12, 12],
              iconAnchor: [6, 6],
            }),
            alt: `${m.navn} var her`,
            title: `${m.navn} — ${relativTid(p.registrert)}`,
            // Gamle punkter skal ikke stjele trykk fra markøren når de ligger tett.
            interactive: false,
          }).addTo(lag)
        }

        // Nøyaktighetssirkelen er ikke pynt: et punkt med ±1500 m og ett med
        // ±10 m ser identiske ut som prikker, men betyr helt forskjellige ting
        // for den som skal finne deg. Kun på siste punkt, og kun når
        // usikkerheten er stor nok til å bety noe på gatenivå.
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
            // 40 og ikke 34: et ansikt trenger flere piksler enn to bokstaver
            // for å kjennes igjen. Anchor er halve størrelsen, så prikken står
            // sentrert over koordinatet.
            iconSize: [40, 40],
            iconAnchor: [20, 20],
          }),
          alt: m.navn,
          title: `${m.navn} — ${relativTid(siste.registrert)}`,
          // #700: ansiktet har ingen handling — trykk går til kartet (lukker panel),
          // langtrykk starter en markering, som på tom kartflate.
          interactive: false,
          keyboard: false,
        }).addTo(lag)
      }
    })

    return () => {
      avbrutt = true
    }
  }, [menn, markeringer, megId, kartKlar, kopierLenke])

  // Nøkkelen (ikke objektet) er dep-en under (#719) — samme mønster som
  // forrigeTimeplanId lenger opp: `deltSted` er et NYTT objekt fra serveren
  // ved hver RSC-render (f.eks. etter en pling eller settMarkering et annet
  // sted på siden), og en deps-sammenligning på objektidentitet ville trigget
  // effektene under langt oftere enn stedet faktisk endret seg.
  const deltStedKey = deltSted ? `${deltSted.lat},${deltSted.lng},${deltSted.tekst ?? ''}` : null

  // Tegner en egen markør for det delte stedet (#719) — uavhengig av om noen
  // `kart_markering`-rad fortsatt finnes. Egen ref, IKKE lagRef: deles den
  // layer-gruppa ville markøren blitt visket ut hver gang menn/markeringer
  // tegnes på nytt (f.eks. ved en pling fra en annen mann).
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
        // #700: samme resonnement som person-markøren over — ingen handling,
        // trykk lukker nå panel, langtrykk starter markering, som vedtatt.
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
    // deltSted (ikke bare -Key) leses inni, men dep-en er nøkkelen — se
    // begrunnelsen over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kartKlar, deltStedKey])

  // Treffnåla for et valgt søketreff (#757) — PRIVAT og MIDLERTIDIG (i
  // motsetning til en kart_markering-rad): den lever kun så lenge steg ===
  // 'sok' og et treff er valgt, forsvinner igjen så snart man går videre
  // («Sett markering her»/«Legg i timeplanen») eller avbryter. Egen
  // LayerGroup, ikke lagRef — den delte laget tegnes på nytt av en annen
  // effekt (menn/markeringer) og ville visket bort nåla ved neste render.
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
        // Ren visning — ikke-interaktiv og ikke i keyboard-tabordenen, i
        // motsetning til en ekte kart_markering-boble som tar imot trykk.
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

  // Flytter kartet til et NYTT delt sted etter mount (#719) — startutsnittet
  // dekkes allerede av init-effekten over. Refen holder unna den samme
  // objektidentitets-fellen som -Key-forklaringen over: kun en ekte
  // verdiendring skal utløse en flyTo, ikke en vilkårlig RSC-revalidering.
  //
  // Samme ankomst som init-effekten (#753) — dette er den ANDRE av de to
  // ankomstveiene: lenken trykket fra chat-PANELET mens man allerede står
  // på /kart (komponenten remountes ikke, kun søkeparametrene endres).
  // Ingen ventetid på fliser her: kartet er allerede tegnet i sitt nåværende
  // utsnitt, det er kun MÅLET som er nytt.
  const forrigeDeltStedKey = useRef<string | null>(deltStedKey)
  useEffect(() => {
    if (deltStedKey === forrigeDeltStedKey.current) return

    // Lenken er FJERNET (?lat/?lng borte): ingen flyvning å gjøre, men
    // tilstanden er terminal — nøkkelen stemples, slik at det samme stedet
    // delt på nytt senere fortsatt teller som en ekte endring.
    if (!deltStedKey || !deltSted) {
      forrigeDeltStedKey.current = deltStedKey
      return
    }

    // Kartet er ikke bygget ennå (Leaflet importeres dynamisk, og en lenke i
    // chat-panelet kan fint trykkes i det vinduet): IKKE stemple nøkkelen her.
    // Effekten kjøres på nytt når `kartKlar` slår om, og flyr da. Samme regel
    // som § Policy: Navigasjon setter for push-overleveringen — markøren
    // konsumeres når handlingen har LYKTES, ikke når den leses.
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

  // Escape lukker markeringspanelet — samme mønster som EuropaKart og
  // AlbumLightbox bruker.
  useEffect(() => {
    if (valgtMarkering === null) return
    function handterTast(e: KeyboardEvent) {
      if (e.key === 'Escape') setValgtMarkering(null)
    }
    document.addEventListener('keydown', handterTast)
    return () => document.removeEventListener('keydown', handterTast)
  }, [valgtMarkering])

  // Forsvinner markeringen (fjernet av meg, eller utløpt mens siden sto åpen),
  // skal ikke panelet bli stående og peke på noe som ikke finnes.
  useEffect(() => {
    if (valgtMarkering && !markeringer.some(m => m.id === valgtMarkering)) {
      setValgtMarkering(null)
    }
  }, [markeringer, valgtMarkering])

  // Markeringen settes der SIKTET står — midt i kartet — ikke der GPS-en sier
  // du er (#700).
  //
  // Opprinnelig brukte den getCurrentPosition. Det så ut som «Sett markering
  // her» plasserte noe uten at man fikk vite hvor, fordi det ikke sto noe kryss
  // på kartet: man hadde ingen måte å se hva «her» betydde før nåla dukket opp.
  // Siktet gjør stedet synlig FØR man lagrer, og lar deg samtidig markere et
  // sted du ikke står — møtestedet, baren borte i gata. Som bonus faller hele
  // GPS-veien bort: ingen tillatelsesdialog, ingen timeout, ingen ventetid.
  // Steg 1 → 2: lås stedet krysset står på, og gå videre til teksten.
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

  // Committen fra langtrykk-gesten (#762, effekten over): panorerer punktet
  // man holdt på inn under siktet, i stedet for å plassere et sikte der
  // fingeren var. Siktet er alltid i sentrum og bekreftSted() leser
  // getCenter() — panorering lar langtrykket arve HELE #700-maskineriet uten
  // én ny sannhetskilde for koordinatet, og punktet kommer samtidig ut fra
  // under fingeren, som er svaret på «hvordan ser man hvor det havner».
  //
  // Forflytningen er SYNKRON (animate: false), ikke animert. Var den animert,
  // sto kartsenteret et sted mellom gammelt senter og punktet så lenge
  // animasjonen løp — mens «Her er det» var trykkbar fra første frame, og
  // bekreftSted() leser getCenter(). Et raskt trykk låste da et koordinat
  // fingeren aldri pekte på, altså nøyaktig den upresisheten gesten skulle
  // fjerne. Alternativet (holde knappen død til 'moveend') gjør en knapp
  // ubrukelig i et kvart sekund for å redde en animasjon som uansett er kort:
  // avstanden er aldri mer enn et halvt kartutsnitt, og gesten committer på
  // pointerup — fingeren er allerede på vei opp når kartet flytter seg.
  // Vaktet av «bekreft umiddelbart etter slipp» i __tests__/kart-langtrykk.test.tsx.
  const startMarkeringFraLangtrykk = useCallback((latlng: LatLng) => {
    const kart = kartetRef.current
    if (!kart) return
    setPresseRing(null)
    setAapentPanel('ingen')
    setValgtMarkering(null)
    kart.panTo(latlng, { animate: false })
    setFeil(null)
    setStedKilde('langtrykk')
    // Steg 'av' → gå til 'sted' (start flyten). Steg 'sted'/'timeplan-punkt' →
    // bare panorer, la steget stå (regissørens beslutning #2). 'tekst' nås
    // aldri hit — koordinatet er låst der, og pointerdown-lytteren silte det
    // bort før vi kom så langt.
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

  // Punktvalg for en timeplan-post (#716) — samme sikte som markeringsflyten
  // over, gjenbrukt via steg 'timeplan-punkt' (ÉN sikte-tilstand for hele
  // kartet). Panelet glir helt ut (aapentPanel → 'ingen') og inn igjen
  // (aapentPanel → 'timeplan') rundt dette; utkastet selv rører vi ikke, det
  // bor i egen state over og overlever runden uendret.
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
    // Et langtrykk (eller et søketreff, #757) under punktvalget setter
    // stedKilde (samme sikte, flere veier inn). Uten nullstilling her ville
    // neste ordinære «Sett markering» møtt hjelpeteksten «Krysset står der
    // du holdt» selv om den ble startet med knappen.
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
  // Åpner søket. Samme opprydding som «Sett markering»/langtrykk: lukk andre
  // paneler, nullstill en tidligere valgt markering og feilmelding.
  const startStedSok = useCallback(() => {
    setAapentPanel('ingen')
    setValgtMarkering(null)
    setFeil(null)
    setSokValgt(null)
    setSteg('sok')
  }, [])

  // Et treff er valgt fra StedSoks kandidatliste: kartet flyr dit (uten
  // animasjon hvis brukeren har bedt om redusert bevegelse) og treffnåla
  // tegnes av effekten lenger ned (avhenger av sokValgt). Ren visning —
  // ingenting er «satt» ennå, det skjer først i markerFraSok/leggSokITimeplan.
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

  // «Sett markering her» fra et søketreff: går via SAMME sikte/«Her er
  // det»-bekreftelse som «Sett markering»-knappen og langtrykket — treffnåla
  // er privat og midlertidig, kun bekreftSted() lager en delt kart_markering
  // (regissørens produktvalg for #757). panTo (synkron) sentrerer kartet
  // eksakt på treffet FØR steg 'sted' vises, slik at «Her er det» kan
  // trykkes med én gang uten å måtte vente på en flyTo-animasjon.
  const markerFraSokTreff = useCallback((treff: StedTreff) => {
    const kart = kartetRef.current
    if (kart) kart.panTo([treff.lat, treff.lng], { animate: false })
    setSokValgt(null)
    setFeil(null)
    setStedKilde('sok')
    setSteg('sted')
  }, [])

  // «Legg i timeplanen» fra et søketreff: fyller PUNKTET i utkastet direkte
  // (samme felt som punktvalg-flyten skriver til), og fyller TEKSTEN med
  // stedets navn KUN hvis feltet er tomt — en tekst brukeren alt har skrevet
  // skal aldri overskrives av et treffnavn. Adressen NULLSTILLES (fylles ikke
  // med Nominatim-teksten): adresse vinner over punkt ved navigering, så en
  // gammel adresse fra utkastet ville sendt folk feil sted (#757-review).
  const leggSokTreffITimeplan = useCallback((treff: StedTreff) => {
    setTimeplanPunkt({ lat: treff.lat, lng: treff.lng })
    setTimeplanAdresse(null)
    setTimeplanTekst(t => (t.trim() ? t : treff.navn))
    setSokValgt(null)
    setFeil(null)
    setSteg('av')
    setAapentPanel('timeplan')
  }, [])

  // «Nytt søk»: det forrige treffet er ikke lenger valgt, så nåla skal bort.
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
      setValgtMarkering(null)
    } catch {
      setFeil('Klarte ikke fjerne markeringen. Prøv igjen.')
    }
  }, [])

  const pling = useCallback(async (profilId: string, navn: string) => {
    setFeil(null)

    // OPTIMISTISK: knappen reagerer på TRYKKET, ikke på serveren (#705).
    // sendVarsel() gjør et rundeslag mot Supabase, web-push og Resend før den
    // returnerer — det tar lang nok tid at knappen så død ut, og man trykket
    // igjen. Nøyaktig det produkteieren gjorde fem ganger den første kvelden,
    // som er hva kvitteringen fra #700 skulle løse; den løste bare halve
    // problemet, fordi den kom etter ventetiden.
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
    // Kvitteringen står i POSISJON_PLING_KVITTERING_SEK og forsvinner så av
    // seg selv. Den skal være lenge nok til at man rekker å se den, men ikke
    // så lenge at knappen føles ødelagt — og når den går tilbake er det
    // samtidig invitasjonen til å spørre igjen.
    const id = window.setTimeout(rullTilbake, POSISJON_PLING_KVITTERING_SEK * 1000)
    plingTimere.current.push(id)

    try {
      await plingEtterPosisjon(profilId)
    } catch {
      // Rulles tilbake ved feil. Uten dette ville den optimistiske
      // kvitteringen LØYET: varselet ER handlingen her (jf. Policy: Varsler),
      // og en grønn kvittering på noe som aldri ble sendt er verre enn ingen.
      window.clearTimeout(id)
      rullTilbake()
      setFeil(`Fikk ikke sendt pling til ${navn}. Prøv igjen.`)
    }
  }, [])

  const antallPaaKartet = menn.length + markeringer.length

  // «Timeplan · 17:00» på pilla (#716) — neste post som ikke er passert enda,
  // fra SERVERENS liste. Bevisst forenkling: en post lagt til tidligere i
  // DENNE økten (kun i TimeplanPanel sin optimistiske state) rekker ikke
  // oppdatere denne teksten før neste fulle sidelast — pilla er en
  // orientering, ikke fasit; panelet (som ER autoritativt) viser alltid
  // riktig liste.
  const nesteTimeplanKlokke = (() => {
    const kommende = timeplanPoster
      .filter(p => new Date(p.tidspunkt).getTime() >= Date.now())
      .sort((a, b) => new Date(a.tidspunkt).getTime() - new Date(b.tidspunkt).getTime())
    return kommende[0] ? formaterDato(kommende[0].tidspunkt, 'HH:mm') : null
  })()

  // Delt mellom stille-knappene og Alert zone-rammen (#763) — samme markup
  // for begge grupper, ingen duplisering mellom raden og sonen.
  // KlubbSymbol og ikke (typeof MARKERING_SYMBOLER)[number]: de partisjonerte
  // listene er typet som KlubbSymbol, ikke som medlemmer av register-unionen
  // (se lib/markering-symboler.ts for hvorfor).
  function symbolKnapp(sym: KlubbSymbol) {
    const valgt = markeringSymbol === sym.id
    return (
      <button
        key={sym.id}
        type="button"
        onClick={() => setMarkeringSymbol(sym.id)}
        aria-pressed={valgt}
        // Kun de varslende symbolene får en aria-label — rammen sier
        // ingenting til den som ikke ser den, og "Alert zone" alene
        // forklarer ikke konsekvensen. Etiketten blir prefiks i navnet
        // ("label in name"), så synlig tekst og skjermleser er i samsvar.
        aria-label={sym.varsel ? `${sym.etikett} — varsler alle i klubben` : undefined}
        data-testid={`symbol-${sym.id}`}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          // Sonen strekker sine knapper til egen høyde pluss SONE_PAD i
          // padding, og align-items: stretch (default) på den ytre raden
          // strekker DA de stille knappene til samme, høyere rad-høyde.
          // Uten justifyContent ville de stille knappenes innhold (som
          // flex-start i en høyere boks) ligget over de innrammedes —
          // center holder emojiene på linje, forutsatt symmetrisk padding
          // i sonen (SONE_PAD likt topp/bunn).
          justifyContent: 'center',
          gap: 2,
          padding: '8px 4px',
          borderRadius: 'var(--radius-small)',
          // Valgt symbol får aksentramme OG bakgrunn: på et lite
          // felt over et kart er ramme alene lett å overse.
          border: valgt ? '1px solid var(--accent)' : '0.5px solid var(--border)',
          background: valgt ? 'var(--accent-soft)' : 'transparent',
          color: valgt ? 'var(--text-primary)' : 'var(--text-secondary)',
          cursor: 'pointer',
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
        // `relative`, IKKE `fixed` (#706). Fixed var det opplagte svaret på at
        // knappene forsvant, men det virker ikke her: `.page-enter` i
        // (app)-layouten har en `transform`-animasjon med fill-mode `both`, og
        // en forelder med transform blir containing block for `position:
        // fixed`. Kartet festet seg da til en kollapset blokk i stedet for til
        // viewporten, og forsvant helt.
        //
        // Rotårsaken er uansett en annen: at SIDEN kunne bevege seg bak
        // kartet. Den er fjernet i effekten over (body-lås + overscroll), og
        // da er `absolute`-overlays inne i en `relative` flate like faste som
        // fixed ville vært.
        position: 'relative',
        // TopHeader er `--top-header-h` HØY PLUSS iOS' topp-innsett i
        // padding (se components/TopHeader.tsx). Trakk vi bare fra høyden, ble
        // kartflaten for høy med hele notch-innsettet og stakk forbi bunnen av
        // skjermen — alt inni, inkludert bunn-knappene, ble skjøvet tilsvarende
        // ned og delvis ut av syne (#707).
        //
        // I reisemodus (#723) er TopHeader ikke montert i det hele tatt — flaten
        // fyller da HELE viewporten i stedet for det som er igjen under headeren.
        height: reisemodus
          ? '100dvh'
          : 'calc(100dvh - var(--top-header-h) - var(--safe-top, 0px))',
        width: '100%',
        overflow: 'hidden',
        // Stopper iOS' rubber-band: uten denne drar et kart-sveip hele siden
        // med seg i bounce, og overlayene sklir ut av skjermen selv om siden
        // ikke egentlig kan scrolle.
        overscrollBehavior: 'none',
        background: 'var(--bg-elevated)',
        // Custom property KONSUMERT av kart-panelene (knapperad, chat-panel,
        // listepanel, TimeplanPanel) i stedet for at hver av dem leser
        // iOS' egen topp-innsett-variabel selv. Med headeren har flaten
        // allerede rykket seg ned under notchen (se height over) — et panel
        // som DA også la på innsettet talte notchen dobbelt (~59 px død luft
        // på en iPhone med notch, se arkitekturstyrets uttalelse i #723).
        // Uten headeren (reisemodus) har flaten IKKE gjort det selv, og
        // panelene MÅ da legge inn innsettet. Ingen kart-panel skal
        // noensinne lese iOS' topp-innsett-variabel direkte — det er
        // invarianten (se grep-kommandoen i CLAUDE.md § Policy: Navigasjon).
        '--kart-panel-safe-top': reisemodus ? 'var(--safe-top, 0px)' : '0px',
        // Høyden på toppkontroll-sonen i hjørnet (ReisemodusBar). 0 uten
        // reisemodus, siden baren ikke finnes da. Verdien eies av
        // ReisemodusBar — se konstantene der (#723-review).
        '--kart-topp-sone': reisemodus ? `${REISEMODUS_BAR_SONE}px` : '0px',
      } as React.CSSProperties}
    >
      <div ref={kartRef} data-testid="posisjonskart" style={{ position: 'absolute', inset: 0 }} />

      {/* ── Reisemodus-bar ───────────────────────────────────────────────────
          Erstatter TopHeader (som ikke er montert i reisemodus, se
          app/(app)/layout.tsx): egen avatar + ulest-prikk + toggle, flytende
          over kartet øverst til høyre — «samme sted i begge moduser»,
          bevisst valgt (#723). */}
      {reisemodus && (
        <ReisemodusBar zIndex={Z.KNAPPER} />
      )}

      {/* ── Knapperad, oppå kartet ───────────────────────────────────────────
          Små piller med liten skrift (#704): kartet er innholdet, knappene er
          verktøy. Wrapper-en har pointerEvents:none så kartet kan panoreres i
          mellomrommene mellom pillene — bare pillene selv tar imot trykk. */}
      <div
        style={{
          position: 'absolute',
          // I NORMAL modus starter flaten allerede under headeren, som selv
          // har tatt hensyn til notchen — --kart-panel-safe-top er da 0px, og
          // dette er nøyaktig `top: 10` som før (#707). I reisemodus (#723) er
          // headeren borte, og variabelen bærer innsettet i stedet.
          //
          // I reisemodus deler denne raden hjørnet med ReisemodusBar (avatar +
          // toggle, øverst til høyre) — uten et ekstra offset flexWrap-et en
          // pille (typisk «Timeplan», siden den bare vises når det FAKTISK er
          // en aktuell tur — nøyaktig når reisemodus også er aktuelt) rett oppå
          // ReisemodusBar og blokkerte klikk på togglen. --kart-topp-sone er
          // barens reserverte høyde, satt fra ReisemodusBar sine egne mål
          // (0px uten reisemodus) — ikke et tall gjettet her (#723-review).
          top: `calc(${KART_TOPP_MARGIN}px + var(--kart-topp-sone, 0px) + var(--kart-panel-safe-top, 0px))`,
          left: KART_TOPP_MARGIN,
          right: KART_TOPP_MARGIN,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          pointerEvents: 'none',
          zIndex: Z.KNAPPER,
        }}
      >
        {meg ? (
          <>
            <button
              type="button"
              onClick={() => hentOgLagre(false)}
              disabled={opptatt}
              data-testid="del-knapp"
              style={{ ...PILLE_PRIMAER, opacity: opptatt ? 0.6 : 1 }}
            >
              {/* Tre tilstander, ikke to: teksten skal si hvilken av de to
                  ventetidene som pågår. `jobber` sjekkes først fordi
                  GPS-hentingen kommer først i flyten — refreshen er det som
                  står igjen etterpå. */}
              {jobber ? 'Henter …' : friskerOpp ? 'Oppdaterer …' : 'Oppdater'}
            </button>
            <button
              type="button"
              onClick={stoppNaa}
              disabled={opptatt}
              data-testid="stopp-knapp"
              style={{ ...PILLE, opacity: opptatt ? 0.6 : 1 }}
            >
              Slutt å dele
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => hentOgLagre(false)}
              disabled={opptatt}
              data-testid="del-knapp"
              style={{ ...PILLE_PRIMAER, opacity: opptatt ? 0.6 : 1 }}
            >
              {jobber ? 'Henter posisjon …' : 'Del posisjonen min'}
            </button>
            {/* Uten denne har den som følger turen uten å dele egen posisjon
                ingen vei til friske data etter at pull-to-refresh ble
                slått av på kartet (#718) — verst i reisemodus, der
                TopHeader ikke finnes og «naviger bort og tilbake» ikke er
                et reelt alternativ. Vises kun her: har `meg` verdi, gjør
                «Oppdater»-pilla i `if (meg)`-grenen over allerede jobben. */}
            <button
              type="button"
              onClick={friskOppKartet}
              disabled={opptatt}
              data-testid="oppdater-kart-knapp"
              style={{ ...PILLE, opacity: opptatt ? 0.6 : 1 }}
            >
              {/* LÅSEN følger `opptatt`, ikke `friskerOpp`: mens GPS-hentingen
                  fra pilla ved siden av pågår er `meg` fortsatt null, så denne
                  grenen står montert og pilla ville vært klikkbar — og hvert
                  trykk et `router.refresh()` i kappløp med refreshen
                  `hentOgLagre` selv ender i. TEKSTEN følger bare `friskerOpp`
                  (bevisst): «Henter …» hører til posisjons-pilla, og to piller
                  som samtidig annonserer samme ventetid er støy. Felles lås,
                  egen tekst — ikke «rett» det til én av delene (#718-review). */}
              {friskerOpp ? 'Oppdaterer …' : 'Oppdater'}
            </button>
          </>
        )}

        {steg === 'av' && (
          <button
            type="button"
            onClick={() => setSteg('sted')}
            data-testid="markering-start"
            style={PILLE}
          >
            Sett markering
          </button>
        )}

        {/* Søk-knappen (#757), samme gate som «Sett markering» over. Rund
            ikonknapp og ikke en tekstpille: raden flexWrap-er allerede på en
            390 px skjerm, og en fjerde pille (etter del/oppdater/sett
            markering) ville dyttet timeplan-pilla ned i en ny rad oftere enn
            nødvendig. 44×44 — minste lovlige trykkflate. */}
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

        {/* Timeplan-pilla (#716). Rendres kun når det finnes et aktuelt
            arrangement — uansett hvor langt fram — og skjules mens man
            sikter, samme gate som «Sett markering» over. Viser neste
            kommende KLOKKESLETT, ikke teksten: knapperaden flexWrap-er
            allerede, og en pille med variabel lengde ville skjøvet de andre
            ned over kartet. */}
        {timeplanArrangement && steg === 'av' && (
          <button
            type="button"
            onClick={aapneTimeplan}
            aria-expanded={timeplanAapent}
            aria-label={timeplanAapent ? 'Lukk timeplanen' : 'Vis timeplanen'}
            data-testid="timeplan-pille"
            style={PILLE}
          >
            {nesteTimeplanKlokke ? `Timeplan · ${nesteTimeplanKlokke}` : 'Timeplan'}
          </button>
        )}

      </div>

      {/* ── Ringen under et pågående langtrykk (#762) ───────────────────────
          Wrapperen er søsken av kartdiven over, som selv er inset:0 i flaten
          — container-rect og flate-rect er derfor samme boks, og regnestykket
          i pointerdown-lytteren (over) holder MED og UTEN TopHeader/
          reisemodus. Ingen kart-panel skal noensinne lese iOS sin egen
          topp-innsett-variabel direkte (Policy: Navigasjon), og denne ringen
          er intet unntak. */}
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
          Ligger oppå kartet, ikke under det. Kun når det faktisk er noe å si —
          et tomt felt her ville spist kartplass uten grunn. */}
      {(steg !== 'av' || feil || plinget) && (
        <div
          style={{
            position: 'absolute',
            left: 10,
            right: 10,
            // Løftes over tastaturet når man skriver markeringsteksten.
            // Uten tastaturOffset ligger tekstfeltet bak tastaturet, og man
            // skriver i blinde.
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
                  // Låst til Leaflet faktisk er initialisert. Uten dette kunne
                  // man trykke før kartet fantes, og bekreftSted() hadde ingen
                  // kartsenter å lese — man fikk «Kartet er ikke klart ennå» i
                  // stedet for å komme videre. Sjelden på en rask telefon,
                  // rutine i CI, og det var der det ble fanget.
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
              {/* Symbolet velges FØR teksten: det er symbolet man ser på
                  kartet på avstand, og teksten er detaljen man leser ved å
                  trykke. Store trykkflater, ikke en nedtrekksliste — med fire
                  valg er en liste flere trykk enn valget er verdt. */}
              {/* Rekkefølgen er registerets: stille knapper først, så
                  Alert zone-rammen rundt de varslende (#763). Partisjonen
                  leses av sym.varsel — ingen liste over enkeltsymboler her. */}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }} role="group" aria-label="Symbol">
                {SYMBOLER_STILLE.map(symbolKnapp)}
                {SYMBOLER_VARSLER.length > 0 && (
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
                      // Basis lik sonens EGEN bredde-kostnad (padding, ramme,
                      // indre gaps — se SONE_EKSTRA), grow lik antall knapper
                      // inni. Da fordeler flexbox den FRIE plassen likt over
                      // alle knapper i raden, stille som innrammede — uten
                      // denne basisen spiser sonens egen ramme/padding av
                      // veksten før knappene inni får sin andel, og de
                      // innrammede ender smalere enn naboene sine.
                      flex: `${SYMBOLER_VARSLER.length} 1 ${SONE_EKSTRA}px`,
                    }}
                  >
                    {/* Absolutt posisjonert så den "kutter" rammens
                        topplinje (fieldset-legend-effekten) uten å koste
                        vertikal plass. <fieldset>/<legend> er bevisst ikke
                        brukt — display: flex på fieldset har WebKit-quirks,
                        og målplattformen er WebKit. Teksten i DOM er "Alert
                        zone" uendret — versalene kommer fra textTransform,
                        ikke fra strengen. */}
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
                    {SYMBOLER_VARSLER.map(symbolKnapp)}
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
                  // 16px og ikke mindre: iOS zoomer inn på et tekstfelt med
                  // mindre skrift, og etterlater kartet forskjøvet.
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
          Ett feedback-sted for to inngangar: «Kopier lenke»-knappen over OG
          langtrykk rett på en boble i kartet. */}
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
                // IKKE readOnly: iOS Safari ignorerer select() og
                // setSelectionRange() på et readonly-felt, så teksten lot seg
                // ikke markere i det hele tatt — og uten Kopier-knappen under
                // sto man da helt fast (#737). inputMode="none" hindrer at
                // tastaturet spretter opp selv om feltet er redigerbart.
                inputMode="none"
                onChange={() => {}}
                ref={el => {
                  if (!el) return
                  el.focus()
                  // setSelectionRange, ikke select(): den førstnevnte er den
                  // som faktisk virker i WebKit.
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
                {/* Et ekte click er den mest pålitelige brukergesten for
                    clipboard i WebKit — langt sikrere enn pointerup etter et
                    langtrykk, som er det som feilet og sendte oss hit (#737).
                    Derfor et nytt forsøk her framfor bare å be om manuell
                    markering. */}
                <button
                  type="button"
                  onClick={() => {
                    const v = lenkeFallback
                    if (!v) return
                    navigator.clipboard
                      ?.writeText(v)
                      .then(visLenkeKvittering)
                      .catch(() => {
                        /* Fortsatt nektet — feltet over er da eneste vei,
                           og det er nå markerbart. */
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
          Speiler listepanelet til høyre. Gutta er ofte på kartet fordi de skal
          finne hverandre — da er det å måtte bytte fane for å skrive «vi er
          her» én omvei for mye. */}
      {/* Timeplan-panelet (#716) tar samme høyre kant som listepanelet — de
          er gjensidig utelukkende via aapentPanel-unionen, så håndtakene
          under skjules mens timeplan er ute, akkurat som de allerede
          skjuler hverandre. */}
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
              cursor: 'pointer',
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
              // EKSPLISITT hidden. `overflow-y: auto` alene beregner
              // `overflow-x` til `auto` (CSS-spec: en ikke-visible verdi på én
              // akse tvinger den andre fra `visible` til `auto`), så panelet
              // lot seg dra sidelengs så snart noe innhold var for bredt —
              // chatten skal bare gå opp og ned (#710).
              overflowX: 'hidden',
              // Hindrer at panelets rubber-band (overscroll ved bunn/topp)
              // forplanter seg videre til siden og flytter visual-viewporten
              // — den ene dansevektoren skrivefeltet-i-flyt ikke løser av
              // seg selv (#714).
              overscrollBehaviorY: 'contain',
              pointerEvents: chatAapent ? 'auto' : 'none',
              zIndex: Z.PANEL,
              padding: `calc(10px + var(--kart-panel-safe-top, 0px)) 10px calc(10px + env(safe-area-inset-bottom, 0px))`,
            }}
          >
            <div style={{ ...SEKSJON, marginBottom: 10 }}>Klubbchat</div>
            {/* Rendres KUN når panelet er åpent: dynamic() henter da chunken
                ved første åpning, og aldri for dem som bare ser på kartet. */}
            {chatAapent && (
              <Chat
                scope={{ type: 'klubb' }}
                brukerId={megId}
                initialMeldinger={chatMeldinger}
                profiler={chatProfiler}
                visSeksjonsLabel={false}
                autoScrollTilBunn
                // Panelet, ikke vinduet: kartsiden låser vindusscroll, så
                // Chats vanlige window.scrollTo gjorde ingenting og tråden ble
                // stående midt oppe (#711).
                scrollContainer={() => chatPanelRef.current}
              />
            )}
          </aside>
        </>
      )}

      {/* ── Sidepanel med lista ──────────────────────────────────────────────
          Håndtaket står alltid på høyre kant; panelet glir ut ved trykk.
          Bredden er capet på 300 px: på en telefon i portrett ville 85 % dekket
          hele kartet, og da er man like langt som før redesignet.

          Håndtakene skjuler hverandre: med begge synlige sto de side om side
          når et panel var ute, og det var uklart hvilket som lukket hva.
          Samme gjelder timeplan-panelet (#716), som deler høyre kant med
          lista. Flyttet ut i KartListePanel (#732-uttrekk, ingen
          atferdsendring). */}
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
          Deler høyre kant med listepanelet over (gjensidig utelukkende via
          aapentPanel). Ingen eget håndtak (#716) — pilla i knapperaden er
          eneste åpner, og panelet har sin egen lukkeknapp i toppen. */}
      {timeplanArrangement && (
        <TimeplanPanel
          // Nøkkelen er arrangementets id (#716 review): panelets `poster`
          // seedes kun ved mount, så uten den ble den forrige turens liste
          // stående når en RSC-revalidering byttet aktuelt arrangement.
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

// aapneVeibeskrivelse() flyttet til lib/kart-navigasjon.ts (#732-uttrekk) —
// TimeplanRad trenger samme veibeskrivelse-åpning, og en 'use client'-fil kan
// ikke importere en funksjon fra en annen komponentfil uten å dra med seg
// hele komponenten.

// Hvor langt inn fra boblas venstre kant halen står (#708). «Ikke helt ut, men
// mot enden» — 22 px lander like til høyre for symbolet, så halen ser ut til å
// henge under det og ikke under midten av teksten.
const HALE_FRA_VENSTRE = 22

// Lagdeling over kartet.
//
// Leaflet har sine EGNE paner med faste z-index-verdier, og de er høye:
// tile 200, overlay 400, shadow 500, marker 600, tooltip 650, popup 700.
// Alt vi legger oppå kartet må ligge over dem, ellers blir det begravd av
// innhold Leaflet tegner. Siktet lå først på 500 og forsvant under markørene
// — usynlig i akkurat den situasjonen det finnes for (#704).
//
// Verdiene her starter derfor over 700, og er navngitt så neste overlay ikke
// må gjette seg til hvor den hører hjemme.
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
// Pillene er små med vilje (#704): kartet er innholdet, knappene er verktøy
// som ligger oppå det. pointerEvents: auto fordi knapperad-wrapperen har
// pointerEvents: none — kartet skal kunne panoreres mellom pillene.
// Pillene bar mono-uppercase — teknisk og stramt. Sommer-løftet (#713) gjør
// dem til vanlig skrift i normal setning: lettere å lese på et kart, og
// mindre «kontrollpanel».
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
  cursor: 'pointer',
  pointerEvents: 'auto',
  whiteSpace: 'nowrap',
  boxShadow: 'var(--shadow-popover)',
} as const

const PILLE_PRIMAER = {
  ...PILLE,
  // Sol, ikke appens sand-aksent: den primære handlingen på kartet skal være
  // det varmeste punktet på skjermen.
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

// Alert zone-rammen rundt de varslende symbolene (#763). Piksel-lokal
// geometri til én komponent — bevisst IKKE i lib/konstanter.ts, som er for
// domene-konstanter, ikke layout-tall.
const SONE_PAD = 5

// Sonens egen bredde-kostnad, brukt som flex-basis på sonen (se stilen der
// for hele regnestykket): (antall indre knapper − 1) gap-er mellom dem à
// 8px, pluss padding på begge sider, pluss 2px for rammens 1px border på
// hver kant.
const SONE_EKSTRA = (SYMBOLER_VARSLER.length - 1) * 8 + 2 * SONE_PAD + 2

// Seksjonsetikettene sto som 9 px mono-uppercase med 2 px sperring — et
// arkiv-uttrykk. Nå display-fonten i normal setning: samme rolle, lettere
// stemme (#713).
const SEKSJON = {
  fontFamily: 'var(--font-display)',
  fontSize: 15,
  color: 'var(--kart-tekst)',
  letterSpacing: '-0.1px',
  marginBottom: 8,
  fontWeight: 500,
} as const
