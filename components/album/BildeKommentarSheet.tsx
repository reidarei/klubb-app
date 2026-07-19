'use client'

import { useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { sendChatMelding, slettChatMelding } from '@/lib/actions/chat'
import { konfigFor } from '@/lib/chat-konfig'
import { formaterDato, erSammeNorskeDag } from '@/lib/dato'
import Icon from '@/components/ui/Icon'
import ChatMeldingRad from '@/components/chat/ChatMeldingRad'
import type { ChatMelding } from '@/components/chat/Chat'
import { useKeyboardOffset } from '@/components/chat/hooks/useKeyboardOffset'
import { useChatReaksjoner } from '@/components/chat/hooks/useChatReaksjoner'
import { useChatMeldinger } from '@/components/chat/hooks/useChatMeldinger'
import {
  beregnMentionSøk,
  velgMentionTekst,
  lagMentionForslag,
  type ChatProfil,
} from '@/lib/mention'
import MentionVelger from '@/components/agenda/MentionVelger'

type Props = {
  bildeId: string
  albumId: string
  brukerId: string
  // Mottas for kontrakt-paritet med resten av chat-flaten, men brukes IKKE
  // til å styre slette-rettighet her — se kanSlette under.
  erAdmin: boolean
  profiler: ChatProfil[]
  initialAntall?: number
  onLukk: () => void
}

/**
 * Dedikert lettvekts-kommentarfelt for ett bilde i album-lightboxen (#481).
 * Bevisst IKKE en Chat.tsx-variant — Chat er bygget for dokument-scroll
 * (window.scrollTo, sticky/fixed mot viewport) som ikke fungerer under
 * lightboxens portal med body.overflow:hidden. Denne komponenten er en egen
 * fixed flex-kolonne med intern scroll, og gjenbruker kun det som faktisk er
 * iOS-tastatur-hardingen: useKeyboardOffset, useChatReaksjoner,
 * useChatMeldinger og ChatMeldingRad. Se arkitekturstyrets uttalelse på #481
 * for hele resonnementet (fjerde alternativ, enstemmig etter runde 2).
 *
 * Ingen bildevedlegg i v1 — ren tekst. Ingen draft-persistering: sheeten
 * key={bildeId}-remountes av AlbumLightbox ved bildebytte, så en påbegynt
 * usendt kommentar forsvinner bevisst (akseptert på 17-manns-skala).
 * Fremtidige «del bilde»-lenker som lander her må revurdere auto-åpning av
 * sheeten via ?bilde=-param — se AlbumDetalj.
 */
export default function BildeKommentarSheet({
  bildeId,
  albumId,
  brukerId,
  erAdmin: _erAdmin,
  profiler,
  initialAntall = 0,
  onLukk,
}: Props) {
  const [tekst, setTekst] = useState('')
  const [sender, setSender] = useState(false)
  const [mentionSøk, setMentionSøk] = useState<string | null>(null)
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const profilMap = useRef(new Map(profiler.map(p => [p.id, p.navn ?? 'Ukjent']))).current
  const bildeMap = useRef(new Map(profiler.map(p => [p.id, p.bilde_url]))).current
  const rolleMap = useRef(new Map(profiler.map(p => [p.id, p.rolle ?? null]))).current
  const andreProfiler = useRef(profiler.filter(p => p.id !== brukerId && p.navn)).current
  const supabase = useRef(createClient()).current

  const scope = { type: 'albumbilde' as const, bildeId, albumId }
  const konfig = konfigFor(scope)
  const kanalNavn = konfig.kanalNavn(scope)

  const { meldinger, setMeldinger, harMerEldre, henterEldre, lastEldre, hentMeldinger, laster } =
    useChatMeldinger({ scope, initialMeldinger: [], supabase, konfig, kanalNavn, hentInitialtSelv: true })

  const mentionForslag = lagMentionForslag(mentionSøk, andreProfiler, brukerId)

  function velgMention(navn: string) {
    const nyTekst = velgMentionTekst(tekst, navn)
    setTekst(nyTekst)
    setMentionSøk(null)
    inputRef.current?.focus()
  }

  const keyboardOffset = useKeyboardOffset()

  const { reaksjonerPerMelding, toggleReaksjon: toggleReaksjonBase } =
    useChatReaksjoner(meldinger, brukerId, supabase)

  function toggleReaksjon(meldingId: string, emoji: string) {
    setPickerFor(null)
    toggleReaksjonBase(meldingId, emoji)
  }

  // Ingen vedlegg i v1 — bilde_url er alltid null på album_bilde_chat-rader,
  // så denne trigges aldri i praksis. Holdes som no-op fremfor å gjøre
  // setLightboxSrc valgfri i ChatMeldingRads Handlers-kontrakt.
  const setLightboxSrc = useCallback(() => {}, [])

  async function handleSend() {
    const melding = tekst.trim()
    if (!melding || sender) return

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const optimistisk: ChatMelding = {
      id: tempId,
      profil_id: brukerId,
      innhold: melding,
      bilde_url: null,
      video_url: null,
      opprettet: new Date().toISOString(),
    }
    setMeldinger(prev => [...prev, optimistisk])
    setTekst('')
    setMentionSøk(null)
    setSender(true)

    try {
      await sendChatMelding(scope, melding, null)
    } catch (err) {
      console.error('Send feilet:', err)
      setMeldinger(prev => prev.filter(m => m.id !== tempId))
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

  // Rediger er bevisst deaktivert for album-kommentarer: album_bilde_chat har
  // ingen UPDATE-policy i DB (mig. 117, styrets beslutning). Vi sender
  // tillatRediger={false} til ChatMeldingRad så knappen aldri vises, og
  // tilfredsstiller edit-delen av Handlers-kontrakten med no-ops framfor å
  // wire en flyt som uansett ville gitt 42501 + stille revert.
  const ingenEdit = useCallback(() => {}, [])

  async function handleSlett(id: string) {
    if (!confirm('Slette denne kommentaren?')) return
    setMeldinger(prev => prev.filter(m => m.id !== id))
    try {
      await slettChatMelding(scope, id)
    } catch {
      const nyeste = await hentMeldinger()
      setMeldinger(nyeste)
    }
  }

  const radHandlers = {
    setEditTekst: ingenEdit,
    lagreEdit: ingenEdit,
    avbrytEdit: ingenEdit,
    startEdit: ingenEdit,
    startLongPress,
    clearLongPress,
    setPickerFor,
    toggleReaksjon,
    handleSlett,
    setLightboxSrc,
  }

  // Teller i headeren. Under første fetch: SSR-tallet. Når det finnes eldre
  // usynlige sider (>30 kommentarer): meldinger.length undertelller, så vis
  // total-tallet — men Math.max verner mot at initialAntall er utdatert-lavt
  // etter live inserts i samme økt. Ellers speiler .length live add/delete.
  const antall =
    laster && meldinger.length === 0
      ? initialAntall
      : harMerEldre
        ? Math.max(initialAntall, meldinger.length)
        : meldinger.length

  const innhold = (
    <div
      // Stopper touch her — hindrer at et sveip inne i sheeten (f.eks. i
      // meldingslisten) treffer AlbumLightboxens swipe-håndtering og bytter
      // bilde under brukeren.
      onTouchStart={e => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: '42dvh',
        left: 0,
        right: 0,
        bottom: `${keyboardOffset}px`,
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-elevated-solid)',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        boxShadow: 'var(--shadow-popover)',
      }}
    >
      {/* Header */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '0.5px solid var(--border-subtle)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: '1.4px',
            fontWeight: 600,
            textTransform: 'uppercase',
            color: 'var(--text-secondary)',
          }}
        >
          Kommentarer {antall > 0 && `(${antall})`}
        </span>
        <button
          type="button"
          onClick={onLukk}
          aria-label="Lukk kommentarer"
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: 'none',
            background: 'transparent',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <Icon name="x" size={18} color="currentColor" strokeWidth={2} />
        </button>
      </div>

      {/* Meldingsliste */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: '10px 16px 0',
        }}
      >
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

        {laster && meldinger.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '24px 0',
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              color: 'var(--text-tertiary)',
            }}
          >
            Henter kommentarer…
          </div>
        )}

        {!laster && meldinger.length === 0 && (
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
            Ingen kommentarer ennå
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 12 }}>
          {meldinger.map((m, i) => {
            const forrige = i > 0 ? meldinger[i - 1] : null
            const visDatoSkille = !forrige || !erSammeNorskeDag(forrige.opprettet, m.opprettet)
            const erFortsettelse = !visDatoSkille && forrige?.profil_id === m.profil_id
            const erEgen = m.profil_id === brukerId
            // Kun-egen sletting (post-069-mønster, se mig. 117) — ingen
            // admin-bypass. erAdmin-propen brukes bevisst ikke her.
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
                editerer={false}
                editTekst=""
                lagrerEdit={false}
                tillatRediger={false}
                pickerAapen={pickerFor === m.id}
                handlers={radHandlers}
              />
            )
          })}
        </div>
      </div>

      {/* Input-pill */}
      <div
        style={{
          flexShrink: 0,
          padding: '8px 16px calc(8px + env(safe-area-inset-bottom))',
        }}
      >
        <MentionVelger forslag={mentionForslag} onVelg={velgMention} />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 8px 8px 14px',
            border: '0.5px solid var(--border)',
            borderRadius: 999,
            background: 'var(--bg-elevated)',
          }}
        >
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
            placeholder="Skriv en kommentar…"
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
          <button
            type="button"
            onClick={handleSend}
            disabled={!tekst.trim() || sender}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'var(--accent)',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: !tekst.trim() || sender ? 'default' : 'pointer',
              opacity: !tekst.trim() || sender ? 0.4 : 1,
              flexShrink: 0,
            }}
            aria-label="Send kommentar"
          >
            <Icon name="arrowRight" size={14} color="var(--accent-foreground)" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(innhold, document.body)
}
