'use client'

import { Fragment, useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  sendChatMelding,
  oppdaterChatMelding,
  slettChatMelding,
  leggTilReaksjon,
  fjernReaksjon,
} from '@/lib/actions/chat'
import { konfigFor, type ChatScope as ChatScopeKonfig } from '@/lib/chat-konfig'
import { formaterDato, erSammeNorskeDag, formaterDatoSkille } from '@/lib/dato'
import Avatar from '@/components/ui/Avatar'
import Icon from '@/components/ui/Icon'
import SectionLabel from '@/components/ui/SectionLabel'
import BildeLightbox from '@/components/ui/BildeLightbox'
import MessengerBadge from '@/components/ui/MessengerBadge'
import { komprimer, genererFilnavn } from '@/lib/bilde-utils'
import { lastOppBilde, slettBilde } from '@/lib/actions/bilde-opplasting'
import {
  beregnMentionSøk,
  velgMentionTekst,
  lagMentionForslag,
  type ChatProfil,
} from '@/lib/mention'
import MentionVelger from '@/components/agenda/MentionVelger'
import { CHAT_NAER_BUNN_TERSKEL_PX } from '@/lib/konstanter'

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

// Antall meldinger som lastes first-batch og per "Vis eldre"-klikk
const SIDE_STORRELSE = 30

// Emojis tilgjengelige i reaksjons-picker
const REAKSJON_EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥', '🙌'] as const

type Reaksjon = { melding_id: string; profil_id: string; emoji: string }

function renderMedMentions(tekst: string | null) {
  if (!tekst) return null
  const deler = tekst.split(/(@[\wæøåÆØÅ][\w æøåÆØÅ-]*)/g)
  return deler.map((del, i) =>
    del.startsWith('@') ? (
      <span key={i} style={{ fontWeight: 600, color: 'var(--accent)' }}>
        {del}
      </span>
    ) : (
      del
    ),
  )
}

type Props = {
  scope: ChatScope
  brukerId: string
  erAdmin: boolean
  initialMeldinger: ChatMelding[]
  profiler: ChatProfil[]
  /** Hvis true: sett en overskrift ("Samtale") over chat-området */
  visSeksjonsLabel?: boolean
  /** Hvis true: scroll siden til siste melding ved mount og ved nye meldinger.
   * Brukes på chat-fokuserte sider (/chat, /samtaler/[id]). Default false så
   * detaljsider med chat under hovedinnholdet ikke spretter til bunn. */
  autoScrollTilBunn?: boolean
}

