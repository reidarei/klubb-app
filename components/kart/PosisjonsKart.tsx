'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import type { Map as LeafletMap, LayerGroup } from 'leaflet'
import { formatDistanceToNowStrict } from 'date-fns'
import { nb } from 'date-fns/locale'
import Avatar, { hueAv } from '@/components/ui/Avatar'
import { harGulGloed } from '@/lib/roller'
import { bildeSrc } from '@/lib/bilde-utils'
import { delPosisjon, stoppDeling, plingEtterPosisjon } from '@/lib/actions/posisjon'
import { settMarkering, slettMarkering } from '@/lib/actions/kart-markering'
import { sendFeilBeacon } from '@/lib/klient-logg'
import {
  POSISJON_FERSK_MINUTTER,
  POSISJON_KART_ZOOM,
  POSISJON_KART_FALLBACK_ZOOM,
  POSISJON_DELING_TIMER,
  POSISJON_PLING_KVITTERING_SEK,
  KART_MARKERING_MAKS_LENGDE,
} from '@/lib/konstanter'
import { formaterDato, FORMAT_KLOKKE } from '@/lib/dato'
import { googleMapsAppUrl, googleMapsNettUrl } from '@/lib/kart-navigasjon'
import { useKeyboardOffset } from '@/components/chat/hooks/useKeyboardOffset'
import {
  MARKERING_SYMBOLER,
  STANDARD_SYMBOL,
  symbolEmoji,
  type MarkeringSymbol,
} from '@/lib/markering-symboler'

