// Symbolene en kartmarkering kan ha (#707, babe lagt til i #759).
//
// Listen speiles av check-constraint kart_markering_symbol_gyldig (migrasjon
// 146, utvidet i migrasjon 151) — legges et symbol til her, må migrasjonen
// følge etter, ellers avviser databasen noe UI-et tilbyr.
//
// Emojien bor HER og ikke i databasen. Det som lagres er nøkkelen ('ol'), slik
// at tegnet kan byttes uten en datamigrering — og fordi et emoji-tegn varierer
// i bredde og komposisjon mellom plattformer, noe som er en presentasjonssak.

/**
 * Hva som skjer når et symbol settes, utover selve lagringen: varsel til alle
 * andre aktive medlemmer (#759). `null` for symboler som IKKE varsler — de er
 * «møt meg her»-beskjeder som ikke skal pinge tolv telefoner.
 *
 * Egenskap på symbolet, ikke en `if (symbol === 'milf')` i actionen: da hadde
 * hvert nytt symbol som skal varsle krevd at noen husket å utvide den if-en
 * ett sted til. Nå er de fire verdiene — type, tittel, to logg-navn — samlet
 * der de faktisk hører hjemme.
 */
type SymbolVarsel = {
  /** Varseltype, lagres i varsel_logg.type og styrer bryteren i varsel_innstillinger. */
  type: string
  /** Tittelen i selve varselet — egen per symbol, ikke delt med et annet. */
  tittel: string
  /** logg.feil()-event når mottakeroppslaget feiler. Literal, ikke komponert — se lib/logg.ts. */
  loggMottakere: string
  /** logg.feil()-event når selve sendVarsel()-kallet kaster. */
  loggVarsel: string
}

export const MARKERING_SYMBOLER = [
  { id: 'ol', emoji: '🍺', etikett: 'Øl', varsel: null },
  { id: 'mat', emoji: '🍽️', etikett: 'Mat', varsel: null },
  {
    id: 'milf',
    emoji: '💋',
    etikett: 'Milf',
    varsel: {
      type: 'milf_alert',
      tittel: 'MILF ALERT!',
      loggMottakere: 'kart.milf.mottakere.feilet',
      loggVarsel: 'kart.milf.varsel.feilet',
    },
  },
  {
    id: 'babe',
    emoji: '😍',
    etikett: 'Babe',
    varsel: {
      type: 'babe_alert',
      tittel: 'BABE ALERT!',
      loggMottakere: 'kart.babe.mottakere.feilet',
      loggVarsel: 'kart.babe.varsel.feilet',
    },
  },
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

/** Varsel-oppsettet for et symbol, eller null hvis symbolet ikke varsler noen. */
export function symbolVarsel(id: string): SymbolVarsel | null {
  const treff = MARKERING_SYMBOLER.find(s => s.id === id)
  return treff?.varsel ?? null
}