export default function Chat({
  scope,
  brukerId,
  erAdmin,
  initialMeldinger,
  profiler,
  visSeksjonsLabel = true,
  autoScrollTilBunn = false,
}: Props) {
  // initialMeldinger kommer som de siste N meldingene i stigende rekkefølge
  const [meldinger, setMeldinger] = useState<ChatMelding[]>(initialMeldinger)
  const [harMerEldre, setHarMerEldre] = useState(initialMeldinger.length >= SIDE_STORRELSE)
  const [henterEldre, setHenterEldre] = useState(false)

  const [tekst, setTekst] = useState('')
  const [sender, setSender] = useState(false)
  const [mentionSøk, setMentionSøk] = useState<string | null>(null)
  // Vedheng-bilde (file holdes til submit, lastes opp først ved send)
  const [bildeFil, setBildeFil] = useState<File | null>(null)
  const [bildePreview, setBildePreview] = useState<string | null>(null)
  const [bildeFeil, setBildeFeil] = useState('')
  const bildeInputRef = useRef<HTMLInputElement>(null)
  // Lightbox-visning av bilder
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  // Reaksjoner — flat liste hentet fra chat_reaksjoner. Grupperes per melding
  // i render. En Map er raskere for hot-paths men flat liste er lettere å
  // oppdatere atomisk via realtime.
  const [reaksjoner, setReaksjoner] = useState<Reaksjon[]>([])
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
  const tabell = konfig.tabell
  const kanalNavn = konfig.kanalNavn(scope)

  // Ekstraherte scope-felter — flate verdier slik at react-hooks/exhaustive-deps
  // kan analysere deps-arrayene under uten "complex expression"-warnings.
  const scopeType = scope.type
  const arrangementId = scope.type === 'arrangement' ? scope.arrangementId : ''
  const pollId = scope.type === 'poll' ? scope.pollId : ''
  const meldingId = scope.type === 'melding' ? scope.meldingId : ''
  const samtaleId = scope.type === 'privat' ? scope.samtaleId : ''

  // Helper — henter meldinger med riktig scope-filter. Returnerer i
  // *stigende* rekkefølge (eldste først) siden det er det UI-et ønsker.
  // Bruker CHAT_KONFIG til å slå opp tabell + FK-filter — ingen scope-
  // spesifikke grener her.
  const hentMeldinger = useCallback(
    async (forTidspunkt?: string): Promise<ChatMelding[]> => {
      // klubb_chat har i tillegg `fra_facebook` for å vise Messenger-badge på
      // historisk-importerte meldinger. Andre chat-tabeller har ikke kolonnen.
      // UPDATE-handleren (under) tar bevisst kun innhold, så endring av
      // fra_facebook på en eksisterende rad slår ikke gjennom i UI — i
      // praksis er flagget skrivebeskyttet etter import.
      const select =
        tabell === 'klubb_chat'
          ? 'id, profil_id, innhold, bilde_url, video_url, opprettet, fra_facebook'
          : 'id, profil_id, innhold, bilde_url, video_url, opprettet'
      let q = supabase
        .from(konfig.tabell)
        .select(select)
        .order('opprettet', { ascending: false })
        .limit(SIDE_STORRELSE)
      const fkVerdi = konfig.scopeId(scope)
      if (konfig.fkFelt && fkVerdi) {
        q = q.eq(konfig.fkFelt, fkVerdi)
      }
      if (forTidspunkt) q = q.lt('opprettet', forTidspunkt)
      const { data } = await q
      return data ? ([...data].reverse() as unknown as ChatMelding[]) : []
    },
    // konfig/scope/tabell utelates bevisst — de er rent utledet av scope-feltene over,
    // og parent sender inline scope-objekter (ny identitet per render) som ville trigget
    // unødvendige re-fetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopeType, arrangementId, pollId, meldingId, samtaleId, supabase],
  )

  // Frigjør blob-URL når preview byttes
  useEffect(() => {
    return () => {
      if (bildePreview) URL.revokeObjectURL(bildePreview)
    }
  }, [bildePreview])

  async function velgBilde(e: React.ChangeEvent<HTMLInputElement>) {
    const fil = e.target.files?.[0]
    if (!fil) return
    setBildeFeil('')
    try {
      const komprimert = await komprimer(fil)
      setBildeFil(komprimert)
      if (bildePreview) URL.revokeObjectURL(bildePreview)
      setBildePreview(URL.createObjectURL(komprimert))
    } catch (err) {
      setBildeFeil(err instanceof Error ? err.message : 'Kunne ikke lese bildet')
    } finally {
      if (bildeInputRef.current) bildeInputRef.current.value = ''
    }
  }

  function fjernBilde() {
    setBildeFil(null)
    if (bildePreview) URL.revokeObjectURL(bildePreview)
    setBildePreview(null)
    setBildeFeil('')
  }

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
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: instant ? 'auto' : 'smooth',
    })
  }, [])

  // Sjekker om brukeren befinner seg nær bunnen av siden.
  // Kjøres kun klient-side (window er undefined under SSR).
  function erNaerBunn(terskel = CHAT_NAER_BUNN_TERSKEL_PX) {
    if (typeof window === 'undefined') return true
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
        // requestAnimationFrame så DOM er rendret før vi måler/scroller
        requestAnimationFrame(() => scrollTilBunn(true))
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

  // Tastatur-høyde via visualViewport. Når iOS-tastaturet åpner med
  // interactiveWidget='overlays-content' (jf. app/layout.tsx, valgt for å
  // unngå dock-bug-klassen) endrer ikke window.innerHeight seg, men
  // visualViewport.height krymper. Differansen er omtrent tastatur-høyden.
  // keyboardOffset brukes KUN til layout: løfter input-pillen (sticky-pill
  // bottom) og vokser paddingBottom på meldingslisten. Ingen scroll-side-
  // effekter — terskel-basert auto-scroll fjernet fordi bounce-quirk (#222)
  // på iOS PWA var ikke robust å skille fra ekte tastatur-åpning. Se #236.
  const [keyboardOffset, setKeyboardOffset] = useState(0)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return
    const vv = window.visualViewport
    function oppdater() {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      setKeyboardOffset(offset)
    }
    vv.addEventListener('resize', oppdater)
    vv.addEventListener('scroll', oppdater)
    oppdater()
    return () => {
      vv.removeEventListener('resize', oppdater)
      vv.removeEventListener('scroll', oppdater)
    }
  }, [])

  // Realtime-subscription — én kanal per scope
  useEffect(() => {
    let cancelled = false

    async function startSubscription() {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled || !session) return

      supabase.realtime.setAuth(session.access_token)

      const channel = supabase.channel(kanalNavn)

      // Filter på FK-kolonnen hvis scope har en (alle utenom klubb).
      const fkVerdi = konfig.scopeId(scope)
      const insertConfig =
        konfig.fkFelt && fkVerdi
          ? {
              event: 'INSERT' as const,
              schema: 'public',
              table: tabell,
              filter: `${konfig.fkFelt}=eq.${fkVerdi}`,
            }
          : { event: 'INSERT' as const, schema: 'public', table: tabell }

      const deleteConfig = { event: 'DELETE' as const, schema: 'public', table: tabell }
      const updateConfig = { event: 'UPDATE' as const, schema: 'public', table: tabell }

      channel
        .on('postgres_changes', insertConfig, payload => {
          const ny = payload.new as ChatMelding
          setMeldinger(prev => {
            if (prev.some(m => m.id === ny.id)) return prev
            // Fjern KUN ÉN matching temp-rad (eldste først), så samme melding
            // sendt to ganger på rad ikke fører til at begge temp-rader
            // forsvinner ved første INSERT.
            const tempIdx = prev.findIndex(
              m =>
                m.id.startsWith('temp-') &&
                m.profil_id === ny.profil_id &&
                m.innhold === ny.innhold,
            )
            const utenTemp =
              tempIdx === -1 ? prev : prev.filter((_, i) => i !== tempIdx)
            // Frigjør blob-URL fra temp-raden hvis den hadde en
            if (tempIdx !== -1) {
              const fjernet = prev[tempIdx]
              if (fjernet.bilde_url?.startsWith('blob:')) {
                URL.revokeObjectURL(fjernet.bilde_url)
              }
            }
            return [...utenTemp, ny]
          })
        })
        .on('postgres_changes', deleteConfig, payload => {
          const slettetId = (payload.old as { id: string }).id
          setMeldinger(prev => prev.filter(m => m.id !== slettetId))
        })
        .on('postgres_changes', updateConfig, payload => {
          const oppdatert = payload.new as ChatMelding
          setMeldinger(prev =>
            prev.map(m => (m.id === oppdatert.id ? { ...m, innhold: oppdatert.innhold } : m)),
          )
        })
        .subscribe()

      return channel
    }

    let channelRef: ReturnType<typeof supabase.channel> | undefined
    startSubscription().then(ch => {
      channelRef = ch
    })

    return () => {
      cancelled = true
      if (channelRef) supabase.removeChannel(channelRef)
    }
    // kanalNavn/konfig/scope/tabell utelates bevisst — alle utledet av scope-feltene over,
    // og parent sender inline scope-objekter (ny identitet per render) som ville trigget
    // unødvendige re-subscribes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeType, arrangementId, pollId, meldingId, samtaleId, supabase])

  // Hent reaksjoner — kun for meldings-ID-er vi ikke har hentet før. På
  // mount: fetch for alle. Ved scrollback (Vis eldre): fetch for nye
  // gamle IDer. Når en ny melding kommer inn via send/realtime: fetcher
  // for den ene IDen — typisk 0 rader, men billig og holder logikken
  // homogen. Realtime-subscription under fanger nye reaksjoner uansett.
  //
  // Tidligere mønster fetch'et HELE settet hver gang meldinger.length
  // endret seg, og erstattet reaksjons-state komplett → re-render av
  // alle chat-bobler. Det dro INP merkbart.
  const fetchedReaksjonsIder = useRef(new Set<string>())
  useEffect(() => {
    const synlige = meldinger.map(m => m.id).filter(id => !id.startsWith('temp-'))
    const nye = synlige.filter(id => !fetchedReaksjonsIder.current.has(id))
    if (nye.length === 0) return
    for (const id of nye) fetchedReaksjonsIder.current.add(id)

    let cancelled = false
    supabase
      .from('chat_reaksjoner')
      .select('melding_id, profil_id, emoji')
      .in('melding_id', nye)
      .then(({ data }) => {
        if (cancelled || !data || data.length === 0) return
        setReaksjoner(prev => {
          // Slå sammen — fjerne dubletter for samme (melding_id, profil_id, emoji)
          const eksisterende = new Set(
            prev.map(r => `${r.melding_id}|${r.profil_id}|${r.emoji}`),
          )
          const nye = (data as Reaksjon[]).filter(
            r => !eksisterende.has(`${r.melding_id}|${r.profil_id}|${r.emoji}`),
          )
          return nye.length > 0 ? [...prev, ...nye] : prev
        })
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meldinger.length])

  // Reaksjoner gruppert per melding_id — kalkuleres én gang per
  // render, ikke i hver boble. Sparer O(N×R) → O(N+R) når N meldinger
  // og R reaksjoner.
  const reaksjonerPerMelding = useMemo(() => {
    const map = new Map<string, Reaksjon[]>()
    for (const r of reaksjoner) {
      const liste = map.get(r.melding_id)
      if (liste) liste.push(r)
      else map.set(r.melding_id, [r])
    }
    return map
  }, [reaksjoner])

  // Realtime for reaksjoner — egen kanal siden vi ikke har filter per scope
  // (reaksjoner har ingen scope-kolonne; vi stoler på at bare synlige meldinger
  // får reaksjoner oppdatert via postfiltering).
  useEffect(() => {
    let cancelled = false
    let channelRef: ReturnType<typeof supabase.channel> | undefined

    async function start() {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled || !session) return
      supabase.realtime.setAuth(session.access_token)

      const channel = supabase.channel('chat-reaksjoner')
      channel
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'chat_reaksjoner' },
          payload => {
            const ny = payload.new as Reaksjon
            setReaksjoner(prev => {
              if (prev.some(r =>
                r.melding_id === ny.melding_id &&
                r.profil_id === ny.profil_id &&
                r.emoji === ny.emoji
              )) return prev
              return [...prev, ny]
            })
          },
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'chat_reaksjoner' },
          payload => {
            const gml = payload.old as Partial<Reaksjon>
            setReaksjoner(prev =>
              prev.filter(r =>
                !(
                  r.melding_id === gml.melding_id &&
                  r.profil_id === gml.profil_id &&
                  r.emoji === gml.emoji
                ),
              ),
            )
          },
        )
        .subscribe()
      channelRef = channel
    }

    start()
    return () => {
      cancelled = true
      if (channelRef) supabase.removeChannel(channelRef)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-fetch ved visibilitychange (iOS PWA dropper WebSocket i bakgrunnen).
  // Henter de siste SIDE_STORRELSE for å fylle manglende meldinger.
  useEffect(() => {
    async function reFetch() {
      if (document.visibilityState !== 'visible') return
      const nyeste = await hentMeldinger()
      if (nyeste.length === 0) return
      setMeldinger(prev => {
        // Behold eventuelle eldre meldinger brukeren allerede har lastet
        const eldste = nyeste[0].opprettet
        const eldre = prev.filter(m => m.opprettet < eldste)
        return [...eldre, ...nyeste]
      })
    }

    document.addEventListener('visibilitychange', reFetch)
    return () => document.removeEventListener('visibilitychange', reFetch)
  }, [hentMeldinger])

  async function lastEldre() {
    if (henterEldre || !harMerEldre || meldinger.length === 0) return
    setHenterEldre(true)
    try {
      const eldstKjentTid = meldinger[0].opprettet
      const eldre = await hentMeldinger(eldstKjentTid)
      if (eldre.length > 0) {
        setMeldinger(prev => [...eldre, ...prev])
      }
      if (eldre.length < SIDE_STORRELSE) setHarMerEldre(false)
    } finally {
      setHenterEldre(false)
    }
  }

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
        fd.append('filnavn', genererFilnavn(filUploadKopi))
        fd.append('kategori', 'chat')
        const res = await lastOppBilde(fd)
        bildeUrl = res.url
      }

      await sendChatMelding(scope, melding, bildeUrl)
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
    // Merk: blob-URL beholdes ved suksess til realtime INSERT bytter ut
    // optimistisk-raden. Cleanup skjer i useEffect under når raden er borte.
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

  async function toggleReaksjon(meldingId: string, emoji: string) {
    const alleredePaa = reaksjoner.some(
      r => r.melding_id === meldingId && r.profil_id === brukerId && r.emoji === emoji,
    )
    // Optimistisk oppdatering
    if (alleredePaa) {
      setReaksjoner(prev =>
        prev.filter(
          r => !(r.melding_id === meldingId && r.profil_id === brukerId && r.emoji === emoji),
        ),
      )
    } else {
      setReaksjoner(prev => [
        ...prev,
        { melding_id: meldingId, profil_id: brukerId, emoji },
      ])
    }
    setPickerFor(null)

    try {
      if (alleredePaa) {
        await fjernReaksjon(meldingId, emoji)
      } else {
        await leggTilReaksjon(meldingId, emoji)
      }
    } catch {
      // Rollback ved feil
      if (alleredePaa) {
        setReaksjoner(prev => [
          ...prev,
          { melding_id: meldingId, profil_id: brukerId, emoji },
        ])
      } else {
        setReaksjoner(prev =>
          prev.filter(
            r => !(r.melding_id === meldingId && r.profil_id === brukerId && r.emoji === emoji),
          ),
        )
      }
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
          over tastaturet når det åpner (jf. #216). */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginBottom: 4,
          paddingBottom: autoScrollTilBunn
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
          // Slett-knapp: kun egen-eier. Admin har ingen UI-snarvei for å
          // slette andres meldinger — om noe må fjernes må admin gjøre det
          // direkte i DB. Gjelder også FB-importerte: sendte du meldingen
          // (i appen eller i Messenger som senere ble importert), kan du
          // slette den her.
          const kanSlette = erEgen
          const navn = profilMap.get(m.profil_id) ?? 'Ukjent'
          const bilde = bildeMap.get(m.profil_id)
          const rolle = rolleMap.get(m.profil_id) ?? null
          const tid = formaterDato(m.opprettet, 'HH:mm')
          return (
            <Fragment key={m.id}>
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
                marginTop: erFortsettelse ? 2 : i === 0 ? 0 : 8,
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
                  {editerer === m.id ? (
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
                        onChange={e => setEditTekst(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            lagreEdit(m.id)
                          } else if (e.key === 'Escape') {
                            e.preventDefault()
                            avbrytEdit()
                          }
                        }}
                        maxLength={konfig.charLimit}
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
                          onClick={avbrytEdit}
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
                          onClick={() => lagreEdit(m.id)}
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
                            fontWeight: 700,
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
                    onTouchStart={() => startLongPress(m.id)}
                    onTouchEnd={clearLongPress}
                    onTouchMove={clearLongPress}
                    onTouchCancel={clearLongPress}
                    onContextMenu={e => {
                      // Hindrer iOS sin native callout (kopier/del) og
                      // fungerer som desktop-høyreklikk-trigger.
                      e.preventDefault()
                      if (!m.id.startsWith('temp-')) setPickerFor(m.id)
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
                        onClick={() => setLightboxSrc(m.bilde_url)}
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
                    {m.innhold && renderMedMentions(m.innhold)}
                  </div>
                  )}
                  {m.fra_facebook && <MessengerBadge erEgen={erEgen} />}
                  {/* Reaksjons-chips — flyter på bunnkanten av bobla, ikke
                      egen linje. Negativ margin trekker dem opp slik at de
                      overlapper bobla, padding holder dem litt inn fra
                      kanten. Bottom-margin på .chat-boble (under) gir plass
                      til at de stikker ut. */}
                  {(() => {
                    const mineReaksjoner = reaksjonerPerMelding.get(m.id)
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
                            onClick={() => toggleReaksjon(m.id, emoji)}
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
                  {/* Picker — vises over bobla når long-press trigger */}
                  {pickerFor === m.id && (
                    <>
                      {/* Overlay som fanger klikk utenfor */}
                      <div
                        onClick={() => setPickerFor(null)}
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
                            onClick={() => toggleReaksjon(m.id, emoji)}
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
                              onClick={() => startEdit(m.id, m.innhold!)}
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
                      onClick={() => handleSlett(m.id)}
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
            </Fragment>
          )
        })}
        <div ref={bunnenRef} />
      </div>

      {/* Container med mention-chips, bilde-preview, evt. feilmelding
          og input-pill. Mention-chips ligger inni for å unngå at de
          skjules bak input-pill når flere chips wrappes til flere linjer.
          På chat-fokuserte sider er container fixed til bunn av viewportet
          så pillen alltid er synlig (også når innholdet er kortere enn
          skjermen); ellers sticky, sånn at den følger med når brukeren
          scroller chat-seksjonen inn i bilde på detalj-sider.
          `bottom` løftes med keyboardOffset så pillen holder seg over
          iOS-tastaturet (jf. #216). */}
      <div
        style={
          autoScrollTilBunn
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
            autoScrollTilBunn
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
          <button
            type="button"
            onClick={fjernBilde}
            aria-label="Fjern bilde"
            style={{
              position: 'absolute',
              top: -6,
              right: -6,
              width: 22,
              height: 22,
              borderRadius: '50%',
              // original var litt mørkere — konsolidert til felles overlay-control-bg-token
              background: 'var(--overlay-control-bg)',
              color: 'var(--text-primary)',
              border: 'none',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
          >
            ×
          </button>
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
        <button
          type="button"
          onClick={() => bildeInputRef.current?.click()}
          aria-label="Legg ved bilde"
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'transparent',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            flexShrink: 0,
            padding: 0,
          }}
        >
          <Icon name="image" size={18} color="currentColor" strokeWidth={1.8} />
        </button>
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
        <button
          type="button"
          onClick={handleSend}
          disabled={(!tekst.trim() && !bildeFil) || sender}
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'var(--accent)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: (!tekst.trim() && !bildeFil) || sender ? 'default' : 'pointer',
            opacity: (!tekst.trim() && !bildeFil) || sender ? 0.4 : 1,
            flexShrink: 0,
          }}
          aria-label="Send melding"
        >
          <Icon name="arrowRight" size={14} color="var(--accent-foreground)" strokeWidth={2.5} />
        </button>
      </div>
      </div>
      </div>

      {lightboxSrc && (
        <BildeLightbox src={lightboxSrc} onLukk={() => setLightboxSrc(null)} />
      )}
    </div>
  )
}
