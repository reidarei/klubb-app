'use client'

import { useEffect, useRef, useState, useTransition, useCallback, type MouseEvent, type KeyboardEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Avatar from '@/components/ui/Avatar'
import Icon from '@/components/ui/Icon'
import Treffflate, { FELT_I_PILLE_STIL, treffflateRundt } from '@/components/ui/Treffflate'
import { sendChatMelding } from '@/lib/actions/chat'
import type { ChatScope } from '@/lib/chat-konfig'
import { formatDistanceToNowStrict } from 'date-fns'
import { nb } from 'date-fns/locale'
import { CHAT_MAKS_LENGDE, LONG_PRESS_MS, LONG_PRESS_BEVEGELSE_PX } from '@/lib/konstanter'
import { naa } from '@/lib/dato'
import {
  beregnMentionSøk,
  velgMentionTekst,
  lagMentionForslag,
  type ChatProfil,
} from '@/lib/mention'
import MentionVelger from '@/components/agenda/MentionVelger'
import { Linkified } from '@/lib/linkify'
import KommentarReaksjoner from '@/components/agenda/KommentarReaksjoner'
import type { ReaksjonGruppe } from '@/lib/reaksjoner'
import { bildeSrc } from '@/lib/bilde-utils'

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
  /** Reaksjoner for denne kommentaren — hentes fra chat_reaksjoner. */
  reaksjoner?: ReaksjonGruppe[]
}

export type KommentarScope =
  | { type: 'arrangement'; id: string }
  | { type: 'poll'; id: string }
  | { type: 'melding'; id: string }

// Send-knappens treffflate vokser inn i gapet mot input-feltet (#700) —
// gapet må minst dekke utvidX, ellers stjeler den fra tekstfeltet.
const KOMMENTAR_SEND_TREFF = treffflateRundt({ hoyde: 24, bredde: 24 })

// Ikke <Treffflate> (rendrer <button>): pila ligger inni kortets ytre <a> (#700/#793).
const KOMMENTAR_EKSPANDER_TREFF = treffflateRundt({ hoyde: 14, bredde: 14 })

/** ID-en til raden med åpen reaksjons-picker (null = lukket). Åpnes via long-press. */
type AktivReaksjonId = string | null

// Kommentarer lengre enn dette avkortes med en ekspander-pil (#793).
const AVKORT_GRENSE = 90

function snippet(tekst: string | null, maks = AVKORT_GRENSE): string {
  if (!tekst) return ''
  const rensket = tekst.replace(/\s+/g, ' ').trim()
  if (rensket.length <= maks) return rensket
  return rensket.slice(0, maks - 1) + '…'
}

export function detaljUrl(scope: KommentarScope): string {
  switch (scope.type) {
    case 'arrangement': return `/arrangementer/${scope.id}`
    case 'poll': return `/poll/${scope.id}`
    case 'melding': return `/meldinger/${scope.id}`
  }
}

/**
 * Én kommentars tekst, avkortet med ekspander-pil (#793). Egen komponent fordi
 * ekspandert-tilstanden er per kommentar (useState i .map() bryter rules of hooks).
 * Null-guard mot tom rad (#281). Alt rendres inni kortets ytre <a>, derfor
 * inneILenke (#465) og <span role="button"> i stedet for <button>.
 */
function KommentarTekst({ tekst }: { tekst: string }) {
  const [utvidet, setUtvidet] = useState(false)
  const rensket = tekst.replace(/\s+/g, ' ').trim()
  if (!rensket) return null
  const langTekst = rensket.length > AVKORT_GRENSE
  // Avkortet er whitespace-kollapset; utvidet beholder originalens linjeskift.
  const visning = utvidet ? tekst.trim() : snippet(tekst)

  function toggle(e: MouseEvent<HTMLSpanElement> | KeyboardEvent<HTMLSpanElement>) {
    e.preventDefault()
    e.stopPropagation()
    setUtvidet(v => !v)
  }

  return (
    <div
      style={{
        fontFamily: 'var(--font-body)',
        fontSize: 13,
        color: 'var(--text-secondary)',
        lineHeight: 1.4,
        whiteSpace: utvidet ? 'pre-wrap' : undefined,
      }}
    >
      <Linkified text={visning} inneILenke />
      {langTekst && (
        // Ytre span: avstand til teksten. Indre: treffflatens negative marginer.
        <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginLeft: 4 }}>
          <span
            role="button"
            tabIndex={0}
            onClick={toggle}
            // Pila skal ikke starte long-press for reaksjoner på raden rundt
            onPointerDown={e => e.stopPropagation()}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') toggle(e)
            }}
            aria-expanded={utvidet}
            aria-label={utvidet ? 'Vis mindre' : 'Vis hele kommentaren'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              color: 'var(--text-tertiary)',
              ...KOMMENTAR_EKSPANDER_TREFF.stil,
            }}
          >
            <Icon name={utvidet ? 'chevronUp' : 'chevronDown'} size={14} strokeWidth={2} />
          </span>
        </span>
      )}
    </div>
  )
}

