// Ren, synkron parser for timeplanlinja (#716). ALDRI kallClaude() — en
// regex løser dette, og en KI-flate til ville gjort docs/ai-act-vurdering.md
// utdatert for en oppgave som ikke trenger den. Ingen avhengigheter.
//
// Klokka leses KUN fra starten av strengen. «Klokkeslett bakerst» støttes
// ikke — det ville doblet regelsettet og skapt tvetydighet mellom «Lunsj på
// Grand 12» og «Vi er 12».
//
// Tre regler bærer designet:
// 1. Klokka må avsluttes av mellomrom eller strengslutt (lookahead
//    `(?=\s|$)`). Det gjør «7:5 middag» trygg — hele matchen ryker i stedet
//    for å gi 07:00 + «:5 middag». Samme vakt gjør «1730middag» til ren tekst
//    (backtracking finner ingen posisjon der klokka avsluttes riktig).
// 2. Valideringsfeil (hh > 23 eller mm > 59) gir HELE den originale strengen
//    tilbake som tekst — aldri halvstrippet. Vi klamper aldri 25:00 til
//    23:00.
// 3. Klokka strippes fra teksten når den ble tolket, ellers leser raden
//    «17:00 17:00 Middag».
//
// Se __tests__/timeplan-parse.test.ts for akseptansekriteriet (testtabellen
// fra arkitekturstyrets runde 2).
const MONSTER =
  /^\s*(?:klokka|klokken|kl\.?)?\s*(\d{1,2})(?:[:.](\d{2})|(\d{2}))?(?=\s|$)\s*(.*)$/i

export type TimeplanTolkning = {
  /** «HH:mm», eller null hvis ingen klokke ble tolket (eller den var ugyldig). */
  klokke: string | null
  /** Beskrivelsen — hele originalstrengen når klokka ikke ble tolket. */
  tekst: string
}

export function parseTimeplanTekst(raw: string): TimeplanTolkning {
  const original = raw.trim()
  const treff = MONSTER.exec(original)
  if (!treff) return { klokke: null, tekst: original }

  const hh = Number(treff[1])
  // Kun én av de to alternative gruppene er satt, avhengig av om «17:00»
  // eller «1700»-formen matchet.
  const mmStr = treff[2] ?? treff[3]
  const mm = mmStr !== undefined ? Number(mmStr) : 0

  if (hh > 23 || mm > 59) return { klokke: null, tekst: original }

  const klokke = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
  return { klokke, tekst: treff[4].trim() }
}
