'use client'

import type { CSSProperties } from 'react'

type Props = {
  on: boolean
  onChange: (on: boolean) => void
  disabled?: boolean
  /** Bred (40×22, default) eller smal (38×22) variant */
  variant?: 'default' | 'rad'
  ariaLabel?: string
}

export default function ToggleSwitch({
  on,
  onChange,
  disabled,
  variant = 'default',
  ariaLabel,
}: Props) {
  const width = variant === 'rad' ? 38 : 40
  const containerStyle: CSSProperties = {
    width,
    height: 22,
    borderRadius: 999,
    background: on ? 'var(--accent)' : 'transparent',
    border: on ? 'none' : '0.5px solid var(--border)',
    position: 'relative',
    cursor: disabled ? 'not-allowed' : 'pointer',
    flexShrink: 0,
    transition: 'background 0.2s',
    opacity: disabled ? 0.5 : 1,
    padding: 0,
  }
  const thumbStyle: CSSProperties = {
    position: 'absolute',
    top: on ? 2 : 1,
    left: on ? width - 20 : 1,
    width: 18,
    height: 18,
    borderRadius: '50%',
    background: on ? '#0a0a0a' : 'var(--text-tertiary)',
    transition: 'left 0.2s, background 0.2s, top 0.2s',
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!on)}
      style={containerStyle}
    >
      <span style={thumbStyle} />
    </button>
  )
}

export function MiniToggle(props: Omit<Props, 'variant'>) {
  return <ToggleSwitch {...props} />
}

export function ToggleRad(props: Omit<Props, 'variant'>) {
  return <ToggleSwitch {...props} variant="rad" />
}
