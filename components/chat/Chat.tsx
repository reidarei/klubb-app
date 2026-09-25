'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import {
  sendChatMelding,
  oppdaterChatMelding,
  slettChatMelding,
} from '@/lib/actions/chat'
import { konfigFor, type ChatScope as ChatScopeKonfig } from '@/lib/chat-konfig'
import { formaterDato, erSammeNorskeDag } from '@/lib/dato'
import Icon from '@/components/ui/Icon'
import SectionLabel from '@/components/ui/SectionLabel'
import Treffflate from '@/components/ui/Treffflate'
import { lastOppBilde, slettBilde } from '@/lib/actions/bilde-opplasting'
import {
  beregnMentionSøk,
  velgMentionTekst,
  lagMentionForslag,
  type ChatProfil,
} from '@/lib/mention'
import MentionVelger from '@/components/agenda/MentionVelger'
import { CHAT_NAER_BUNN_TERSKEL_PX, CHAT_TASTATUR_LUFT_PX } from '@/lib/konstanter'
import ChatMeldingRad from './ChatMeldingRad'
import { useKeyboardOffset, useTastaturHoyde } from './hooks/useKeyboardOffset'
import { useBildeOpplasting } from './hooks/useBildeOpplasting'
import { useChatReaksjoner } from './hooks/useChatReaksjoner'
import { useChatMeldinger } from './hooks/useChatMeldinger'

// Dynamisk import: AlbumLightbox drar med seg BildeKommentarSheet og
// AlbumBildeReaksjoner (→ chat-hooks, mention-velger, browser-supabase-
// klienten). Chatten sender verken albumId, brukerId eller profiler til den
// (se lightboxSrc-bruken lenger ned), så statisk import ville lagt død JS i
// initial bundle for denne siden. Overlayet vises uansett først etter et
// klikk, så det er ingen fossefall-kostnad ved å hente det da. Samme mønster
// som ChatBildeGalleri.tsx (#623/#625).
const AlbumLightbox = dynamic(() => import('@/components/album/AlbumLightbox'), { ssr: false })

// ChatScope er sentralt definert i lib/chat-konfig.ts og re-eksportert her
// for kall-ergonomi (eksisterende callsites importerer fra Chat.tsx).
export type ChatScope = ChatScopeKonfig

export type ChatMelding = {
  id: string
  profil_id: string
  innhold: string | null
  bilde_url: string | null
  video_url: string | null
  opprettet: string
  // fra_facebook finnes kun på klubb_chat-tabellen — markerer meldinger
  // som er importert fra Messenger. Valgfritt så typen kan brukes i alle
  // chat-scopes uten å late som om feltet eksisterer overalt.
  fra_facebook?: boolean
}

// ChatProfil-typen ligger i lib/mention.ts — importer derfra direkte.

type Props = {
  scope: ChatScope
  brukerId: string
  initialMeldinger: ChatMelding[]
  profiler: ChatProfil[]
  /** Hvis true: sett en overskrift ("Samtale") over chat-området */
  visSeksjonsLabel?: boolean
  /** Hvis true: scroll siden til siste melding ved mount og ved nye meldinger.
   * Brukes på chat-fokuserte sider (/chat, /samtaler/[id]). Default false så
   * detaljsider med chat under hovedinnholdet ikke spretter til bunn. */
  autoScrollTilBunn?: boolean
  /**
   * Elementet som skal scrolles i stedet for vinduet.
   *
   * Utelates den, scrolles `window` — dagens oppførsel på /chat og
   * /samtaler/[id], der SIDEN er scroll-containeren. Kartet (#711) rendrer
   * chatten i et sidepanel med egen scroll, og der låser kartsiden dessuten
   * vindusscroll helt: `window.scrollTo` gjorde da ingenting, og chatten ble
   * stående et tilfeldig sted midt i tråden i stedet for nederst.
   *
   * En funksjon og ikke en ref: panelet monteres etter Chat i noen
   * rekkefølger, og en ref ville vært null på det tidspunktet.
   */
  scrollContainer?: () => HTMLElement | null
}

