import '@testing-library/jest-dom/vitest'

// Egenkontroll for #754: kjøres i selve worker-prosessen (ikke i skriptet
// som spawner den), FØR noen test i fila rekker å kjøre. Hvis process.env.TZ
// er satt eksplisitt (typisk av npm run test:tz, se scripts/tz-test.mjs),
// men Node likevel har resolvet en annen sone, betyr det at TZ ikke slo
// gjennom til denne prosessen — akkurat den stille svikten #754 handler om.
// Kastes i stedet for å logges: en tidssone-avhengig test som «består» i feil
// sone er verre enn ingen test i det hele tatt.
//
// Trygt selv om __tests__/dato-tidssone-matrise.test.ts og
// __tests__/paaminnelser-tidssone.test.ts muterer process.env.TZ i
// kjøretiden — begge restaurerer synkront (try/finally) før neste test i
// suiten kjører, og TZ og Intl-resolvet sone flytter seg alltid sammen når
// samme prosess endrer TZ underveis. Denne sjekken kjører uansett kun ÉN
// gang per testfil, før den filens tester i det hele tatt starter.
if (process.env.TZ !== undefined) {
  const resolvert = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (resolvert !== process.env.TZ) {
    throw new Error(
      `TZ er satt til "${process.env.TZ}", men Intl.DateTimeFormat() resolvet til ` +
        `"${resolvert}" — sonen nådde ikke fram til denne prosessen (#754).`,
    )
  }
}
