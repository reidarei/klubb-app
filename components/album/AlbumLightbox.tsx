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

// Fullskjerm-galleri: piler, sveip, pinch-zoom, X. Bytter bilde uten å
// unmounte overlayet, så det føles stabilt mens bilder laster.
// Gest-matematikken er enhetstestet i lib/bilde-zoom.ts (pinch kan ikke
// automatiseres i Playwright); gest-maskinen her dekkes av
// __tests__/album-lightbox-gest.test.tsx (#625).
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
  // reaksjoner/brukerId er valgfrie: reaksjonsraden hører kun til album/[id]
  // (#480), og kommentarene krever i tillegg profiler (#481). Andre flater
  // bruker lightboxen som ren forhåndsvisning.
  bilder: { id: string; bilde_url: string; reaksjoner?: ReaksjonGruppe[]; kommentarAntall?: number }[]
  startIndex: number
  onLukk: () => void
  albumId?: string
  kanRedigere?: boolean
  coverBildeId?: string | null
  brukerId?: string
  profiler?: ChatProfil[]
  erAdmin?: boolean
  // Deep-link (?bilde=) fra mention-varsel: åpner kommentar-sheeten direkte.
  autoAapneKommentarer?: boolean
  // Chatten (#625): et trykk hvor som helst (uten drag/pinch) lukker. Av på
  // album-flatene, der trykk skal treffe X, piler og reaksjonsrad.
  lukkVedTrykk?: boolean
}) {
  const router = useRouter()
  const [index, setIndex] = useState(startIndex)
  const [montert, setMontert] = useState(false)
  const [sheetAapen, setSheetAapen] = useState(autoAapneKommentarer)
  const [pending, startTransition] = useTransition()
  // Ref-speil så peker-handlerne leser fersk verdi.
  const sheetAapenRef = useRef(sheetAapen)
  sheetAapenRef.current = sheetAapen

  // ─── Pinch-zoom + panorering (#625) ────────────────────────────────────
  // skala/pos er transformen på <img>; refs holder gest-tilstand som ikke skal re-rendre.
  const [skala, setSkala] = useState(MIN_SKALA)
  const [pos, setPos] = useState<Punkt>({ x: 0, y: 0 })
  const imgRef = useRef<HTMLImageElement>(null)
  const zoomLagRef = useRef<HTMLDivElement>(null)
  const pointereRef = useRef<Map<number, Punkt>>(new Map())
  const pinchStartRef = useRef<{ dist: number; skala: number; fokus: Punkt; pos: Punkt } | null>(null)
  const dragStartRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  // true fra 2 fingre ned til 0 fingre — en ujevnt avsluttet pinch (kortvarig
  // 1 finger igjen) skal ikke tolkes som sveip.
  const pinchetRef = useRef(false)
  const dragDeltaXRef = useRef(0)
  // Minst én peker nede. MÅ være state, ikke avledet av pointereRef: en ref
  // re-rendrer ikke, og willChange/transition ble hengende i gest-tilstand.
  // Alle tre stiene som tømmer pointereRef (onPointerUp, window-opprydding,
  // sheet-åpning) må nullstille den.
  const [gestAktiv, setGestAktiv] = useState(false)

  // createPortal kan ikke kalles på server.
  useEffect(() => {
    setMontert(true)
  }, [])

  // Neste bilde skal ikke arve forrige bildes zoom.
  useEffect(() => {
    setSkala(MIN_SKALA)
    setPos({ x: 0, y: 0 })
  }, [index])

  // Sheeten krymper bildet til 40dvh — zoom gir ikke mening der, og
  // gesttilstand skal ikke henge igjen når sheeten lukkes.
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
    document.body.style.overflow = 'hidden'
    document.documentElement.classList.add('tillat-landskap')
    return () => {
      document.body.style.overflow = ''
      document.documentElement.classList.remove('tillat-landskap')
    }
  }, [])

  // FELLE: ikke setPointerCapture her (i motsetning til BildeCropper). Laget
  // dekker hele skjermen, så capture ville bare retarget pointerup og brutt
  // click på X-, pil- og reaksjonsknappene på touch (synes ikke på desktop).
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
        // Ikke zoomet: kun horisontal drift, for sveip-terskelen.
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
      // 2 → 1 finger: re-seed draget fra gjenværende peker (dragStartRef ble
      // nullet ved pinch-start), ellers må han slippe helt for å panorere videre.
      // pinchetRef sperrer fortsatt sveip ut gesten.
      const [rest] = Array.from(pointereRef.current.values())
      dragStartRef.current = { x: rest.x, y: rest.y, px: pos.x, py: pos.y }
      dragDeltaXRef.current = 0
    }
    if (pointereRef.current.size > 0) return
    // Transition slås på i samme render som snapp-verdiene — det animerer snappen.
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

  // Foreldreløse pekere: et pointerup kan lande på en søsken-knapp (f.eks.
  // pilene, midt i sveipet) i stedet for zoom-laget. Da ble pekeren liggende i
  // pointereRef, neste trykk ble tolket som pinch, og ingen gest virket mer.
  // React-lytteren (på document.body) fyrer før window-lytteren, så pointerup
  // PÅ laget er allerede slettet — has()-sjekken gjør dette til ren opprydding.
  useEffect(() => {
    function ryddPeker(e: PointerEvent) {
      if (!pointereRef.current.has(e.pointerId)) return
      pointereRef.current.delete(e.pointerId)
      if (pointereRef.current.size < 2) pinchStartRef.current = null
      if (pointereRef.current.size === 0) {
        dragStartRef.current = null
        dragDeltaXRef.current = 0
        pinchetRef.current = false
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

  // Portal til <body>, ellers begrenser layout-containeren (maxWidth 480,
  // position: relative) fixed-posisjoneringen.
  //
  // Overlayet har INGEN gest-handlers: touchAction:none på en ancestor kan ikke
  // oppheves av en etterkommer og ville drept scrollingen i kommentar-sheeten.
  // Gestene bor på zoom-laget, som dekker samme flate.
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
      {/* Zoom-lag: eneste sted med touchAction:'none' og pointer-handlers. */}
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
          // Med sheeten åpen (starter på top: 42dvh) flyttes bildet opp i
          // stedet for å stå midtstilt bak den.
          alignItems: sheetAapen ? 'flex-start' : 'center',
          justifyContent: 'center',
          // Et 4x-skalert bilde maler ellers utenfor overlayet.
          overflow: 'hidden'
        }}
      >
        {/* pointerEvents: none så touchene treffer zoom-laget rundt. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={bilde}
          alt=""
          style={{
            maxWidth: '95vw',
            maxHeight: sheetAapen ? '40dvh' : '95vh',
            marginTop: sheetAapen ? 'max(16px, var(--header-topp))' : 0,
            objectFit: 'contain',
            userSelect: 'none',
            pointerEvents: 'none',
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${skala})`,
            transformOrigin: 'center',
            // Kun under gest: permanent willChange koster et kompositor-lag i minnet.
            willChange: gestAktiv ? 'transform' : undefined,
            // Ingen transition under gest, ellers henger bildet etter fingeren.
            transition: gestAktiv ? 'none' : 'transform 0.15s ease-out',
          }}
        />
      </div>

      {/* Skjult når sheeten (med egen lukk) er åpen. --header-topp, ikke bare
          safe-area: ekstra luft forbi iOS' Liquid Glass-slør (#787). */}
      {!sheetAapen && (
        <button
          type="button"
          onClick={onLukk}
          aria-label="Lukk"
          style={{
            position: 'absolute',
            top: 'max(16px, var(--header-topp))',
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
            top: 'max(24px, calc(var(--header-topp) + 8px))',
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

      {/* Pilene vises alltid: eneste inngang for VoiceOver, som ikke kan sveipe. */}
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
              backdropFilter: 'blur(8px)',
            }}
          >
            <Icon name="chevron" size={22} color="currentColor" strokeWidth={2.5} />
          </button>
        </>
      )}

      {/* key={aktiv.id} er KRITISK: lightboxen unmounter ikke ved bildebytte,
          så uten key beholdt raden forrige bildes optimistiske state. */}
      {brukerId && !sheetAapen && (
        <div
          style={{
            position: 'absolute',
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
          {/* Kun når profiler er sendt med (album/[id], #481). */}
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

      {/* Admin/eier-handlinger øverst til venstre. Kort label + fontSize 11 så
          pillen ikke kolliderer med den sentrerte telleren på smale skjermer. */}
      {kanRedigere && albumId && !sheetAapen && (
        <div
          style={{
            position: 'absolute',
            top: 'max(16px, var(--header-topp))',
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
              opacity: pending ? 0.6 : 1,
            }}
          >
            Slett
          </button>
        </div>
      )}

      {/* key: usendt tekst/edit-state skal ikke overleve til neste bilde (#481). */}
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
