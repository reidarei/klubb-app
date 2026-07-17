'use client'

import Avatar from '@/components/ui/Avatar'
import Icon from '@/components/ui/Icon'
import MessengerBadge from '@/components/ui/MessengerBadge'
import { formaterDatoSkille } from '@/lib/dato'
import { REAKSJON_EMOJIS } from '@/lib/konstanter'
import { LinkifiedMedMentions } from './LinkifiedMedMentions'
import type { ChatMelding } from './Chat'
import type { Reaksjon } from './hooks/useChatReaksjoner'

// Callbacks fra Chat.tsx samlet i ett objekt for lesbarhet. All state-eierskap
// (edit, picker, lightbox, optimistiske meldingsoppdateringer) blir i Chat —
// denne komponenten er ren visning av én melding.
type Handlers = {
  setEditTekst: (tekst: string) => void
  lagreEdit: (id: string) => void
  avbrytEdit: () => void
  startEdit: (id: string, naavarende: string) => void
  startLongPress: (id: string) => void
  clearLongPress: () => void
  setPickerFor: (id: string | null) => void
  toggleReaksjon: (id: string, emoji: string) => void
  handleSlett: (id: string) => void
  setLightboxSrc: (src: string | null) => void
}

type Props = {
  melding: ChatMelding
  /** Dato-skille over meldingen — første melding eller ny kalenderdag. Beregnes i Chats map (leser forrige melding). */
  visDatoSkille: boolean
  /** Fortsettelses-melding fra samme bruker — skjuler avatar og navn/tid-header. */
  erFortsettelse: boolean
  /** Første melding i listen — styrer marginTop. */
  erFoerste: boolean
  erEgen: boolean
  kanSlette: boolean
  navn: string
  bilde: string | null | undefined
  rolle: string | null
  /** Ferdig formatert HH:mm. */
  tid: string
  brukerId: string
  charLimit: number
  /** Reaksjoner for akkurat denne meldingen (fra reaksjonerPerMelding-mapet). */
  reaksjoner: Reaksjon[] | undefined
  /** True når denne meldingen er i edit-modus. */
  editerer: boolean
  editTekst: string
  lagrerEdit: boolean
  /** True når emoji-pickeren vises for denne meldingen. */
  pickerAapen: boolean
  handlers: Handlers
}

