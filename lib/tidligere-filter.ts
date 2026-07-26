// Type-filter for /tidligere-siden — lar brukeren begrense historikken til
// én innholdstype (møte, tur, melding, poll) i stedet for alt blandet.
// Issue #487.

// `tomTekst` er substantivet som brukes i «Ingen … i historikken.» — holdes som
// eget felt i stedet for å lowercase etiketten i render, slik at oppslaget kan
// gjøres i et Record uten non-null-assertion.
export const TIDLIGERE_FILTRE = [
  { verdi: 'alle', etikett: 'Alle', tomTekst: 'innhold' },
  { verdi: 'moete', etikett: 'Møter', tomTekst: 'møter' },
  { verdi: 'tur', etikett: 'Turer', tomTekst: 'turer' },
  { verdi: 'melding', etikett: 'Meldinger', tomTekst: 'meldinger' },
  { verdi: 'poll', etikett: 'Poller', tomTekst: 'poller' },
] as const

export type TidligereFilter = (typeof TIDLIGERE_FILTRE)[number]['verdi']

// Oppslagstabell for tom-tilstanden. Record-typen gjør at TypeScript krever en
// verdi for hver TidligereFilter — nytt filter uten tomTekst gir kompileringsfeil.
export const TOM_TEKST: Record<TidligereFilter, string> = Object.fromEntries(
  TIDLIGERE_FILTRE.map(f => [f.verdi, f.tomTekst]),
) as Record<TidligereFilter, string>

const GYLDIGE_VERDIER = new Set<string>(TIDLIGERE_FILTRE.map(f => f.verdi))

// Whitelist-oppslag. Dette er sikkerhetskritisk: verdien ender opp i et
// `.eq('type', …)`-kall mot arrangement-spørringen, så alt som ikke er en
// av de fem kjente verdiene MÅ falle tilbake til 'alle' — samme klasse
// injection-flate som cursor-verdiene i lib/tidligere-cursor.ts.
export function parseFilter(s: string | undefined): TidligereFilter {
  if (s && GYLDIGE_VERDIER.has(s)) return s as TidligereFilter
  return 'alle'
}

// Avgjør om en gitt kilde (arrangement/melding/poll) skal hentes for det
// aktive filteret. 'alle' henter alt; ellers kun kilden filteret peker på.
export function skalHente(filter: TidligereFilter, kilde: 'arrangement' | 'melding' | 'poll'): boolean {
  if (filter === 'alle') return true
  if (filter === 'moete' || filter === 'tur') return kilde === 'arrangement'
  return filter === kilde
}

// Mapper filteret til arrangementstype-verdien i DB-enumet, eller null hvis
// filteret ikke skal begrense arrangement-spørringen (alle/melding/poll).
export function arrangementstypeFor(filter: TidligereFilter): 'moete' | 'tur' | null {
  if (filter === 'moete' || filter === 'tur') return filter
  return null
}
