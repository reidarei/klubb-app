// Sortering for medlemslisten på /klubbinfo/medlemmer. Issue #629: veksleknappen
// fantes fra før, men defaulten var alfabetisk — endringen flipper defaulten til
// nærvær, den bygger ikke ny funksjonalitet.

export type MedlemSortering = 'narvaer' | 'alfabetisk'

// Defaulten skal bo her, ikke som literal i useState — ett sted å endre, én
// verdi å pinne i test.
export const STANDARD_SORTERING: MedlemSortering = 'narvaer'

// Modulnivå, ikke useMemo som i PaameldteListe.tsx: dette er en ren funksjon uten
// komponent å henge en hook på, og locale er fast. Collator framfor localeCompare
// fordi den er raskere i en sorteringsløkke.
const collator = new Intl.Collator('nb')

export function sorterMedlemmer<T extends { navn: string; narv: number | null }>(
  liste: T[],
  sortering: MedlemSortering,
): T[] {
  if (sortering === 'alfabetisk') {
    return [...liste].sort((a, b) => collator.compare(a.navn, b.navn))
  }
  // narvaer: synkende på prosent, null lavest. Alfabetisk tiebreak er bevisst —
  // uten den arver «Tidligere» (alle 0 %) og januar (alle null) en rekkefølge
  // som ser tilfeldig ut, og Postgres sin collation er ikke enig med nb på æøå.
  return [...liste].sort((a, b) => {
    const diff = (b.narv ?? -1) - (a.narv ?? -1)
    return diff !== 0 ? diff : collator.compare(a.navn, b.navn)
  })
}
