'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import SkjemaBar from '@/components/ui/SkjemaBar'
import Icon from '@/components/ui/Icon'

const textareaStil: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-elevated)',
  border: '0.5px solid var(--border-strong)',
  outline: 'none',
  padding: '16px 18px',
  borderRadius: 14,
  fontFamily: 'var(--font-body)',
  fontSize: 15,
  color: 'var(--text-primary)',
  lineHeight: 1.55,
  resize: 'vertical',
  minHeight: 260,
  boxShadow: 'inset 0 1px 0 var(--border-subtle)',
}

export default function BliUtvikler() {
  const [tekst, setTekst] = useState('')
  const [laster, setLaster] = useState(false)
  const [feil, setFeil] = useState('')
  const [sendt, setSendt] = useState(false)
  const router = useRouter()

  async function handleSend() {
    if (tekst.trim().length < 5) {
      setFeil('Skriv litt mer — hva er det du savner?')
      return
    }
    setLaster(true)
    setFeil('')

    const res = await fetch('/api/bli-utvikler', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tekst }),
    })

    const data = await res.json()
    setLaster(false)

    if (!res.ok) {
      setFeil(data.feil ?? 'Noe gikk galt')
    } else {
      setSendt(true)
    }
  }

  if (sendt) {
    return (
      <div style={{ padding: '0 20px 20px' }}>
        <div
          style={{
            marginTop: 40,
            padding: '32px 24px',
            textAlign: 'center',
            background:
              'radial-gradient(ellipse at top, var(--accent-soft), transparent 70%), var(--bg-elevated)',
            border: '0.5px solid var(--border-strong)',
            borderRadius: 'var(--radius)',
            backdropFilter: 'var(--blur-card)',
            WebkitBackdropFilter: 'var(--blur-card)',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'var(--accent-soft)',
              marginBottom: 18,
            }}
          >
            <Icon name="sparkle" size={24} color="var(--accent)" strokeWidth={1.8} />
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--accent)',
              letterSpacing: '2px',
              textTransform: 'uppercase',
              marginBottom: 10,
            }}
          >
            Mottatt
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 28,
              fontWeight: 500,
              letterSpacing: '-0.4px',
              lineHeight: 1.1,
              margin: 0,
              marginBottom: 10,
              color: 'var(--text-primary)',
            }}
          >
            Takk, Herre
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              color: 'var(--text-secondary)',
              lineHeight: 1.55,
              marginBottom: 26,
            }}
          >
            Ønsket ditt er lagt i ei krokke majjones. Vi ser på det så fort vi får tid.
          </p>
          <button
            type="button"
            onClick={() => router.push('/')}
            style={{
              width: '100%',
              padding: '14px 0',
              borderRadius: 999,
              background: 'var(--accent)',
              color: 'var(--accent-foreground)',
              border: 'none',
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Tilbake til tidslinjen
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <SkjemaBar
        overtittel="Innspill"
        tittel="Til appen"
        onAvbryt={() => router.back()}
        onLagre={handleSend}
        lagreLabel="Send"
        laster={laster}
      />

      <style>{`textarea.innspill-felt::placeholder { color: var(--text-tertiary); opacity: 0.6; }
textarea.innspill-felt:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft), inset 0 1px 0 var(--border-subtle); }`}</style>
      <textarea
        className="innspill-felt"
        value={tekst}
        onChange={e => setTekst(e.target.value)}
        required
        autoFocus
        rows={10}
        placeholder="Skriv her — hva savner du, hva funker ikke, hva skulle du ønske appen kunne?"
        style={textareaStil}
      />

      {feil && (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 12,
            background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
            border: '0.5px solid color-mix(in srgb, var(--danger) 40%, transparent)',
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            color: 'var(--danger)',
          }}
        >
          {feil}
        </div>
      )}
    </div>
  )
}
