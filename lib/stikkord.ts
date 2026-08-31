import { STIKKORD_MAKS_ANTALL, STIKKORD_MAKS_LENGDE } from '@/lib/konstanter'

/**
 * Normaliserer stikkord til en ren liste: splitter på komma eller
 * linjeskift når input er én streng (skjemafeltet er fritekst), trimmer
 * hvert element, kollapser indre whitespace, dropper tomme elementer og
 * dedupliserer case-insensitivt (beholder den første skrivemåten).
 *
 * Kutter framfor å kaste: overskytende lengde/antall trimmes stille ned
 * til grensene i stedet for å avvise hele skjemaet. Regissørens avgjørelse
 * — å kaste her ville også mistet navne- og telefonendringen i samme
 * skjema (#639). DB-constrainten (migrasjon 138) er likevel den egentlige
 * sannheten og kan aldri fyres fra vår egen UI når denne følges.
 */
export function normaliserStikkord(input: string | string[]): string[] {
  const rå = Array.isArray(input) ? input : input.split(/[,\n]/)

  const sett = new Set<string>()
  const resultat: string[] = []

  for (const element of rå) {
    const trimmet = element.trim().replace(/\s+/g, ' ')
    if (!trimmet) continue
    // Kutt FØR dedup-nøkkelen bygges. Kuttes det etterpå, slipper to ulike
    // stikkord som er like de første STIKKORD_MAKS_LENGDE tegnene begge
    // gjennom dedup og blir to identiske chips på medlemssiden.
    //
    // [...streng] itererer kodepunkter, ikke UTF-16-enheter: det treffer
    // samme telling som Postgres' char_length i check-constrainten, og
    // hindrer at et emoji på grensen kappes midt i et surrogatpar.
    const kuttet = [...trimmet].slice(0, STIKKORD_MAKS_LENGDE).join('')
    const nøkkel = kuttet.toLowerCase()
    if (sett.has(nøkkel)) continue
    sett.add(nøkkel)
    resultat.push(kuttet)
    if (resultat.length >= STIKKORD_MAKS_ANTALL) break
  }

  return resultat
}

/** Motsatt vei — fyller et fritekstfelt fra en lagret stikkord-liste. */
export function formaterStikkord(liste: string[]): string {
  return liste.join(', ')
}
