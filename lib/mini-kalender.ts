// Ren logikk for MiniKalender (#429) — ingen React, ingen side-effekter.
// Skilt ut slik at logikken kan enhetstestes uten DOM-oppsett.

import { startOfMonth, endOfMonth, eachDayOfInterval, getISODay, format } from 'date-fns'

/**
 * Bygg flat grid for en måned med mandag-først-layout.
 *
 * Returnerer en flat liste der:
 * - De første getISODay(1. dag) - 1 elementene er null (tomme celler
 *   for mandag–dagen-før-1.)
 * - Resten er yyyy-MM-dd-nøkler for hver dag i måneden
 *
 * Eksempel: juli 2026 starter på onsdag (ISO day 3) → 2 null-celler,
 * deretter '2026-07-01' .. '2026-07-31'.
 */
export function byggMaanedsGrid(aar: number, maaned0: number): (string | null)[] {
  const foersteDag = startOfMonth(new Date(aar, maaned0, 1))

  // getISODay: 1 = mandag, 7 = søndag. Ledende null-celler = ISO-dag - 1,
  // fordi mandag (dag 1) trenger 0 tomme celler, søndag (dag 7) trenger 6.
  const forskyvning = getISODay(foersteDag) - 1

  const dager = eachDayOfInterval({ start: foersteDag, end: endOfMonth(foersteDag) })

  return [
    ...Array<null>(forskyvning).fill(null),
    ...dager.map(d => format(d, 'yyyy-MM-dd')),
  ]
}

/**
 * Returnerer true dersom dagNokkel finnes i datoSett.
 * Holder lookup-logikken i logikk-laget — enkelt å teste isolert.
 */
export function harInnhold(dagNokkel: string, datoSett: Set<string>): boolean {
  return datoSett.has(dagNokkel)
}
