// Teksten et medlem får når innspillet hans lukkes (#633). Kilden er
// endringslogg-oppføringen merket `innspill: [<nr>]`, aldri GitHub-
// kommentaren — se CLAUDE.md § Policy: Varsler.
//
// Identitetsfri, deles ordrett med klubb-app.
//
// Versjon, ikke klokkeslett: issuet lukkes etter deploy, så et klokkeslett
// ville vært et gjett; versjonen kan medlemmet finne igjen i endringsloggen.

import type { Endring } from '@/lib/endringslogg'

// Ingen «se det under Innspill»-CTA: samme streng rendres PÅ /innspill.
// Nødløsning når kontrakten er brutt (webhooken logger det som feil) — teksten
// later ikke som alt er i orden, men gir en vei videre.
export const INNSPILL_HANDTERT_TITTEL = 'Takk for innspillet'
export const INNSPILL_HANDTERT_MELDING =
  'Takk for innspillet! Saken er lukket hos oss. Er du usikker på hva som ble gjort, spør i chatten.'

export const INNSPILL_AVSLUTTET_TITTEL = 'Innspillet ditt er avsluttet'
export const INNSPILL_AVSLUTTET_MELDING =
  'Vi har sett på innspillet ditt, men går ikke videre med det nå. Takk for at du sendte det inn.'

export const INNSPILL_PA_PLASS_TITTEL = 'Ønsket ditt er på plass'

// `endringer` er nyeste-først, så ved flere treff vinner det nyeste.
export function finnEndringForInnspill(endringer: Endring[], issueNummer: number): Endring | null {
  return endringer.find(e => e.innspill?.includes(issueNummer)) ?? null
}

// ENESTE kilde til svarteksten — push/innboks og /innspill kaller denne.
// Ny flate som viser svaret: kall funksjonen, ikke bygg en egen variant.
//
// Ingen kutting her: push og varsel-lista klipper selv, og /innspill viser alt.
// Takken står kort og på samme linje som endringen, så den ikke spiser
// 2-linjers-klippet.
export function byggInnspillSvar(
  endring: Endring | null,
  stateReason?: string | null,
): { tittel: string; melding: string } {
  if (endring) {
    return {
      tittel: INNSPILL_PA_PLASS_TITTEL,
      melding: `Takk for innspillet! ${endring.tekst}\n\nUte i appen fra ${endring.versjon}.`,
    }
  }

  if (stateReason === 'not_planned') {
    return { tittel: INNSPILL_AVSLUTTET_TITTEL, melding: INNSPILL_AVSLUTTET_MELDING }
  }

  return { tittel: INNSPILL_HANDTERT_TITTEL, melding: INNSPILL_HANDTERT_MELDING }
}
