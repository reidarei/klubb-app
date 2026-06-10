export default function Ordsky({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const accent = 'var(--accent)'
  const subtle = 'var(--text-tertiary)'
  const faint = '#2c2c2e'
  const font = "var(--font-inter), 'Inter', system-ui, sans-serif"

  return (
    <svg
      viewBox="0 0 520 300"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
    >
      {/* === STORE ORD === */}
      <text x="4" y="284" fontSize="60" fontWeight="700" fill={accent} fontFamily={font} letterSpacing="-1" opacity="0.7">SVEISEBLIND</text>
      <text x="240" y="298" fontSize="56" fontWeight="700" fill={accent} fontFamily={font} letterSpacing="-1" opacity="0.5">DRITINGS</text>
      <text x="40" y="88" fontSize="44" fontWeight="700" fill={accent} fontFamily={font} opacity="0.6">KANAKKAS</text>
      <text x="406" y="148" fontSize="44" fontWeight="700" fill={accent} fontFamily={font} opacity="0.4">DRITA</text>

      {/* === MELLOMSTORE ORD === */}
      <text x="322" y="82" fontSize="32" fontWeight="600" fill={subtle} fontFamily={font} letterSpacing="1">BRISEN</text>
      <text x="168" y="256" fontSize="34" fontWeight="700" fill={accent} fontFamily={font} opacity="0.35">PÅ EN SNURR</text>
      <text x="90" y="148" fontSize="30" fontWeight="600" fill={subtle} fontFamily={font}>MØKINGS</text>
      <text x="186" y="136" fontSize="26" fontWeight="600" fill={subtle} fontFamily={font}>SVINGSTANG</text>
      <text x="318" y="136" fontSize="26" fontWeight="600" fill={subtle} fontFamily={font}>AMØBE</text>
      <text x="400" y="174" fontSize="26" fontWeight="600" fill={subtle} fontFamily={font}>DILL</text>
      <text x="394" y="106" fontSize="28" fontWeight="700" fill={accent} fontFamily={font} opacity="0.45">FULL</text>
      <text x="148" y="232" fontSize="24" fontWeight="600" fill={subtle} fontFamily={font}>GLADFULL</text>
      <text x="32" y="240" fontSize="20" fontWeight="500" fill={subtle} fontFamily={font}>BEDUGG ET</text>

      {/* === SMÅ ORD === */}
      <text x="196" y="156" fontSize="14" fontWeight="500" fill={faint} fontFamily={font}>PANSERDRITA</text>
      <text x="182" y="172" fontSize="12" fontWeight="500" fill={faint} fontFamily={font}>MILD</text>
      <text x="220" y="172" fontSize="11" fontWeight="500" fill={faint} fontFamily={font}>SHITFACED</text>
      <text x="196" y="184" fontSize="11" fontWeight="500" fill={faint} fontFamily={font}>SNITINGS</text>
      <text x="234" y="184" fontSize="11" fontWeight="500" fill={faint} fontFamily={font}>SØRPE FULL</text>
      <text x="228" y="196" fontSize="11" fontWeight="500" fill={faint} fontFamily={font}>GOKANAKKAS!</text>
      <text x="196" y="196" fontSize="10" fontWeight="500" fill={faint} fontFamily={font}>MOPED</text>
      <text x="166" y="184" fontSize="10" fontWeight="500" fill={faint} fontFamily={font}>SYLLEFULL</text>
      <text x="166" y="196" fontSize="10" fontWeight="500" fill={faint} fontFamily={font}>WAWWIN</text>
      <text x="290" y="172" fontSize="11" fontWeight="500" fill={faint} fontFamily={font}>NEDSNØD</text>
      <text x="290" y="184" fontSize="10" fontWeight="500" fill={faint} fontFamily={font}>SOWLETDRITA</text>
    </svg>
  )
}
