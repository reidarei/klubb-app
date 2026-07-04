'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import type { createClient } from '@/lib/supabase/client'
import { leggTilReaksjon, fjernReaksjon } from '@/lib/actions/chat'

export type Reaksjon = { melding_id: string; profil_id: string; emoji: string }

// Reaksjoner for en meldingsliste — fetch, realtime og optimistisk toggle.
// Tar meldinger som minimal id-liste (ikke hele ChatMelding) for å unngå
// sirkulær import mot Chat.tsx.
export function useChatReaksjoner(
  meldinger: { id: string }[],
  brukerId: string,
  supabase: ReturnType<typeof createClient>,
) {
  // Reaksjoner — flat liste hentet fra chat_reaksjoner. Grupperes per melding
  // i render. En Map er raskere for hot-paths men flat liste er lettere å
  // oppdatere atomisk via realtime.
  const [reaksjoner, setReaksjoner] = useState<Reaksjon[]>([])

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
    // Tomt deps-array er bevisst — global kanal som skal mountes ÉN gang,
    // ikke re-subscribe per render. supabase er init-once (useRef i Chat).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  return { reaksjonerPerMelding, toggleReaksjon }
}
