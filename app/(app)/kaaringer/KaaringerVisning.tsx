'use client'

import { useState } from 'react'
import Icon from '@/components/ui/Icon'
import SetVinnerModal from '@/components/SetVinnerModal'

type Mal = { id: string; navn: string }

type Vinner = {
  id: string
  mal_id: string
  aar: number
  begrunnelse: string | null
  profil_id: string | null
  profiles: { navn: string } | null
  arrangement_id: string | null
  arrangementer: { tittel: string } | null
}

type Props = {
  maler: Mal[]
  vinnere: Vinner[]
  aarListe: number[]
  startAar: number
  erAdmin: boolean
  medlemmer: { id: string; navn: string }[]
  arrangementer: { id: string; tittel: string; start_tidspunkt: string }[]
}

export default function KaaringerVisning({
  maler,
  vinnere,
  aarListe,
  startAar,
  erAdmin,
  medlemmer,
  arrangementer,
}: Props) {
  const [aar, setAar] = useState(startAar)
  const [apentMalId, setApentMalId] = useState<string | null>(null)

  const idx = aarListe.indexOf(aar)
  const kanBakover = idx < aarListe.length - 1
  const kanFremover = idx > 0

  const vinnerForMal = (malId: string) =>
    vinnere.find(v => v.mal_id === malId && v.aar === aar)

  return (
    <>
      {/* År-veksler */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          marginBottom: 18,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
        }}
      >
        <button
          type="button"
          onClick={() => kanBakover && setAar(aarListe[idx + 1])}
          disabled={!kanBakover}
          style={{
            background: 'none',
            border: 'none',
            cursor: kanBakover ? 'pointer' : 'default',
            color: 'var(--text-tertiary)',
            padding: 4,
            display: 'flex',
            opacity: kanBakover ? 1 : 0.3,
          }}
          aria-label="Forrige år"
        >
          <span style={{ display: 'inline-block', transform: 'rotate(180deg)' }}>
            <Icon name="chevron" size={16} color="var(--text-tertiary)" />
          </span>
        </button>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 20,
            fontWeight: 500,
            color: 'var(--accent)',
            letterSpacing: '2px',
          }}
        >
          {aar}
        </div>
        <button
          type="button"
          onClick={() => kanFremover && setAar(aarListe[idx - 1])}
          disabled={!kanFremover}
          style={{
            background: 'none',
            border: 'none',
            cursor: kanFremover ? 'pointer' : 'default',
            color: 'var(--text-tertiary)',
            padding: 4,
            display: 'flex',
            opacity: kanFremover ? 1 : 0.3,
          }}
          aria-label="Neste år"
        >
          <Icon name="chevron" size={16} color="var(--text-tertiary)" />
        </button>
      </div>

      {/* Kort */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {maler.map(mal => {
          const v = vinnerForMal(mal.id)
          const vinnerNavn = v
            ? v.profil_id
              ? v.profiles?.navn
              : v.arrangementer?.tittel
            : null
          const erArrangement = !!v?.arrangement_id
          const ikonNavn = vinnerNavn
            ? erArrangement
              ? 'trophy'
              : 'crown'
            : 'clock'

          return (
            <div
              key={mal.id}
              style={{
                position: 'relative',
                padding: 18,
                background: 'var(--bg-elevated)',
                border: '0.5px solid var(--border-strong)',
                borderRadius: 'var(--radius)',
                backdropFilter: 'var(--blur-card)',
                WebkitBackdropFilter: 'var(--blur-card)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    border: '1px solid var(--border-strong)',
                    background: 'var(--accent-soft)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon
                    name={ikonNavn}
                    size={18}
                    color={vinnerNavn ? 'var(--accent)' : 'var(--text-tertiary)'}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      color: 'var(--text-tertiary)',
                      letterSpacing: '1.5px',
                      textTransform: 'uppercase',
                      marginBottom: 4,
                      fontWeight: 600,
                    }}
                  >
                    {mal.navn}
                  </div>
                  {vinnerNavn ? (
                    <>
                      <div
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: 20,
                          fontWeight: 500,
                          color: 'var(--text-primary)',
                          lineHeight: 1.1,
                          letterSpacing: '-0.2px',
                        }}
                      >
                        {vinnerNavn}
                      </div>
                      {v?.begrunnelse && (
                        <div
                          style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 13,
                            fontStyle: 'italic',
                            color: 'var(--text-secondary)',
                            marginTop: 6,
                            lineHeight: 1.4,
                          }}
                        >
                          «{v.begrunnelse}»
                        </div>
                      )}
                    </>
                  ) : (
                    <div
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 13,
                        color: 'var(--text-tertiary)',
                        fontStyle: 'italic',
                        marginTop: 4,
                      }}
                    >
                      Ikke kåret ennå
                    </div>
                  )}
                </div>

                {erAdmin && (
                  <button
                    type="button"
                    onClick={() => setApentMalId(mal.id)}
                    style={{
                      padding: '6px 10px',
                      background: 'transparent',
                      border: '0.5px solid var(--border)',
                      borderRadius: 999,
                      color: 'var(--text-secondary)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      letterSpacing: '1.4px',
                      textTransform: 'uppercase',
                      fontWeight: 600,
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    {vinnerNavn ? 'Endre' : 'Sett'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {erAdmin &&
        maler.map(mal => {
          const v = vinnerForMal(mal.id)
          return (
            <SetVinnerModal
              key={mal.id}
              aapen={apentMalId === mal.id}
              setAapen={b => setApentMalId(b ? mal.id : null)}
              malId={mal.id}
              malNavn={mal.navn}
              aar={aar}
              medlemmer={medlemmer}
              arrangementer={arrangementer}
              eksisterendeVinner={
                v
                  ? {
                      profil_id: v.profil_id ?? undefined,
                      arrangement_id: v.arrangement_id ?? undefined,
                      begrunnelse: v.begrunnelse ?? undefined,
                    }
                  : undefined
              }
            />
          )
        })}
    </>
  )
}
