'use client'

import { useState, useTransition } from 'react'
import { oppdaterPaamelding } from '@/lib/actions/paameldinger'
import RsvpGlyph from './RsvpGlyph'

type Status = 'ja' | 'kanskje' | 'nei'

const alternativer: Array<{
  id: Status
  label: string
  kort: string
  ikon: 'check' | 'question' | 'x'
}> = [
  { id: 'ja', label: 'Jeg kommer', kort: 'Du er påmeldt', ikon: 'check' },
  { id: 'kanskje', label: 'Kanskje', kort: 'Du er kanskje på', ikon: 'question' },
  { id: 'nei', label: 'Kan ikke', kort: 'Du står over', ikon: 'x' },
]

export default function RsvpBlokk({
  arrangementId,
  minStatus,
}: {
  arrangementId: string
  minStatus?: Status
}) {
  const [redigerer, setRedigerer] = useState(!minStatus)
  const [aktivtSvar, setAktivtSvar] = useState<Status | undefined>(minStatus)
  const [isPending, startTransition] = useTransition()

  const valgt = aktivtSvar && !redigerer

  function velg(status: Status) {
    setAktivtSvar(status)
    setRedigerer(false)
    startTransition(async () => {
      await oppdaterPaamelding(arrangementId, status)
    })
  }

  if (valgt) {
    const v = alternativer.find(a => a.id === aktivtSvar)!
    const isJa = aktivtSvar === 'ja'
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 14px',
          borderRadius: 14,
          background: isJa ? 'var(--accent-soft)' : 'var(--bg-elevated)',
          border: `0.5px solid ${isJa ? 'var(--border-strong)' : 'var(--border)'}`,
          marginBottom: 28,
          opacity: isPending ? 0.7 : 1,
          transition: 'opacity 0.15s',
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            background: isJa ? 'var(--accent)' : 'transparent',
            border: isJa ? 'none' : '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <RsvpGlyph
            name={v.ikon}
            color={
              isJa
                ? '#0a0a0a'
                : aktivtSvar === 'kanskje'
                ? 'var(--text-secondary)'
                : 'var(--text-tertiary)'
            }
          />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: 'var(--text-tertiary)',
              letterSpacing: '1.8px',
              textTransform: 'uppercase',
              marginBottom: 3,
              fontWeight: 600,
            }}
          >
            Ditt svar
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 17,
              fontWeight: 500,
              color: 'var(--text-primary)',
              letterSpacing: '-0.2px',
              lineHeight: 1.1,
            }}
          >
            {v.kort}
          </div>
        </div>

        <button
          onClick={() => setRedigerer(true)}
          style={{
            padding: '8px 14px',
            borderRadius: 999,
            border: '0.5px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: '0.1px',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          Endre
        </button>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-tertiary)',
            letterSpacing: '2px',
            textTransform: 'uppercase',
          }}
        >
          Kommer du?
        </span>
        <span style={{ flex: 1, height: '0.5px', background: 'var(--border-subtle)' }} />
        {aktivtSvar && (
          <button
            onClick={() => setRedigerer(false)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              letterSpacing: '1.8px',
              textTransform: 'uppercase',
              cursor: 'pointer',
              padding: 0,
              fontWeight: 600,
            }}
          >
            Avbryt
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {alternativer.map(a => {
          const erAktiv = aktivtSvar === a.id
          const erJa = a.id === 'ja'
          return (
            <button
              key={a.id}
              disabled={isPending}
              onClick={() => velg(a.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                padding: '14px 6px',
                borderRadius: 14,
                background: erAktiv
                  ? erJa
                    ? 'var(--accent)'
                    : 'var(--bg-elevated)'
                  : 'transparent',
                border: erAktiv
                  ? erJa
                    ? 'none'
                    : '0.5px solid var(--border-strong)'
                  : '1px solid var(--border)',
                color: erAktiv && erJa ? '#0a0a0a' : 'var(--text-primary)',
                fontFamily: 'var(--font-body)',
                cursor: 'pointer',
                transition: 'background 0.15s, border 0.15s',
                opacity: isPending ? 0.6 : 1,
              }}
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: erAktiv && erJa ? 'rgba(10,10,12,0.12)' : 'transparent',
                  border: erAktiv && erJa ? 'none' : '0.5px solid var(--border)',
                }}
              >
                <RsvpGlyph
                  name={a.ikon}
                  color={
                    erAktiv && erJa
                      ? '#0a0a0a'
                      : a.id === 'ja'
                      ? 'var(--accent)'
                      : a.id === 'kanskje'
                      ? 'var(--text-secondary)'
                      : 'var(--text-tertiary)'
                  }
                />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.1px' }}>
                {a.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
