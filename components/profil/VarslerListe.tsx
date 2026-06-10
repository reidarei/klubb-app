'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { formaterDato } from '@/lib/dato'
import { markerAlleVarslerLest } from '@/lib/actions/varsler'

export type VarselRad = {
  id: string
  tittel: string
  melding: string | null
  lest: boolean
  opprettet: string | null
  url: string | null
}

type Props = {
  varsler: VarselRad[]
  /**
   * Totalt antall uleste varsler i DB (også eldre enn de 10 vi henter til
   * listen). Tellingen i tittelen og "Marker alle som lest"-knappen bruker
   * denne — uten den ville Reidar med 116 uleste eldre + 0 uleste i top 10
   * sett "Varsler (0 uleste)" og en disabled knapp, men prikken på avataren
   * fortsatt aktiv. Se #207.
   */
  antallUlesteTotal: number
}

// Klient-komponent fordi vi vil ha lokal state for kollaps og filter uten
// å re-fetche fra serveren. Marker-alle-lest kaller server action og lar
// revalidatePath sørge for at neste render reflekterer endringen — vi
// oppdaterer også lokal state med en gang for momentan UI-feedback.
export default function VarslerListe({
  varsler: initialVarsler,
  antallUlesteTotal: initialAntallUlesteTotal,
}: Props) {
  const router = useRouter()
  const [varsler, setVarsler] = useState(initialVarsler)
  // Total ulest-count som lokal state så optimistisk marker-alle-lest kan
  // nulle den umiddelbart uten å vente på revalidatePath.
  const [antallUlesteTotal, setAntallUlesteTotal] = useState(initialAntallUlesteTotal)
  const [kollapset, setKollapset] = useState(false)
  const [kunUleste, setKunUleste] = useState(false)
  const [isPending, startTransition] = useTransition()

  const visning = kunUleste ? varsler.filter(v => !v.lest) : varsler

  function markerAlleLest() {
    if (antallUlesteTotal === 0) return
    startTransition(async () => {
      // Optimistisk oppdatering — server action får siste ord via revalidatePath.
      setVarsler(varsler.map(v => ({ ...v, lest: true })))
      setAntallUlesteTotal(0)
      try {
        await markerAlleVarslerLest()
        // router.refresh() tvinger klientens Router Cache til å re-fetche
        // layout-RSC, slik at ulest-prikken på profil-avataren forsvinner
        // umiddelbart. revalidatePath på serveren alene er ikke nok når
        // layouten allerede er hydrert i klientens cache. Se #218.
        router.refresh()
      } catch {
        // Ved feil: rull tilbake lokal state.
        setVarsler(initialVarsler)
        setAntallUlesteTotal(initialAntallUlesteTotal)
      }
    })
  }

  return (
    <section style={{ marginBottom: 24, marginTop: 24 }}>
      {/* Header med tittel + antall + toggle-knapp for kollaps */}
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          fontWeight: 500,
          color: 'var(--text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '1.6px',
          marginBottom: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <button
          type="button"
          onClick={() => setKollapset(k => !k)}
          aria-expanded={!kollapset}
          aria-controls="varsler-innhold"
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            color: 'inherit',
            font: 'inherit',
            letterSpacing: 'inherit',
            textTransform: 'inherit',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: 'inline-block',
              transform: kollapset ? 'rotate(-90deg)' : 'rotate(0deg)',
              transition: 'transform 150ms ease',
              fontSize: 9,
              opacity: 0.7,
            }}
          >
            ▼
          </span>
          <span>
            Varsler ({antallUlesteTotal} uleste)
          </span>
        </button>
        <span style={{ flex: 1, height: '0.5px', background: 'var(--border-subtle)' }} />
      </div>

      {!kollapset && (
        <div id="varsler-innhold">
          {/* Filter + marker-alle-lest */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 10,
              padding: '0 4px',
            }}
          >
            <button
              type="button"
              onClick={() => setKunUleste(v => !v)}
              style={{
                background: kunUleste ? 'var(--accent-soft)' : 'transparent',
                border: '0.5px solid var(--border-subtle)',
                borderRadius: 999,
                padding: '6px 12px',
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                fontWeight: 500,
                color: kunUleste ? 'var(--accent)' : 'var(--text-tertiary)',
                cursor: 'pointer',
                letterSpacing: '-0.1px',
              }}
              aria-pressed={kunUleste}
            >
              {kunUleste ? 'Viser uleste' : 'Vis kun uleste'}
            </button>

            <button
              type="button"
              onClick={markerAlleLest}
              disabled={antallUlesteTotal === 0 || isPending}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '6px 4px',
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                fontWeight: 500,
                color: antallUlesteTotal === 0 ? 'var(--text-tertiary)' : 'var(--accent)',
                opacity: antallUlesteTotal === 0 || isPending ? 0.5 : 1,
                cursor: antallUlesteTotal === 0 ? 'default' : 'pointer',
                letterSpacing: '-0.1px',
              }}
            >
              Marker alle som lest
            </button>
          </div>

          {visning.length === 0 ? (
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                color: 'var(--text-tertiary)',
                padding: '18px 4px',
                textAlign: 'center',
              }}
            >
              {kunUleste ? 'Ingen uleste varsler' : 'Ingen varsler'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {visning.map((v, i) => (
                <Link
                  key={v.id}
                  href={`/varsler/${v.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 14,
                    padding: '14px 4px',
                    borderBottom:
                      i < visning.length - 1 ? '0.5px solid var(--border-subtle)' : 'none',
                    textDecoration: 'none',
                    color: 'inherit',
                    opacity: v.lest ? 0.6 : 1,
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: v.lest ? 'var(--border-subtle)' : 'var(--accent)',
                      marginTop: 6,
                      flexShrink: 0,
                      boxShadow: v.lest
                        ? 'none'
                        : '0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent)',
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 15,
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                        letterSpacing: '-0.2px',
                        lineHeight: 1.2,
                        marginBottom: 3,
                      }}
                    >
                      {v.tittel}
                    </div>
                    {v.melding && (
                      <div
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: 12,
                          color: 'var(--text-secondary)',
                          lineHeight: 1.45,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                        {v.melding}
                      </div>
                    )}
                    {v.opprettet && (
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 9,
                          color: 'var(--text-tertiary)',
                          letterSpacing: '1.4px',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          marginTop: 4,
                        }}
                      >
                        {formaterDato(v.opprettet, 'd. MMM · HH:mm')}
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
