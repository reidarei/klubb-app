'use client'

import { ALLE_VALG, type ChatProfil } from '@/lib/mention'
import { PilleKnapp } from '@/components/ui/TreffPille'
import { treffflateRundt } from '@/components/ui/Treffflate'

// Litt under målt høyde (~30 px), så skrift-avrunding ikke sender treffflaten under 44.
// Radgapet må dekke BEGGE naboradenes usynlige utvidelse, ellers overlapper chipsene
// når raden brytes (CHIP_RAD_GAP-fella, #508).
const CHIP_SYNLIG_HOYDE = 28
const CHIP_TREFF = treffflateRundt({ hoyde: CHIP_SYNLIG_HOYDE })

type Props = {
  forslag: ChatProfil[]
  onVelg: (navn: string) => void
}

/**
 * Presentational chip-rad over input-feltet for @mention-forslag.
 * Bruksområde: full chat (`Chat.tsx`) og inline kommentar-felt på agenda
 * (`KommentarerPaaKort.tsx`). Holder ingen egen state — kalleren styrer
 * søk og valgt-tekst via `lib/mention.ts`.
 *
 * To subtile valg som er verdt å forklare:
 *
 * 1. `onMouseDown preventDefault` — uten dette mister input-feltet fokus
 *    i det øyeblikket brukeren klikker på chipen. Det fjerner mention-søket
 *    før `onClick` rekker å trigge, og chipen blir effektivt uklikkbar.
 *    `preventDefault` på mousedown holder fokus på input gjennom klikket.
 *
 * 2. `onClick stopPropagation` — agenda-kortene wrapper innholdet i en
 *    `<Link>`, så et chip-klikk uten propagasjons-stopp ville navigert til
 *    detaljsiden. Vi stopper propagasjon her i stedet for å la hver kaller
 *    huske det. (I full chat skader det heller ikke.)
 */
export default function MentionVelger({ forslag, onVelg }: Props) {
  if (forslag.length === 0) return null

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 6, rowGap: CHIP_TREFF.minsteRadGap, marginBottom: 10 }}>
      {forslag.map(p => {
        const erAlle = p.id === ALLE_VALG.id
        return (
          <PilleKnapp
            key={p.id}
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={e => {
              e.preventDefault()
              e.stopPropagation()
              onVelg(p.navn!)
            }}
            pilleStil={{
              padding: '6px 12px',
              borderRadius: 999,
              background: erAlle ? 'var(--accent-soft)' : 'var(--bg-elevated)',
              border: `0.5px solid ${erAlle ? 'var(--accent)' : 'var(--border)'}`,
              color: 'var(--accent)',
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              fontWeight: erAlle ? 600 : 500,
            }}
            synligHoyde={CHIP_SYNLIG_HOYDE}
          >
            @{p.navn}
            {erAlle && (
              <span
                style={{
                  marginLeft: 6,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  letterSpacing: '1.2px',
                  textTransform: 'uppercase',
                  color: 'var(--text-tertiary)',
                }}
              >
                varsler hele klubben
              </span>
            )}
          </PilleKnapp>
        )
      })}
    </div>
  )
}
