type Props = {
  orientation?: 'horizontal' | 'vertical'
  strong?: boolean
}

export default function HairlineDivider({
  orientation = 'horizontal',
  strong = false,
}: Props) {
  const color = strong ? 'var(--border)' : 'var(--border-subtle)'
  if (orientation === 'vertical') {
    return (
      <span
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: '0.5px',
          alignSelf: 'stretch',
          background: color,
        }}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'block',
        flex: 1,
        height: '0.5px',
        background: color,
      }}
    />
  )
}