export default function Chat({
  scope,
  brukerId,
  initialMeldinger,
  profiler,
  visSeksjonsLabel = true,
  autoScrollTilBunn = false,
  scrollContainer,
}: Props) {
  const [tekst, setTekst] = useState('')
  const [sender, setSender] = useState(false)
  const [mentionSøk, setMentionSøk] = useState<string | null>(null)
  // Vedheng-bilde (file holdes til submit, lastes opp først ved send)
  const {
    bildeFil,
    setBildeFil,
    bildePreview,
    setBildePreview,
    bildeFeil,
    setBildeFeil,
    bildeInputRef,
    velgBilde,
    fjernBilde,
  } = useBildeOpplasting()
  // Lightbox-visning av bilder
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  // Hvilken melding viser picker. Null = ingen.
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  // Hvilken melding redigeres. Null = ingen. editTekst holder editert innhold.
  const [editerer, setEditerer] = useState<string | null>(null)
  const [editTekst, setEditTekst] = useState('')
  const [lagrerEdit, setLagrerEdit] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bunnenRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const profilMap = useRef(
    new Map(profiler.map(p => [p.id, p.navn ?? 'Ukjent'])),
  ).current
  const bildeMap = useRef(
    new Map(profiler.map(p => [p.id, p.bilde_url])),
  ).current
  const rolleMap = useRef(
    new Map(profiler.map(p => [p.id, p.rolle ?? null])),
  ).current
  const andreProfiler = useRef(
    profiler.filter(p => p.id !== brukerId && p.navn),
  ).current
  const supabase = useRef(createClient()).current

  // CHAT_KONFIG-lookup samler tabell/kanal/charLimit per scope. Erstatter
  // 5 paralle switch-kjeder som tidligere måtte holdes synk her, i hentMeldinger,
  // i realtime-oppsett og i input-validering.
  const konfig = konfigFor(scope)
  const kanalNavn = konfig.kanalNavn(scope)

  // Meldingsliste (fetch/paginering, realtime, visibility-refetch) bor i egen
  // hook. setMeldinger/hentMeldinger brukes videre av de optimistiske
  // handler-funksjonene under (handleSend, lagreEdit, handleSlett).
  const { meldinger, setMeldinger, harMerEldre, henterEldre, lastEldre, hentMeldinger } =
    useChatMeldinger({ scope, initialMeldinger, supabase, konfig, kanalNavn })

  // Mention-state og -forslag styres av hjelperne i lib/mention.ts.
  // andreProfiler-filteret over ekskluderer allerede innlogget bruker, men vi
  // sender brukerId likevel som ekskluder for å gjøre kontrakten eksplisitt.
  const mentionForslag = lagMentionForslag(mentionSøk, andreProfiler, brukerId)

  function velgMention(navn: string) {
    const nyTekst = velgMentionTekst(tekst, navn)
    setTekst(nyTekst)
    setMentionSøk(null)
    inputRef.current?.focus()
  }

  const scrollTilBunn = useCallback((instant = false) => {
    // window.scrollTo (ikke scrollIntoView) fordi vi vil ha hele siden
    // til bunnen, ikke kun bunnen av meldingsblokken. Sticky input-pill
    // under bunnenRef gir naturlig avstand.
    //
    // Initial-mount-scroll håndteres nå av <ChatAutoScrollScript /> i
    // sidens markup (kjører før hydrering, eliminerer flikket fra #209).
    // Denne useCallback brukes fortsatt for realtime-INSERT-grenen og som
    // defense-in-depth-fallback hvis inline-scriptet blokkeres.
    if (typeof window === 'undefined') return
    const boks = scrollContainer?.()
    if (boks) {
      boks.scrollTo({ top: boks.scrollHeight, behavior: instant ? 'auto' : 'smooth' })
      return
    }
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: instant ? 'auto' : 'smooth',
    })
  }, [scrollContainer])

  // Sjekker om brukeren befinner seg nær bunnen av siden.
  // Kjøres kun klient-side (window er undefined under SSR).
  function erNaerBunn(terskel = CHAT_NAER_BUNN_TERSKEL_PX) {
    if (typeof window === 'undefined') return true
    const boks = scrollContainer?.()
    if (boks) {
      return boks.scrollHeight - boks.scrollTop - boks.clientHeight <= terskel
    }
    const rest = document.documentElement.scrollHeight - window.scrollY - window.innerHeight
    return rest <= terskel
  }

  // Scroll til bunn ved første mount (instant), og når nye meldinger
  // dukker opp i bunnen (smooth). Ikke ved paginering (store diff)
  // eller når listen krymper.
  const forrigeLengde = useRef(meldinger.length)
  const harMountet = useRef(false)
  useEffect(() => {
    const lengdeForDenneEffekten = meldinger.length
    const diff = lengdeForDenneEffekten - forrigeLengde.current
    forrigeLengde.current = lengdeForDenneEffekten

    if (!harMountet.current) {
      harMountet.current = true
      if (autoScrollTilBunn) {
        // requestAnimationFrame så DOM er rendret før vi måler/scroller.
        // To runder når vi scroller en egen container (#711): panelet glir inn
        // over 220 ms, og bilder uten satte dimensjoner får høyde først etter
        // at de har lastet — én frame er da for tidlig, og chatten ble stående
        // et stykke over bunnen.
        requestAnimationFrame(() => {
          scrollTilBunn(true)
          if (scrollContainer) {
            requestAnimationFrame(() => scrollTilBunn(true))
            window.setTimeout(() => scrollTilBunn(true), 400)
          }
        })
      }
      return
    }
    if (autoScrollTilBunn && diff > 0 && diff <= 3) {
      const sisteEgen = meldinger[meldinger.length - 1]?.profil_id === brukerId
      // Egen melding: alltid scroll (forventet at vi ser det vi sendte).
      // Andres melding: scroll bare hvis brukeren står nær bunnen — ellers
      // er det irriterende å bli kastet ned mens han leser eldre. Se #238.
      if (sisteEgen || erNaerBunn()) scrollTilBunn()
    }
    // Bevisst: vi vil kun trigge på lengde-endring, ikke når meldinger-arrayen
    // får ny referanse av andre grunner. brukerId/meldinger leses inne i effekten
    // men er stabile innenfor det øyeblikket lengden endres. Se #260.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meldinger.length, scrollTilBunn, autoScrollTilBunn])

  // iOS-tastaturhøyde — skjør visualViewport-logikk, se hooks/useKeyboardOffset.ts.
  // keyboardOffset (viewport-forankret) brukes KUN i !iEgenBoks-grenene under;
  // tastaturHoyde (stabil, for flyt) brukes KUN i iEgenBoks-grenen. Se #714.
  const keyboardOffset = useKeyboardOffset()
  const tastaturHoyde = useTastaturHoyde()

  // Rendres chatten i sin EGEN scroll-boks (kartets sidepanel, #711), eller
  // er den sidens hovedinnhold?
  //
  // Skillet styrer input-pillen: på /chat og /samtaler/[id] ER chatten siden,
  // og pillen forankres til viewporten (`position: fixed`) slik den alltid
  // har gjort — se CLAUDE.md § Policy: Skrivefelt og iOS-tastatur for hvorfor
  // det unntaket er varig. I et sidepanel (kartet) ligger pillen i stedet i
  // NORMAL FLYT som siste element under meldingene, ikke forankret i det hele
  // tatt — `sticky` festet den til boksens bunn og gjenskapte akkurat den
  // dansende, viewport-avhengige posisjoneringen chatten på egen side har
  // (#712, #713). Se #714.
  const iEgenBoks = Boolean(scrollContainer)

  // Reaksjoner (fetch + realtime + optimistisk toggle) bor i egen hook.
  const { reaksjonerPerMelding, toggleReaksjon: toggleReaksjonBase } =
    useChatReaksjoner(meldinger, brukerId, supabase)

  // Lukker picker i tillegg til å toggle — pickerFor er UI-state som bor
  // her i Chat, selve reaksjons-logikken bor i useChatReaksjoner.
  function toggleReaksjon(meldingId: string, emoji: string) {
    setPickerFor(null)
    toggleReaksjonBase(meldingId, emoji)
  }

  // Fokus-scroll (#714): engangs-scroll når feltet får fokus, pluss en
  // kompletterende effekt for tastatur-animasjonen. vv.resize (som driver
  // tastaturHoyde) kommer ETTER focus-eventet, så paddingen som gir plass
  // til å scrolle i finnes ikke ennå på fokus-tidspunktet — uten denne
  // effekten stopper scrollen for tidlig.
  //
  // iOS leverer typisk FLERE resize-høyder mens tastaturet animerer opp, så
  // guarden står på «høyden vokser», ikke bare på 0→N: stoppet vi etter
  // første trinn, rakk paddingen å vokse videre uten at noen scrollet, og
  // feltet kunne ende bak tastaturet likevel. Retningen er det bærende — vi
  // scroller ALDRI når høyden synker eller står stille (N→0, N→M<N), for da
  // er vi tilbake i den løpende omposisjoneringen som ER bug-klassen (#222,
  // #236, #712, #713). Dette er en scroll av boksen, ikke en flytting av
  // feltet, og skjer kun mens feltet faktisk har fokus.
  const forrigeTastaturHoyde = useRef(0)
  useEffect(() => {
    const vokser = tastaturHoyde > forrigeTastaturHoyde.current
    forrigeTastaturHoyde.current = tastaturHoyde
    if (!vokser || !iEgenBoks) return
    if (document.activeElement === inputRef.current) scrollTilBunn(true)
  }, [tastaturHoyde, iEgenBoks, scrollTilBunn])

  async function handleSend() {
    const melding = tekst.trim() || null
    const harBilde = !!bildeFil
    if (!melding && !harBilde) return
    if (sender) return

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const optimistisk: ChatMelding = {
      id: tempId,
      profil_id: brukerId,
      innhold: melding,
      bilde_url: bildePreview, // viser blob-URL midlertidig
      video_url: null,
      opprettet: new Date().toISOString(),
      fra_facebook: false,
    }
    setMeldinger(prev => [...prev, optimistisk])

    setTekst('')
    setMentionSøk(null)
    setSender(true)
    const filUploadKopi = bildeFil
    const previewUrlKopi = bildePreview
    setBildeFil(null)
    setBildePreview(null) // ikke revoke ennå — optimistisk rad bruker den

    let bildeUrl: string | null = null
    try {
      // Last opp bilde til R2 først hvis valgt
      if (filUploadKopi) {
        const fd = new FormData()
        fd.append('fil', filUploadKopi)
        fd.append('kategori', 'chat')
        const res = await lastOppBilde(fd)
        bildeUrl = res.url
      }

      const nyRad = await sendChatMelding(scope, melding, bildeUrl)
      // Bytt den optimistiske temp-raden ut med den ekte raden fra serveren med
      // en gang — ikke vent på realtime-INSERT. Egen melding forsvant tidligere
      // når det eventet ikke nådde fram (abonnement-race ved sidelast, droppet
      // WebSocket på iOS-PWA), fordi realtime var eneste avstemming. Realtime-
      // handleren dedup'er på id, så en senere echo av samme rad blir no-op.
      setMeldinger(prev => {
        // Realtime rakk å legge inn den ekte raden allerede — fjern kun temp.
        if (prev.some(m => m.id === nyRad.id)) {
          return prev.filter(m => m.id !== tempId)
        }
        const harTemp = prev.some(m => m.id === tempId)
        return harTemp
          ? prev.map(m => (m.id === tempId ? { ...nyRad, fra_facebook: false } : m))
          : [...prev, { ...nyRad, fra_facebook: false }]
      })
      // Den ekte raden peker på R2-URL nå — frigjør blob-preview-en.
      if (previewUrlKopi) URL.revokeObjectURL(previewUrlKopi)
    } catch (err) {
      console.error('Send feilet:', err)
      setMeldinger(prev => prev.filter(m => m.id !== tempId))
      setBildeFeil('Kunne ikke sende meldingen')
      // Rydd opp R2-fil hvis upload lyktes men insert feilet (best effort —
      // bedre å ha en orphan enn å feile uten tilbakemelding).
      if (bildeUrl) slettBilde(bildeUrl).catch(() => {})
      // Frigjør blob-URL siden den optimistiske raden ble fjernet
      if (previewUrlKopi) URL.revokeObjectURL(previewUrlKopi)
    } finally {
      setSender(false)
      inputRef.current?.focus()
    }
  }

  function startLongPress(meldingId: string) {
    if (meldingId.startsWith('temp-')) return
    clearLongPress()
    longPressTimer.current = setTimeout(() => {
      setPickerFor(meldingId)
      // Haptisk feedback på mobil hvis tilgjengelig
      if (typeof window !== 'undefined' && 'navigator' in window) {
        navigator.vibrate?.(12)
      }
    }, 420)
  }

  function clearLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  function startEdit(meldingId: string, naavarende: string) {
    setPickerFor(null)
    setEditerer(meldingId)
    setEditTekst(naavarende)
  }

  function avbrytEdit() {
    setEditerer(null)
    setEditTekst('')
  }

  async function lagreEdit(id: string) {
    const ny = editTekst.trim()
    if (!ny || lagrerEdit) return
    // No-op hvis tekst er uendret
    const forrige = meldinger.find(m => m.id === id)
    if (forrige && forrige.innhold === ny) {
      avbrytEdit()
      return
    }
    setLagrerEdit(true)
    // Optimistisk oppdatering
    setMeldinger(prev => prev.map(m => (m.id === id ? { ...m, innhold: ny } : m)))
    try {
      await oppdaterChatMelding(scope, id, ny)
      avbrytEdit()
    } catch {
      // Rull tilbake ved feil
      if (forrige) {
        setMeldinger(prev =>
          prev.map(m => (m.id === id ? { ...m, innhold: forrige.innhold } : m)),
        )
      }
    } finally {
      setLagrerEdit(false)
    }
  }

  async function handleSlett(id: string) {
    if (!confirm('Slette denne meldingen?')) return
    setMeldinger(prev => prev.filter(m => m.id !== id))
    try {
      await slettChatMelding(scope, id)
    } catch {
      // Ved feil: last inn de siste N på nytt
      const nyeste = await hentMeldinger()
      setMeldinger(nyeste)
    }
  }

  // Callbacks til ChatMeldingRad samlet i ett objekt — state-eierskapet
  // (edit, picker, lightbox, meldinger) blir her i Chat.
  const radHandlers = {
    setEditTekst,
    lagreEdit,
    avbrytEdit,
    startEdit,
    startLongPress,
    clearLongPress,
    setPickerFor,
    toggleReaksjon,
    handleSlett,
    setLightboxSrc,
  }

  return (
    <div style={{ marginTop: visSeksjonsLabel ? 28 : 0 }}>
      {visSeksjonsLabel && (
        <SectionLabel count={meldinger.length}>
          {scope.type === 'klubb' ? 'Samtale' : 'Kommentarer'}
        </SectionLabel>
      )}

      {/* Vis eldre-knapp */}
      {harMerEldre && meldinger.length > 0 && (
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <button
            type="button"
            onClick={lastEldre}
            disabled={henterEldre}
            style={{
              padding: '6px 14px',
              background: 'transparent',
              border: '0.5px solid var(--border)',
              borderRadius: 999,
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '1.4px',
              textTransform: 'uppercase',
              cursor: henterEldre ? 'wait' : 'pointer',
              opacity: henterEldre ? 0.5 : 1,
            }}
          >
            {henterEldre ? 'Henter…' : 'Vis eldre'}
          </button>
        </div>
      )}

      {/* Meldingsliste — padding-bottom må romme input-pillen så ingen
          melding havner visuelt bak den. ~48px = pill-høyde (button 32 + 8+8
          padding) + buffer for grupperingsavstand. Tidligere kuttet ned til
          bare safe-area, men siden iOS-safe-area-inset-bottom (~34px) er
          større enn wrapperens 20px padding, endte sticky-pillen et stykke
          over sin naturlige posisjon og dekket siste melding.
          På chat-fokuserte sider vokser paddingen i tillegg med keyboardOffset
          slik at dokumentet blir høyt nok til å scrolle siste melding opp
          over tastaturet når det åpner (jf. #216).
          I egen boks (iEgenBoks) er padding-bottom 0: pillen ligger i normal
          flyt rett under meldingslisten, ikke forankret, så det trengs ikke
          noe tomrom å reservere for den. Se #714. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginBottom: 4,
          paddingBottom: iEgenBoks
            ? 0
            : autoScrollTilBunn
              ? `calc(64px + ${keyboardOffset}px + env(safe-area-inset-bottom))`
              : 'calc(64px + env(safe-area-inset-bottom))',
        }}
      >
        {meldinger.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '24px 0',
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              color: 'var(--text-tertiary)',
              fontStyle: 'italic',
            }}
          >
            Ingen meldinger ennå.
          </div>
        )}

        {meldinger.map((m, i) => {
          const forrige = i > 0 ? meldinger[i - 1] : null
          // Vis dato-skille når det er første melding eller ny kalenderdag (norsk tid).
          const visDatoSkille = !forrige || !erSammeNorskeDag(forrige.opprettet, m.opprettet)
          // Grupper sammenhengende meldinger fra samme bruker — skjul avatar
          // og navn/tid-header på fortsettelses-meldinger. Dato-skille bryter
          // alltid grupperingen så første melding på ny dag alltid viser header.
          const erFortsettelse = !visDatoSkille && forrige?.profil_id === m.profil_id
          const erEgen = m.profil_id === brukerId
          // Slett-knapp: kun egen-eier. Admin har verken knapp eller
          // RLS-rett til å slette andres chat (migrasjon 069, gjenopprettet
          // i 132) — må det bort, gjøres det i Supabase-dashbordet. Gjelder også FB-importerte: sendte du meldingen
          // (i appen eller i Messenger som senere ble importert), kan du
          // slette den her.
          const kanSlette = erEgen
          return (
            <ChatMeldingRad
              key={m.id}
              melding={m}
              visDatoSkille={visDatoSkille}
              erFortsettelse={erFortsettelse}
              erFoerste={i === 0}
              erEgen={erEgen}
              kanSlette={kanSlette}
              navn={profilMap.get(m.profil_id) ?? 'Ukjent'}
              bilde={bildeMap.get(m.profil_id)}
              rolle={rolleMap.get(m.profil_id) ?? null}
              tid={formaterDato(m.opprettet, 'HH:mm')}
              brukerId={brukerId}
              charLimit={konfig.charLimit}
              reaksjoner={reaksjonerPerMelding.get(m.id)}
              editerer={editerer === m.id}
              editTekst={editTekst}
              lagrerEdit={lagrerEdit}
              pickerAapen={pickerFor === m.id}
              handlers={radHandlers}
            />
          )
        })}
        <div ref={bunnenRef} />
      </div>

      {/* Container med mention-chips, bilde-preview, evt. feilmelding
          og input-pill.
          I egen boks (kartets sidepanel, #711) ligger pillen i NORMAL FLYT
          som siste element under meldingene — ingen position, ingen bottom-
          offset. Scroller man opp i panelet, går pillen ut av syne sammen
          med resten av innholdet, som er ønsket (se CLAUDE.md § Policy:
          Skrivefelt og iOS-tastatur). Fire runder i samme bug-klasse
          (#222, #236, #712, #713) landet på dette: forankring til
          viewporten er problemet, ikke løsningen. Se #714.
          Utenfor egen boks: på chat-fokuserte sider er container fixed til
          bunn av viewportet så pillen alltid er synlig (også når innholdet
          er kortere enn skjermen); ellers sticky, sånn at den følger med når
          brukeren scroller chat-seksjonen inn i bilde på detalj-sider.
          `bottom` løftes med keyboardOffset så pillen holder seg over
          iOS-tastaturet (jf. #216). Mention-chips ligger inni containeren
          for å unngå at de skjules bak input-pill når flere chips wrappes
          til flere linjer. */}
      <div
        style={
          iEgenBoks
            ? {
                paddingBottom: tastaturHoyde > 0 ? tastaturHoyde + CHAT_TASTATUR_LUFT_PX : 0,
                marginTop: 6,
              }
            : autoScrollTilBunn
              ? {
                  position: 'fixed',
                  left: 0,
                  right: 0,
                  bottom:
                    keyboardOffset > 0
                      ? `${keyboardOffset}px`
                      : 'env(safe-area-inset-bottom)',
                  zIndex: 20,
                  display: 'flex',
                  justifyContent: 'center',
                  // pointer-events: none på ytre wrapper så taps over/under
                  // pillen treffer chat-innholdet under; inner gjenoppretter
                  // pointer-events for selve pillen.
                  pointerEvents: 'none',
                }
              : {
                  position: 'sticky',
                  bottom:
                    keyboardOffset > 0
                      ? `${keyboardOffset}px`
                      : 'env(safe-area-inset-bottom)',
                  zIndex: 20,
                }
        }
      >
        <div
          style={
            iEgenBoks
              ? { width: '100%', boxSizing: 'border-box' }
              : autoScrollTilBunn
                ? {
                    width: '100%',
                    maxWidth: 480,
                    padding: '0 20px',
                    boxSizing: 'border-box',
                    pointerEvents: 'auto',
                  }
                : undefined
          }
        >
      {/* @mention-forslag */}
      <MentionVelger forslag={mentionForslag} onVelg={velgMention} />
      {/* Bilde-forhåndsvisning over input når et bilde er valgt */}
      {bildePreview && (
        <div
          style={{
            position: 'relative',
            marginBottom: 6,
            display: 'inline-block',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bildePreview}
            alt="Forhåndsvisning"
            style={{
              maxWidth: 120,
              maxHeight: 120,
              borderRadius: 8,
              border: '0.5px solid var(--border)',
              objectFit: 'cover',
            }}
          />
          <Treffflate
            synlig={22}
            onClick={fjernBilde}
            aria-label="Fjern bilde"
            style={{ position: 'absolute', top: -6, right: -6, cursor: 'pointer' }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                // original var litt mørkere — konsolidert til felles overlay-control-bg-token
                background: 'var(--overlay-control-bg)',
                color: 'var(--text-primary)',
                fontSize: 14,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ×
            </span>
          </Treffflate>
        </div>
      )}
      {bildeFeil && (
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 11,
            color: 'var(--danger)',
            marginBottom: 6,
          }}
        >
          {bildeFeil}
        </div>
      )}

      {/* Skriv melding — pill. Solid bakgrunn (ikke --bg-elevated som er
          95% opaque) så eventuelle meldinger som glir bak pillen ved sticky-
          offset ikke skinner gjennom. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 8px 8px 12px',
          border: '0.5px solid var(--border)',
          borderRadius: 999,
          background: 'var(--bg-elevated-solid)',
          marginBottom: 4,
        }}
      >
        <Treffflate
          synlig={32}
          onClick={() => bildeInputRef.current?.click()}
          aria-label="Legg ved bilde"
          style={{ color: 'var(--text-secondary)', flexShrink: 0, cursor: 'pointer' }}
        >
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="image" size={18} color="currentColor" strokeWidth={1.8} />
          </span>
        </Treffflate>
        <input
          ref={bildeInputRef}
          type="file"
          accept="image/*"
          onChange={velgBilde}
          style={{ display: 'none' }}
        />
        <input
          ref={inputRef}
          type="text"
          value={tekst}
          onChange={e => {
            setTekst(e.target.value)
            setMentionSøk(beregnMentionSøk(e.target.value))
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          onFocus={() => {
            // Engangs-scroll ved fokus, ikke en løpende lytter. Kompletteres
            // av tastaturHoyde-effekten over for tilfellet der tastaturet
            // åpner senere enn fokuset (#714).
            if (iEgenBoks) scrollTilBunn(true)
          }}
          placeholder={bildePreview ? 'Legg til tekst (valgfritt)…' : 'Skriv en melding…'}
          maxLength={konfig.charLimit}
          enterKeyHint="send"
          autoComplete="off"
          style={{
            flex: 1,
            minWidth: 0,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
            fontSize: 13,
          }}
        />
        <Treffflate
          synlig={32}
          onClick={handleSend}
          disabled={(!tekst.trim() && !bildeFil) || sender}
          aria-label="Send melding"
          style={{
            flexShrink: 0,
            cursor: (!tekst.trim() && !bildeFil) || sender ? 'default' : 'pointer',
            opacity: (!tekst.trim() && !bildeFil) || sender ? 0.4 : 1,
          }}
        >
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="arrowRight" size={14} color="var(--accent-foreground)" strokeWidth={2.5} />
          </span>
        </Treffflate>
      </div>
      </div>
      </div>

      {lightboxSrc && (
        // id settes til URL-en: den brukes kun av reaksjons-/kommentar-/
        // admin-stiene i AlbumLightbox, som alle er gated av props chatten
        // ikke sender (albumId, brukerId, profiler, kanRedigere) — så
        // verdien har ingen betydning her utover å være en stabil nøkkel.
        // lukkVedTrykk gjenskaper BildeLightbox sin gamle "klikk hvor som
        // helst for å lukke"-oppførsel i tillegg til X-knappen AlbumLightbox
        // alltid viser.
        <AlbumLightbox
          bilder={[{ id: lightboxSrc, bilde_url: lightboxSrc }]}
          startIndex={0}
          onLukk={() => setLightboxSrc(null)}
          lukkVedTrykk
        />
      )}
    </div>
  )
}
