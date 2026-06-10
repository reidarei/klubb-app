'use client'

import React from 'react'

export default function TurFelt({
  felt,
  label,
  type = 'text',
  hemmelig,
  onToggle,
  defaultValue,
}: {
  felt: string
  label: string
  type?: string
  hemmelig: boolean
  onToggle: () => void
  defaultValue?: string | number
}) {
  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-elevated-2)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    borderRadius: '0.75rem',
    padding: '0.75rem 1rem',
    width: '100%',
    fontSize: '1rem',
    fontFamily: 'inherit',
  }

  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </label>

      <div className="flex gap-2 mb-2">
        <button
          type="button"
          onClick={() => hemmelig && onToggle()}
          className="flex-1 py-1.5 rounded-xl text-xs font-semibold transition-colors"
          style={{
            background: !hemmelig ? 'var(--accent)' : 'var(--bg-elevated)',
            border: `1px solid ${!hemmelig ? 'var(--accent)' : 'var(--border)'}`,
            color: !hemmelig ? '#fff' : 'var(--text-secondary)',
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          Oppgi
        </button>
        <button
          type="button"
          onClick={() => !hemmelig && onToggle()}
          className="flex-1 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
          style={{
            background: hemmelig ? 'var(--bg-tertiary)' : 'var(--bg-elevated)',
            border: `1px solid ${hemmelig ? 'rgba(255,255,255,0.15)' : 'var(--border)'}`,
            color: hemmelig ? 'var(--text-secondary)' : 'var(--text-tertiary)',
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              background: 'var(--bg)',
              width: '3.5rem',
              height: '0.75em',
              borderRadius: '2px',
              border: '1px solid rgba(255,255,255,0.15)',
            }}
          />
          Hemmelig
        </button>
      </div>

      {!hemmelig && (
        <input
          name={felt}
          type={type}
          min={type === 'number' ? 0 : undefined}
          defaultValue={defaultValue}
          style={inputStyle}
        />
      )}
    </div>
  )
}
