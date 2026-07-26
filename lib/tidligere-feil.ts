// Feiltekst og retry-lenke for /tidligere når én eller flere kilder
// (arrangementer/meldinger/polls) feiler under henting. Ren modul — ingen
// React/Supabase-avhengighet — slik at den kan enhetstestes uten mocks.
// Se #492.

import { BESTEMT_FORM, type TidligereFilter } from '@/lib/tidligere-filter'

export type TidligereKilde = 'arrangement' | 'melding' | 'poll'

// Det ENE unntaket fra BESTEMT_FORM-oppslaget: arrangement-kilden dekker to
// arrangementstyper (møte/tur), så med filter=alle må teksten nevne begge.
// BESTEMT_FORM['alle'] er 'innholdet' — riktig for tom-tilstanden, men for
// vagt her når vi vet at det nettopp er arrangement-spørringen som feilet.
const ARRANGEMENT_ALLE_EMNE = 'møtene og turene'

// Bøyningen eies av TIDLIGERE_FILTRE (lib/tidligere-filter.ts) — aldri
// hardkod formene på nytt her, da får vi to steder å redigere norsk grammatikk
// og bare det ene vises.
function emneFor(kilde: TidligereKilde, filter: TidligereFilter): string {
  // 'melding'/'poll' finnes som både kilde- og filterverdi, så oppslaget kan
  // gjøres direkte på kilden — teksten er den samme uansett aktivt filter.
  if (kilde === 'melding' || kilde === 'poll') return BESTEMT_FORM[kilde]
  if (filter === 'moete' || filter === 'tur') return BESTEMT_FORM[filter]
  return ARRANGEMENT_ALLE_EMNE
}

// Genererer feilteksten som vises i TidligereFeilBanner. Én feilet kilde gir
// en presis melding («Fikk ikke tak i meldingene akkurat nå.») — en generisk
// tekst ville vært direkte usann ved aktivt filter: med ?type=melding og
// feilet meldingsspørring lastet *ingenting*, ikke «deler». Flere feilede
// kilder faller tilbake til en samlet tekst siden emnet da blir uklart.
export function feilTekst(feilende: TidligereKilde[], filter: TidligereFilter): string | null {
  if (feilende.length === 0) return null
  if (feilende.length === 1) {
    return `Fikk ikke tak i ${emneFor(feilende[0], filter)} akkurat nå.`
  }
  return 'Fikk ikke tak i alt her.'
}

// Bygger href for «Prøv igjen»-lenka. Bevarer BÅDE aktivt filter og gjeldende
// cursor — en retry skal reprodusere samme sidevindu, aldri resette til side
// 1. `tidsstempel` sendes inn (ikke Date.now() internt) slik at funksjonen
// er deterministisk testbar; `r` er en ren cache-buster mot Next sin
// client-side Router Cache og leses aldri av page.tsx.
export function proevIgjenHref(filter: TidligereFilter, cursorStr: string | undefined, tidsstempel: string): string {
  const params = new URLSearchParams()
  if (filter !== 'alle') params.set('type', filter)
  if (cursorStr) params.set('cursor', cursorStr)
  params.set('r', tidsstempel)
  return `/tidligere?${params.toString()}`
}

// ─── UI-INVARIANTER ──────────────────────────────────────────────────────────
// De to reglene under er selve kjernen i #492 og lå tidligere som rene
// betingelser inne i JSX-en, kun beskyttet av en kommentar. Trukket ut hit
// slik at de kan enhetstestes (og mutasjonstestes) på lik linje med
// cursor-gaten i lib/tidligere-cursor.ts.

// Skal «Her stopper løypa / Ingen X i historikken»-teksten vises?
// Kun når siden er reelt tom OG ingen kilde feilet: med filter=alle kan
// antallet være 0 fordi to kilder er uttømte mens den tredje feilet — da ville
// tom-teksten vært en falsk «uttømt»-påstand som skjulte feilen. Feilbanneret
// skal være eneste signal i det tilfellet.
export function visTomTekst(antallPaaSiden: number, harFeil: boolean): boolean {
  return antallPaaSiden === 0 && !harFeil
}

// Hva skal ligge i slotten nederst på lista? «Last mer» og «Prøv igjen» deler
// plass og er gjensidig utelukkende ved konstruksjon (byggNesteCursor gir null
// når en aktiv kilde feilet — se lib/tidligere-cursor.ts, hvor den regelen er
// mutasjonstestet). Prioriteringen her speiler JSX-en 1:1 og er bevisst ikke
// et nytt vern: eier vi mutual exclusion to steder, får vi to sannheter som
// kan drifte fra hverandre.
export function bunnSlot(
  nesteCursor: string | null,
  retryHref: string | null,
): 'last-mer' | 'proev-igjen' | 'ingen' {
  if (nesteCursor) return 'last-mer'
  if (retryHref) return 'proev-igjen'
  return 'ingen'
}
