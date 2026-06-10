/**
 * Normaliserer norsk telefonnummer til formatet `+47 NNNNNNNN`. Tar
 * høyde for at noen brukere allerede har skrevet med +47, andre med
 * 0047, og noen bare 8-siffrige numre. Numre som ikke matcher mønsteret
 * (f.eks. utenlandsk) returneres uendret — vi gjør ikke valideringer
 * vi ikke har sikker grunn til.
 */
export function normaliserTelefon(input: string | null | undefined): string | null {
  if (!input) return null
  const trimmet = input.trim()
  if (!trimmet) return null

  // Allerede med +-prefix → la stå (kan være +47 eller utenlandsk)
  if (trimmet.startsWith('+')) return trimmet

  // 00-prefiks (internasjonal alternativ til +)
  if (trimmet.startsWith('00')) {
    return '+' + trimmet.slice(2).trim()
  }

  // 8-siffer (norsk standard) — strip alle ikke-siffre først for å
  // håndtere skrivemåter som "915 83 965" eller "91-58-39-65"
  const bareSiffer = trimmet.replace(/\D/g, '')
  if (bareSiffer.length === 8) {
    return `+47 ${bareSiffer}`
  }

  // Annet format → la stå
  return trimmet
}
