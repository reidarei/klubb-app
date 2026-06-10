'use client'

import type { CSSProperties } from 'react'

type Option<V extends string> = {
  value: V
  label: string
}

type Props<V extends string> = {
  value: V
  onChange: (value: V) => void
  options: Option<V>[]
}

export default function Segment<V extends string>({ value, onChange, options }: Props<V>) {
  return (
    <div
      style={{
        display: 'flex',
        borderTop: '0.5px solid var(--border-subtle)',
        borderBottom: '0.5px solid var(--border-subtle)',
      }}
      role="tablist"
    >
      {options.map((opt, i) => {
        const aktiv = opt.value === value
        const cellStyle: CSSProperties = {
          flex: 1,
          padding: '10px 0',
          textAlign: 'center',
          fontFamily: 'var(--font-display)',
          fontSize: 14,
          fontWeight: 500,
          color: aktiv ? 'var(--text-primary)' : 'var(--text-tertiary)',
          background: 'transparent',
          border: 'none',
          borderLeft: i === 0 ? 'none' : '0.5px solid var(--border-subtle)',
          cursor: 'pointer',
          position: 'relative',
        }
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={aktiv}
            onClick={() => onChange(opt.value)}
            style={cellStyle}
          >
            {opt.label}
            {aktiv && (
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  bottom: -1,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 24,
                  height: '1.5px',
                  background: 'var(--accent)',
                }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