// Fallback til «📷 Bilde» ved lastefeil så raden ikke blir blank.
function KommentarMiniatyr({ src, href }: { src: string; href: string }) {
  const [feilet, setFeilet] = useState(false)
  const router = useRouter()
  const bilde = bildeSrc(src)

  if (feilet || !bilde) {
    return (
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-secondary)' }}>
        📷 Bilde
      </span>
    )
  }

  // Navigerer selv: seksjonens rot-div svelger klikk (stopp) før de når kort-Link-en.
  // <div role="button">, ikke <button>: <button> i kortets <a> er ugyldig HTML.
  function naviger(e: MouseEvent | KeyboardEvent) {
    e.stopPropagation()
    router.push(href)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Åpne innlegget"
      onClick={naviger}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); naviger(e) }
      }}
      style={{ display: 'block', marginTop: 4 }}
    >
      <div style={{ position: 'relative', width: 'min(140px, 100%)', height: 105, borderRadius: 8, overflow: 'hidden', background: 'var(--bg-elevated)' }}>
        <Image src={bilde} alt="" fill sizes="140px" style={{ objectFit: 'cover' }} onError={() => setFeilet(true)} />
      </div>
    </div>
  )
}

function relativTid(iso: string): string {
  return formatDistanceToNowStrict(new Date(iso), { locale: nb, addSuffix: true })
}

/**
 * Delt stil for de to header-variantene (chevron-toggle og navigerende label) —
 * de skal se identiske ut; to kopier driftet fra hverandre (#648).
 */
const HEADER_STIL = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  color: 'var(--text-tertiary)',
  letterSpacing: '1.4px',
  textTransform: 'uppercase',
  fontWeight: 600,
  // 15 px over/under tekstlinjen (~15 px) gir ≥ 44 px treffflate; -7 px margin holder
  // layout-fotavtrykket på det gamle (31 px). Stables over naboene som ellers stjeler overlappen (#700).
  padding: '15px 10px',
  margin: '-7px -10px',
  position: 'relative',
  zIndex: 1,
} as const

/**
 * Kollapsbar kommentar-seksjon på agendakort: opp til 3 siste kommentarer +
 * inline input. Alle klikk/tastetrykk må stoppe propagasjon, ellers navigerer
 * kortets ytre Link til detaljsiden.
 */
