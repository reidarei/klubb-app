'use client'

import { useState, useEffect, useCallback } from 'react'
import type { createClient } from '@/lib/supabase/client'
import type { ChatScope, ChatKonfig } from '@/lib/chat-konfig'
import type { ChatMelding } from '../Chat'

// Antall meldinger som lastes first-batch og per "Vis eldre"-klikk
const SIDE_STORRELSE = 30

// Meldingsliste-state for en chat: initial fetch/paginering ("Vis eldre"),
// realtime-kanal per scope og re-fetch ved visibilitychange. setMeldinger
// eksponeres fordi handleSend/lagreEdit/handleSlett i Chat.tsx gjør
// optimistiske oppdateringer direkte.
export function useChatMeldinger({
  scope,
  initialMeldinger,
  supabase,
  konfig,
  kanalNavn,
}: {
  scope: ChatScope
  initialMeldinger: ChatMelding[]
  supabase: ReturnType<typeof createClient>
  konfig: ChatKonfig
  kanalNavn: string
}) {
  // konfig.tabell er eneste sannhetskilde for tabellnavnet — brukes både i
  // select-grenen (fra_facebook kun på klubb_chat) og i realtime-configene.
  const tabell = konfig.tabell
  // initialMeldinger kommer som de siste N meldingene i stigende rekkefølge
  const [meldinger, setMeldinger] = useState<ChatMelding[]>(initialMeldinger)
  const [harMerEldre, setHarMerEldre] = useState(initialMeldinger.length >= SIDE_STORRELSE)
  const [henterEldre, setHenterEldre] = useState(false)

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
        .from(tabell)
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

  return { meldinger, setMeldinger, harMerEldre, henterEldre, lastEldre, hentMeldinger }
}
