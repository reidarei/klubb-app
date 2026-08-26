'use client'

import { useEffect, useState, useRef, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import Icon from '@/components/ui/Icon'
import { settOmslagsbilde, slettAlbumBilde } from '@/lib/actions/album'
import AlbumBildeReaksjoner from '@/components/album/AlbumBildeReaksjoner'
import BildeKommentarSheet from '@/components/album/BildeKommentarSheet'
import type { ReaksjonGruppe } from '@/lib/reaksjoner'
import type { ChatProfil } from '@/lib/mention'
import { bildeSrc } from '@/lib/bilde-utils'
import {
  avstand,
  midtpunkt,
  nySkala,
  fokusJustering,
  klemPosisjon,
  sveipUtfall,
  snapp,
  MIN_SKALA,
  TRYKK_TERSKEL,
  type Punkt,
} from '@/lib/bilde-zoom'

// Fullskjerm-galleri for album. Pil-knapper, swipe, pinch-zoom, tastatur og
// X for å lukke. Krysser mellom bilder uten å unmounte hele overlayet — det
// gir en stabil følelse selv om bildene tar tid å laste.
//
// Touch-håndtering: vi måler horisontalt drag og bytter bilde hvis terskelen
// er passert (og brukeren ikke er zoomet inn, #625). Vertikal scroll fanges
// ikke (bildet fyller skjermen). All gest-matematikk (pinch, panorering,
// sveip-terskel) ligger i lib/bilde-zoom.ts og er enhetstestet der — en
// pinch-gest kan ikke automatiseres i Playwright. Selve gest-MASKINEN her
// (pekerbokføring, wheel-binding, trykk vs. sveip) dekkes av
// __tests__/album-lightbox-gest.test.tsx, som kjører i jsdom.
export default function AlbumLightbox({
  bilder,
  startIndex,
  onLukk,
  albumId,
  kanRedigere = false,
  coverBildeId = null,
  brukerId,
  profiler,
  erAdmin = false,
  autoAapneKommentarer = false,
  lukkVedTrykk = false,
}: {
  // reaksjoner er valgfri: AlbumSeksjon (arrangement-forhåndsvisning) sender
  // ikke reaksjonsdata og bruker denne lightboxen kun til rask forhåndsvisning
  // — reaksjonsraden er scopet til album/[id]-siden (#480). brukerId er derfor
  // også valgfri; raden rendres kun når begge er til stede. Samme gating
  // gjelder kommentar-knappen/sheeten (#481) — profiler kreves i tillegg.
  bilder: { id: string; bilde_url: string; reaksjoner?: ReaksjonGruppe[]; kommentarAntall?: number }[]
  startIndex: number
  onLukk: () => void
  albumId?: string
  kanRedigere?: boolean
  coverBildeId?: string | null
  brukerId?: string
  profiler?: ChatProfil[]
  erAdmin?: boolean
  // Deep-link (?bilde=) fra en mention-varsel — åpner sheeten med det samme
  // i stedet for at brukeren må trykke kommentar-knappen selv.
  autoAapneKommentarer?: boolean
  // Chat (#625) har ingen navigasjon eller X-knapp å falle tilbake på i den
  // enkleste bruken — et trykk hvor som helst (uten drag/pinch) skal lukke,
  // slik den gamle BildeLightbox gjorde. Album-flatene lar denne stå av
  // (default false) siden de har X-knapp, piler og reaksjonsrad å treffe.
  lukkVedTrykk?: boolean
}) {
  const router = useRouter()
  const [index, setIndex] = useState(startIndex)
  const [montert, setMontert] = useState(false)
  const [sheetAapen, setSheetAapen] = useState(autoAapneKommentarer)
  const [pending, startTransition] = useTransition()
  // Speiler sheetAapen i en ref så det globale keydown-listeneret (bundet én
  // gang) leser fersk verdi uten å re-binde effekten ved hver sheet-toggle.
  const sheetAapenRef = useRef(sheetAapen)
  sheetAapenRef.current = sheetAapen

  // ─── Pinch-zoom + panorering (#625) ────────────────────────────────────
  // skala/pos er selve transformen på <img>. Refs holder gest-tilstand som
  // ikke skal trigge re-render underveis (kun start/slutt-verdiene gjør).
  const [skala, setSkala] = useState(MIN_SKALA)
  const [pos, setPos] = useState<Punkt>({ x: 0, y: 0 })
  // Speiler skala/pos i refs, av samme grunn som sheetAapenRef: den native
  // wheel-lytteren bindes én gang og ville ellers lest verdier fra første
  // render for alltid. Refs i stedet for state-updatere — updatere skal være
  // rene, og en setPos() inne i en setSkala()-updater kjøres dobbelt i
  // StrictMode (og dobler dermed fokusjusteringen per wheel-tick).
  const skalaRef = useRef(skala)
  skalaRef.current = skala
  const posRef = useRef(pos)
  posRef.current = pos
  const imgRef = useRef<HTMLImageElement>(null)
  const zoomLagRef = useRef<HTMLDivElement>(null)
  const pointereRef = useRef<Map<number, Punkt>>(new Map())
  const pinchStartRef = useRef<{ dist: number; skala: number; fokus: Punkt; pos: Punkt } | null>(null)
  const dragStartRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  // true fra pointerdown med 2 fingre til pointerup med 0 fingre — hindrer
  // at en ujevnt avsluttet pinch (fingrene løftes ikke helt samtidig, så
  // komponenten kortvarig ser 1 finger igjen) tolkes som et sveip.
  const pinchetRef = useRef(false)
  const dragDeltaXRef = useRef(0)
  // true så lenge minst én peker er nede. MÅ være state, ikke en avledning av
  // pointereRef.current.size: ref-endringer trigger ingen re-render, så
  // willChange/transition under ble hengende i gest-tilstand etter en gest der
  // pointerup ikke endret skala/pos (snapp til samme verdi) — og da uteble den
  // myke overgangen ved neste snapp. Alle tre stiene som tømmer pointereRef
  // (onPointerUp, window-opprydding, sheet-åpning) må nullstille denne.
  const [gestAktiv, setGestAktiv] = useState(false)

  // Mount-flag for portal — createPortal kan ikke kalles på server
  useEffect(() => {
    setMontert(true)
  }, [])

  // Nullstill zoom/pan når aktivt bilde bytter — ellers arver neste bilde
  // forrige bildes zoom-nivå, som ikke gir mening.
  useEffect(() => {
    setSkala(MIN_SKALA)
    setPos({ x: 0, y: 0 })
  }, [index])

  // Kommentar-sheeten krymper bildet til 40dvh (se justifyContent-kommentaren
  // lenger ned) — zoom gir ikke mening der, og gesttilstanden må nullstilles
  // så den ikke henger igjen når sheeten lukkes.
  useEffect(() => {
    if (!sheetAapen) return
    setSkala(MIN_SKALA)
    setPos({ x: 0, y: 0 })
    pointereRef.current.clear()
    pinchStartRef.current = null
    dragStartRef.current = null
    pinchetRef.current = false
    dragDeltaXRef.current = 0
    setGestAktiv(false)
  }, [sheetAapen])

  function senterAv(el: HTMLElement | null): Punkt {
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }

  function neste() {
    setIndex(i => (i + 1) % bilder.length)
  }
  function forrige() {
    setIndex(i => (i - 1 + bilder.length) % bilder.length)
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Mens kommentar-sheeten er åpen: Escape lukker KUN sheeten, og piltaster
      // ignoreres (ellers bytter de bilde → remount av sheeten → mister tekst
      // brukeren skriver, f.eks. når markøren flyttes i input-feltet).
      if (sheetAapenRef.current) {
        if (e.key === 'Escape') {
          e.preventDefault()
          setSheetAapen(false)
        }
        return
      }
      if (e.key === 'Escape') onLukk()
      else if (e.key === 'ArrowRight') neste()
      else if (e.key === 'ArrowLeft') forrige()
    }
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    document.documentElement.classList.add('tillat-landskap')
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
      document.documentElement.classList.remove('tillat-landskap')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bilder.length])

  // FELLE: ikke kall setPointerCapture her (i motsetning til BildeCropper).
  // Zoom-laget dekker hele skjermen, så pekeren kan aldri forlate det — en
  // capture ville bare retarget pointerup og dermed brutt click på X-,
  // pil- og reaksjonsknappene på touch (en bug som ikke synes på desktop,
  // siden musepekeren der aldri "sender" som touch gjør).
  function onPointerDown(e: React.PointerEvent) {
    if (sheetAapenRef.current) return
    pointereRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    setGestAktiv(true)

    if (pointereRef.current.size === 2) {
      const [a, b] = Array.from(pointereRef.current.values())
      const senter = senterAv(zoomLagRef.current)
      const midt = midtpunkt(a, b)
      pinchStartRef.current = {
        dist: avstand(a, b),
        skala,
        fokus: { x: midt.x - senter.x, y: midt.y - senter.y },
        pos,
      }
      pinchetRef.current = true
      dragStartRef.current = null
    } else if (pointereRef.current.size === 1) {
      dragStartRef.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }
      dragDeltaXRef.current = 0
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (sheetAapenRef.current) return
    if (!pointereRef.current.has(e.pointerId)) return
    pointereRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    const img = imgRef.current
    const view = zoomLagRef.current
    if (!img || !view) return

    if (pointereRef.current.size === 2 && pinchStartRef.current) {
      const [a, b] = Array.from(pointereRef.current.values())
      const start = pinchStartRef.current
      const ny = nySkala(start.dist, avstand(a, b), start.skala)
      const nyX = fokusJustering(start.pos.x, start.fokus.x, start.skala, ny)
      const nyY = fokusJustering(start.pos.y, start.fokus.y, start.skala, ny)
      const klemt = klemPosisjon(
        { x: nyX, y: nyY },
        ny,
        img.offsetWidth,
        img.offsetHeight,
        view.offsetWidth,
        view.offsetHeight,
      )
      setSkala(ny)
      setPos(klemt)
      return
    }

    if (pointereRef.current.size === 1 && dragStartRef.current) {
      const start = dragStartRef.current
      if (skala > MIN_SKALA) {
        const klemt = klemPosisjon(
          { x: start.px + (e.clientX - start.x), y: start.py + (e.clientY - start.y) },
          skala,
          img.offsetWidth,
          img.offsetHeight,
          view.offsetWidth,
          view.offsetHeight,
        )
        setPos(klemt)
      } else {
        // Ikke zoomet: hold kun styr på horisontal drift for sveip-terskelen.
        dragDeltaXRef.current = e.clientX - start.x
      }
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (sheetAapenRef.current) return
    pointereRef.current.delete(e.pointerId)

    if (pointereRef.current.size < 2) {
      pinchStartRef.current = null
    }
    if (pointereRef.current.size === 1) {
      // Fra 2 til 1 finger: re-seed draget fra den gjenværende pekeren, ellers
      // gjør den ingenting og brukeren må slippe helt og ta på igjen for å
      // panorere videre. dragStartRef ble nullet ved pinch-start.
      // Sveip-sperren står: dragDeltaXRef oppdateres uansett kun ved skala 1,
      // og pinchetRef blokkerer fortsatt navigasjon ut gesten.
      const [rest] = Array.from(pointereRef.current.values())
      dragStartRef.current = { x: rest.x, y: rest.y, px: pos.x, py: pos.y }
      dragDeltaXRef.current = 0
    }
    if (pointereRef.current.size > 0) return
    // Siste finger er sluppet: gesten er over, så transition slås på igjen i
    // samme render som snapp-verdiene under — det er den som animerer snappen.
    setGestAktiv(false)

    const snappSkala = snapp(skala)
    setSkala(snappSkala)
    if (snappSkala === MIN_SKALA) setPos({ x: 0, y: 0 })

    const varPinchet = pinchetRef.current
    pinchetRef.current = false

    // En ujevnt avsluttet pinch skal aldri tolkes som et sveip mellom bilder.
    if (!varPinchet) {
      const utfall = sveipUtfall(dragDeltaXRef.current, snappSkala)
      if (utfall === 'neste') neste()
      else if (utfall === 'forrige') forrige()
      else if (
        lukkVedTrykk &&
        snappSkala === MIN_SKALA &&
        dragStartRef.current &&
        avstand(dragStartRef.current, { x: e.clientX, y: e.clientY }) < TRYKK_TERSKEL
      ) {
        onLukk()
      }
    }

    dragStartRef.current = null
    dragDeltaXRef.current = 0
  }

  // Trackpad-pinch rapporteres av nettleseren som wheel + ctrlKey, ikke som
  // pointer-events. Må bindes nativt og ikke-passivt: Reacts onWheel er
  // passiv, så preventDefault() der ville ikke hindret sidens egen zoom og
  // gitt en konsoll-advarsel i tillegg.
  //
  // Deps MÅ inneholde `montert`: i første commit er montert=false, komponenten
  // returnerer null og zoomLagRef.current er fortsatt null — med tom dep-array
  // kjørte effekten aldri på nytt, og lytteren ble aldri registrert i det hele
  // tatt. Vakt: __tests__/album-lightbox-gest.test.tsx.
  useEffect(() => {
    const el = zoomLagRef.current
    if (!el) return
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey) return
      e.preventDefault()
      if (sheetAapenRef.current) return
      const view = zoomLagRef.current
      if (!view) return
      // Verdibaserte kall (ikke updatere) — samme form som pointer-stien.
      const gammelSkala = skalaRef.current
      const gammelPos = posRef.current
      const faktor = Math.exp(-e.deltaY * 0.01)
      const ny = nySkala(1, faktor, gammelSkala)
      const senter = senterAv(view)
      const fokus = { x: e.clientX - senter.x, y: e.clientY - senter.y }
      const nyX = fokusJustering(gammelPos.x, fokus.x, gammelSkala, ny)
      const nyY = fokusJustering(gammelPos.y, fokus.y, gammelSkala, ny)
      const img = imgRef.current
      setSkala(ny)
      setPos(
        img
          ? klemPosisjon({ x: nyX, y: nyY }, ny, img.offsetWidth, img.offsetHeight, view.offsetWidth, view.offsetHeight)
          : { x: nyX, y: nyY },
      )
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [montert])

  // Foreldreløse pekere: pointerup treffer kun zoom-laget når pekeren faktisk
  // slippes DER. På desktop (mus, ingen implisitt pointer capture) er det
  // trivielt å slippe over en søsken-knapp — pilene er vertikalt sentrert,
  // nøyaktig der et sveip lander. Uten denne oppryddingen ble pekeren liggende
  // i pointereRef resten av økten: neste pointerdown ga size===2 → tolket som
  // pinch → pointerup returnerte på size>0 → verken sveip, pinch eller trykk
  // virket igjen. window ser hvert eneste pointerup, også de vi ikke eier.
  //
  // Rekkefølge: React sin delegerte lytter sitter på portal-containeren
  // (document.body) og fyrer før window sin bubble-lytter, så et pointerup PÅ
  // laget er allerede håndtert og slettet når vi kommer hit — has()-sjekken
  // gjør denne til en ren opprydder for de foreldreløse.
  useEffect(() => {
    function ryddPeker(e: PointerEvent) {
      if (!pointereRef.current.has(e.pointerId)) return
      pointereRef.current.delete(e.pointerId)
      if (pointereRef.current.size < 2) pinchStartRef.current = null
      if (pointereRef.current.size === 0) {
        dragStartRef.current = null
        dragDeltaXRef.current = 0
        pinchetRef.current = false
        // Samme nullstilling som i onPointerUp: en foreldreløs peker som ryddes
        // her ville ellers latt willChange/transition henge i gest-tilstand.
        setGestAktiv(false)
      }
    }
    window.addEventListener('pointerup', ryddPeker)
    window.addEventListener('pointercancel', ryddPeker)
    return () => {
      window.removeEventListener('pointerup', ryddPeker)
      window.removeEventListener('pointercancel', ryddPeker)
    }
  }, [])

  const aktiv = bilder[index]
  const bilde = aktiv ? bildeSrc(aktiv.bilde_url) : null
  if (!aktiv || !montert || !bilde) return null

  function handleSettOmslag() {
    if (!albumId || !aktiv) return
    startTransition(async () => {
      try {
        await settOmslagsbilde(albumId, aktiv.id)
        router.refresh()
      } catch (e) {
        console.error(e)
        alert('Kunne ikke sette omslag')
      }
    })
  }

  function handleSlett() {
    if (!aktiv) return
    if (!confirm('Slett dette bildet?')) return
    const bildeId = aktiv.id
    const erSiste = bilder.length === 1
    startTransition(async () => {
      try {
        await slettAlbumBilde(bildeId)
        if (erSiste) onLukk()
        else if (index >= bilder.length - 1) setIndex(Math.max(0, index - 1))
        router.refresh()
      } catch (e) {
        console.error(e)
        alert('Kunne ikke slette bildet')
      }
    })
  }

  const erOmslag = coverBildeId === aktiv.id

  // Portal til <body> så fixed-positioning ikke begrenses av layout-
  // containeren (maxWidth 480, position: relative). Uten portal havner
  // overlayet inn i den smale kolonnen og bildet i ovenkanten av den.
  //
  // Overlayet selv har INGEN gest-handlers (touch-action avgjøres av unionen
  // fra hit-testet element og oppover ancestors, og kan ikke re-aktiveres av
  // en etterkommer — touchAction:none her ville drept scrollingen i alt som
  // ligger inni, særlig kommentar-sheeten). Gest-håndteringen bor i stedet på
  // det indre zoomLag-et rett under, som dekker nøyaktig samme flate.
  const innhold = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Bilde i full skjerm"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100dvh',
        background: 'var(--lightbox-backdrop)',
        zIndex: 9999,
      }}
    >
      {/* Zoom-lag: eneste sted med touchAction:'none' og pointer-handlers.
          position:absolute inset:0 dekker akkurat samme flate som overlayet,
          så et trykk/sveip/pinch hvor som helst på bildet treffes riktig. */}
      <div
        ref={zoomLagRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          position: 'absolute',
          inset: 0,
          touchAction: 'none',
          display: 'flex',
          // Når kommentar-sheeten er åpen krymper bildet til øvre del av
          // skjermen (sheeten dekker resten nedenfra, se BildeKommentarSheet
          // som starter på top: 42dvh) — flex-start i stedet for center gjør
          // at bildet flytter seg opp i stedet for å forbli midtstilt bak sheeten.
          alignItems: sheetAapen ? 'flex-start' : 'center',
          justifyContent: 'center',
          // Et 4x-skalert bilde maler ellers utenfor det fikserte overlayet;
          // laget dekker nøyaktig samme flate og er den naturlige klippeflaten.
          overflow: 'hidden',
          // Affordanse fra den gamle BildeLightbox: når et trykk hvor som helst
          // lukker (chat-flaten), skal markøren si det på desktop.
          cursor: lukkVedTrykk ? 'zoom-out' : undefined,
        }}
      >
        {/* Bilde — pointerEvents: none så touchene treffer zoom-laget rundt.
            Navigasjon skjer via pil-knappene, sveip, pinch-zoom og piltaster. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={bilde}
          alt=""
          style={{
            maxWidth: '95vw',
            maxHeight: sheetAapen ? '40dvh' : '95vh',
            marginTop: sheetAapen ? 'max(16px, env(safe-area-inset-top))' : 0,
            objectFit: 'contain',
            userSelect: 'none',
            pointerEvents: 'none',
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${skala})`,
            transformOrigin: 'center',
            // Kun mens en peker er nede: permanent willChange holder bildet i
            // et eget kompositor-lag hele tiden, som koster minne til ingen
            // nytte når ingen gest pågår.
            willChange: gestAktiv ? 'transform' : undefined,
            // Ingen transition mens en peker er nede — ellers henger
            // panoreringen/zoomen synlig etter fingeren.
            transition: gestAktiv ? 'none' : 'transform 0.15s ease-out',
          }}
        />
      </div>

      {/* Lukk-knapp — skjult mens sheeten er åpen (sheeten har sin egen) */}
      {!sheetAapen && (
        <button
          type="button"
          onClick={onLukk}
          aria-label="Lukk"
          style={{
            position: 'absolute',
            top: 'max(16px, env(safe-area-inset-top))',
            right: 16,
            width: 44,
            height: 44,
            borderRadius: '50%',
            border: 'none',
            background: 'var(--overlay-control-bg)',
            color: 'var(--lightbox-foreground)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 0 0 1px var(--overlay-control-ring)',
          }}
        >
          <Icon name="x" size={20} color="currentColor" strokeWidth={2.5} />
        </button>
      )}

      {/* Teller */}
      {bilder.length > 1 && !sheetAapen && (
        <div
          style={{
            position: 'absolute',
            top: 'max(24px, calc(env(safe-area-inset-top) + 8px))',
            left: '50%',
            transform: 'translateX(-50%)',
            color: 'var(--lightbox-foreground)',
            opacity: 0.85,
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            letterSpacing: '1.4px',
            fontWeight: 600,
          }}
        >
          {index + 1} / {bilder.length}
        </div>
      )}

      {/* Pil-knapper (synlig på desktop, swipe brukes på mobil) */}
      {bilder.length > 1 && !sheetAapen && (
        <>
          <button
            type="button"
            onClick={forrige}
            aria-label="Forrige bilde"
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 44,
              height: 44,
              borderRadius: '50%',
              border: 'none',
              // glass-effekt på fotografisk bakgrunn — ingen passende token
              background: 'rgba(255,255,255,0.12)',
              color: 'var(--lightbox-foreground)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              backdropFilter: 'blur(8px)',
            }}
          >
            <span style={{ display: 'flex', transform: 'rotate(180deg)' }}>
              <Icon name="chevron" size={22} color="currentColor" strokeWidth={2.5} />
            </span>
          </button>
          <button
            type="button"
            onClick={neste}
            aria-label="Neste bilde"
            style={{
              position: 'absolute',
              right: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 44,
              height: 44,
              borderRadius: '50%',
              border: 'none',
              // glass-effekt på fotografisk bakgrunn — ingen passende token
              background: 'rgba(255,255,255,0.12)',
              color: 'var(--lightbox-foreground)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              backdropFilter: 'blur(8px)',
            }}
          >
            <Icon name="chevron" size={22} color="currentColor" strokeWidth={2.5} />
          </button>
        </>
      )}

      {/* Reaksjoner på det aktive bildet — kun når brukerId er oppgitt (album/[id]-
          siden). key={aktiv.id} er KRITISK: lightboxen unmounter ikke ved
          bildebytte (samme <AlbumBildeReaksjoner>-instans ville ellers beholde
          forrige bildes optimistiske state) — key tvinger React til å remounte
          komponenten når aktivt bilde endres, slik at useAlbumBildeReaksjoner
          re-initialiseres med riktig `initial`. */}
      {brukerId && !sheetAapen && (
        <div
          // Teknisk overflødig siden #625: gest-handlerne bor nå på
          // zoomLag-diven (et SØSKEN av denne reaksjonsraden, ikke en
          // ancestor), så et touchstart her når dem uansett aldri via
          // bubbling. Latt stå som defensiv rest — se historikken før #625
          // for hvorfor den opprinnelig var nødvendig (swipe-handlerne lå
          // da på selve overlayet, en faktisk ancestor).
          onTouchStart={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            // Admin-kontrollene bor nå øverst til venstre (20. juli), så
            // reaksjonsraden kan alltid ligge i bunnen uten ekstra offset.
            bottom: 'max(20px, env(safe-area-inset-bottom))',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            borderRadius: 999,
            background: 'var(--overlay-control-bg)',
            boxShadow: '0 0 0 1px var(--overlay-control-ring)',
          }}
        >
          <AlbumBildeReaksjoner key={aktiv.id} bildeId={aktiv.id} brukerId={brukerId} initial={aktiv.reaksjoner ?? []} />
          {/* Kommentar-knapp — kun når profiler er sendt med (album/[id]-siden,
              #481). Åpner BildeKommentarSheet for det aktive bildet. */}
          {albumId && profiler && (
            <button
              type="button"
              onClick={() => setSheetAapen(true)}
              aria-label="Vis kommentarer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                border: 'none',
                background: 'transparent',
                color: 'var(--lightbox-foreground)',
                cursor: 'pointer',
                padding: '2px 4px',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              <Icon name="message" size={16} color="currentColor" strokeWidth={1.8} />
              {(aktiv.kommentarAntall ?? 0) > 0 && aktiv.kommentarAntall}
            </button>
          )}
        </div>
      )}

      {/* Handlinger (kun synlig for admin/eier) — kompakt pill øverst til
          venstre (X-en bor øverst til høyre, telleren i midten). Flyttet fra
          bunnen og krympet etter admins tilbakemelding 20. juli: «Omslag»
          med accent-stil når bildet ER omslaget, ellers nøytral knapp som
          setter det. Kort label + fontSize 11 så pillen ikke kolliderer med
          den sentrerte telleren på smale skjermer. */}
      {kanRedigere && albumId && !sheetAapen && (
        <div
          style={{
            position: 'absolute',
            top: 'max(16px, env(safe-area-inset-top))',
            left: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            padding: '4px 6px',
            borderRadius: 999,
            background: 'var(--overlay-control-bg)',
            boxShadow: '0 0 0 1px var(--overlay-control-ring)',
          }}
        >
          <button
            type="button"
            onClick={handleSettOmslag}
            disabled={pending || erOmslag}
            aria-label={erOmslag ? 'Dette bildet er omslaget' : 'Sett som omslag'}
            style={{
              border: 'none',
              padding: '6px 10px',
              borderRadius: 999,
              background: erOmslag ? 'var(--accent-soft)' : 'transparent',
              color: erOmslag ? 'var(--accent)' : 'var(--lightbox-foreground)',
              fontFamily: 'var(--font-body)',
              fontSize: 11,
              fontWeight: 600,
              cursor: erOmslag || pending ? 'default' : 'pointer',
              opacity: pending && !erOmslag ? 0.6 : 1,
            }}
          >
            Omslag
          </button>
          <button
            type="button"
            onClick={handleSlett}
            disabled={pending}
            style={{
              border: 'none',
              padding: '6px 10px',
              borderRadius: 999,
              background: 'transparent',
              color: 'var(--danger-alt)',
              fontFamily: 'var(--font-body)',
              fontSize: 11,
              fontWeight: 600,
              cursor: pending ? 'default' : 'pointer',
              opacity: pending ? 0.6 : 1,
            }}
          >
            Slett
          </button>
        </div>
      )}

      {/* Bilde-kommentarer (#481) — key={aktiv.id} tvinger remount ved
          bildebytte (samme grunn som AlbumBildeReaksjoner over: usendt
          tekst/edit-state skal ikke overleve til neste bilde). */}
      {sheetAapen && brukerId && albumId && (
        <BildeKommentarSheet
          key={aktiv.id}
          bildeId={aktiv.id}
          albumId={albumId}
          brukerId={brukerId}
          erAdmin={erAdmin}
          profiler={profiler ?? []}
          initialAntall={aktiv.kommentarAntall ?? 0}
          onLukk={() => setSheetAapen(false)}
        />
      )}
    </div>
  )

  return createPortal(innhold, document.body)
}
