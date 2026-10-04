'use client'

import { useState, useTransition } from 'react'
import { SkjemaRad, ValgFelt } from '@/components/ui/Skjema'
import { oppdaterTestEpost } from './actions'

// Velger hvilken admin-epost testmodus-varsler rutes til. Selve på/av-
// togglen håndteres av VarselToggle — denne styrer kun beskrivelse-feltet.
export default function TestEpostVelger({
  valgt,
  admins,
}: {
  valgt: string | null
  admins: { navn: string | null; epost: string }[]
}) {
  const [isPending, startTransition] = useTransition()
  const [feil, setFeil] = useState<string | null>(null)
  // Hvis lagret verdi ikke matcher en admin (f.eks. gammel fritekst),
  // viser vi plassholder i stedet for et valgt navn.
  const gyldigValgt = admins.some(a => a.epost === valgt) ? valgt : null

  return (
    // BryterBoks har 12 px sidepadding; raden har sin egen (14 px), så den
    // trekkes ut til kantene. Linjen skiller den fra bryteren over.
    <div style={{ margin: '0 -12px', borderTop: '0.5px solid var(--border-subtle)' }}>
      <SkjemaRad etikett="Test-epost (mottaker i testmodus)">
        <ValgFelt
          value={gyldigValgt ?? ''}
          valg={admins.map(a => ({ verdi: a.epost, etikett: a.navn ?? a.epost }))}
          plassholder="Velg admin…"
          disabled={isPending}
          onChange={e => {
            const epost = e.target.value
            if (!epost) return
            setFeil(null)
            // Feilen fanges her og vises inline. Lot vi den avvise inne i
            // transitionen, ville React 19 sendt den til nærmeste error boundary
            // og byttet ut hele innstillingssiden med feilskjermen.
            startTransition(async () => {
              try {
                const res = await oppdaterTestEpost(epost)
                if (!res.ok) setFeil(res.feil)
              } catch {
                setFeil('Kunne ikke lagre test-epost. Prøv igjen.')
              }
            })
          }}
          aria-label="Velg test-epost for testmodus"
        />
      </SkjemaRad>
      {feil && (
        <p
          role="alert"
          style={{
            margin: '0 14px 10px',
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            color: 'var(--danger)',
            lineHeight: 1.35,
          }}
        >
          {feil}
        </p>
      )}
    </div>
  )
}