export default function KommentarerPaaKort({
  kommentarer,
  scope,
  startKollapset = false,
  totaltAntall,
  profiler = [],
  brukerId,
  brukerNavn,
  brukerBildeUrl,
  brukerRolle,
  tommel,
}: {
  kommentarer: KommentarKortData[]
  scope: KommentarScope
  startKollapset?: boolean
  /** Totalt antall kommentarer (for korrekt overskrift når listen er begrenset til 3). */
  totaltAntall?: number
  /** For @mention-forslag. `@alle` er alltid tilgjengelig uten profil-data. */
  profiler?: ChatProfil[]
  /** Ekskluderes fra mention-forslag. */
  brukerId?: string
  /** Trengs for å rendre optimistisk rad; utelatt = ingen optimistisk fase (#316). */
  brukerNavn?: string
  /** For avatar på optimistisk rad (#316). */
  brukerBildeUrl?: string | null
  /** For gul glød på optimistisk rad (#316). */
  brukerRolle?: string | null
  /** Tommel opp-knapp til venstre for input-pillen. Kun fra MeldingKort — andre
   * kort har ingen kort-nivå-reaksjoner. Komponenten er ren layout-vert (#468). */
  tommel?: ReactNode
}) {
  const visTall = totaltAntall ?? kommentarer.length
  const [apen, setApen] = useState(!startKollapset)
  const [tekst, setTekst] = useState('')
  const [mentionSøk, setMentionSøk] = useState<string | null>(null)
  const [optimistiske, setOptimistiske] = useState<KommentarKortData[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const [sender, startTransition] = useTransition()
  const router = useRouter()

  const [aktivReaksjonId, setAktivReaksjonId] = useState<AktivReaksjonId>(null)
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Startpunkt, for å avbryte long-press ved scroll-bevegelse.
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null)
  // Raden under aktivt trykk — gir visuell feedback før LONG_PRESS_MS er nådd.
  const [pressetId, setPressetId] = useState<string | null>(null)

  // Trykk utenfor raden lukker pickeren — ellers fantes ingen vei ut på mobil (#793).
  useEffect(() => {
    if (aktivReaksjonId === null) return
    const lukkVedTrykkUtenfor = (e: PointerEvent) => {
      const rad = (e.target as Element | null)?.closest?.('[data-kommentar-rad]')
      if (rad?.getAttribute('data-kommentar-rad') !== aktivReaksjonId) setAktivReaksjonId(null)
    }
    document.addEventListener('pointerdown', lukkVedTrykkUtenfor)
    return () => document.removeEventListener('pointerdown', lukkVedTrykkUtenfor)
  }, [aktivReaksjonId])

  const mentionForslag = lagMentionForslag(mentionSøk, profiler, brukerId)

  // En optimistisk rad skygges av server-raden med samme avsender-navn + innhold
  // (ikke id — temp-id og server-id er ulike). Da kan dobbel-rad ikke oppstå
  // uansett batching-timing. Navnet er eneste avsender-id KommentarKortData har (#316).
  const serverNokler = new Set(
    kommentarer.map(k => `${k.avsender.navn} ${k.innhold ?? ''}`),
  )
  const usynkroniserte = optimistiske.filter(
    o => !serverNokler.has(`${o.avsender.navn} ${o.innhold ?? ''}`),
  )
  // Siste 3 som serveren (kronologisk, nyeste sist): en optimistisk rad skyver
  // den eldste ut i stedet for å bli en fjerde (#316).
  const visteKommentarer = [...kommentarer, ...usynkroniserte].slice(-3)

  // Begge avledet fra visteKommentarer, ikke visTall/apen: telleren kan vise
  // kommentarer som ikke er med i agenda-uttaket, og da finnes ingen liste (#648).
  const kanEkspandere = visteKommentarer.length > 0
  const utvidet = apen && kanEkspandere

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

  const startLongPress = useCallback((kommentarId: string) => (e: React.PointerEvent) => {
    e.stopPropagation()
    longPressStartRef.current = { x: e.clientX, y: e.clientY }
    setPressetId(kommentarId)
    longPressRef.current = setTimeout(() => {
      setAktivReaksjonId(kommentarId)
    }, LONG_PRESS_MS)
  }, [])

  // Bevegelse over terskelen er scroll-intensjon, ikke long-press.
  const sjekkBevegelse = useCallback((e: React.PointerEvent) => {
    const start = longPressStartRef.current
    if (!start || longPressRef.current === null) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (dx * dx + dy * dy > LONG_PRESS_BEVEGELSE_PX ** 2) {
      clearTimeout(longPressRef.current)
      longPressRef.current = null
      longPressStartRef.current = null
      setPressetId(null)
    }
  }, [])

  const avbrytLongPress = useCallback(() => {
    if (longPressRef.current !== null) {
      clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
    longPressStartRef.current = null
    setPressetId(null)
  }, [])

  function handleSend(e?: MouseEvent<HTMLButtonElement> | KeyboardEvent<HTMLInputElement>) {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    const melding = tekst.trim()
    if (!melding || sender) return
    setTekst('')
    setMentionSøk(null)

    const chatScope: ChatScope =
      scope.type === 'arrangement'
        ? { type: 'arrangement', arrangementId: scope.id }
        : scope.type === 'poll'
          ? { type: 'poll', pollId: scope.id }
          : { type: 'melding', meldingId: scope.id }

    // «temp-»-prefikset markerer ubekreftet rad, som i Chat.tsx (#316).
    const tempId = `temp-${crypto.randomUUID()}`

    // Uten brukerdata (f.eks. «Tidligere», der props ikke sendes) hoppes den
    // optimistiske fasen over, og vi venter på server-refresh (#316).
    if (brukerNavn) {
      setOptimistiske(o => [
        ...o,
        {
          id: tempId,
          innhold: melding,
          bilde_url: null,
          opprettet: naa(),
          avsender: {
            navn: brukerNavn,
            bilde_url: brukerBildeUrl ?? null,
            rolle: brukerRolle ?? null,
          },
        },
      ])
    }

    startTransition(async () => {
      try {
        await sendChatMelding(chatScope, melding, null)
        await router.refresh()
        // Dedupen i render skjuler allerede raden; dette rydder state så lista
        // ikke vokser, og fanger rader som aldri fikk server-match (#316).
        setOptimistiske(o => o.filter(r => r.id !== tempId))
      } catch {
        setOptimistiske(o => o.filter(r => r.id !== tempId))
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
      {/* Agenda-queryen henter bare de 30 globalt nyeste kommentarene (innen
          cutoff), så et kort kan ha teller uten noe å vise. Da blir headeren en
          navigerende label i stedet for en chevron som toggler tomt (#648). */}
      {visTall > 0 && (kanEkspandere ? (
        <span
          role="button"
          tabIndex={0}
          onClick={toggle}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') toggle(e)
          }}
          aria-expanded={apen}
          style={HEADER_STIL}
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
          {apen && visTall > visteKommentarer.length
            ? `Siste ${visteKommentarer.length} av ${visTall} kommentarer`
            : `${visTall} ${visTall === 1 ? 'kommentar' : 'kommentarer'}`}
        </span>
      ) : (
        <span
          role="button"
          tabIndex={0}
          onClick={e => { e.preventDefault(); e.stopPropagation(); router.push(detaljUrl(scope)) }}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              e.stopPropagation()
              router.push(detaljUrl(scope))
            }
          }}
          // aria-label overstyrer tekstinnholdet, så antallet må med i labelen.
          aria-label={`${visTall} ${visTall === 1 ? 'kommentar' : 'kommentarer'} — åpne for å lese`}
          style={HEADER_STIL}
        >
          {`${visTall} ${visTall === 1 ? 'kommentar' : 'kommentarer'}`}
        </span>
      ))}

      {/* Kommentar-liste (inkl. optimistiske rader, maks 3) */}
      {utvidet && (
        <div
          style={{
            marginTop: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {visteKommentarer.map(k => {
            const erTempRad = k.id.startsWith('temp-')
            // Temp-rader har ingen server-ID å reagere på.
            const pickerApen = !erTempRad && aktivReaksjonId === k.id
            return (
              <div
                key={k.id}
                // Leses av «trykk utenfor lukker»-lytteren.
                data-kommentar-rad={k.id}
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'flex-start',
                  transform: pressetId === k.id ? 'scale(0.98)' : 'scale(1)',
                  opacity: pressetId === k.id ? 0.85 : 1,
                  transition: 'transform 120ms ease-out, opacity 120ms ease-out',
                  // Ellers stjeler tekstmarkering og iOS-callout gesten (#359).
                  userSelect: pressetId === k.id ? 'none' : undefined,
                  WebkitUserSelect: pressetId === k.id ? 'none' : undefined,
                  WebkitTouchCallout: pressetId === k.id ? 'none' : undefined,
                }}
                onPointerDown={!erTempRad ? startLongPress(k.id) : undefined}
                onPointerMove={sjekkBevegelse}
                onPointerUp={avbrytLongPress}
                onPointerCancel={avbrytLongPress}
                onContextMenu={e => {
                  if (pressetId === k.id) e.preventDefault()
                }}
              >
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
                    {/* Relativ tid kan krysse en minuttgrense mellom SSR og hydrering
                        → React #418 (#466). suppressHydrationWarning er mekanismen for tidsstempler. */}
                    <span
                      suppressHydrationWarning
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
                  {/* Ingen tom div ved ren-bilde-kommentarer (#281/#350). */}
                  {k.innhold && <KommentarTekst tekst={k.innhold} />}
                  {/* Miniatyr i tillegg til tekst når begge finnes. */}
                  {k.bilde_url && (
                    <KommentarMiniatyr src={k.bilde_url} href={detaljUrl(scope)} />
                  )}
                  {/* Badges alltid synlige, + kun ved long-press. Returnerer null
                      ved tomme reaksjoner og lukket picker. */}
                  {brukerId && !erTempRad && (
                    <KommentarReaksjoner
                      meldingId={k.id}
                      brukerId={brukerId}
                      reaksjoner={k.reaksjoner ?? []}
                      pickerApen={pickerApen}
                      lukkPicker={() => setAktivReaksjonId(null)}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* IKKE på `apen` alene: uten chevron å toggle med står apen på true, og
          feltet ville vist for et kort man ikke kan lese kommentarene til (#648). */}
      {(utvidet || visTall === 0) && (
        <div style={{ marginTop: kommentarer.length > 0 ? 10 : 0 }} onClick={stopp}>
        {/* Over hele raden (tommel + pille) så chips ikke krysser den runde rammen. */}
        <MentionVelger forslag={mentionForslag} onVelg={velgMention} />
        {/* Tommel (kun fra MeldingKort) + input-pille i samme rad (#468). */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {tommel}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: Math.max(8, KOMMENTAR_SEND_TREFF.utvidX),
            padding: '6px 6px 6px 12px',
            border: '0.5px solid var(--border)',
            borderRadius: 999,
            background: 'var(--bg-elevated)',
            flex: 1,
            minWidth: 0,
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
              ...FELT_I_PILLE_STIL,
            }}
          />
          <Treffflate
            synlig={24}
            onClick={handleSend}
            disabled={!tekst.trim() || sender}
            aria-label="Send kommentar"
            style={{
              flexShrink: 0,
              opacity: !tekst.trim() || sender ? 0.4 : 1,
            }}
          >
            <span
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="arrowRight" size={12} color="var(--accent-foreground)" strokeWidth={2.5} />
            </span>
          </Treffflate>
        </div>
        </div>
        </div>
      )}
    </div>
  )
}
