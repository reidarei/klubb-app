'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SkjemaGruppe, SkjemaRad, RadInput, LagreKnapp } from '@/components/ui/Skjema'
import { PilleKnapp } from '@/components/ui/TreffPille'
import { KART_SYMBOL_NAVN_MAKS, KART_SYMBOL_EMOJI_MAKS } from '@/lib/konstanter'
import { lagreKartSymbol } from './actions'

type Props = {
  symbol: string
  /** Løpenummer på siden. Gir boksen en nøytral overskrift — navnet er det man redigerer. */
  nummer: number
  etikett: string
  emoji: string
  /** Registerets standard (lib/klubb-symboler.ts) — for «Tilbake til standard». */
  standardEtikett: string
  standardEmoji: string
}

export default function KartSymbolSkjema({
  symbol,
  nummer,
  etikett,
  emoji,
  standardEtikett,
  standardEmoji,
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

  return (
    <div>
      <SkjemaGruppe
        // Ikke navnet som overskrift: det står allerede i Navn-feltet rett under,
        // og overskriften ville skiftet mens man skriver.
        tittel={`Alarm ${nummer}`}
        hjelp={`Varselet heter «${(navn.trim() || standardEtikett).toUpperCase()} ALERT!»`}
        feil={feil}
      >
        <SkjemaRad etikett="Symbol">
          <RadInput
            value={tegn}
            onChange={e => setTegn(e.target.value)}
            maxLength={KART_SYMBOL_EMOJI_MAKS}
            aria-label={`Emoji for ${etikett}`}
            data-testid={`kart-symbol-emoji-${symbol}`}
            style={{ fontSize: 22 }}
          />
        </SkjemaRad>
        <SkjemaRad etikett="Navn">
          <RadInput
            value={navn}
            onChange={e => setNavn(e.target.value)}
            maxLength={KART_SYMBOL_NAVN_MAKS}
            aria-label={`Navn på ${etikett}`}
            data-testid={`kart-symbol-navn-${symbol}`}
          />
        </SkjemaRad>
      </SkjemaGruppe>

      <div style={{ marginTop: -8, marginBottom: 28 }}>
        <LagreKnapp onClick={() => lagre(navn, tegn)} endret={endret} lagrer={lagrer} lagret={lagret} />
        {!erStandard && (
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center' }}>
            <PilleKnapp
              type="button"
              onClick={() => lagre(standardEtikett, standardEmoji)}
              disabled={lagrer}
              pilleStil={{
                display: 'inline-block',
                padding: '8px 14px',
                borderRadius: 999,
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                fontWeight: 500,
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '0.5px solid var(--border)',
              }}
              synligHoyde={34}
            >
              Tilbake til {standardEmoji} {standardEtikett}
            </PilleKnapp>
          </div>
        )}
      </div>
    </div>
  )
}
