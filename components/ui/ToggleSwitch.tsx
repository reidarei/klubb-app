'use client'

import type { CSSProperties } from 'react'
import Treffflate from '@/components/ui/Treffflate'

type Props = {
  on: boolean
  onChange: (on: boolean) => void
  disabled?: boolean
  /** Bred (40×22, default) eller smal (38×22) variant */
  variant?: 'default' | 'rad'
  ariaLabel?: string
  /** Test-krok på selve bryteren — der role="switch" og aria-checked sitter. */
  testId?: string
}

export default function ToggleSwitch({
  on,
  onChange,
  disabled,
  variant = 'default',
  ariaLabel,
  testId,
}: Props) {
  const width = variant === 'rad' ? 38 : 40
  // Selve bryteren (track + thumb) forblir visuelt uendret — <Treffflate>
  // legger et usynlig 44 px treffområde UTENPÅ denne, i stedet for å gjøre
  // selve pillen større (#700). Track og thumb flyttet til en ren
  // visningsdiv; onClick/role/aria-* sitter på Treffflates knapp.
  const trackStyle: CSSProperties = {
    width,
    height: 22,
    borderRadius: 999,
    background: on ? 'var(--accent)' : 'transparent',
    border: on ? 'none' : '0.5px solid var(--border)',
    position: 'relative',
    flexShrink: 0,
    transition: 'background 0.2s',
  }
  const thumbStyle: CSSProperties = {
    position: 'absolute',
    top: on ? 2 : 1,
    left: on ? width - 20 : 1,
    width: 18,
    height: 18,
    borderRadius: '50%',
    background: on ? 'var(--accent-foreground)' : 'var(--text-tertiary)',
    transition: 'left 0.2s, background 0.2s, top 0.2s',
  }

  return (
    <Treffflate
      synlig={{ bredde: width, hoyde: 22 }}
      role="switch"
      data-testid={testId}
      aria-checked={on}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!on)}
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <span style={trackStyle}>
        <span style={thumbStyle} />
      </span>
    </Treffflate>
  )
}

export function MiniToggle(props: Omit<Props, 'variant'>) {
  return <ToggleSwitch {...props} />
}

export function ToggleRad(props: Omit<Props, 'variant'>) {
  return <ToggleSwitch {...props} variant="rad" />
}
