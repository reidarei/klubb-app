'use client'

import { useTransition } from 'react'
import { oppdaterPaamelding } from '@/lib/actions/paameldinger'
import Card from '@/components/ui/Card'

const valg = [
  { status: 'ja', label: 'Ja', aktiv: 'var(--success)', aktivBg: 'var(--success-subtle)' },
  { status: 'kanskje', label: 'Kanskje', aktiv: 'var(--accent)', aktivBg: 'var(--accent-subtle)' },
  { status: 'nei', label: 'Nei', aktiv: 'var(--destructive)', aktivBg: 'var(--destructive-subtle)' },
] as const

export default function PaameldingKnapper({
  arrangementId,
  minStatus,
}: {
  arrangementId: string
  minStatus?: 'ja' | 'nei' | 'kanskje'
}) {
  const [isPending, startTransition] = useTransition()

  function velg(status: 'ja' | 'nei' | 'kanskje') {
    startTransition(async () => {
      await oppdaterPaamelding(arrangementId, status)
    })
  }

  return (
    <Card>
      <p className="text-[13px] font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>
        Kommer du?
      </p>
      <div className="flex gap-2">
        {valg.map(({ status, label, aktiv, aktivBg }) => {
          const erAktiv = minStatus === status
          return (
            <button
              key={status}
              onClick={() => velg(status)}
              disabled={isPending}
              className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-50"
              style={{
                background: erAktiv ? aktivBg : 'var(--bg)',
                border: `1px solid ${erAktiv ? aktiv : 'var(--border)'}`,
                color: erAktiv ? aktiv : 'var(--text-secondary)',
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>
    </Card>
  )
}
