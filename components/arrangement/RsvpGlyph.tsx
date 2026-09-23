type GlyphNavn = 'check' | 'question' | 'x' | 'dash'

export default function RsvpGlyph({
  name,
  color,
  size = 14,
}: {
  name: GlyphNavn
  color: string
  size?: number
}) {
  const paths: Record<GlyphNavn, React.ReactNode> = {
    check: <path d="M5 12l5 5 9-11" />,
    question: <path d="M9 9a3 3 0 116 0c0 2-3 2-3 4M12 18h.01" />,
    x: <path d="M6 6l12 12M18 6L6 18" />,
    // dash = «ikke svart» — nøytral horisontal strek (#285).
    // strokeWidth/strokeLinecap arves fra <svg> — ikke dupliser på path.
    dash: <path d="M6 12h12" />,
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}
