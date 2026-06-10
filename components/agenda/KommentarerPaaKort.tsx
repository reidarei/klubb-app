'use client'

import { useRef, useState, useTransition, type MouseEvent, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import Avatar from '@/components/ui/Avatar'
import Icon from '@/components/ui/Icon'
import { sendChatMelding } from '@/lib/actions/chat'
import type { ChatScope } from '@/lib/chat-konfig'
import { formatDistanceToNowStrict } from 'date-fns'
import { nb } from 'date-fns/locale'
import { CHAT_MAKS_LENGDE } from '@/lib/konstanter'
import {
  beregnMentionSøk,
  velgMentionTekst,
  lagMentionForslag,
  type ChatProfil,
} from '@/lib/mention'
import MentionVelger from '@/components/agenda/MentionVelger'

export type KommentarKortData = {
  id: string
  innhold: string | null
  bilde_url?: string | null
  opprettet: string
  avsender: {
    navn: string
    bilde_url: string | null
    rolle: string | null
  }
}

export type KommentarScope =
  | { type: 'arrangement'; id: string }
  | { type: 'poll'; id: string }
  | { type: 'melding'; id: string }

function snippet(tekst: string | null, maks = 90): string {
  if (!tekst) return ''
  const rensket = tekst.replace(/\s+/g, ' ').trim()
  if (rensket.length <= maks) return rensket
  return rensket.slice(0, maks - 1) + '…'
}

// Brukes når en kommentar kun har bilde og ingen tekst — uten dette ble raden
// helt blank, og før null-guarden i snippet krasjet hele forsiden. Se #281.
function visningstekst(k: { innhold: string | null; bilde_url?: string | null }): string {
  const tekst = snippet(k.innhold)
  if (tekst) return tekst
  if (k.bilde_url) return '📷 Bilde'
  return ''
}

function relativTid(iso: string): string {
  return formatDistanceToNowStrict(new Date(iso), { locale: nb, addSuffix: true })
}

/**
 * Kollapsbar kommentar-seksjon på arrangement- og pollkort. Viser opp til 3
 * siste kommentarer og har et inline input-felt under dem for å legge til
 * ny kommentar uten å navigere bort fra agenda.
 *
 * Alle klikk og tastatur-hendelser må stoppe propagasjon — ellers trigger
 * den ytre Link-wrapperen navigering til detaljsiden. Default ekspandert.
 */
export default function KommentarerPaaKort({
  kommentarer,
  scope,
  startKollapset = false,
  totaltAntall,
  profiler = [],
  brukerId,
}: {
  kommentarer: KommentarKortData[]
  scope: KommentarScope
  startKollapset?: boolean
  /** Totalt antall kommentarer (for korrekt overskrift når listen er begrenset til 3). */
  totaltAntall?: number
  /** Aktive profiler — brukes til @mention-forslag på navn. `@alle` er alltid tilgjengelig uansett, siden den ikke krever profil-data. */
  profiler?: ChatProfil[]
  /** Innlogget brukers id — ekskluderes fra mention-forslag (han nevner ikke seg selv). */
  brukerId?: string
}) {
  const visTall = totaltAntall ?? kommentarer.length
  const [apen, setApen] = useState(!startKollapset)
  const [tekst, setTekst] = useState('')
  const [mentionSøk, setMentionSøk] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [sender, startTransition] = useTransition()
  const router = useRouter()

  const mentionForslag = lagMentionForslag(mentionSøk, profiler, brukerId)

  function velgMention(navn: string) {
    const ny = velgMentionTekst(tekst, navn)
    setTekst(ny)
    setMentionSøk(null)
    inputRef.current?.focus()
  }

  function toggle(e: MouseEvent<HTMLSpanElement> | KeyboardEvent<HTMLSpanElement>) {
    e.preventDefault()
    e.stopPropagation()
    setApen(v => !v)
  }

  function stopp(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

  function handleSend(e?: MouseEvent<HTMLButtonElement> | KeyboardEvent<HTMLInputElement>) {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    const melding = tekst.trim()
    if (!melding || sender) return
    setTekst('')
    setMentionSøk(null)

    // Map fra det lokale KommentarScope til CHAT_KONFIG-scopet.
    const chatScope: ChatScope =
      scope.type === 'arrangement'
        ? { type: 'arrangement', arrangementId: scope.id }
        : scope.type === 'poll'
          ? { type: 'poll', pollId: scope.id }
          : { type: 'melding', meldingId: scope.id }

    startTransition(async () => {
      try {
        await sendChatMelding(chatScope, melding, null)
        router.refresh()
      } catch {
        // Gjenopprett tekst ved feil så brukeren ikke mister det de skrev
        setTekst(melding)
      }
    })
  }

  return (
    <div
      style={{
        borderTop: '0.5px solid var(--border-subtle)',
        padding: '10px 14px 12px 16px',
      }}
      onClick={stopp}
    >
      {/* Toggle-header vises hvis det finnes kommentarer totalt — også når
          listen er tom fordi alle ligger utenfor topp-30-uttaket men innenfor
          24-mnd-totalvinduet. */}
      {visTall > 0 && (
        <span
          role="button"
          tabIndex={0}
          onClick={toggle}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') toggle(e)
          }}
          aria-expanded={apen}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-tertiary)',
            letterSpacing: '1.4px',
            textTransform: 'uppercase',
            fontWeight: 600,
            cursor: 'pointer',
            padding: '2px 0',
          }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform: apen ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 160ms ease-out',
            }}
            aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
          {apen && kommentarer.length > 0 && visTall > kommentarer.length
            ? `Siste ${kommentarer.length} av ${visTall} kommentarer`
            : `${visTall} ${visTall === 1 ? 'kommentar' : 'kommentarer'}`}
        </span>
      )}

      {/* Kommentar-liste — kun synlig når ekspandert */}
      {apen && kommentarer.length > 0 && (
        <div
          style={{
            marginTop: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {kommentarer.map(k => (
            <div key={k.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Avatar
                name={k.avsender.navn}
                size={18}
                src={k.avsender.bilde_url}
                rolle={k.avsender.rolle}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 6,
                    marginBottom: 1,
                    flexWrap: 'wrap',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 11,
                      color: 'var(--text-primary)',
                      fontWeight: 600,
                    }}
                  >
                    {k.avsender.navn}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      color: 'var(--text-tertiary)',
                      letterSpacing: '1px',
                      textTransform: 'uppercase',
                    }}
                  >
                    {relativTid(k.opprettet)}
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 13,
                    color: 'var(--text-secondary)',
                    lineHeight: 1.4,
                  }}
                >
                  {visningstekst(k)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Inline kommentar-input — alltid synlig når seksjonen er åpen (eller
          når det ikke er kommentarer ennå) */}
      {(apen || kommentarer.length === 0) && (
        <div style={{ marginTop: kommentarer.length > 0 ? 10 : 0 }} onClick={stopp}>
        {/* Mention-velger ligger over selve input-pillen så chips ikke krysser
            den runde rammen. Komponenten returnerer null når det ikke er
            forslag, så ingen tom margin. */}
        <MentionVelger forslag={mentionForslag} onVelg={velgMention} />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 6px 6px 12px',
            border: '0.5px solid var(--border)',
            borderRadius: 999,
            background: 'var(--bg-elevated)',
          }}
          onClick={stopp}
        >
          <input
            ref={inputRef}
            type="text"
            value={tekst}
            onChange={e => {
              setTekst(e.target.value)
              setMentionSøk(beregnMentionSøk(e.target.value))
            }}
            onClick={stopp}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                handleSend(e)
              }
            }}
            placeholder="Skriv en kommentar…"
            maxLength={CHAT_MAKS_LENGDE}
            enterKeyHint="send"
            autoComplete="off"
            disabled={sender}
            style={{
              flex: 1,
              minWidth: 0,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-body)',
              fontSize: 12,
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!tekst.trim() || sender}
            aria-label="Send kommentar"
            style={{
              width: 24,
              height: 24,
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
          >
            <Icon name="arrowRight" size={12} color="#0a0a0a" strokeWidth={2.5} />
          </button>
        </div>
        </div>
      )}
    </div>
  )
}
