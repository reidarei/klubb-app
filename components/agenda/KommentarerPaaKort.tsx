'use client'

import { useRef, useState, useTransition, useCallback, type MouseEvent, type KeyboardEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Avatar from '@/components/ui/Avatar'
import Icon from '@/components/ui/Icon'
import { sendChatMelding } from '@/lib/actions/chat'
import type { ChatScope } from '@/lib/chat-konfig'
import { formatDistanceToNowStrict } from 'date-fns'
import { nb } from 'date-fns/locale'
import { CHAT_MAKS_LENGDE } from '@/lib/konstanter'
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

/**
 * Brukes i kommentarradene for å styre + knapp-synlighet.
 * Holder ID-en til raden der picker er åpen (null = lukket).
 * Åpnes via hover (desktop) eller long-press (mobil).
 */
type AktivReaksjonId = string | null

function snippet(tekst: string | null, maks = 90): string {
  if (!tekst) return ''
  const rensket = tekst.replace(/\s+/g, ' ').trim()
  if (rensket.length <= maks) return rensket
  return rensket.slice(0, maks - 1) + '…'
}

// Ren URL-hjelper for navigasjon til detaljsiden. Uttømmende switch over
// KommentarScope (tre varianter) — TS kontrollerer at alle scope-grenene er dekket.
export function detaljUrl(scope: KommentarScope): string {
  switch (scope.type) {
    case 'arrangement': return `/arrangementer/${scope.id}`
    case 'poll': return `/poll/${scope.id}`
    case 'melding': return `/meldinger/${scope.id}`
  }
}

// Returnerer kun tekst-noden — bilde-miniatyr håndteres separat i raden av
// KommentarMiniatyr. Beholder null-guard mot tom rad (se #281) og snippet-
// avkorting av URL-treff (se #350). inneILenke: kommentarene rendres inni
// kortets ytre <a>, så ekte lenker ville nøstet <a>-i-<a> (#465).
function visningsInnhold(k: { innhold: string | null }): ReactNode {
  const tekst = snippet(k.innhold)
  if (tekst) return <Linkified text={tekst} inneILenke />
  return null
}

// Subkomponent for bilde-miniatyr i kommentar-raden. Rendres kun når
// kommentaren har bilde_url — fallback til tekstlig «📷 Bilde» ved lastefeil
// slik at raden ikke blir blank. Tap navigerer til detaljsiden.
function KommentarMiniatyr({ src, href }: { src: string; href: string }) {
  const [feilet, setFeilet] = useState(false)
  const router = useRouter()

  if (feilet) {
    return (
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-secondary)' }}>
        📷 Bilde
      </span>
    )
  }

  // Navigasjon skjer via eksplisitt router.push, ikke via en ytre <a>: hele
  // kommentar-seksjonens rot-div har onClick={stopp} (stopPropagation) som svelger
  // klikk før de når kort-Link-en, så miniatyren må navigere selv. Bruker
  // <div role="button"> — ikke <button> — fordi miniatyren rendres inne i kortets
  // ytre <a>, og <button> i <a> er ugyldig HTML (React 19 hydration-advarsel).
  // Samme mønster som toggle-headeren under (<span role="button" tabIndex={0}>).
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
      style={{ cursor: 'pointer', display: 'block', marginTop: 4 }}
    >
      <div style={{ position: 'relative', width: 'min(140px, 100%)', height: 105, borderRadius: 8, overflow: 'hidden', background: 'var(--bg-elevated)' }}>
        <Image src={src} alt="" fill sizes="140px" style={{ objectFit: 'cover' }} onError={() => setFeilet(true)} />
      </div>
    </div>
  )
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
  brukerNavn,
  brukerBildeUrl,
  brukerRolle,
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
  /** Innlogget brukers navn — trengs for å rendre optimistisk kommentar-rad. se #316 */
  brukerNavn?: string
  /** Innlogget brukers bilde_url — trengs for optimistisk rad-avatar. se #316 */
  brukerBildeUrl?: string | null
  /** Innlogget brukers rolle — trengs for gul glød på optimistisk rad. se #316 */
  brukerRolle?: string | null
}) {
  const visTall = totaltAntall ?? kommentarer.length
  const [apen, setApen] = useState(!startKollapset)
  const [tekst, setTekst] = useState('')
  const [mentionSøk, setMentionSøk] = useState<string | null>(null)
  // Optimistiske rader som vises umiddelbart etter send, fjernes når server-refresh lander
  const [optimistiske, setOptimistiske] = useState<KommentarKortData[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const [sender, startTransition] = useTransition()
  const router = useRouter()

  // Styrer hvilken kommentar-rad som viser reaksjons-picker.
  // null = ingen åpen; ellers ID-en til raden der picker er synlig.
  const [aktivReaksjonId, setAktivReaksjonId] = useState<AktivReaksjonId>(null)
  // Long-press timer ref — brukes på touch for å åpne picker etter 350 ms hold.
  // Redusert fra 500 ms fordi 500 uten visuell feedback føles «dødt» — 350 er
  // fortsatt over accidental-touch-terskelen men merkes umiddelbart som «noe skjer».
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Startkoordinater for gjeldende long-press — brukes til å canselle timeren
  // hvis fingeren beveger seg > 10 px (scroll-intensjon, ikke long-press). se #359-review.
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null)
  // ID-en til raden som er «under aktivt trykk» — brukes til subtil scale-transform
  // som visuell feedback før 350 ms-terskelen. null = ingen aktiv presse.
  const [pressetId, setPressetId] = useState<string | null>(null)

  const mentionForslag = lagMentionForslag(mentionSøk, profiler, brukerId)

  // Flett optimistiske rader inn etter server-radene, men dropp en optimistisk
  // rad så snart en matchende server-rad er kommet inn (samme avsender-navn +
  // samme innhold). Match på innhold+avsender — IKKE på id, siden temp-id og
  // server-id er ulike. Dette gjør dobbel-frame-racen strukturelt umulig: i det
  // øyeblikket router.refresh() leverer server-raden, skygger den den optimistiske
  // raden, uavhengig av React-batching-timing. Avsender-navn er den eneste
  // avsender-identifikatoren KommentarKortData bærer på klienten; den optimistiske
  // raden er alltid avsenderens egen, så navne-kravet hindrer falske positiver der
  // to ulike medlemmer tilfeldigvis skriver samme tekst. se #316
  const serverNokler = new Set(
    kommentarer.map(k => `${k.avsender.navn} ${k.innhold ?? ''}`),
  )
  const usynkroniserte = optimistiske.filter(
    o => !serverNokler.has(`${o.avsender.navn} ${o.innhold ?? ''}`),
  )
  // Cap visningen til siste 3 — server caper også til 3, så en optimistisk rad
  // pusher den eldste ut visuelt i stedet for å legge til en fjerde. Nyeste står
  // sist (lista er kronologisk, eldste øverst), så .slice(-3) gir de 3 nyeste. se #316
  const visteKommentarer = [...kommentarer, ...usynkroniserte].slice(-3)

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

  // Long-press på mobil: hold i 350 ms åpner reaksjons-picker for denne raden.
  // pointerdown/up dekker både touch og peker-enheter — bredere enn touchstart/end.
  // Mus skippes fordi desktop bruker hover (onMouseEnter/Leave) — long-press på mus
  // ville dupliserer flyt og forvirre. se #359-review.
  const startLongPress = useCallback((kommentarId: string) => (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return
    e.stopPropagation()
    longPressStartRef.current = { x: e.clientX, y: e.clientY }
    setPressetId(kommentarId)
    longPressRef.current = setTimeout(() => {
      setAktivReaksjonId(kommentarId)
    }, 350)
  }, [])

  // Cancel timer hvis fingeren beveger seg > 10 px — tolkes som scroll-intensjon,
  // ikke long-press. Terskelen matcher iOS' egne heuristikker for tap-vs-scroll.
  const sjekkBevegelse = useCallback((e: React.PointerEvent) => {
    const start = longPressStartRef.current
    if (!start || longPressRef.current === null) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (dx * dx + dy * dy > 100) {
      // > 10 px unna startpunkt
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

    // Map fra det lokale KommentarScope til CHAT_KONFIG-scopet.
    const chatScope: ChatScope =
      scope.type === 'arrangement'
        ? { type: 'arrangement', arrangementId: scope.id }
        : scope.type === 'poll'
          ? { type: 'poll', pollId: scope.id }
          : { type: 'melding', meldingId: scope.id }

    // Temp-nøkkel — samme «temp-»-prefiks som Chat.tsx bruker for å signalisere
    // at raden ikke er bekreftet fra server ennå. se #316
    const tempId = `temp-${crypto.randomUUID()}`

    // Vis kommentaren umiddelbart hvis vi har nok brukerdata til å rendre raden.
    // Uten brukerdata (f.eks. «Tidligere»-seksjon der props ikke sendes) hopper
    // vi over den optimistiske fasen og venter på server-refresh. se #316
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
        // Backstop-opprydding: innholds-dedupen i render (se serverNokler) skygger
        // allerede den optimistiske raden så snart server-raden lander, så ingen
        // dobbel-rad synes uavhengig av batching-timing. Dette filteret rydder bort
        // selve state-raden så lista ikke vokser ubegrenset — og fanger rader som
        // aldri fikk en server-match. se #316
        setOptimistiske(o => o.filter(r => r.id !== tempId))
      } catch {
        // Rollback: fjern optimistisk rad og gjenopprett input
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

      {/* Kommentar-liste — kun synlig når ekspandert. Optimistiske rader flettes
          inn via visteKommentarer, deduppes mot server-rader på innhold+avsender
          og capes til siste 3, så ingen dobbel-rad eller fjerde rad synes. se #316 */}
      {apen && visteKommentarer.length > 0 && (
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
            // Temp-rader (optimistiske) har ikke server-ID ennå — picker skjules
            const pickerApen = !erTempRad && aktivReaksjonId === k.id
            // Beregnes én gang for å unngå dobbeltkall i JSX — bilde håndteres
            // av KommentarMiniatyr under, ikke her
            const innhold = visningsInnhold(k)
            return (
              <div
                key={k.id}
                // Hover-gruppe: CSS-klasse for hover-avhengig + knapp
                className="kommentar-rad-gruppe"
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'flex-start',
                  // Subtil scale + opacity som visuell feedback under 350 ms-vinduet.
                  // Signaliserer «noe skjer» før picker faktisk åpner. se #359-review.
                  transform: pressetId === k.id ? 'scale(0.98)' : 'scale(1)',
                  opacity: pressetId === k.id ? 0.85 : 1,
                  transition: 'transform 120ms ease-out, opacity 120ms ease-out',
                  // Under long-press: hindre tekst-seleksjon og iOS callout-meny
                  // (kopier/del-popup) som ellers stjeler gesture. se #359-review.
                  userSelect: pressetId === k.id ? 'none' : undefined,
                  WebkitUserSelect: pressetId === k.id ? 'none' : undefined,
                  WebkitTouchCallout: pressetId === k.id ? 'none' : undefined,
                }}
                // Desktop: hover åpner picker
                onMouseEnter={() => !erTempRad && setAktivReaksjonId(k.id)}
                onMouseLeave={() => setAktivReaksjonId(null)}
                // Mobil: long-press (350 ms) åpner picker
                onPointerDown={!erTempRad ? startLongPress(k.id) : undefined}
                onPointerMove={sjekkBevegelse}
                onPointerUp={avbrytLongPress}
                onPointerCancel={avbrytLongPress}
                onPointerLeave={avbrytLongPress}
                // Hindre iOS context-meny når vi er midt i et long-press
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
                    {/* relativTid regnes ut i render (formatDistanceToNowStrict); server-render og hydrering
                        skjer sekunder fra hverandre, og krysser vi en minutt-grense i det vinduet blir
                        teksten ulik → hydration-feil (React #418, logget i feil_logg — se #466). suppressHydrationWarning
                        er Reacts tiltenkte mekanisme for tidsstempler. */}
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
                  {/* Tekst-div rendres kun når det finnes tekst — unngår tom div
                      ved ren-bilde-kommentarer. Se #281/#350 */}
                  {innhold && (
                    <div
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 13,
                        color: 'var(--text-secondary)',
                        lineHeight: 1.4,
                      }}
                    >
                      {innhold}
                    </div>
                  )}
                  {/* Bilde-miniatyr rendres i tillegg til tekst hvis kommentaren
                      har bilde_url — både tekst og miniatyr vises når begge finnes */}
                  {k.bilde_url && (
                    <KommentarMiniatyr src={k.bilde_url} href={detaljUrl(scope)} />
                  )}
                  {/* Reaksjons-rad: badges alltid synlige, + knapp kun ved hover/long-press.
                      brukerId er alltid satt i denne konteksten (agendaforside), men
                      KommentarReaksjoner returnerer null ved tomme reaksjoner og lukket picker. */}
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
