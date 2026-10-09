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
import Treffflate, { FELT_I_PILLE_STIL } from '@/components/ui/Treffflate'
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

// Dynamisk import: AlbumLightbox drar med seg kommentar-/reaksjonsmaskineriet,
// som chatten aldri bruker (den sender ikke albumId/brukerId/profiler). Statisk
// import ville lagt død JS i initial bundle; overlayet vises uansett først etter
// et klikk (#623/#625).
const AlbumLightbox = dynamic(() => import('@/components/album/AlbumLightbox'), { ssr: false })

// Re-eksport fra lib/chat-konfig.ts — eksisterende kallsteder importerer herfra.
export type ChatScope = ChatScopeKonfig

export type ChatMelding = {
  id: string
  profil_id: string
  innhold: string | null
  bilde_url: string | null
  video_url: string | null
  opprettet: string
  // Kun på klubb_chat (Messenger-import) — valgfritt fordi andre scopes mangler feltet.
  fra_facebook?: boolean
}

type Props = {
  scope: ChatScope
  brukerId: string
  initialMeldinger: ChatMelding[]
  profiler: ChatProfil[]
  /** Hvis true: sett en overskrift ("Samtale") over chat-området */
  visSeksjonsLabel?: boolean
  /** Scroll til siste melding ved mount og ved nye meldinger (/chat, /samtaler/[id]).
   * Default false så detaljsider med chat under hovedinnholdet ikke spretter til bunn. */
  autoScrollTilBunn?: boolean
  /**
   * Elementet som skal scrolles i stedet for `window` — for kartets sidepanel
   * (#711), der vindusscroll er låst og `window.scrollTo` ikke gjør noe.
   * En funksjon og ikke en ref: panelet kan monteres etter Chat, og en ref
   * ville da vært null.
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
  // Vedheng-bilde holdes lokalt og lastes opp først ved send.
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
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [pickerFor, setPickerFor] = useState<string | null>(null)
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
  // Alle navn, også ens eget — andre kan tagge deg, og taggen skal avgrenses likt.
  const mentionNavn = useRef(
    profiler.flatMap(p => (p.navn ? [p.navn] : [])),
  ).current
  const supabase = useRef(createClient()).current

  const konfig = konfigFor(scope)
  const kanalNavn = konfig.kanalNavn(scope)

  // Fetch/paginering, realtime og visibility-refetch bor i hooken.
  const { meldinger, setMeldinger, harMerEldre, henterEldre, lastEldre, hentMeldinger } =
    useChatMeldinger({ scope, initialMeldinger, supabase, konfig, kanalNavn })

  // andreProfiler ekskluderer allerede brukeren; brukerId sendes likevel for å
  // gjøre kontrakten eksplisitt.
  const mentionForslag = lagMentionForslag(mentionSøk, andreProfiler, brukerId)

  function velgMention(navn: string) {
    const nyTekst = velgMentionTekst(tekst, navn)
    setTekst(nyTekst)
    setMentionSøk(null)
    inputRef.current?.focus()
  }

  const scrollTilBunn = useCallback((instant = false) => {
    // window.scrollTo (ikke scrollIntoView): hele siden skal til bunnen, ikke
    // bare meldingsblokken. Første scroll gjøres av <ChatAutoScrollScript />
    // før hydrering (#209); denne er for nye meldinger og som fallback.
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

  function erNaerBunn(terskel = CHAT_NAER_BUNN_TERSKEL_PX) {
    if (typeof window === 'undefined') return true
    const boks = scrollContainer?.()
    if (boks) {
      return boks.scrollHeight - boks.scrollTop - boks.clientHeight <= terskel
    }
    const rest = document.documentElement.scrollHeight - window.scrollY - window.innerHeight
    return rest <= terskel
  }

  // Instant ved første mount, smooth ved nye meldinger i bunnen. Ikke ved
  // paginering (stor diff) eller når lista krymper.
  const forrigeLengde = useRef(meldinger.length)
  const harMountet = useRef(false)
  useEffect(() => {
    const lengdeForDenneEffekten = meldinger.length
    const diff = lengdeForDenneEffekten - forrigeLengde.current
    forrigeLengde.current = lengdeForDenneEffekten

    if (!harMountet.current) {
      harMountet.current = true
      if (autoScrollTilBunn) {
        // Egen container (#711): ekstra runder fordi panelet glir inn over
        // 220 ms og bilder får høyde først når de har lastet — én frame er for tidlig.
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
      // Andres melding: scroll bare nær bunnen, ellers kastes han ned mens han leser eldre (#238).
      if (sisteEgen || erNaerBunn()) scrollTilBunn()
    }
    // Bevisst kun lengde-endring, ikke ny array-referanse (#260).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meldinger.length, scrollTilBunn, autoScrollTilBunn])

  // Fest til bunnen mens innholdet vokser: chat-bilder har ingen kjent høyde
  // før de er lastet, så bunnen flytter seg etter mount-scrollen.
  // ResizeObserver måler content-box, så padding-bottom (tastatur-luft) utløser
  // den IKKE — ellers flyttet den visningen per vv-hendelse (se CLAUDE.md
  // § Policy: Skrivefelt og iOS-tastatur).
  const listeRef = useRef<HTMLDivElement>(null)
  const festetBunn = useRef(true)
  useEffect(() => {
    if (!autoScrollTilBunn) return
    const liste = listeRef.current
    if (!liste || typeof ResizeObserver === 'undefined') return
    const boks = scrollContainer?.()
    const mål: HTMLElement | Window = boks ?? window
    // Egne scrollTo-kall gir også scroll-events; underveis i en smooth-scroll
    // er vi ikke nær bunnen ennå, og det skal ikke tolkes som at han scrollet opp.
    let egenScrollTil = 0
    const følg = () => {
      egenScrollTil = Date.now() + 700
      scrollTilBunn(true)
    }
    const påScroll = () => {
      if (Date.now() < egenScrollTil) return
      festetBunn.current = erNaerBunn()
    }
    let forrigeHoyde = liste.getBoundingClientRect().height
    const obs = new ResizeObserver(entries => {
      const hoyde = entries[0]?.contentRect.height ?? forrigeHoyde
      const vokste = hoyde > forrigeHoyde
      forrigeHoyde = hoyde
      if (vokste && festetBunn.current) følg()
    })
    obs.observe(liste)
    mål.addEventListener('scroll', påScroll, { passive: true })
    return () => {
      obs.disconnect()
      mål.removeEventListener('scroll', påScroll)
    }
    // erNaerBunn leser kun scrollContainer, som står i lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoScrollTilBunn, scrollContainer, scrollTilBunn])

  // keyboardOffset (viewport-forankret) brukes KUN i !iEgenBoks-grenene;
  // tastaturHoyde (stabil, for flyt) KUN i iEgenBoks-grenen (#714).
  const keyboardOffset = useKeyboardOffset()
  const tastaturHoyde = useTastaturHoyde()

  // Egen scroll-boks (kartets sidepanel): pillen ligger i normal flyt.
  // Ellers ER chatten siden, og pillen forankres til viewporten (#714,
  // se CLAUDE.md § Policy: Skrivefelt og iOS-tastatur).
  const iEgenBoks = Boolean(scrollContainer)

  const { reaksjonerPerMelding, toggleReaksjon: toggleReaksjonBase } =
    useChatReaksjoner(meldinger, brukerId, supabase)

  // Lukker også pickeren — den er UI-state som bor her, ikke i hooken.
  function toggleReaksjon(meldingId: string, emoji: string) {
    setPickerFor(null)
    toggleReaksjonBase(meldingId, emoji)
  }

  // Kompletterer fokus-scrollen: vv.resize kommer ETTER focus, så paddingen
  // finnes ikke ennå ved fokus. Scroll så lenge høyden VOKSER (iOS leverer
  // flere trinn), aldri når den synker/står stille — det er bug-klassen (#714,
  // se CLAUDE.md § Policy: Skrivefelt og iOS-tastatur).
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
      if (filUploadKopi) {
        const fd = new FormData()
        fd.append('fil', filUploadKopi)
        fd.append('kategori', 'chat')
        const res = await lastOppBilde(fd)
        bildeUrl = res.url
      }

      const nyRad = await sendChatMelding(scope, melding, bildeUrl)
      // Bytt temp-raden med en gang — ikke vent på realtime-INSERT, som kan
      // utebli (abonnement-race, droppet WebSocket på iOS). Realtime dedup'er på id.
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
      // Best effort: en foreldreløs R2-fil er bedre enn å feile uten tilbakemelding.
      if (bildeUrl) slettBilde(bildeUrl).catch(() => {})
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
    const forrige = meldinger.find(m => m.id === id)
    if (forrige && forrige.innhold === ny) {
      avbrytEdit()
      return
    }
    setLagrerEdit(true)
    setMeldinger(prev => prev.map(m => (m.id === id ? { ...m, innhold: ny } : m)))
    try {
      await oppdaterChatMelding(scope, id, ny)
      avbrytEdit()
    } catch {
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
      const nyeste = await hentMeldinger()
      setMeldinger(nyeste)
    }
  }

  // State-eierskapet (edit, picker, lightbox, meldinger) blir her i Chat.
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

      {/* Vis eldre */}
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
              opacity: henterEldre ? 0.5 : 1,
            }}
          >
            {henterEldre ? 'Henter…' : 'Vis eldre'}
          </button>
        </div>
      )}

      {/* padding-bottom rommer den forankrede input-pillen (pill-høyde +
          safe-area) så siste melding ikke havner bak den. På chat-fokuserte
          sider vokser den med keyboardOffset så siste melding kan scrolles
          over tastaturet (#216). I egen boks: 0 — pillen ligger i flyt (#714). */}
      <div
        ref={listeRef}
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
          const visDatoSkille = !forrige || !erSammeNorskeDag(forrige.opprettet, m.opprettet)
          // Dato-skille bryter alltid grupperingen, så første melding på ny dag viser header.
          const erFortsettelse = !visDatoSkille && forrige?.profil_id === m.profil_id
          const neste = i < meldinger.length - 1 ? meldinger[i + 1] : null
          const erSisteIGruppe = !neste || neste.profil_id !== m.profil_id || !erSammeNorskeDag(m.opprettet, neste.opprettet)
          const erEgen = m.profil_id === brukerId
          // Kun eieren, også for FB-importerte. Admin har verken knapp eller
          // RLS-rett (migrasjon 069/132) — må noe bort, gjøres det i Supabase-dashbordet.
          const kanSlette = erEgen
          return (
            <ChatMeldingRad
              key={m.id}
              melding={m}
              visDatoSkille={visDatoSkille}
              erFortsettelse={erFortsettelse}
              erSisteIGruppe={erSisteIGruppe}
              erFoerste={i === 0}
              erEgen={erEgen}
              kanSlette={kanSlette}
              navn={profilMap.get(m.profil_id) ?? 'Ukjent'}
              bilde={bildeMap.get(m.profil_id)}
              rolle={rolleMap.get(m.profil_id) ?? null}
              mentionNavn={mentionNavn}
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

      {/* Mention-chips, bilde-preview, feilmelding og input-pill.
          I egen boks: normal flyt, ingen position/bottom — ikke forankre (#714,
          se CLAUDE.md § Policy: Skrivefelt og iOS-tastatur).
          Ellers: fixed på chat-fokuserte sider (alltid synlig), sticky på
          detaljsider; `bottom` løftes med keyboardOffset over iOS-tastaturet
          (#216). Chips ligger inni så de ikke skjules bak pillen når de wrapper. */}
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
                  // Taps ved siden av pillen skal treffe innholdet under; inner gjenoppretter.
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
                    padding: '0 20px',
                    boxSizing: 'border-box',
                    pointerEvents: 'auto',
                  }
                : undefined
          }
        >
      {/* @mention-forslag */}
      <MentionVelger forslag={mentionForslag} onVelg={velgMention} />
      {/* Bilde-forhåndsvisning */}
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
            style={{ position: 'absolute', top: -6, right: -6 }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
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

      {/* Solid bakgrunn (ikke --bg-elevated, 95 % opak) så meldinger bak pillen ikke skinner gjennom. */}
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
          style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
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
            <Icon name="camera" size={20} color="currentColor" strokeWidth={1.8} />
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
            // Engangs-scroll, ikke en løpende lytter; tastaturHoyde-effekten kompletterer (#714).
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
            ...FELT_I_PILLE_STIL,
          }}
        />
        <Treffflate
          synlig={32}
          onClick={handleSend}
          disabled={(!tekst.trim() && !bildeFil) || sender}
          aria-label="Send melding"
          style={{
            flexShrink: 0,
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
        // id = URL-en: kun en stabil nøkkel, siden stiene som bruker id er gated
        // av props chatten ikke sender. lukkVedTrykk: trykk hvor som helst lukker.
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
