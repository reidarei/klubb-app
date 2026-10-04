'use client'

import { useState, useTransition } from 'react'
import { leggTilAnsvarlig, fjernAnsvarlig } from '@/lib/actions/arrangoransvar'
import Icon from '@/components/ui/Icon'
import { PilleKnapp } from '@/components/ui/TreffPille'
import Treffflate, { treffflateRundt } from '@/components/ui/Treffflate'
import { SkjemaGruppe, SkjemaRad, ValgFelt } from '@/components/ui/Skjema'

// «Legg til» er type=submit, og <Treffflate> tvinger type=button — teknikken legges på manuelt (#700).
const LEGG_TIL_TREFF = treffflateRundt({ hoyde: 32, bredde: 32 })

const pillKnapp: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 999,
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '1.4px',
  textTransform: 'uppercase'
}

export default function AnsvarAdmin({
  ansvarlige,
  arrangementNavn,
  aar,
  medlemmer,
}: {
  ansvarlige: { ansvarId: string; profilId: string }[]
  arrangementNavn: string
  aar: number
  medlemmer: { id: string; navn: string }[]
}) {
  const [aapen, setAapen] = useState(false)
  const [valgtId, setValgtId] = useState('')
  const [isPending, startTransition] = useTransition()

  const tildelte = new Set(ansvarlige.map(a => a.profilId))
  const tilgjengelige = medlemmer.filter(m => !tildelte.has(m.id))

  function handleLeggTil(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const profilId = valgtId
    if (!profilId) return
    startTransition(async () => {
      await leggTilAnsvarlig({ aar, arrangement_navn: arrangementNavn, ansvarlig_id: profilId })
    })
    setValgtId('')
  }

  function handleFjern(ansvarId: string) {
    startTransition(async () => {
      await fjernAnsvarlig(ansvarId)
    })
  }

  if (!aapen) {
    return (
      <PilleKnapp
        onClick={() => setAapen(true)}
        synligHoyde={30}
        pilleStil={{
          ...pillKnapp,
          background: 'transparent',
          border: '0.5px solid var(--border)',
          color: 'var(--text-secondary)',
        }}
      >
        Endre
      </PilleKnapp>
    )
  }

  return (
    <div style={{ marginTop: 10, opacity: isPending ? 0.5 : 1 }}>
      <SkjemaGruppe>
        {ansvarlige.map(a => {
          const navn = medlemmer.find(m => m.id === a.profilId)?.navn ?? '–'
          return (
            <SkjemaRad key={a.ansvarId} etikett={navn}>
              <Treffflate
                synlig={26}
                disabled={isPending}
                aria-label="Fjern ansvarlig"
                onClick={() => handleFjern(a.ansvarId)}
              >
                <span
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    border: '0.5px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--danger)',
                  }}
                >
                  <Icon name="x" size={12} color="var(--danger)" strokeWidth={2} />
                </span>
              </Treffflate>
            </SkjemaRad>
          )
        })}

        {tilgjengelige.length > 0 && (
          // Skjemaet ligger rundt raden, så Enter/«Legg til» sender som før.
          <form onSubmit={handleLeggTil}>
            <SkjemaRad etikett="Legg til">
              <ValgFelt
                name="ansvarlig_id"
                value={valgtId}
                onChange={e => setValgtId(e.target.value)}
                plassholder="Velg ansvarlig…"
                valg={tilgjengelige.map(m => ({ verdi: m.id, etikett: m.navn }))}
              />
              <button
                type="submit"
                disabled={isPending}
                aria-label="Legg til"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32 + 2 * LEGG_TIL_TREFF.utvidX,
                  height: 32 + 2 * LEGG_TIL_TREFF.utvidY,
                  marginTop: -LEGG_TIL_TREFF.utvidY,
                  marginBottom: -LEGG_TIL_TREFF.utvidY,
                  marginLeft: -LEGG_TIL_TREFF.utvidX,
                  marginRight: -LEGG_TIL_TREFF.utvidX,
                  padding: 0,
                  background: 'transparent',
                  border: 'none',
                  flexShrink: 0,
                  // Over det usynlige select-laget, ellers stjeler det trykket.
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="plus" size={14} color="var(--accent-foreground)" strokeWidth={2.5} />
                </span>
              </button>
            </SkjemaRad>
          </form>
        )}
      </SkjemaGruppe>

      <PilleKnapp
        onClick={() => setAapen(false)}
        synligHoyde={30}
        style={{ alignSelf: 'flex-start' }}
        pilleStil={{
          ...pillKnapp,
          background: 'transparent',
          border: '0.5px solid var(--border)',
          color: 'var(--text-secondary)',
        }}
      >
        Ferdig
      </PilleKnapp>
    </div>
  )
}
