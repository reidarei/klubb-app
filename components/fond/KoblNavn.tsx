'use client'

import { useEffect, useState, useTransition } from 'react'
import { SkjemaGruppe, SkjemaRad, ValgFelt, LagreKnapp } from '@/components/ui/Skjema'
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
    <div>
      <SkjemaGruppe
        tittel={`${navn.length} navn må kobles`}
        hjelp="Disse navnene står i oppgjøret, men matcher ingen medlemmer i appen. Velg hvem de tilhører — koblingen huskes til neste år."
        feil={feil}
      >
        {navn.map(n => (
          <SkjemaRad key={n} etikett={n}>
            <ValgFelt
              aria-label={`Koble «${n}» til medlem`}
              value={valg[n] ?? ''}
              valg={medlemmer.map(m => ({
                verdi: m.id,
                etikett: m.visningsnavn ? `${m.visningsnavn} — ${m.navn}` : m.navn,
              }))}
              plassholder="Velg medlem…"
              onChange={e => setValg(v => ({ ...v, [n]: e.target.value }))}
            />
          </SkjemaRad>
        ))}
      </SkjemaGruppe>

      <LagreKnapp
        onClick={lagre}
        endret={alleValgt}
        lagrer={pending}
        tekst="Lagre koblingene og hent på nytt"
      />
    </div>
  )
}
