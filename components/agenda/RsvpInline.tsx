'use client'

// Inline RSVP-knapper for ubesvart-seksjonen på agendaen (#271).
// Kompakt tre-knapper-rad: Ja / Kanskje / Nei.
// Komponenten sitter *utenfor* <Link>-wrapperen i page.tsx, så klikk
// på knappene navigerer ikke til arrangementet (se kommentar under).
// useTransition gir optimistic pending-state uten ekstra setState.

import { useState, useTransition } from 'react'
import { oppdaterPaamelding } from '@/lib/actions/paameldinger'
import RsvpGlyph from '@/components/arrangement/RsvpGlyph'
import Toast from '@/components/ui/Toast'

type Status = 'ja' | 'kanskje' | 'nei'

const knapper: Array<{
  id: Status
  label: string
  ikon: 'check' | 'question' | 'x'
}> = [
  { id: 'ja', label: 'Ja', ikon: 'check' },
  { id: 'kanskje', label: 'Kanskje', ikon: 'question' },
  { id: 'nei', label: 'Nei', ikon: 'x' },
]

export default function RsvpInline({ arrangementId }: { arrangementId: string }) {
  // Optimistic state: sett lokalt med én gang, server-kall i bakgrunnen.
  // Ved feil rulleres tilbake til forrige verdi og vi viser toast.
  const [valgt, setValgt] = useState<Status | null>(null)
  const [feilMelding, setFeilMelding] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function velg(status: Status) {
    const forrige = valgt
    setValgt(status) // optimistisk
    startTransition(async () => {
      try {
        await oppdaterPaamelding(arrangementId, status)
        // revalidatePath('/') i server action sørger for at arrangementet
        // forsvinner fra ubesvart-seksjonen etter at serveren svarer.
      } catch {
        setValgt(forrige) // rull tilbake ved feil
        setFeilMelding('Fikk ikke lagra — prøv igjen')
      }
    })
  }

  return (
    <>
    <Toast melding={feilMelding} onSkjul={() => setFeilMelding(null)} />
    <div
      style={{
        display: 'flex',
        gap: 8,
        padding: '14px 14px 16px',
        // Henger visuelt sammen med ArrangementKort over: samme bakgrunn.
        // Ingen egen borderTop — ArrangementKort har allerede en bunn-border
        // som fungerer som separator. Å legge på borderTop her ga dobbel
        // strek + avkuttet kort-innramming (#275 review-funn).
        background: 'var(--bg-elevated)',
        borderRadius: '0 0 var(--radius-card) var(--radius-card)',
      }}
    >
      {knapper.map(k => {
        const erValgt = valgt === k.id
        const erJa = k.id === 'ja'
        return (
          <button
            key={k.id}
            disabled={isPending}
            onClick={e => {
              // defensiv: hvis noen senere wrapper RsvpInline inni <Link>,
              // unngår vi utilsiktet navigasjon.
              e.preventDefault()
              e.stopPropagation()
              velg(k.id)
            }}
            aria-label={k.label}
            aria-pressed={erValgt}
            aria-busy={isPending}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              // Minste touch-mål 48px — litt rausere enn Apple HIG-minimum (44px)
              // fordi dette er primær-handlingen brukeren må gjøre (#275)
              minHeight: 48,
              borderRadius: 10,
              // Uvalgt: sterkere border + lett bakgrunn gjør knappene mer synlige
              // Valgt Ja: fylt accent (uendret)
              // Valgt Kanskje/Nei: accent-soft bakgrunn + accent-border (#275)
              border: erValgt
                ? erJa
                  ? 'none'
                  : '1px solid var(--accent)'
                : '1px solid var(--border-strong)',
              background: erValgt
                ? erJa
                  ? 'var(--accent)'
                  : 'var(--accent-soft)'
                : 'rgba(255,255,255,0.04)',
              color: erValgt && erJa ? '#0a0a0a' : 'var(--text-primary)',
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              fontWeight: 600,
              cursor: isPending ? 'wait' : 'pointer',
              opacity: isPending ? 0.6 : 1,
              transition: 'background 0.12s, border 0.12s, opacity 0.12s',
            }}
          >
            <RsvpGlyph
              name={k.ikon}
              size={15}
              color={
                erValgt && erJa
                  ? '#0a0a0a'
                  : k.id === 'ja'
                  ? 'var(--accent)'
                  : k.id === 'kanskje'
                  ? 'var(--text-secondary)'
                  : 'var(--text-tertiary)'
              }
            />
            {k.label}
          </button>
        )
      })}
    </div>
    </>
  )
}
