'use client'

import { useState, useTransition } from 'react'
import { leggTilMal, oppdaterMal, slettMal } from '@/lib/actions/arrangementmaler'
import { SkjemaGruppe, SkjemaRad, RadInput, ValgFelt } from '@/components/ui/Skjema'
import { AdminKnapp, KNAPP_NORMAL, ListeRad } from '@/components/MalAdminDeler'

type Mal = { id: string; navn: string; rekkefølge: number; purredato: string | null }

const MAANEDER = [
  'Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Desember',
]

function parsePurredato(purredato: string | null): { maaned: number; dag: number } | null {
  if (!purredato) return null
  const [, mm, dd] = purredato.split('-').map(Number)
  return { maaned: mm, dag: dd }
}

function tilLagringsdato(maaned: number, dag: number): string {
  return `2000-${String(maaned).padStart(2, '0')}-${String(dag).padStart(2, '0')}`
}

function dagerIMaaned(maaned: number): number {
  // Bruker år 2000 (skuddår) slik at 29. feb er tilgjengelig
  return new Date(2000, maaned, 0).getDate()
}

function MalRad({ mal }: { mal: Mal }) {
  const [redigerer, setRedigerer] = useState(false)
  const [bekrefterSlett, setBekrefterSlett] = useState(false)
  const [navn, setNavn] = useState(mal.navn)
  const parsed = parsePurredato(mal.purredato)
  const [maaned, setMaaned] = useState<number | null>(parsed?.maaned ?? null)
  const [dag, setDag] = useState<number>(parsed?.dag ?? 1)
  const [isPending, startTransition] = useTransition()

  function handleLagre() {
    if (!navn.trim()) return
    const nyPurredato = maaned ? tilLagringsdato(maaned, dag) : null
    startTransition(async () => {
      await oppdaterMal(mal.id, navn, nyPurredato)
      setRedigerer(false)
    })
  }

  function handleSlett() {
    startTransition(async () => {
      await slettMal(mal.id)
    })
  }

  function handleAvbryt() {
    setNavn(mal.navn)
    const p = parsePurredato(mal.purredato)
    setMaaned(p?.maaned ?? null)
    setDag(p?.dag ?? 1)
    setRedigerer(false)
  }

  function handleMaanedEndring(val: string) {
    if (val === '') {
      setMaaned(null)
    } else {
      const nyMaaned = parseInt(val)
      setMaaned(nyMaaned)
      const maxDag = dagerIMaaned(nyMaaned)
      if (dag > maxDag) setDag(maxDag)
    }
  }

  // Vis purredato-tekst i normal-visning
  function purredatoTekst(): string | null {
    if (!mal.purredato) return null
    const p = parsePurredato(mal.purredato)
    if (!p) return null
    return `${p.dag}. ${MAANEDER[p.maaned - 1].toLowerCase()}`
  }

  if (redigerer) {
    const antallDager = maaned ? dagerIMaaned(maaned) : 31
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
        <SkjemaRad etikett="Purring">
          <ValgFelt
            value={maaned ? String(maaned) : ''}
            valg={[{ verdi: '', etikett: 'Ingen' }, ...MAANEDER.map((m, i) => ({ verdi: String(i + 1), etikett: m }))]}
            onChange={e => handleMaanedEndring(e.target.value)}
            aria-label="Purremåned"
          />
        </SkjemaRad>
        {maaned && (
          <SkjemaRad etikett="Dag">
            <ValgFelt
              value={String(dag)}
              valg={Array.from({ length: antallDager }, (_, i) => ({ verdi: String(i + 1), etikett: `${i + 1}.` }))}
              onChange={e => setDag(parseInt(e.target.value))}
              aria-label="Purredag"
            />
          </SkjemaRad>
        )}
        <ListeRad>
          <AdminKnapp onClick={handleAvbryt} stil={KNAPP_NORMAL}>
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

  const pTekst = purredatoTekst()

  return (
    <ListeRad
      venstre={
        <>
          <p className="text-sm truncate" style={{ color: 'var(--text-primary)', margin: 0 }}>{mal.navn}</p>
          {pTekst && (
            <p className="text-xs" style={{ color: 'var(--text-secondary)', margin: 0 }}>Purring {pTekst}</p>
          )}
        </>
      }
    >
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
      await leggTilMal(navn)
      setNavn('')
    })
  }

  const kanLeggeTil = !isPending && !!navn.trim()

  return (
    <SkjemaGruppe tittel="Ny mal">
      <SkjemaRad etikett="Navn">
        <RadInput
          value={navn}
          onChange={e => setNavn(e.target.value)}
          placeholder="Nytt arrangement…"
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

export default function ArrangementmalerAdmin({ maler }: { maler: Mal[] }) {
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
