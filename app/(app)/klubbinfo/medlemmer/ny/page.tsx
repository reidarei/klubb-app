'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import SkjemaBar from '@/components/ui/SkjemaBar'
import SkjemaSeksjon from '@/components/ui/SkjemaSeksjon'

const labelStil: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 9.5,
  fontWeight: 600,
  color: 'var(--text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '1.6px',
  marginBottom: 4,
}

const inputBaseStil: React.CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: 'none',
  outline: 'none',
  padding: 0,
  fontFamily: 'var(--font-body)',
  fontSize: 14,
  color: 'var(--text-primary)',
  lineHeight: 1.5,
}

const accentInputStil: React.CSSProperties = {
  ...inputBaseStil,
  fontFamily: 'var(--font-display)',
  fontSize: 19,
  fontWeight: 500,
  letterSpacing: '-0.3px',
  color: 'var(--accent)',
}

function Rad({
  children,
  last,
}: {
  children: React.ReactNode
  last?: boolean
}) {
  return (
    <div
      style={{
        padding: '10px 4px',
        borderBottom: last ? 'none' : '0.5px solid var(--border-subtle)',
      }}
    >
      {children}
    </div>
  )
}

export default function NyttMedlem() {
  const [navn, setNavn] = useState('')
  const [epost, setEpost] = useState('')
  const [laster, setLaster] = useState(false)
  const [feil, setFeil] = useState('')
  const [opprettet, setOpprettet] = useState<{ passord: string } | null>(null)
  const router = useRouter()

  async function handleOpprett() {
    if (!navn || !epost) {
      setFeil('Fyll inn navn og e-post')
      return
    }
    setLaster(true)
    setFeil('')

    const res = await fetch('/api/admin/opprett-medlem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ navn, epost }),
    })

    const data = await res.json()
    setLaster(false)

    if (!res.ok) {
      setFeil(data.feil ?? 'Noe gikk galt')
    } else {
      setOpprettet({ passord: data.passord })
    }
  }

  if (opprettet) {
    return (
      <div style={{ padding: '0 20px 20px' }}>
        <header style={{ marginTop: 12, marginBottom: 24 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--success)',
              letterSpacing: '1.6px',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            Medlem opprettet
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 32,
              fontWeight: 500,
              letterSpacing: '-0.4px',
              lineHeight: 1.05,
              margin: 0,
              color: 'var(--text-primary)',
            }}
          >
            {navn} er med i klubben
          </h1>
        </header>

        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            lineHeight: 1.55,
            color: 'var(--text-secondary)',
            marginBottom: 24,
          }}
        >
          En velkomst-e-post med innloggingsinfo er sendt til {epost}. Du trenger ikke gjøre mer.
        </p>

        <SkjemaSeksjon label="Innloggingsinfo">
          <Rad>
            <div style={labelStil}>E-post</div>
            <div style={{ ...inputBaseStil, fontFamily: 'var(--font-mono)' }}>{epost}</div>
          </Rad>
          <Rad last>
            <div style={labelStil}>Midlertidig passord</div>
            <div
              style={{
                ...inputBaseStil,
                fontFamily: 'var(--font-mono)',
                color: 'var(--accent)',
                fontWeight: 600,
                letterSpacing: '1.5px',
              }}
            >
              {opprettet.passord}
            </div>
          </Rad>
        </SkjemaSeksjon>

        <button
          type="button"
          onClick={() => router.push('/klubbinfo/medlemmer')}
          style={{
            marginTop: 8,
            width: '100%',
            padding: '14px 0',
            borderRadius: 999,
            background: 'var(--accent)',
            color: '#0a0a0a',
            border: 'none',
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Tilbake til medlemslisten
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <SkjemaBar
        overtittel="Nytt"
        tittel="Medlem"
        onAvbryt={() => router.back()}
        onLagre={handleOpprett}
        lagreLabel="Opprett"
        laster={laster}
      />

      <SkjemaSeksjon label="Kontaktinfo">
        <Rad>
          <div style={labelStil}>Navn</div>
          <input
            type="text"
            value={navn}
            onChange={e => setNavn(e.target.value)}
            placeholder="Fornavn Etternavn"
            style={accentInputStil}
            required
          />
        </Rad>
        <Rad last>
          <div style={labelStil}>E-post</div>
          <input
            type="email"
            value={epost}
            onChange={e => setEpost(e.target.value)}
            placeholder="gutt@epost.no"
            style={inputBaseStil}
            required
          />
        </Rad>
      </SkjemaSeksjon>

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
            marginTop: 12,
          }}
        >
          {feil}
        </div>
      )}

      <p
        style={{
          marginTop: 16,
          fontFamily: 'var(--font-body)',
          fontSize: 12,
          color: 'var(--text-tertiary)',
          lineHeight: 1.5,
        }}
      >
        En velkomst-e-post med midlertidig passord sendes til medlemmet. Passordet kan endres under «Rediger profil».
      </p>
    </div>
  )
}