export default function ChatMeldingRad({
  melding: m,
  visDatoSkille,
  erFortsettelse,
  erFoerste,
  erEgen,
  kanSlette,
  navn,
  bilde,
  rolle,
  tid,
  brukerId,
  charLimit,
  reaksjoner,
  editerer,
  editTekst,
  lagrerEdit,
  pickerAapen,
  handlers,
}: Props) {
  return (
    <>
      {visDatoSkille && (
        <div
          role="separator"
          aria-label={`Meldinger fra ${formaterDatoSkille(m.opprettet)}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 8,
            margin: '10px 0 2px',
            paddingRight: 2,
          }}
        >
          <span aria-hidden="true" style={{ width: 24, height: '0.5px', background: 'var(--border-subtle)' }} />
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              letterSpacing: '1.2px',
              fontWeight: 600,
              color: 'var(--text-tertiary)',
            }}
          >
            {formaterDatoSkille(m.opprettet)}
          </span>
        </div>
      )}
    <div
      style={{
        display: 'flex',
        gap: 10,
        flexDirection: erEgen ? 'row-reverse' : 'row',
        marginTop: erFortsettelse ? 2 : erFoerste ? 0 : 8,
      }}
    >
      <div style={{ flexShrink: 0, alignSelf: 'flex-end' }}>
        {erFortsettelse ? (
          // Tom plassholder så meldingene linjerer opp mot forrige boble
          <div style={{ width: 26, height: 1 }} />
        ) : (
          <Avatar name={navn} size={26} src={bilde} rolle={rolle} />
        )}
      </div>
      <div
        style={{
          maxWidth: '78%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: erEgen ? 'flex-end' : 'flex-start',
          minWidth: 0,
        }}
      >
        {!erFortsettelse && (
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 8,
              marginBottom: 2,
              paddingLeft: erEgen ? 0 : 2,
              paddingRight: erEgen ? 2 : 0,
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                color: 'var(--text-secondary)',
                fontWeight: 500,
              }}
            >
              {navn}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: 'var(--text-tertiary)',
                letterSpacing: '1.2px',
              }}
            >
              {tid}
            </span>
          </div>
        )}
        <div style={{ position: 'relative' }} className="chat-boble">
          {editerer ? (
            <div
              style={{
                padding: '8px 10px',
                borderRadius: erEgen ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                background: erEgen ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                border: '0.5px solid var(--accent)',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                minWidth: 220,
              }}
            >
              <textarea
                autoFocus
                value={editTekst}
                onChange={e => handlers.setEditTekst(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handlers.lagreEdit(m.id)
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    handlers.avbrytEdit()
                  }
                }}
                maxLength={charLimit}
                rows={2}
                style={{
                  width: '100%',
                  resize: 'none',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 13,
                  lineHeight: 1.5,
                  padding: '2px 4px',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  gap: 6,
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                }}
              >
                <button
                  type="button"
                  onClick={handlers.avbrytEdit}
                  disabled={lagrerEdit}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 999,
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    letterSpacing: '1.4px',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                    cursor: lagrerEdit ? 'wait' : 'pointer',
                  }}
                >
                  Avbryt
                </button>
                <button
                  type="button"
                  onClick={() => handlers.lagreEdit(m.id)}
                  disabled={lagrerEdit || !editTekst.trim()}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 999,
                    background: 'var(--accent)',
                    border: 'none',
                    color: 'var(--accent-foreground)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    letterSpacing: '1.4px',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                    cursor:
                      lagrerEdit || !editTekst.trim() ? 'default' : 'pointer',
                    opacity: lagrerEdit || !editTekst.trim() ? 0.5 : 1,
                  }}
                >
                  {lagrerEdit ? 'Lagrer…' : 'Lagre'}
                </button>
              </div>
            </div>
          ) : (
          <div
            onTouchStart={() => handlers.startLongPress(m.id)}
            onTouchEnd={handlers.clearLongPress}
            onTouchMove={handlers.clearLongPress}
            onTouchCancel={handlers.clearLongPress}
            onContextMenu={e => {
              // Hindrer iOS sin native callout (kopier/del) og
              // fungerer som desktop-høyreklikk-trigger.
              e.preventDefault()
              if (!m.id.startsWith('temp-')) handlers.setPickerFor(m.id)
            }}
            style={{
              padding: '7px 12px',
              borderRadius: erEgen ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
              background: erEgen ? 'var(--accent-soft)' : 'var(--bg-elevated)',
              border: `0.5px solid ${
                erEgen ? 'var(--border-strong)' : 'var(--border-subtle)'
              }`,
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              lineHeight: 1.5,
              color: 'var(--text-primary)',
              letterSpacing: '0.1px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              cursor: 'default',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              WebkitTouchCallout: 'none',
              touchAction: 'manipulation',
            }}
          >
            {m.bilde_url && (
              <button
                type="button"
                onClick={() => handlers.setLightboxSrc(m.bilde_url)}
                style={{
                  display: 'block',
                  padding: 0,
                  border: 'none',
                  background: 'none',
                  margin: m.innhold ? '0 0 8px' : 0,
                  cursor: 'zoom-in',
                  maxWidth: '100%',
                }}
                aria-label="Vis bilde i full skjerm"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.bilde_url}
                  alt=""
                  loading="lazy"
                  style={{
                    display: 'block',
                    maxWidth: 280,
                    maxHeight: 280,
                    borderRadius: 8,
                    objectFit: 'cover',
                  }}
                />
              </button>
            )}
            {m.video_url && (
              <video
                src={m.video_url}
                controls
                preload="metadata"
                playsInline
                style={{
                  display: 'block',
                  maxWidth: 280,
                  height: 'auto',
                  maxHeight: 280,
                  borderRadius: 8,
                  marginBottom: m.innhold ? 8 : 0,
                }}
              />
            )}
            {/* LinkifiedMedMentions wrapper splittPaaUrler og legger
                på mention-styling. Bevarer fet/accent-farge på @navn
                samtidig som URLer blir klikkbare. se #350 */}
            {m.innhold && <LinkifiedMedMentions text={m.innhold} />}
          </div>
          )}
          {m.fra_facebook && <MessengerBadge erEgen={erEgen} />}
          {/* Reaksjons-chips — flyter på bunnkanten av bobla, ikke
              egen linje. Negativ margin trekker dem opp slik at de
              overlapper bobla, padding holder dem litt inn fra
              kanten. Bottom-margin på .chat-boble (under) gir plass
              til at de stikker ut. */}
          {(() => {
            const mineReaksjoner = reaksjoner
            if (!mineReaksjoner || mineReaksjoner.length === 0) return null
            const grupper = new Map<string, { antall: number; minReaksjon: boolean }>()
            for (const r of mineReaksjoner) {
              const g = grupper.get(r.emoji) ?? { antall: 0, minReaksjon: false }
              g.antall += 1
              if (r.profil_id === brukerId) g.minReaksjon = true
              grupper.set(r.emoji, g)
            }
            return (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 2,
                  marginTop: -10,
                  paddingLeft: erEgen ? 0 : 8,
                  paddingRight: erEgen ? 8 : 0,
                  position: 'relative',
                  zIndex: 1,
                  justifyContent: erEgen ? 'flex-end' : 'flex-start',
                }}
              >
                {[...grupper.entries()].map(([emoji, { antall, minReaksjon }]) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handlers.toggleReaksjon(m.id, emoji)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      padding: '1px 6px',
                      borderRadius: 999,
                      border: `0.5px solid ${minReaksjon ? 'var(--accent)' : 'var(--border)'}`,
                      background: 'var(--bg-elevated-2)',
                      // marginalt mindre offset i original — akseptert konsolidering
                      boxShadow: 'var(--shadow-floating)',
                      fontSize: 11,
                      lineHeight: 1.2,
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-body)',
                    }}
                    aria-label={`${emoji} ${antall} ${minReaksjon ? '(fjern din reaksjon)' : '(reager også)'}`}
                  >
                    <span>{emoji}</span>
                    {antall > 1 && (
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 9,
                          color: minReaksjon ? 'var(--accent)' : 'var(--text-secondary)',
                          fontWeight: 600,
                        }}
                      >
                        {antall}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )
          })()}
          {/* Picker — vises over bobla når long-press trigger.
              Bevisst ikke ReaksjonPicker (#471): side-forankring etter
              erEgen, klikk-fanger-overlay og innebygd Rediger-knapp ville
              krevd for mange props. */}
          {pickerAapen && (
            <>
              {/* Overlay som fanger klikk utenfor */}
              <div
                onClick={() => handlers.setPickerFor(null)}
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 90,
                  background: 'transparent',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 6px)',
                  [erEgen ? 'right' : 'left']: 0,
                  zIndex: 100,
                  display: 'flex',
                  gap: 4,
                  padding: '6px 8px',
                  borderRadius: 999,
                  background: 'var(--bg-elevated)',
                  border: '0.5px solid var(--border-strong)',
                  boxShadow: 'var(--shadow-popover)',
                }}
              >
                {REAKSJON_EMOJIS.map(emoji => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handlers.toggleReaksjon(m.id, emoji)}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      border: 'none',
                      background: 'transparent',
                      fontSize: 20,
                      cursor: 'pointer',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    aria-label={`Reager med ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
                {erEgen && m.innhold !== null && (
                  <>
                    <div
                      style={{
                        width: '0.5px',
                        background: 'var(--border-subtle)',
                        margin: '4px 4px',
                      }}
                      aria-hidden="true"
                    />
                    <button
                      type="button"
                      onClick={() => handlers.startEdit(m.id, m.innhold!)}
                      style={{
                        height: 34,
                        borderRadius: 999,
                        border: 'none',
                        background: 'transparent',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9,
                        color: 'var(--text-secondary)',
                        letterSpacing: '1.4px',
                        textTransform: 'uppercase',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: '0 12px',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      aria-label="Rediger melding"
                    >
                      Rediger
                    </button>
                  </>
                )}
              </div>
            </>
          )}
          {kanSlette && !m.id.startsWith('temp-') && (
            <button
              type="button"
              onClick={() => handlers.handleSlett(m.id)}
              className="chat-slett-knapp"
              style={{
                position: 'absolute',
                top: -6,
                [erEgen ? 'left' : 'right']: -6,
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: 'var(--bg-elevated)',
                border: '0.5px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                padding: 0,
                color: 'var(--danger)',
                opacity: 0,
                transition: 'opacity 120ms',
              }}
              aria-label="Slett melding"
            >
              <Icon name="x" size={10} color="var(--danger)" strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
    </div>
    </>
  )
}
