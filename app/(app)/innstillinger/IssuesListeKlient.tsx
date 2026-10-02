'use client'

import { useState } from 'react'
import { formaterDato } from '@/lib/dato'
import { treffflateRundt } from '@/components/ui/Treffflate'

type GitHubIssue = {
  number: number
  title: string
  state: string
  created_at: string
  html_url: string
}

function IssueRad({ issue, i, erLukket }: { issue: GitHubIssue; i: number; erLukket: boolean }) {
  return (
    <a
      href={issue.html_url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between px-4 py-3 text-sm"
      style={{
        background: i % 2 === 0 ? 'var(--bg-elevated)' : 'var(--bg)',
        borderTop: i > 0 ? '1px solid var(--border-subtle)' : undefined,
        textDecoration: 'none',
        color: 'inherit',
        opacity: erLukket ? 0.5 : 1,
      }}
    >
      <div className="flex-1 min-w-0 mr-3">
        <p
          className="font-medium truncate"
          style={{
            color: 'var(--text-primary)',
            textDecoration: erLukket ? 'line-through' : undefined,
          }}
        >
          {issue.title}
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
          #{issue.number} · {formaterDato(issue.created_at, 'd. MMM yyyy')}
        </p>
      </div>
      <span
        className="text-xs px-2 py-0.5 rounded-md shrink-0"
        style={{
          background: erLukket ? 'var(--success-soft)' : 'var(--accent-soft)',
          color: erLukket ? 'var(--success)' : 'var(--accent)',
          fontWeight: 600,
        }}
      >
        {erLukket ? 'Lukket' : 'Åpen'}
      </span>
    </a>
  )
}

const PER_SIDE = 10

// Tekstknapper på ~18 px (12 px × 1,5); utvidelsen er usynlig og kanselleres av negativ margin (#700).
const TEKSTKNAPP_TREFF = treffflateRundt({ hoyde: 16 })

export default function IssuesListeKlient({ aapne }: { aapne: GitHubIssue[] }) {
  const [visLukkede, setVisLukkede] = useState(false)
  const [lukkede, setLukkede] = useState<GitHubIssue[]>([])
  const [side, setSide] = useState(1)
  const [harFlere, setHarFlere] = useState(true)
  const [laster, setLaster] = useState(false)

  async function hentLukkede(pageNr: number) {
    setLaster(true)
    try {
      const res = await fetch(`/api/admin/issues?state=closed&page=${pageNr}&per_page=${PER_SIDE}`)
      const { data } = await res.json() as { data: GitHubIssue[] }
      if (pageNr === 1) {
        setLukkede(data)
      } else {
        setLukkede(prev => [...prev, ...data])
      }
      setHarFlere(data.length === PER_SIDE)
      setSide(pageNr)
    } finally {
      setLaster(false)
    }
  }

  async function toggleLukkede() {
    if (!visLukkede && lukkede.length === 0) {
      await hentLukkede(1)
    }
    setVisLukkede(v => !v)
  }

  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--accent)' }}>
        Ønsker fra gutta ({aapne.length} åpne)
      </h2>

      {aapne.length > 0 ? (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {aapne.map((issue, i) => (
            <IssueRad key={issue.number} issue={issue} i={i} erLukket={false} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Ingen åpne ønsker</p>
        </div>
      )}

      <div className="mt-4">
        <button
          onClick={toggleLukkede}
          disabled={laster}
          className="text-xs font-medium"
          // mb-2 (8 px) inn i marginen: utvidelsen kanselleres av den negative marginen
          style={{ color: 'var(--text-tertiary)', background: 'none', border: 'none', ...TEKSTKNAPP_TREFF.stil, marginBottom: 8 - TEKSTKNAPP_TREFF.utvidY }}
        >
          {laster ? 'Laster…' : visLukkede ? '▾ Skjul lukkede' : '▸ Vis lukkede'}
        </button>

        {visLukkede && lukkede.length > 0 && (
          <>
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              {lukkede.map((issue, i) => (
                <IssueRad key={issue.number} issue={issue} i={i} erLukket />
              ))}
            </div>
            {harFlere && (
              <button
                onClick={() => hentLukkede(side + 1)}
                disabled={laster}
                className="text-xs font-medium block"
                style={{ color: 'var(--accent)', background: 'none', border: 'none', ...TEKSTKNAPP_TREFF.stil, marginTop: 8 - TEKSTKNAPP_TREFF.utvidY }}
              >
                {laster ? 'Laster…' : 'Vis flere'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
