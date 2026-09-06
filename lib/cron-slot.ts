// Delt slot-indeks-utregning for de norske morgen-cron-rutene
// (app/api/cron/paaminne/route.ts og app/api/cron/bursdagsbilde/route.ts).
// Begge rutene kalles av samme GitHub Actions-workflow
// (.github/workflows/paaminne.yml) på UTC-tidene 5, 6, 7, 8 og skal se
// nøyaktig samme slot-nummer for én og samme invokasjon av vinduet.
// Flyttet ut av paaminne/route.ts (#641) — ren utflytting, ingen endring i
// selve utregningen.

/**
 * Beregn slot-indeks fra UTC-time. Cron-tidene er i UTC (5,6,7,8) — å regne
 * fra norsk lokaltid ble feil ved DST-overgang fordi vinter-cron (06 UTC)
 * blir 07 norsk og slotIndex ble 0 i stedet for 1 (se #328-review).
 *   Slot 0: 05 UTC = 07 norsk sommer / 06 norsk vinter
 *   Slot 1: 06 UTC = 08 norsk sommer / 07 norsk vinter ← påminnelses-gating
 *   Slot 2: 07 UTC = 09 norsk sommer / 08 norsk vinter
 *   Slot 3: 08 UTC = 10 norsk sommer / 09 norsk vinter (siste sjanse)
 * Påminnelser sendes derfor alltid kl. 07/08 norsk uansett DST. På vinter
 * faller bursdagsvinduet 06–09 norsk litt utenfor det ideelle 07–10, men
 * siste slot (09 norsk) garanterer fortsatt sending.
 */
export function utledSlotIndex(): number {
  return new Date().getUTCHours() - 5
}

/** Kastet av parseSlotOverride() ved en ugyldig ?slotIndex=-verdi. Kallstedet fanger denne og svarer 400. */
export class UgyldigSlotIndexFeil extends Error {}

/**
 * Valider en manuell `?slotIndex=N`-override (for testing / manuell
 * triggering) mot `[0, totalSlots)`. Returnerer `null` hvis parameteren
 * ikke er satt (bruk da utledSlotIndex()), parsed heltall ved gyldig verdi,
 * eller kaster UgyldigSlotIndexFeil ved en ugyldig verdi.
 */
export function parseSlotOverride(verdi: string | null, totalSlots: number): number | null {
  if (verdi === null) return null
  const n = Number(verdi)
  if (!Number.isInteger(n) || n < 0 || n >= totalSlots) {
    throw new UgyldigSlotIndexFeil(
      `Ugyldig slotIndex: må være heltall i området 0..${totalSlots - 1}`,
    )
  }
  return n
}
