'use client'

import { useState, useTransition } from 'react'
import { leggTilKaaringMal, oppdaterKaaringMal, slettKaaringMal } from '@/lib/actions/kaaringmaler'
import { SkjemaGruppe, SkjemaRad, RadInput } from '@/components/ui/Skjema'
import { AdminKnapp, KNAPP_NORMAL, ListeRad } from '@/components/MalAdminDeler'

type Mal = { id: string; navn: string; rekkefolge: number }

function MalRad({ mal }: { mal: Mal }) {
  const [redigerer, setRedigerer] = useState(false)
  const [bekrefterSlett, setBekrefterSlett] = useState(false)
  const [navn, setNavn] = useState(mal.navn)
  const [isPending, startTransition] = useTransition()

  function handleLagre() {
    if (!navn.trim()) return
    startTransition(async () => {
      await oppdaterKaaringMal(mal.id, navn)
      setRedigerer(false)
    })
  }

  function handleSlett() {
    startTransition(async () => {
      await slettKaaringMal(mal.id)
    })
  }

  if (redigerer) {
    return (
      <>
        <SkjemaRad etikett="Navn">
          <RadInput
            value={navn}
            onChange={e => setNavn(e.target.value)}
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') handleLagre() }}
          />
        </SkjemaRad>
        <ListeRad>
          <AdminKnapp onClick={() => { setNavn(mal.navn); setRedigerer(false) }} stil={KNAPP_NORMAL}>
            Avbryt
          </AdminKnapp>
          <AdminKnapp onClick={handleLagre} disabled={isPending}
            stil={{ background: 'var(--accent)', color: 'var(--accent-foreground)', opacity: isPending ? 0.5 : 1 }}>
            {isPending ? '…' : 'Lagre'}
          </AdminKnapp>
        </ListeRad>
      </>
    )
  }

  return (
    <ListeRad venstre={<p className="text-sm truncate" style={{ color: 'var(--text-primary)', margin: 0 }}>{mal.navn}</p>}>
      {bekrefterSlett ? (
        <>
          <AdminKnapp onClick={handleSlett} disabled={isPending}
            stil={{ background: 'var(--danger)', color: 'var(--text-primary)', opacity: isPending ? 0.5 : 1 }}>
            Slett
          </AdminKnapp>
          <AdminKnapp onClick={() => setBekrefterSlett(false)} stil={KNAPP_NORMAL}>
            Nei
          </AdminKnapp>
        </>
      ) : (
        <>
          <AdminKnapp onClick={() => setRedigerer(true)} stil={KNAPP_NORMAL}>
            Rediger
          </AdminKnapp>
          <AdminKnapp onClick={() => setBekrefterSlett(true)} stil={{ ...KNAPP_NORMAL, color: 'var(--danger)' }}>
            Slett
          </AdminKnapp>
        </>
      )}
    </ListeRad>
  )
}

function NyMalForm() {
  const [navn, setNavn] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleLeggTil() {
    if (!navn.trim()) return
    startTransition(async () => {
      await leggTilKaaringMal(navn)
      setNavn('')
    })
  }

  const kanLeggeTil = !isPending && !!navn.trim()

  return (
    <SkjemaGruppe tittel="Ny kåring">
      <SkjemaRad etikett="Navn">
        <RadInput
          value={navn}
          onChange={e => setNavn(e.target.value)}
          placeholder="Ny kåringmal…"
          onKeyDown={e => { if (e.key === 'Enter') handleLeggTil() }}
        />
      </SkjemaRad>
      <ListeRad>
        <AdminKnapp onClick={handleLeggTil} disabled={!kanLeggeTil}
          stil={{ background: 'var(--accent)', color: 'var(--accent-foreground)', opacity: kanLeggeTil ? 1 : 0.5 }}>
          {isPending ? '…' : '+ Legg til'}
        </AdminKnapp>
      </ListeRad>
    </SkjemaGruppe>
  )
}

export default function KaaringMalAdmin({ maler }: { maler: Mal[] }) {
  return (
    <div>
      {maler.length > 0 && (
        <SkjemaGruppe>
          {maler.map(mal => <MalRad key={mal.id} mal={mal} />)}
        </SkjemaGruppe>
      )}
      <NyMalForm />
    </div>
  )
}
