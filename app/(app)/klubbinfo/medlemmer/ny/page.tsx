'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import SkjemaBar from '@/components/ui/SkjemaBar'
import { SkjemaGruppe, SkjemaRad, RadInput } from '@/components/ui/Skjema'

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

        <SkjemaGruppe tittel="Innloggingsinfo">
          <SkjemaRad etikett="E-post">
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-primary)', overflowWrap: 'anywhere', textAlign: 'right' }}>
              {epost}
            </span>
          </SkjemaRad>
          <SkjemaRad etikett="Midlertidig passord">
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 14,
                color: 'var(--accent)',
                fontWeight: 600,
                letterSpacing: '1.5px',
                overflowWrap: 'anywhere',
                textAlign: 'right',
              }}
            >
              {opprettet.passord}
            </span>
          </SkjemaRad>
        </SkjemaGruppe>

        <button
          type="button"
          onClick={() => router.push('/klubbinfo/medlemmer')}
          style={{
            marginTop: 8,
            width: '100%',
            padding: '14px 0',
            borderRadius: 999,
            background: 'var(--accent)',
            color: 'var(--accent-foreground)',
            border: 'none',
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            fontWeight: 600
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

      <SkjemaGruppe
        tittel="Kontaktinfo"
        hjelp="En velkomst-e-post med midlertidig passord sendes til medlemmet. Passordet kan endres under «Rediger profil»."
        feil={feil}
      >
        <SkjemaRad etikett="Navn">
          <RadInput
            type="text"
            value={navn}
            onChange={e => setNavn(e.target.value)}
            placeholder="Fornavn Etternavn"
            required
            aria-label="Navn"
          />
        </SkjemaRad>
        <SkjemaRad etikett="E-post">
          <RadInput
            type="email"
            value={epost}
            onChange={e => setEpost(e.target.value)}
            placeholder="gutt@epost.no"
            required
            aria-label="E-post"
          />
        </SkjemaRad>
      </SkjemaGruppe>
    </div>
  )
}
