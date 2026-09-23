// Klubbens egne symboler for kartmarkeringer.
//
// Denne fila er MENT å byttes ut per instans — se lib/markering-symboler.ts
// for formen hvert symbol må ha (SymbolDef) og hva feltene betyr, og
// docs/klubb-tilpasning.md for hvordan. All logikk (typer, symbolEmoji(),
// erGyldigSymbol(), varsel-avledning) bor i lib/markering-symboler.ts og er
// felles kode — denne fila er REN DATA: kun array-literalen.
//
// Formatet på id-en håndheves av migrasjon 152 sin check-constraint
// (symbol ~ '^[a-z][a-z0-9_]{0,23}$') — et nytt symbol her krever ingen
// migrasjon, så lenge id-en holder seg innenfor den formen.
//
// De to siste symbolene har et varsel-felt og pinger derfor ALLE medlemmer når
// noen setter markeringen. Symboler med `varsel: null` er stille. Vil du ikke
// ha varslende symboler i det hele tatt, sett feltet til null — resten av koden
// avleder varseltypene fra registeret og tilpasser seg av seg selv.

export const KLUBB_SYMBOLER = [
  { id: 'ol', emoji: '🍺', etikett: 'Øl', varsel: null },
  { id: 'mat', emoji: '🍽️', etikett: 'Mat', varsel: null },
  {
    id: 'obs1',
    emoji: '🚨',
    etikett: 'Obs 1',
    varsel: {
      type: 'obs1_alert',
      tittel: 'OBS 1!',
      panel: 'Obs 1 (når noen setter en 🚨-markering på kartet)',
      kort: 'Obs 1',
      loggMottakere: 'kart.obs1.mottakere.feilet',
      loggVarsel: 'kart.obs1.varsel.feilet',
    },
  },
  {
    id: 'obs2',
    emoji: '📣',
    etikett: 'Obs 2',
    varsel: {
      type: 'obs2_alert',
      tittel: 'OBS 2!',
      panel: 'Obs 2 (når noen setter en 📣-markering på kartet)',
      kort: 'Obs 2',
      loggMottakere: 'kart.obs2.mottakere.feilet',
      loggVarsel: 'kart.obs2.varsel.feilet',
    },
  },
] as const
