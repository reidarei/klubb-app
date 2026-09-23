type Props = {
  size?: number
}

export default function Monogram({ size = 44 }: Props) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: '1px solid var(--border-strong)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-display)',
        color: 'var(--accent)',
        fontSize: size * 0.42,
        fontWeight: 500,
        letterSpacing: '-1px',
        background:
          'radial-gradient(circle at 30% 30%, var(--accent-soft), transparent 70%)',
      }}
      aria-hidden="true"
    >
      MH
    </div>
  )
}
