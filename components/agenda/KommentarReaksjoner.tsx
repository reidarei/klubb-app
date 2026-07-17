'use client'

import { useState, useTransition, useEffect, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import { leggTilReaksjon, fjernReaksjon } from '@/lib/actions/chat'
import ReaksjonPicker from '@/components/agenda/ReaksjonPicker'
import type { ReaksjonGruppe } from '@/lib/reaksjoner'

type Props = {
  meldingId: string
  brukerId: string
  reaksjoner: ReaksjonGruppe[]
  /** Styres av forelder-komponenten (KommentarerPaaKort) som håndterer
   * hover (desktop) og long-press (mobil). true = vis picker, false = skjul. */
  pickerApen: boolean
  lukkPicker: () => void
}

/**
 * Reaksjons-rad for inline kommentarer på agenda-kortet. Bruker
 * chat_reaksjoner-tabellen (leggTilReaksjon / fjernReaksjon fra
 * lib/actions/chat.ts) — ikke melding_reaksjon-tabellen.
 *
 * Rendrer eksisterende reaksjons-badges + en controlled emoji-picker som
 * åpnes/lukkes av forelderen (KommentarerPaaKort) basert på hover (desktop)
 * eller long-press (mobil). Ingen egen trigger-knapp — helt controlled. se #359.
 */
export default function KommentarReaksjoner({
  meldingId,
  brukerId,
  reaksjoner: initial,
  pickerApen,
  lukkPicker,
}: Props) {
  const [reaksjoner, setReaksjoner] = useState<ReaksjonGruppe[]>(initial)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  // Sync inn ferske server-props etter router.refresh(). Uten dette blir en
  // rollback fanget på den *første* initial-verdien, og senere server-
  // oppdateringer ignoreres når komponent-instansen ikke remountes. se #359.
  // isPending-guarden hindrer at en refresh fra annen kilde overskriver
  // optimistisk state mens en toggle er in-flight — samme fiks som i
  // lib/reaksjoner-hook.ts (#468/F2).
  useEffect(() => {
    if (isPending) return
    setReaksjoner(initial)
  }, [initial, isPending])

  function stopp(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

  function toggle(emoji: string) {
    const finnes = reaksjoner.find(r => r.emoji === emoji)
    const harReagert = finnes?.profilIder.includes(brukerId) ?? false

    // Optimistisk oppdatering: legg til eller fjern brukerens stemme
    // umiddelbart — rollback til initial ved server-feil.
    setReaksjoner(prev => {
      const utenBruker = prev.map(r => ({
        ...r,
        profilIder: r.profilIder.filter(p => p !== brukerId),
      }))
      const ferdig = harReagert
        ? utenBruker
        : utenBruker.map(r => r.emoji === emoji ? { ...r, profilIder: [...r.profilIder, brukerId] } : r)

      const harGruppe = ferdig.some(r => r.emoji === emoji)
      const utvidet = !harReagert && !harGruppe
        ? [...ferdig, { emoji, profilIder: [brukerId] }]
        : ferdig

      return utvidet.filter(r => r.profilIder.length > 0)
    })

    startTransition(async () => {
      try {
        if (harReagert) {
          await fjernReaksjon(meldingId, emoji)
        } else {
          await leggTilReaksjon(meldingId, emoji)
        }
        router.refresh()
      } catch {
        setReaksjoner(initial)
      }
    })
  }

  // Ingen reaksjoner og picker er lukket → tom komponent (sparer vertikalt rom)
  if (reaksjoner.length === 0 && !pickerApen) return null

  return (
    <div
      onClick={stopp}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        flexWrap: 'wrap',
        marginTop: 4,
      }}
    >
      {/* Eksisterende reaksjonsbadger — alltid synlige når de finnes */}
      {reaksjoner.map(r => {
        const harReagert = r.profilIder.includes(brukerId)
        return (
          <button
            key={r.emoji}
            type="button"
            disabled={isPending}
            onClick={e => {
              stopp(e)
              toggle(r.emoji)
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              padding: '2px 6px',
              borderRadius: 999,
              background: harReagert ? 'var(--accent-soft)' : 'var(--bg-elevated-2)',
              border: harReagert ? '0.5px solid var(--accent)' : '0.5px solid var(--border)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-body)',
              fontSize: 11,
              // Ingen dimming under isPending — serverturen skal ikke synes (#472-oppf.)
              cursor: 'pointer',
            }}
          >
            <span>{r.emoji}</span>
            <span style={{ fontWeight: 500 }}>{r.profilIder.length}</span>
          </button>
        )
      })}

      {/* Picker — åpnes ved hover (desktop) eller long-press/tap (mobil),
          styrt av forelderen via pickerApen. Bruker nå delt ReaksjonPicker
          (#471) — liten visuell endring (2 px posisjon, 30 px knapper) er
          bevisst konsolidering. */}
      {pickerApen && (
        <ReaksjonPicker
          isPending={isPending}
          onVelg={emoji => {
            lukkPicker()
            toggle(emoji)
          }}
        />
      )}
    </div>
  )
}
