'use client'

import { useEffect, useState, useTransition } from 'react'
import Button from '@/components/ui/Button'
import { koblNavnTilMedlem, hentAktiveMedlemmer } from '@/lib/actions/fond'

// Kobler navn fra oppgjøret til medlemmer i appen (#571).
//
// Oppgjøret identifiserer innskytere med et navn fra regnearket. Appen slår
// det opp mot visningsnavn, men de to holdes ikke i sync av noe — bytter et
// medlem kallenavn, eller står det noe annet i arket, matcher det ikke.
//
// I stedet for å blokkere hele importen med «ukjent navn», listes de uavklarte
// navnene her med et nedtrekk. Koblingen lagres og gjelder også neste år, så
// dette er en engangsjobb per navn — ikke noe som må gjøres på nytt hver gang.

type Medlem = { id: string; navn: string; visningsnavn: string | null }

export default function KoblNavn({
  navn,
  onKoblet,
}: {
  navn: string[]
  onKoblet: () => void
}) {
  const [medlemmer, setMedlemmer] = useState<Medlem[]>([])
  const [valg, setValg] = useState<Record<string, string>>({})
  const [feil, setFeil] = useState<string | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    hentAktiveMedlemmer()
      .then(setMedlemmer)
      .catch((e: unknown) =>
        setFeil(e instanceof Error ? e.message : 'Kunne ikke hente medlemmer'),
      )
  }, [])

  const alleValgt = navn.every(n => valg[n])

  function lagre() {
    setFeil(null)
    start(async () => {
      try {
        // Sekvensielt, ikke parallelt: listene er små (typisk 1–3 navn), og en
        // halvveis feil er lettere å forstå når den stopper på ett navn enn når
        // tre skriv feiler samtidig.
        for (const n of navn) {
          await koblNavnTilMedlem(n, valg[n])
        }
        onKoblet()
      } catch (e) {
        setFeil(e instanceof Error ? e.message : 'Kunne ikke lagre koblingen')
      }
    })
  }

  return (
    <div
      style={{
        border: '1px solid var(--warning-border)',
        background: 'var(--warning-soft)',
        borderRadius: 'var(--radius-card)',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
            color: 'var(--warning)',
            fontWeight: 600,
            marginBottom: 6,
          }}
        >
          {navn.length} {navn.length === 1 ? 'navn' : 'navn'} må kobles
        </div>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Disse navnene står i oppgjøret, men matcher ingen medlemmer i appen. Velg
          hvem de tilhører — koblingen huskes til neste år.
        </p>
      </div>

      {navn.map(n => (
        <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              flex: '0 0 38%',
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {n}
          </span>
          <select
            aria-label={`Koble «${n}» til medlem`}
            value={valg[n] ?? ''}
            onChange={e => setValg(v => ({ ...v, [n]: e.target.value }))}
            style={{
              flex: 1,
              minWidth: 0,
              padding: '7px 9px',
              borderRadius: 8,
              border: '0.5px solid var(--border)',
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-body)',
              fontSize: 13.5,
            }}
          >
            <option value="">Velg medlem…</option>
            {medlemmer.map(m => (
              <option key={m.id} value={m.id}>
                {m.visningsnavn ? `${m.visningsnavn} — ${m.navn}` : m.navn}
              </option>
            ))}
          </select>
        </div>
      ))}

      {feil && (
        <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--danger)' }}>
          {feil}
        </p>
      )}

      <Button onClick={lagre} disabled={!alleValgt || pending}>
        {pending ? 'Lagrer…' : 'Lagre koblingene og hent på nytt'}
      </Button>
    </div>
  )
}
