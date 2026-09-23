'use client'

import { useState, useTransition } from 'react'
import MarkdownVisning from '@/components/MarkdownVisning'
import { formaterDato } from '@/lib/dato'
import { oppdaterVedtekt } from '@/lib/actions/vedtekter'
import SkjemaBar from '@/components/ui/SkjemaBar'
import SkjemaSeksjon from '@/components/ui/SkjemaSeksjon'
import SectionLabel from '@/components/ui/SectionLabel'
import Icon from '@/components/ui/Icon'

const labelStil: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 9.5,
  fontWeight: 600,
  color: 'var(--text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '1.6px',
  marginBottom: 6,
}

const inputStil: React.CSSProperties = {
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

const textareaMonoStil: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-elevated)',
  border: '0.5px solid var(--border)',
  color: 'var(--text-primary)',
  borderRadius: 12,
  padding: '12px 14px',
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
  lineHeight: 1.5,
  resize: 'vertical',
  outline: 'none',
}

type Versjon = {
  id: string
  vedtaksdato: string
  endringsnotat: string
  opprettet: string
  profiles: { navn: string } | null
}

export default function VedtektVisning({
  vedtekt,
  erAdmin,
  versjoner,
}: {
  vedtekt: { slug: string; tittel: string; innhold: string; oppdatert: string }
  erAdmin: boolean
  versjoner: Versjon[]
}) {
  const [redigerer, setRedigerer] = useState(false)
  const [innhold, setInnhold] = useState(vedtekt.innhold)
  const [vedtaksdato, setVedtaksdato] = useState('')
  const [endringsnotat, setEndringsnotat] = useState('')
  const [visHistorikk, setVisHistorikk] = useState(false)
  const [feil, setFeil] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleLagre() {
    if (!vedtaksdato || !endringsnotat) {
      setFeil('Fyll inn vedtaksdato og endringsnotat.')
      return
    }
    setFeil('')
    startTransition(async () => {
      await oppdaterVedtekt({ slug: vedtekt.slug, nyttInnhold: innhold, vedtaksdato, endringsnotat })
      setRedigerer(false)
      setVedtaksdato('')
      setEndringsnotat('')
    })
  }

  if (redigerer) {
    return (
      <>
        <SkjemaBar
          overtittel="Rediger"
          tittel={vedtekt.tittel}
          onAvbryt={() => {
            setRedigerer(false)
            setInnhold(vedtekt.innhold)
          }}
          onLagre={handleLagre}
          laster={isPending}
        />

        <SkjemaSeksjon label="Innhold">
          <div style={{ padding: '6px 0' }}>
            <textarea
              value={innhold}
              onChange={e => setInnhold(e.target.value)}
              rows={18}
              style={textareaMonoStil}
            />
          </div>
        </SkjemaSeksjon>

        <SkjemaSeksjon label="Hjemmel">
          <div
            style={{
              padding: '14px 4px',
              borderBottom: '0.5px solid var(--border-subtle)',
            }}
          >
            <div style={labelStil}>Vedtaksdato</div>
            <input
              type="date"
              value={vedtaksdato}
              onChange={e => setVedtaksdato(e.target.value)}
              style={{ ...inputStil, colorScheme: 'dark' }}
              required
            />
          </div>
          <div style={{ padding: '14px 4px' }}>
            <div style={labelStil}>Hva ble endret og hvorfor</div>
            <textarea
              value={endringsnotat}
              onChange={e => setEndringsnotat(e.target.value)}
              rows={3}
              style={{ ...inputStil, resize: 'vertical' }}
              required
              placeholder="Beskriv endringen og hjemmelsgrunnlaget…"
            />
          </div>
        </SkjemaSeksjon>

        {feil && (
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              color: 'var(--danger)',
              padding: '0 4px',
            }}
          >
            {feil}
          </div>
        )}
      </>
    )
  }

  return (
    <>
      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 15,
          lineHeight: 1.65,
          color: 'var(--text-primary)',
          marginBottom: 28,
        }}
      >
        <MarkdownVisning innhold={innhold} />
      </div>

      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--text-tertiary)',
          letterSpacing: '1.4px',
          fontWeight: 600,
          textTransform: 'uppercase',
          marginBottom: 20,
        }}
      >
        Sist oppdatert {formaterDato(vedtekt.oppdatert, 'd. MMMM yyyy')}
      </div>

      {erAdmin && (
        <button
          type="button"
          onClick={() => setRedigerer(true)}
          style={{
            width: '100%',
            padding: '12px 18px',
            background: 'transparent',
            border: '0.5px solid var(--border)',
            borderRadius: 999,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            marginBottom: 28,
          }}
        >
          Rediger
        </button>
      )}

      {versjoner.length > 0 && (
        <section>
          <SectionLabel count={versjoner.length}>Endringshistorikk</SectionLabel>
          <button
            type="button"
            onClick={() => setVisHistorikk(!visHistorikk)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 4px',
              background: 'none',
              border: 'none',
              borderBottom: visHistorikk ? '0.5px solid var(--border-subtle)' : 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              color: 'var(--text-secondary)',
              textAlign: 'left',
            }}
          >
            <span>{visHistorikk ? 'Skjul' : 'Vis'} alle {versjoner.length} endringer</span>
            <div
              style={{
                transform: visHistorikk ? 'rotate(90deg)' : 'none',
                transition: 'transform 120ms',
              }}
            >
              <Icon name="chevron" size={12} color="var(--text-tertiary)" />
            </div>
          </button>

          {visHistorikk && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {versjoner.map((v, i) => (
                <div
                  key={v.id}
                  style={{
                    padding: '14px 4px',
                    borderBottom:
                      i < versjoner.length - 1 ? '0.5px solid var(--border-subtle)' : 'none',
                  }}
                >
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      color: 'var(--accent)',
                      letterSpacing: '1.4px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      marginBottom: 4,
                    }}
                  >
                    {formaterDato(v.vedtaksdato, 'd. MMMM yyyy')}
                    {v.profiles?.navn && ` · ${v.profiles.navn}`}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 13,
                      color: 'var(--text-secondary)',
                      lineHeight: 1.5,
                    }}
                  >
                    {v.endringsnotat}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  )
}