// Chat-komponenten er stor, og de fleste som åpner kartet er der for kartet.
// ssr: false fordi den uansett bare rendres etter et klikk — og da slipper
// serveren å bygge markup ingen ser (#709).
const Chat = dynamic(() => import('@/components/chat/Chat'), { ssr: false })

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
  /** Senter når ingen deler. Klubbens egen bydel, fra lib/klubb-config.ts. */
  fallbackSenter: { lat: number; lng: number }
  /**
   * Sant når et arrangement rammer inn sporet. Sporet VISES uansett (#698) —
   * dette styrer bare hvor lenge ruta lever, og hva vi lover brukeren om det.
   */
  underArrangement: boolean
  /** Admin kan fjerne andres markeringer — RLS tillater det allerede. */
  erAdmin: boolean
  /** Tittelen på arrangementet som pågår, til den lille status-pilla. */
  arrangementTittel: string | null
  /** Av når admin har skrudd av chat-fanen (admin beholder tilgang selv). */
  visChat: boolean
  chatMeldinger: React.ComponentProps<typeof Chat>['initialMeldinger']
  chatProfiler: React.ComponentProps<typeof Chat>['profiler']
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
// etter at Reidar testet med Michael: «1R» sa ham ingenting om hvem som sto der,
// og et lite ansikt gjenkjennes raskere enn to bokstaver når man vet hvem som er
// med. Størrelsen er samtidig hevet fra 34 til 40 px for å gi ansiktet en sjanse.
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
// siden av. Det leste som to markeringer, og som Reidar sa: man må nesten bare
// velge. Bobla er nå hele markeringen, og halen under den er det som peker på
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
  arrangementTittel,
  visChat,
  chatMeldinger,
  chatProfiler,
}: Props) {
  const kartRef = useRef<HTMLDivElement>(null)
  const kartetRef = useRef<LeafletMap | null>(null)
  const lagRef = useRef<LayerGroup | null>(null)

  const [jobber, setJobber] = useState(false)
  const [feil, setFeil] = useState<string | null>(null)
  const [plinget, setPlinget] = useState<string | null>(null)
  // Hvem som nettopp er plinget, og derfor har en låst, grå knapp. Uten denne
  // sto knappen helt uendret etter trykket, og Reidar visste ikke om plinget
  // faktisk hadde gått ut — knappen var eneste stedet han så etter svar.
  const [nyligPlinget, setNyligPlinget] = useState<Record<string, boolean>>({})
  // Timer-IDene ryddes ved unmount. Uten det fyrer en setState på en komponent
  // som er borte hvis man forlater kartet innen vinduet er ute.
  const plingTimere = useRef<number[]>([])
  // Markeringsskjemaet er lukket til man trykker «Sett markering». Å la
  // tekstfeltet stå åpent hele tiden ville tatt plass fra kartet, som er det
  // man er der for.
  // Markeringsflyten har to steg (#702). Ett steg var feil rekkefølge: å åpne
  // tekstfeltet med én gang sprang opp tastaturet, som dekket kartet — og
  // dermed krysset man skulle sikte med. Man skrev inn teksten uten å ha sett
  // hvor nåla havnet.
  //
  //   'av'    — ingenting på gang
  //   'sted'  — krysset står på kartet, kartet er fritt å flytte, ingen tekst
  //   'tekst' — stedet er låst, nå skriver man hva det er
  const [steg, setSteg] = useState<'av' | 'sted' | 'tekst'>('av')
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
  // Sidepanelet med lista (#704). Minimert som default: kartet er grunnen til
  // at man er her, og lista er oppslagsverket ved siden av.
  const [panelAapent, setPanelAapent] = useState(false)
  // Chatten i venstrepanelet. Minimert som default, som lista til høyre:
  // kartet er grunnen til at man er på siden.
  const [chatAapent, setChatAapent] = useState(false)
  const chatPanelRef = useRef<HTMLElement>(null)

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

  // Ett panel om gangen. To åpne paneler på en 390 px skjerm ville latt igjen
  // en stripe kart i midten — da er man like langt som før kartet ble
  // fullskjerm.
  const aapneListe = useCallback(() => {
    setChatAapent(false)
    setPanelAapent(a => !a)
  }, [])

  const aapneChat = useCallback(() => {
    setPanelAapent(false)
    setChatAapent(a => !a)
  }, [])

  const senterPaa = useCallback((lat: number, lng: number) => {
    kartetRef.current?.flyTo([lat, lng], POSISJON_KART_ZOOM)
  }, [])

  // Kjernen i innmeldingen. `stille` skiller den automatiske oppdateringen ved
  // sidelast fra et bevisst knappetrykk: den automatiske skal aldri vise en
  // feilmelding eller flytte kartet under føttene på deg — den bare fyller på
  // sporet hvis den får lov.
  const hentOgLagre = useCallback(
    (stille: boolean) => {
      if (!stille) setFeil(null)
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        if (!stille) setFeil('Denne telefonen gir ikke appen tilgang til posisjon.')
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
                return
              }
              senterPaa(pos.coords.latitude, pos.coords.longitude)
            }
          } catch {
            if (!stille) {
              setJobber(false)
              setFeil('Klarte ikke lagre posisjonen. Prøv igjen.')
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
        },
        // enableHighAccuracy slår på GPS i stedet for mast/wifi. Det koster
        // batteri og noen sekunder, men et punkt med ±1500 m er ubrukelig til
        // nettopp det kartet er til for: å finne hverandre i en gate.
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      )
    },
    [senterPaa],
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
    const node = kartRef.current
    if (!node) return

    import('leaflet').then(mod => {
      if (avbrutt || kartetRef.current) return
      const L = mod.default

      // Startutsnittet rammer inn ALT som finnes — hver manns siste posisjon OG
      // hver markering. Tidligere sentrerte kartet på første manns siste punkt,
      // og markeringer telte ikke med: setter noen en markering i sentrum mens
      // ingen deler posisjon, åpnet kartet på klubbens bydel med nåla langt
      // utenfor skjermen. Man så den aldri, og kunne dermed heller ikke trykke
      // på den (#699).
      const punkterIUtsnittet: [number, number][] = [
        ...menn.flatMap(m => {
          const siste = m.spor[m.spor.length - 1]
          return siste ? [[siste.lat, siste.lng] as [number, number]] : []
        }),
        ...markeringer.map(mk => [mk.lat, mk.lng] as [number, number]),
      ]

      const kart = L.map(node, {
        center: punkterIUtsnittet[0] ?? [fallbackSenter.lat, fallbackSenter.lng],
        zoom: punkterIUtsnittet.length > 0 ? POSISJON_KART_ZOOM : POSISJON_KART_FALLBACK_ZOOM,
        // Zoom-knappene er museflate. Målplattformen er en telefon der man
        // kniper, og knappene ville bare spist skjermplass.
        zoomControl: false,
        attributionControl: true,
      })

      // Med flere punkter zoomer vi ut til alt får plass. maxZoom hindrer at to
      // punkter i samme kvartal zoomer helt inn på husnummer; padding holder
      // markørene unna kanten, der de ville vært halvt avskåret.
      if (punkterIUtsnittet.length > 1) {
        kart.fitBounds(L.latLngBounds(punkterIUtsnittet), {
          padding: [50, 50],
          maxZoom: POSISJON_KART_ZOOM,
        })
      }

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        // Attribusjon er et VILKÅR for å bruke OSMs fliser, ikke en høflighet.
        attribution: '&copy; OpenStreetMap',
      }).addTo(kart)

      lagRef.current = L.layerGroup().addTo(kart)
      kartetRef.current = kart
      setKartKlar(true)
      // Leaflet måler containeren ved init. Åpnes siden mens layouten fortsatt
      // setter seg (fonter, safe-area), blir målingen for liten og flisene
      // dekker bare deler av ruta. invalidateSize etter første paint retter opp.
      requestAnimationFrame(() => kart.invalidateSize())
    })

    return () => {
      avbrutt = true
      kartetRef.current?.remove()
      kartetRef.current = null
      lagRef.current = null
      setKartKlar(false)
    }
    // Kjøres én gang: menn/fallbackSenter leses kun for STARTutsnittet, og
    // senere endringer tegnes av effekten under i stedet for å bygge kartet på nytt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
              // akkurat snakkeboble-formen Reidar ba om. Offset løfter bobla
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
        }).addTo(lag)
      }
    })

    return () => {
      avbrutt = true
    }
  }, [menn, markeringer, megId, kartKlar])

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
    setSteg('tekst')
  }, [])

  const avbrytMarkering = useCallback(() => {
    setSteg('av')
    setMarkeringTekst('')
    setMarkeringSymbol(STANDARD_SYMBOL)
    setValgtSted(null)
    setFeil(null)
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
    // igjen. Nøyaktig det Reidar gjorde fem ganger den første kvelden, som er
    // hva kvitteringen fra #700 skulle løse; den løste bare halve problemet,
    // fordi den kom etter ventetiden.
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
        // TopHeader er `--top-header-h` HØY PLUSS `env(safe-area-inset-top)` i
        // padding (se components/TopHeader.tsx). Trakk vi bare fra høyden, ble
        // kartflaten for høy med hele notch-innsettet og stakk forbi bunnen av
        // skjermen — alt inni, inkludert bunn-knappene, ble skjøvet tilsvarende
        // ned og delvis ut av syne (#707).
        height: 'calc(100dvh - var(--top-header-h) - env(safe-area-inset-top, 0px))',
        width: '100%',
        overflow: 'hidden',
        // Stopper iOS' rubber-band: uten denne drar et kart-sveip hele siden
        // med seg i bounce, og overlayene sklir ut av skjermen selv om siden
        // ikke egentlig kan scrolle.
        overscrollBehavior: 'none',
        background: 'var(--bg-elevated)',
      }}
    >
      <div ref={kartRef} data-testid="posisjonskart" style={{ position: 'absolute', inset: 0 }} />

      {/* ── Knapperad, oppå kartet ───────────────────────────────────────────
          Små piller med liten skrift (#704): kartet er innholdet, knappene er
          verktøy. Wrapper-en har pointerEvents:none så kartet kan panoreres i
          mellomrommene mellom pillene — bare pillene selv tar imot trykk. */}
      <div
        style={{
          position: 'absolute',
          // INGEN safe-area her: flaten starter allerede under headeren, som
          // selv har tatt hensyn til notchen. Å legge den på igjen var å telle
          // innsettet to ganger, og knappene havnet for langt ned (#707).
          top: 10,
          left: 10,
          right: 10,
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
              disabled={jobber}
              data-testid="del-knapp"
              style={{ ...PILLE_PRIMAER, opacity: jobber ? 0.6 : 1 }}
            >
              {jobber ? 'Henter …' : 'Oppdater'}
            </button>
            <button
              type="button"
              onClick={stoppNaa}
              disabled={jobber}
              data-testid="stopp-knapp"
              style={{ ...PILLE, opacity: jobber ? 0.6 : 1 }}
            >
              Slutt å dele
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => hentOgLagre(false)}
            disabled={jobber}
            data-testid="del-knapp"
            style={{ ...PILLE_PRIMAER, opacity: jobber ? 0.6 : 1 }}
          >
            {jobber ? 'Henter posisjon …' : 'Del posisjonen min'}
          </button>
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

        {/* «Sporer» foran tittelen: en naken arrangementstittel i en pille
            forklarer ikke hvorfor den står der. Ordet er det som gjør at man
            skjønner at rutene på kartet hører til akkurat denne turen. */}
        {arrangementTittel && (
          <span
            data-testid="arrangement-pille"
            style={{ ...PILLE, pointerEvents: 'none', color: 'var(--kart-hav)' }}
          >
            Sporer {arrangementTittel}
          </span>
        )}
      </div>

      {/* ── Siktet ───────────────────────────────────────────────────────── */}
      {steg === 'sted' && (
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
              <div style={HJELPETEKST}>Flytt kartet så krysset står der markeringen skal.</div>
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

          {steg === 'tekst' && (
            <>
              <div style={HJELPETEKST}>Stedet er valgt. Hva er det som er der?</div>
              {/* Symbolet velges FØR teksten: det er symbolet man ser på
                  kartet på avstand, og teksten er detaljen man leser ved å
                  trykke. Tre store trykkflater, ikke en nedtrekksliste — med
                  tre valg er en liste flere trykk enn valget er verdt. */}
              <div style={{ display: 'flex', gap: 8 }} role="group" aria-label="Symbol">
                {MARKERING_SYMBOLER.map(sym => {
                  const valgt = markeringSymbol === sym.id
                  return (
                    <button
                      key={sym.id}
                      type="button"
                      onClick={() => setMarkeringSymbol(sym.id)}
                      aria-pressed={valgt}
                      data-testid={`symbol-${sym.id}`}
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
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
                })}
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
          const kanFjerne = mk.erMin || erAdmin
          return (
            <div
              data-testid="markering-panel"
              style={{
                position: 'absolute',
                left: 10,
                right: 10,
                // Over bunn-blokka når den står der, ellers på samme plass.
                bottom: `calc(${steg !== 'av' || feil || plinget ? 110 : 10}px + env(safe-area-inset-bottom, 0px) + ${tastaturOffset}px)`,
                background: 'var(--kart-flate-sterk)',
                border: '0.5px solid var(--kart-kant)',
                borderRadius: 18,
                padding: '14px 16px',
                boxShadow: 'var(--shadow-popover)',
                backdropFilter: 'var(--blur-card)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                zIndex: Z.DETALJ,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    overflowWrap: 'anywhere',
                  }}
                >
                  <span aria-hidden="true" style={{ marginRight: 6 }}>
                    {symbolEmoji(mk.symbol)}
                  </span>
                  {mk.tekst}
                </div>
                <div suppressHydrationWarning style={{ ...HJELPETEKST, marginTop: 2 }}>
                  {mk.avNavn} · {relativTid(mk.opprettet)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {/* Veibeskrivelse i Google Maps (#708). Michael spurte om
                    dette allerede da kartet var nytt: «er det en gå til
                    funksjon der eller naviger til? Ellers må man jo inn i
                    Google Maps å finne det uansett.»

                    Bevisst `window.open` og ikke appens egen router — dette er
                    en EKSTERN lenke, og da er det riktig å forlate appen.
                    dir/?api=1 er Googles universal-format: åpner Maps-appen
                    når den er installert, ellers nettleseren. */}
                <button
                  type="button"
                  onClick={() => navigerTil(mk.lat, mk.lng)}
                  aria-label={`Veibeskrivelse til «${mk.tekst}» i Google Maps`}
                  data-testid="markering-naviger"
                  style={{ ...PILLE, color: 'var(--accent)' }}
                >
                  Veibeskrivelse
                </button>
                {kanFjerne && (
                  <button
                    type="button"
                    onClick={() => fjernMarkering(mk.id)}
                    data-testid="markering-panel-fjern"
                    style={{ ...PILLE, color: 'var(--danger)', borderColor: 'var(--danger-border)' }}
                  >
                    Fjern
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setValgtMarkering(null)}
                  aria-label="Lukk"
                  data-testid="markering-panel-lukk"
                  style={PILLE}
                >
                  Lukk
                </button>
              </div>
            </div>
          )
        })()}

      {/* ── Chat-panel på venstre side (#709) ────────────────────────────────
          Speiler listepanelet til høyre. Gutta er ofte på kartet fordi de skal
          finne hverandre — da er det å måtte bytte fane for å skrive «vi er
          her» én omvei for mye. */}
      {visChat && !panelAapent && (
        <>
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
              cursor: 'pointer',
              padding: 0,
              zIndex: Z.HANDTAK,
              transition: 'left 220ms ease',
            }}
          >
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1 }}>
              {chatAapent ? '‹' : '›'}
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
              padding: `calc(10px + env(safe-area-inset-top, 0px)) 10px calc(10px + env(safe-area-inset-bottom, 0px))`,
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
          hele kartet, og da er man like langt som før redesignet. */}
      {/* Håndtakene skjuler hverandre: med begge synlige sto de side om side når
          et panel var ute, og det var uklart hvilket som lukket hva. */}
      {!chatAapent && (
      <button
        type="button"
        onClick={aapneListe}
        aria-expanded={panelAapent}
        aria-label={panelAapent ? 'Lukk lista' : `Vis lista (${antallPaaKartet})`}
        data-testid="panel-handtak"
        style={{
          position: 'absolute',
          right: panelAapent ? 'min(300px, 85%)' : 0,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 30,
          // 76 px høyt: bredden må være smal for ikke å dekke kartet, så
          // høyden bærer treffmålet i stedet (jf. #700 og TREFF = 44).
          height: 76,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
          border: '0.5px solid var(--kart-kant)',
          borderRight: panelAapent ? '0.5px solid var(--kart-kant)' : 'none',
          borderRadius: '14px 0 0 14px',
          background: 'var(--kart-flate-sterk)',
          backdropFilter: 'var(--blur-card)',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          padding: 0,
          zIndex: Z.HANDTAK,
          transition: 'right 220ms ease',
        }}
      >
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1 }}>
          {panelAapent ? '›' : '‹'}
        </span>
        {!panelAapent && antallPaaKartet > 0 && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--kart-sol)',
              lineHeight: 1,
            }}
          >
            {antallPaaKartet}
          </span>
        )}
      </button>
      )}

      <aside
        data-testid="kart-panel"
        aria-hidden={!panelAapent}
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: 0,
          width: 'min(300px, 85%)',
          transform: panelAapent ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 220ms ease',
          background: 'var(--kart-flate)',
          backdropFilter: 'var(--blur-card)',
          borderLeft: '0.5px solid var(--kart-kant)',
          overflowY: 'auto',
          // Panelet er ute av syne når det er lukket, men et skjult panel skal
          // heller ikke kunne treffes av et trykk som gjaldt kartet under.
          pointerEvents: panelAapent ? 'auto' : 'none',
          zIndex: Z.PANEL,
          padding: `calc(12px + env(safe-area-inset-top, 0px)) 12px calc(12px + env(safe-area-inset-bottom, 0px))`,
        }}
      >
        {/* Delingsstatusen din. Sto tidligere rett under kartet; flyttet hit
            da kartet ble fullskjerm (#704). Den skal ikke spise kartplass, men
            den skal heller ikke forsvinne — «hvor lenge deler jeg egentlig?»
            er det eneste man ikke kan lese av selve kartet. */}
        {meg ? (
          <div
            style={{
              ...HJELPETEKST,
              padding: '0 2px 10px',
              borderBottom: '0.5px solid var(--border-subtle)',
              marginBottom: 12,
            }}
          >
            Du deler til {formaterDato(meg.delerTil, FORMAT_KLOKKE)}.
            {underArrangement
              ? ' Ruta di slettes når arrangementet er over.'
              : ' Ruta di slettes når du slutter å dele.'}
          </div>
        ) : (
          <div
            style={{
              ...HJELPETEKST,
              padding: '0 2px 10px',
              borderBottom: '0.5px solid var(--border-subtle)',
              marginBottom: 12,
            }}
          >
            Du deler ikke posisjon. Deler du, varer det {POSISJON_DELING_TIMER} timer og slutter
            av seg selv.
          </div>
        )}

        {menn.length === 0 && markeringer.length === 0 && (
          <div style={{ ...HJELPETEKST, padding: '8px 4px' }}>
            Ingen deler posisjon akkurat nå.
          </div>
        )}

        {menn.length > 0 && <div style={SEKSJON}>På kartet</div>}
        {menn.map(m => {
          const siste = m.spor[m.spor.length - 1]
          if (!siste) return null
          const erMeg = m.profilId === megId
          return (
            <div
              key={m.profilId}
              data-testid="kart-rad"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 2px',
                borderBottom: '0.5px solid var(--border-subtle)',
              }}
            >
              <button
                type="button"
                onClick={() => senterPaa(siste.lat, siste.lng)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flex: 1,
                  minWidth: 0,
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  textAlign: 'left',
                  cursor: 'pointer',
                  color: 'inherit',
                }}
              >
                <Avatar name={m.navn} src={m.bildeUrl} rolle={m.rolle} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 15,
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                      letterSpacing: '-0.2px',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {m.navn}
                    {erMeg && (
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 9,
                          color: 'var(--accent)',
                          marginLeft: 6,
                          letterSpacing: '1px',
                        }}
                      >
                        DEG
                      </span>
                    )}
                  </div>
                  {/* suppressHydrationWarning: relativTid() og erFersk() leser
                      klokka i render — server og klient kjører sekunder fra
                      hverandre (#466, #698). */}
                  <div
                    suppressHydrationWarning
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 11,
                      color: erFersk(siste.registrert) ? 'var(--success)' : 'var(--text-tertiary)',
                      marginTop: 1,
                    }}
                  >
                    {relativTid(siste.registrert)}
                    {m.spor.length > 1 && ` · ${m.spor.length} stopp`}
                  </div>
                </div>
              </button>

              {!erMeg &&
                (() => {
                  const nettopp = nyligPlinget[m.profilId] === true
                  return (
                    <button
                      type="button"
                      onClick={() => pling(m.profilId, m.navn)}
                      disabled={nettopp}
                      data-testid="pling-knapp"
                      data-plinget={nettopp ? 'ja' : 'nei'}
                      aria-label={nettopp ? `${m.navn} er plinget` : `Pling ${m.navn} om hvor han er`}
                      style={{
                        ...PILLE,
                        opacity: nettopp ? 0.55 : 1,
                        cursor: nettopp ? 'default' : 'pointer',
                        color: nettopp ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                      }}
                    >
                      {nettopp ? 'Plinget' : 'Pling'}
                    </button>
                  )
                })()}
            </div>
          )
        })}

        {markeringer.length > 0 && <div style={{ ...SEKSJON, marginTop: 18 }}>Markeringer</div>}
        {markeringer.map(mk => (
          <div
            key={mk.id}
            data-testid="markering-rad"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 2px',
              borderBottom: '0.5px solid var(--border-subtle)',
            }}
          >
            <button
              type="button"
              onClick={() => senterPaa(mk.lat, mk.lng)}
              style={{
                flex: 1,
                minWidth: 0,
                background: 'none',
                border: 'none',
                padding: 0,
                textAlign: 'left',
                cursor: 'pointer',
                color: 'inherit',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 14,
                  color: 'var(--text-primary)',
                  overflowWrap: 'anywhere',
                }}
              >
                <span aria-hidden="true" style={{ marginRight: 6 }}>
                  {symbolEmoji(mk.symbol)}
                </span>
                {mk.tekst}
              </div>
              <div suppressHydrationWarning style={{ ...HJELPETEKST, fontSize: 11, marginTop: 1 }}>
                {mk.avNavn} · {relativTid(mk.opprettet)}
              </div>
            </button>

            {(mk.erMin || erAdmin) && (
              <button
                type="button"
                onClick={() => fjernMarkering(mk.id)}
                aria-label={`Fjern markeringen «${mk.tekst}»`}
                data-testid="markering-fjern"
                style={PILLE}
              >
                Fjern
              </button>
            )}
          </div>
        ))}
      </aside>
    </div>
  )
}

