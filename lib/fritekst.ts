/**
 * Normaliserer et fritekstfelt på en profil (matallergier, stikkord, #685):
 * trim, kollaps indre whitespace til ett mellomrom, kapp til `maks` tegn og
 * gi `null` tilbake for et tomt resultat — «ikke utfylt» skal ha ÉN
 * representasjon i dataene, aldri en tom streng.
 *
 * Generalisering av den tidligere private `normaliserMatallergier()` i
 * `lib/actions/profil.ts` — stikkord ble fritekst i samme runde (#685) og
 * trengte nøyaktig samme regel. Ikke atferdsidentisk med forgjengeren: den
 * kollapset ikke indre whitespace og kappet på UTF-16-enheter. Begge er
 * bevisste forbedringer (se avsnittet under), ikke en ren flytting.
 *
 * Egen fil fordi `'use server'`-filer kun får eksportere async funksjoner
 * (denne er synkron).
 *
 * [...streng] itererer kodepunkter, ikke UTF-16-enheter: det speiler
 * Postgres' char_length i check-constrainten (profiles_stikkord_gyldig,
 * profiles_matallergier_gyldig) og hindrer at et emoji på grensen kappes
 * midt i et surrogatpar.
 */
export function normaliserFritekst(input: string | null | undefined, maks: number): string | null {
  if (!input) return null
  const trimmet = input.trim().replace(/\s+/g, ' ')
  if (!trimmet) return null
  return [...trimmet].slice(0, maks).join('')
}
