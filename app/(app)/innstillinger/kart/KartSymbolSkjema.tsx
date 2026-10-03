'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PilleKnapp } from '@/components/ui/TreffPille'
import { KART_SYMBOL_NAVN_MAKS, KART_SYMBOL_EMOJI_MAKS } from '@/lib/konstanter'
import { lagreKartSymbol } from './actions'

type Props = {
  symbol: string
  etikett: string
  emoji: string
  /** Registerets standard (lib/klubb-symboler.ts) — for «Tilbake til standard». */
  standardEtikett: string
  standardEmoji: string
  siste: boolean
}

const feltStil = {
  background: 'var(--bg-elevated-2)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)',
  fontSize: 16, // 16 px: under det zoomer iOS inn ved fokus
  padding: '10px 12px',
} as const

export default function KartSymbolSkjema({
  symbol,
  etikett,
  emoji,
  standardEtikett,
  standardEmoji,
  siste,
}: Props) {
  const [navn, setNavn] = useState(etikett)
  const [tegn, setTegn] = useState(emoji)
  const [feil, setFeil] = useState<string | null>(null)
  const [lagret, setLagret] = useState(false)
  const [lagrer, startLagring] = useTransition()
  const router = useRouter()

  const endret = navn.trim() !== etikett || tegn.trim() !== emoji
  const erStandard = navn.trim() === standardEtikett && tegn.trim() === standardEmoji

  function lagre(nyttNavn: string, nyEmoji: string) {
    setFeil(null)
    setLagret(false)
    startLagring(async () => {
      const svar = await lagreKartSymbol(symbol, nyttNavn, nyEmoji)
      if (!svar.ok) {
        setFeil(svar.feil)
        return
      }
      setNavn(nyttNavn.trim())
      setTegn(nyEmoji.trim())
      setLagret(true)
      router.refresh()
    })
  }

  const knappStil = {
    padding: '8px 14px',
    borderRadius: 999,
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    fontWeight: 500,
  } as const

  return (
    <div
      style={{
        padding: '14px 0',
        borderBottom: siste ? 'none' : '0.5px solid var(--border-subtle)',
      }}
    >
      <div style={{ display: 'flex', gap: 10 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 72 }}>
          <span style={etikettStil}>Symbol</span>
          <input
            className="skjemafelt"
            value={tegn}
            onChange={e => setTegn(e.target.value)}
            maxLength={KART_SYMBOL_EMOJI_MAKS}
            aria-label={`Emoji for ${etikett}`}
            data-testid={`kart-symbol-emoji-${symbol}`}
            style={{ ...feltStil, fontSize: 22, textAlign: 'center', width: '100%' }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
          <span style={etikettStil}>Navn</span>
          <input
            className="skjemafelt"
            value={navn}
            onChange={e => setNavn(e.target.value)}
            maxLength={KART_SYMBOL_NAVN_MAKS}
            aria-label={`Navn på ${etikett}`}
            data-testid={`kart-symbol-navn-${symbol}`}
            style={{ ...feltStil, width: '100%' }}
          />
        </label>
      </div>

      <p style={hjelpStil}>
        Varselet heter «{(navn.trim() || standardEtikett).toUpperCase()} ALERT!»
      </p>

      <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <PilleKnapp
          type="button"
          onClick={() => lagre(navn, tegn)}
          disabled={!endret || lagrer}
          pilleStil={{
            ...knappStil,
            display: 'inline-block',
            background: endret ? 'var(--accent)' : 'var(--bg-elevated-2)',
            color: endret ? 'var(--accent-foreground)' : 'var(--text-tertiary)',
            border: '0.5px solid var(--border)',
          }}
          synligHoyde={34}
        >
          {lagrer ? 'Lagrer …' : 'Lagre'}
        </PilleKnapp>
        {!erStandard && (
          <PilleKnapp
            type="button"
            onClick={() => lagre(standardEtikett, standardEmoji)}
            disabled={lagrer}
            pilleStil={{
              ...knappStil,
              display: 'inline-block',
              background: 'transparent',
              color: 'var(--text-secondary)',
              border: '0.5px solid var(--border)',
            }}
            synligHoyde={34}
          >
            Tilbake til {standardEmoji} {standardEtikett}
          </PilleKnapp>
        )}
        {lagret && !endret && (
          <span style={{ ...hjelpStil, margin: 0, color: 'var(--accent)' }}>Lagret</span>
        )}
      </div>

      {feil && (
        <p role="alert" style={{ ...hjelpStil, color: 'var(--danger)' }}>
          {feil}
        </p>
      )}
    </div>
  )
}

const etikettStil = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  fontWeight: 600,
  color: 'var(--text-tertiary)',
  letterSpacing: '1.2px',
  textTransform: 'uppercase',
} as const

const hjelpStil = {
  fontFamily: 'var(--font-body)',
  fontSize: 12,
  color: 'var(--text-tertiary)',
  margin: '8px 0 0',
} as const