/**
 * Åpner veibeskrivelse til et punkt i Google Maps.
 *
 * `comgooglemaps://` FØRST, ikke https (#711). I en installert PWA på iOS
 * åpner `window.open` med en https-URL en in-app-nettleser som legger seg oppå
 * appen — Reidar så «en merkelig hvit browser-aktig sak oppå appen» — og den
 * blir stående igjen etter at Maps-appen har tatt over via universal link.
 * App-skjemaet hopper rett til appen uten det mellomleddet.
 *
 * Fallback til https etter en kort frist, for den som ikke har Google Maps
 * installert: da gjør app-skjemaet ingenting, og uten fallbacken ville knappen
 * vært død. Fristen avbrytes hvis siden mister fokus — det betyr at Maps
 * faktisk åpnet, og da skal vi ikke i tillegg åpne en nettleser.
 */
function navigerTil(lat: number, lng: number) {
  const nett = googleMapsNettUrl(lat, lng)
  let byttet = false
  const merkBytte = () => {
    byttet = true
  }
  document.addEventListener('visibilitychange', merkBytte, { once: true })
  window.addEventListener('pagehide', merkBytte, { once: true })

  window.location.href = googleMapsAppUrl(lat, lng)

  window.setTimeout(() => {
    document.removeEventListener('visibilitychange', merkBytte)
    window.removeEventListener('pagehide', merkBytte)
    if (!byttet && !document.hidden) window.location.href = nett
  }, 700)
}

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
  color: '#241a0c',
  border: 'none',
  fontWeight: 600,
} as const

const HJELPETEKST = {
  fontFamily: 'var(--font-body)',
  fontSize: 12.5,
  color: 'var(--text-tertiary)',
  lineHeight: 1.5,
} as const

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
