'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Lytt på poll_stemme for denne pollen og refresh server-komponenten når
 * noen stemmer eller fjerner en stemme. Billig (ingen state-håndtering her
 * — server-rendringen gjør jobben), men gir live oppdatering for alle som
 * ser pollen samtidig.
 */
export default function PollRealtime({ pollId }: { pollId: string }) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    let channelRef: ReturnType<typeof supabase.channel> | undefined
    ;(async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (cancelled || !session) return

      supabase.realtime.setAuth(session.access_token)

      const channel = supabase.channel(`poll-${pollId}`)
      channel
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'poll_stemme',
            filter: `poll_id=eq.${pollId}`,
          },
          () => router.refresh(),
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'poll_stemme',
            // DELETE-payloads inkluderer ikke filtered rows uansett, så vi
            // refresh på alle delete-events på tabellen. Lav frekvens — ok.
          },
          () => router.refresh(),
        )
        .subscribe()

      channelRef = channel
    })()

    return () => {
      cancelled = true
      if (channelRef) supabase.removeChannel(channelRef)
    }
  }, [pollId, router])

  return null
}
