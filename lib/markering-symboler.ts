// Symbolene en kartmarkering kan ha (#707).
//
// Listen speiles av check-constraint kart_markering_symbol_gyldig (migrasjon
// 146) — legges et symbol til her, må migrasjonen følge etter, ellers avviser
// databasen noe UI-et tilbyr.
//
// Emojien bor HER og ikke i databasen. Det som lagres er nøkkelen ('ol'), slik
// at tegnet kan byttes uten en datamigrering — og fordi et emoji-tegn varierer
// i bredde og komposisjon mellom plattformer, noe som er en presentasjonssak.

export const MARKERING_SYMBOLER = [
  { id: 'ol', emoji: '🍺', etikett: 'Øl' },
  { id: 'mat', emoji: '🍽️', etikett: 'Mat' },
  { id: 'milf', emoji: '💋', etikett: 'Milf' },
] as const

export type MarkeringSymbol = (typeof MARKERING_SYMBOLER)[number]['id']

export const STANDARD_SYMBOL: MarkeringSymbol = 'ol'

/**
 * Emojien for et symbol. Faller tilbake til standardsymbolet for en ukjent
 * verdi — en rad skrevet direkte i databasen, eller et symbol som er fjernet
 * fra listen etter at markeringer allerede brukte det. Bedre enn et tomt felt
 * på kartet, der man ville sett en markering uten å skjønne hva den var.
 */
export function symbolEmoji(id: string | null | undefined): string {
  const treff = MARKERING_SYMBOLER.find(s => s.id === id)
  return (treff ?? MARKERING_SYMBOLER[0]).emoji
}

export function erGyldigSymbol(id: string): id is MarkeringSymbol {
  return MARKERING_SYMBOLER.some(s => s.id === id)
}
