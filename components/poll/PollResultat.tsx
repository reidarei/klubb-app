type Valg = { id: string; tekst: string }

type Props = {
  valg: Valg[]
  stemmerPerValg: Map<string, number>
  antallStemmere: number
  mineStemmer: string[]
}

/**
 * Horisontale stolper med prosent. Prosenten beregnes mot antall unike
 * stemmere (ikke antall stemmer totalt) slik at tallene summerer til 100 %
 * for enkeltvalg. For flervalg kan summen overstige 100 % — det er by
 * design og dekker "hvor mange av oss likte hvert alternativ".
 */
export default function PollResultat({
  valg,
  stemmerPerValg,
  antallStemmere,
  mineStemmer,
}: Props) {
  const basis = antallStemmere || 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {valg.map(v => {
        const antall = stemmerPerValg.get(v.id) ?? 0
        const prosent = Math.round((antall / basis) * 100)
        const minStemme = mineStemmer.includes(v.id)

        return (
          <div key={v.id}>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 10,
                marginBottom: 6,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 14,
                  color: 'var(--text-primary)',
                  fontWeight: minStemme ? 600 : 400,
                }}
              >
                {v.tekst}
                {minStemme && (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 10,
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--accent)',
                      letterSpacing: '1.2px',
                      textTransform: 'uppercase',
                    }}
                  >
                    Din
                  </span>
                )}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {antall} · {prosent}%
              </span>
            </div>
            <div
              style={{
                height: 8,
                borderRadius: 4,
                background: 'var(--bg-elevated)',
                overflow: 'hidden',
                border: '0.5px solid var(--border-subtle)',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${prosent}%`,
                  background: minStemme
                    ? 'var(--accent)'
                    : 'linear-gradient(90deg, var(--accent-soft), var(--accent))',
                  transition: 'width 240ms ease-out',
                }}
              />
            </div>
          </div>
        )
      })}
      {antallStemmere === 0 && (
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--text-tertiary)',
            letterSpacing: '0.5px',
            margin: '4px 0',
          }}
        >
          Ingen har stemt ennå.
        </p>
      )}
    </div>
  )
}
