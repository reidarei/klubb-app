export default function MarkdownVisning({ innhold }: { innhold: string }) {
  const linjer = innhold.split('\n')

  function rendrerInline(tekst: string) {
    // Bold: **tekst**
    const deler = tekst.split(/(\*\*[^*]+\*\*)/)
    return deler.map((del, i) => {
      if (del.startsWith('**') && del.endsWith('**')) {
        return <strong key={i} style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{del.slice(2, -2)}</strong>
      }
      if (del.startsWith('*') && del.endsWith('*') && del.length > 2) {
        return <em key={i} style={{ color: 'var(--text-secondary)' }}>{del.slice(1, -1)}</em>
      }
      return <span key={i}>{del}</span>
    })
  }

  const elementer: React.ReactNode[] = []
  let i = 0

  while (i < linjer.length) {
    const linje = linjer[i]

    if (linje.startsWith('# ')) {
      elementer.push(
        <h1 key={i} style={{ color: 'var(--text-primary)', fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.75rem', marginTop: '1rem' }}>
          {linje.slice(2)}
        </h1>
      )
    } else if (linje.startsWith('## ')) {
      elementer.push(
        <h2 key={i} style={{ color: 'var(--accent)', fontSize: '1rem', fontWeight: 600, marginTop: '1.25rem', marginBottom: '0.5rem' }}>
          {linje.slice(3)}
        </h2>
      )
    } else if (linje.startsWith('### ')) {
      elementer.push(
        <h3 key={i} style={{ color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: 600, marginTop: '1rem', marginBottom: '0.25rem' }}>
          {linje.slice(4)}
        </h3>
      )
    } else if (linje.startsWith('- ') || linje.startsWith('* ')) {
      // Samle liste-elementer
      const listeElementer: React.ReactNode[] = []
      while (i < linjer.length && (linjer[i].startsWith('- ') || linjer[i].startsWith('* '))) {
        listeElementer.push(
          <li key={i} style={{ color: 'var(--text-primary)', fontSize: '0.9rem', marginBottom: '0.2rem' }}>
            {rendrerInline(linjer[i].slice(2))}
          </li>
        )
        i++
      }
      elementer.push(
        <ul key={`ul-${i}`} style={{ paddingLeft: '1.25rem', marginBottom: '0.75rem', listStyleType: 'disc' }}>
          {listeElementer}
        </ul>
      )
      continue
    } else if (/^\d+\. /.test(linje)) {
      const listeElementer: React.ReactNode[] = []
      while (i < linjer.length && /^\d+\. /.test(linjer[i])) {
        listeElementer.push(
          <li key={i} style={{ color: 'var(--text-primary)', fontSize: '0.9rem', marginBottom: '0.2rem' }}>
            {rendrerInline(linjer[i].replace(/^\d+\. /, ''))}
          </li>
        )
        i++
      }
      elementer.push(
        <ol key={`ol-${i}`} style={{ paddingLeft: '1.25rem', marginBottom: '0.75rem', listStyleType: 'decimal' }}>
          {listeElementer}
        </ol>
      )
      continue
    } else if (linje.startsWith('---')) {
      elementer.push(<hr key={i} style={{ borderColor: 'var(--border)', margin: '1rem 0' }} />)
    } else if (linje.trim() === '') {
      elementer.push(<div key={i} style={{ height: '0.5rem' }} />)
    } else {
      elementer.push(
        <p key={i} style={{ color: 'var(--text-primary)', lineHeight: '1.7', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
          {rendrerInline(linje)}
        </p>
      )
    }
    i++
  }

  return <div>{elementer}</div>
}
