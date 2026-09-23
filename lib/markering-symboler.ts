// Symbolene en kartmarkering kan ha (#707, utvidet med et nytt varslende symbol i #759).
//
// Registeret er delt i to fra #767 (PR 2/4): denne fila er FELLES kode —
// typer, avledning og hjelpefunksjoner — og importerer selve symbol-
// listen fra lib/klubb-symboler.ts, som er klubbens egne data og MENT å
// byttes ut per instans (se docs/klubb-tilpasning.md). Importen bruker
// @/-alias og ikke relativ sti med vilje: sjekkDivergererEksporter() i
// scripts/sync-klubb-app.mjs skanner etter @/-alias-importer for å vite
// hvilke navn en klubb-datafil må eksportere — en relativ import gjør
// vakten blind (samme feilklasse som #563 lukket).
//
// Migrasjon 146/151 listet symbolverdiene eksplisitt i check-constrainten
// kart_markering_symbol_gyldig. Migrasjon 152 bytter den til et FORMAT-
// check (symbol ~ '^[a-z][a-z0-9_]{0,23}$') i stedet for en verdiliste: et
// nytt symbol i lib/klubb-symboler.ts krever dermed ikke lenger noen
// migrasjon, så lenge id-en holder seg innenfor den formen. 146 og 151
// rører vi ikke — se kommentaren i 152 for hvorfor.
//
// Emojien bor HER (i klubbens datafil) og ikke i databasen. Det som lagres
// er nøkkelen ('ol'), slik at tegnet kan byttes uten en datamigrering — og
// fordi et emoji-tegn varierer i bredde og komposisjon mellom plattformer,
// noe som er en presentasjonssak.

import { KLUBB_SYMBOLER } from '@/lib/klubb-symboler'

/**
 * Hva som skjer når et symbol settes, utover selve lagringen: varsel til alle
 * andre aktive medlemmer (#759). `null` for symboler som IKKE varsler — de er
 * «møt meg her»-beskjeder som ikke skal pinge tolv telefoner.
 *
 * Egenskap på symbolet, ikke en if-sjekk på symbol-id i actionen: da hadde
 * hvert nytt symbol som skal varsle krevd at noen husket å utvide den if-en
 * ett sted til. Nå er de fire verdiene — type, tittel, to logg-navn — samlet
 * der de faktisk hører hjemme.
 */
type SymbolVarsel = {
  /** Varseltype, lagres i varsel_logg.type og styrer bryteren i varsel_innstillinger. */
  type: string
  /** Tittelen i selve varselet — egen per symbol, ikke delt med et annet. */
  tittel: string
  /**
   * Etikett i admin-kontrollpanelet (#767). Flyttet ORDRETT hit fra
   * VARSEL_TEKSTER i lib/varsel-typer.ts, som nå avleder Kartet-gruppen av
   * registeret i stedet for å liste den som egne literaler — admin skal
   * ikke se noen tekstendring av flyttingen.
   */
  panel: string
  /** Kort navn i varselhistorikken — samme flytting og samme begrunnelse som panel. */
  kort: string
  /** logg.feil()-event når mottakeroppslaget feiler. Literal, ikke komponert — se lib/logg.ts. */
  loggMottakere: string
  /** logg.feil()-event når selve sendVarsel()-kallet kaster. */
  loggVarsel: string
}

/** Formen ENHVER klubbs symbolregister (lib/klubb-symboler.ts) må ha. */
type SymbolDef = {
  id: string
  emoji: string
  etikett: string
  varsel: SymbolVarsel | null
}

// `satisfies`, ikke en annotert `: readonly SymbolDef[]` — en annotasjon
// ville VIDET typen til SymbolDef[] og drept literal-unionen MARKERING_SYMBOLER[number]['id']
// bygger på under. `satisfies` sjekker at KLUBB_SYMBOLER faktisk oppfyller
// formen (feiler bygget hvis en klubb-datafil mangler et felt), men
// beholder de literale id-/emoji-typene fra `as const` i klubb-symboler.ts.
export const MARKERING_SYMBOLER = KLUBB_SYMBOLER satisfies readonly SymbolDef[]

export type MarkeringSymbol = (typeof MARKERING_SYMBOLER)[number]['id']

/**
 * Ett symbol, med id-en narrowet til registerets egne verdier.
 *
 * Dette er formen forbrukerne skal ta imot — ikke
 * `(typeof MARKERING_SYMBOLER)[number]`, som er en UNION med én konkret
 * objekt-type per symbol i registeret. Partisjoneringen under snittet tidligere den unionen med
 * `{ varsel: SymbolVarsel }`, og det snittet kollapser til `never` i det
 * øyeblikket ingen av unionens medlemmer har et varsel: `.varsel` finnes
 * ikke på `never`, og bygget ryker i varsel-typer.ts og innstillinger/page.tsx
 * — i en klubb som bare har stille symboler (#767-review). Med id-en løftet
 * ut av unionen er det ingen motstridende literal igjen å kollapse på, og
 * `setMarkeringSymbol(sym.id)` beholder likevel den smale typen.
 */
export type KlubbSymbol = Omit<SymbolDef, 'id'> & { id: MarkeringSymbol }

// Partisjonering av registeret for kartets symbolvelger (#763): hvilke
// symboler som havner i "Alert zone"-innrammingen utledes her, av
// varsel-feltet — aldri hardkodet i komponenten som lister opp symbol-id-er.
// Et nytt varslende symbol havner i sonen av seg selv. Begge
// bevarer registerets rekkefølge.
//
// Type-predikatene (i stedet for en enkel s => s.varsel) narrower
// SYMBOLER_VARSLER sitt element-varsel til SymbolVarsel (ikke
// SymbolVarsel | null) — uten det måtte hver forbruker (#767: varsel-typer.ts,
// innstillinger/page.tsx, testene) null-sjekke .varsel på nytt selv om
// filteret allerede har bevist at det ikke er null.
//
// Filtrene går via ALLE (KlubbSymbol[]) og ikke MARKERING_SYMBOLER direkte:
// et type-predikat må være tilordningsbart til PARAMETERENS type, og
// KlubbSymbol er den formen som tåler at en av kategoriene er tom (se
// typedoc over). BEGGE kategoriene er valgfrie — et register kan bestå
// bare av stille symboler, eller bare av varslende.
const ALLE: readonly KlubbSymbol[] = MARKERING_SYMBOLER

export const SYMBOLER_STILLE = ALLE.filter(
  (s): s is KlubbSymbol & { varsel: null } => s.varsel === null,
)
export const SYMBOLER_VARSLER = ALLE.filter(
  (s): s is KlubbSymbol & { varsel: SymbolVarsel } => s.varsel !== null,
)

// Første symbol i klubbens eget register, ikke en literal (#767) — en
// klubb uten 'ol' i lib/klubb-symboler.ts ville ellers fått en standard som
// ikke finnes i dens eget register.
export const STANDARD_SYMBOL: MarkeringSymbol = MARKERING_SYMBOLER[0].id

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
