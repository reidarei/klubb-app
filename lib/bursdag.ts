// Ren, IO-fri datoregel for «hvem har bursdag i dag» + alder. Delt mellom
// den automatiske chat-gratulasjonen (lib/actions/bursdagsgratulasjon.ts) og
// det automatiske varselet til alle andre (lib/actions/bursdagsvarsel.ts) for
// å hindre at skuddårsregelen driver mellom dem — men det er KUN
// datoregelen som deles. Det finnes **ingen** kobling mellom gratulasjonen i
// klubbchatten og varselet: varselet går uansett om `profiles.
// bursdagsgratulasjon_aktiv` er av for alle admins, og uansett om posten i
// klubbchatten faktisk ble laget (#638).
//
// lib/agenda-sortering.ts og app/(app)/TidslinjeWrapper.tsx har egne
// bursdagsberegninger uten skuddårsregelen — å samle alle tre er utenfor
// scope for #638, ikke rørt her.

/** Skuddår-regel (gregoriansk kalender). */
export function erSkuddaar(aar: number): boolean {
  return (aar % 4 === 0 && aar % 100 !== 0) || aar % 400 === 0
}

/**
 * Filtrer en liste profiler til de som har bursdag på `iDagIso` (norsk dato,
 * "YYYY-MM-DD"). Matcher MM-DD, med skuddårsregel: en fødselsdato 29. februar
 * treffer 1. mars i et ikke-skuddår.
 */
export function finnBursdagsbarn<T extends { fodselsdato: string | null }>(
  profiler: T[],
  iDagIso: string,
): T[] {
  const [aarStr, mmStr, ddStr] = iDagIso.split('-')
  const dagStr = `${mmStr}-${ddStr}`
  const aar = Number(aarStr)

  return profiler.filter(p => {
    if (!p.fodselsdato) return false
    const [, mm, dd] = p.fodselsdato.split('-')
    const fodselsMmDd = `${mm}-${dd}`

    if (fodselsMmDd === dagStr) return true

    // 29. feb-barn i ikke-skuddår → «bursdag» 1. mars
    if (fodselsMmDd === '02-29' && dagStr === '03-01' && !erSkuddaar(aar)) {
      return true
    }

    return false
  })
}

/**
 * Alder mannen fyller på `iDagIso` (norsk dato, "YYYY-MM-DD"), gitt
 * fødselsdato "YYYY-MM-DD". Ren årstalls-differanse — kalleren har allerede
 * fastslått at `iDagIso` er hans bursdag (via finnBursdagsbarn), så ingen
 * MM-DD-sammenligning trengs her.
 */
export function alderIAar(fodselsdato: string, iDagIso: string): number {
  const fodselsAar = Number(fodselsdato.split('-')[0])
  const iDagAar = Number(iDagIso.split('-')[0])
  return iDagAar - fodselsAar
}
