// Symbolene en kartmarkering kan ha (#707, #759).
//
// Felles kode; selve symbol-listen bor i lib/klubb-symboler.ts, som er klubbens
// egne data og byttes per instans (se docs/klubb-tilpasning.md). Importen MÅ
// bruke @/-alias: sjekkDivergererEksporter() i scripts/sync-klubb-app.mjs
// finner kravene via @/-importer, og en relativ sti gjør vakten blind (#563).
//
// DB-en har kun et FORMAT-check på symbol (migrasjon 152), så et nytt symbol
// krever ingen migrasjon så lenge id-en matcher '^[a-z][a-z0-9_]{0,23}$'.
// Emojien bor her, ikke i DB-en: nøkkelen lagres, så tegnet kan byttes uten
// datamigrering.

import { KLUBB_SYMBOLER } from '@/lib/klubb-symboler'
import type { KartSymbolHendelse } from '@/lib/logg-hendelser'

/**
 * Varsel til alle andre aktive medlemmer når symbolet settes (#759). `null` for
 * stille «møt meg her»-symboler. Egenskap på symbolet, ikke en if på symbol-id
 * i actionen, så et nytt varslende symbol ikke krever endring andre steder.
 */
type SymbolVarsel = {
  /** Varseltype, lagres i varsel_logg.type og styrer bryteren i varsel_innstillinger. */
  type: string
  /** Tittelen i selve varselet — egen per symbol, ikke delt med et annet. */
  tittel: string
  /** Etikett i admin-kontrollpanelet; lib/varsel-typer.ts avleder Kartet-gruppen herfra (#767). */
  panel: string
  /** Kort navn i varselhistorikken. */
  kort: string
  /** logg.feil()-event når mottakeroppslaget feiler. Literal, ikke komponert — se lib/logg-hendelser.ts. */
  loggMottakere: KartSymbolHendelse
  /** logg.feil()-event når selve sendVarsel()-kallet kaster. */
  loggVarsel: KartSymbolHendelse
}

/** Formen ENHVER klubbs symbolregister (lib/klubb-symboler.ts) må ha. */
type SymbolDef = {
  id: string
  emoji: string
  etikett: string
  varsel: SymbolVarsel | null
}

// `satisfies`, ikke annotasjon: `: readonly SymbolDef[]` ville videt typen og
// drept literal-unionen MarkeringSymbol bygger på. Formen sjekkes likevel.
export const MARKERING_SYMBOLER = KLUBB_SYMBOLER satisfies readonly SymbolDef[]

export type MarkeringSymbol = (typeof MARKERING_SYMBOLER)[number]['id']

/**
 * Ett symbol, med id-en narrowet til registerets verdier — formen forbrukerne
 * skal ta imot. Ikke `(typeof MARKERING_SYMBOLER)[number]`: den unionen snittet
 * med `{ varsel: SymbolVarsel }` kollapser til `never` i en klubb med bare
 * stille symboler, og bygget ryker (#767).
 */
export type KlubbSymbol = Omit<SymbolDef, 'id'> & { id: MarkeringSymbol }

// Partisjonering for symbolvelgerens «Alert zone» (#763), utledet av varsel-
// feltet så et nytt varslende symbol havner i sonen av seg selv. Bevarer
// rekkefølgen. Type-predikatene sparer forbrukerne for null-sjekk av .varsel.
// Går via ALLE (KlubbSymbol[]) fordi den formen tåler at en kategori er tom
// (se KlubbSymbol) — begge kategoriene er valgfrie.
const ALLE: readonly KlubbSymbol[] = MARKERING_SYMBOLER

export const SYMBOLER_STILLE = ALLE.filter(
  (s): s is KlubbSymbol & { varsel: null } => s.varsel === null,
)
export const SYMBOLER_VARSLER = ALLE.filter(
  (s): s is KlubbSymbol & { varsel: SymbolVarsel } => s.varsel !== null,
)

// Første symbol i registeret, ikke en literal — en klubb uten 'ol' ville ellers
// fått en standard som ikke finnes (#767).
export const STANDARD_SYMBOL: MarkeringSymbol = MARKERING_SYMBOLER[0].id

/**
 * Emojien for et symbol. Ukjent verdi (rad skrevet direkte i DB, eller symbol
 * fjernet fra registeret etter bruk) faller til standardsymbolet, ikke tomt felt.
 */
export function symbolEmoji(id: string | null | undefined): string {
  const treff = MARKERING_SYMBOLER.find(s => s.id === id)
  return (treff ?? MARKERING_SYMBOLER[0]).emoji
}

export function erGyldigSymbol(id: string): id is MarkeringSymbol {
  return MARKERING_SYMBOLER.some(s => s.id === id)
}
