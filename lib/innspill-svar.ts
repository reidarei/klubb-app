// Bygger teksten et medlem faktisk får når innspillet hans lukkes (#633).
//
// Den forrige løsningen hentet et 200-tegns utdrag av siste GitHub-kommentar
// — en tekst skrevet til Reidar (PR-numre, arkitekturvalg, notater for
// ettertiden), ikke til medlemmet. Kilden er nå endringslogg-oppføringen som
// er merket med issue-nummeret via `innspill: [<nr>]` i
// lib/endringslogg-data.ts — den er allerede skrevet ikke-teknisk og til
// medlemmene, se #595.
//
// Helt identitetsfri (DIVERGERER ikke — deles ordrett med klubb-app): ingen
// klubbnavn, ingen medlemsnavn.
//
// Issue-malen har både klokkeslett og versjon; vi tar med versjonen og dropper
// klokkeslettet bevisst. Det gamle «live i appen ca. kl. HH:mm» var et gjett
// regnet ut fra webhook-tidspunktet, og med ordningskravet (issuet lukkes
// etter deploy-verifisering) er endringen allerede ute når varselet går —
// da er et framtidig klokkeslett direkte feil. Versjonen er etterprøvbar:
// medlemmet finner den igjen i endringsloggen under Klubb.

import type { Endring } from '@/lib/endringslogg'

// Ingen «trykk for å se det under Innspill»-CTA i brødteksten: pushen har
// allerede knappTekst «Se svaret», og den samme strengen rendres nå ordrett
// PÅ /innspill — der ville en oppfordring om å gå dit vært selvmotsigende.
export const INNSPILL_HANDTERT_TITTEL = 'Takk for innspillet'
export const INNSPILL_HANDTERT_MELDING =
  'Takk for innspillet! Vi har sett på det og lukket saken.'

export const INNSPILL_AVSLUTTET_TITTEL = 'Innspillet ditt er avsluttet'
export const INNSPILL_AVSLUTTET_MELDING =
  'Vi har sett på innspillet ditt, men går ikke videre med det nå. Takk for at du sendte det inn.'

export const INNSPILL_PA_PLASS_TITTEL = 'Ønsket ditt er på plass'

// Finner endringslogg-oppføringen som svarer ut et gitt issue-nummer.
// `endringer` er nyeste-først (se lib/endringslogg-data.ts), så første treff
// er alltid det nyeste — relevant hvis to oppføringer skulle nevne samme
// issue (f.eks. en oppfølging).
export function finnEndringForInnspill(endringer: Endring[], issueNummer: number): Endring | null {
  return endringer.find(e => e.innspill?.includes(issueNummer)) ?? null
}

// ENESTE kilde til teksten medlemmet får — både pushen/innboksen (webhooken)
// og Svar-boksen på /innspill (lib/innspill.ts) kaller denne. Bygger du en ny
// flate som viser svaret, kall funksjonen; ikke sett sammen en egen variant,
// da får medlemmet to ulike svar på samme innspill.
//
// Ren funksjon — ingen kutting i noen gren. Push og varsel-lista klipper selv
// (se VarslerListe.tsx og sw.js), og en tekst skrevet FOR et 2-linjers klipp
// skal ikke også avkortes her. /innspill klipper ikke i det hele tatt, og er
// derfor stedet hele teksten — versjonen inkludert — faktisk kan leses.
//
// Takken står først og KORT, på samme linje som endringsteksten. Reidar ba om
// takk tidlig. En kort takk foran koster noen få tegn og dytter derfor ikke
// selve endringen ut av klippet (varsel-lista viser 2 linjer, iOS 2-4). Hadde
// takken vært en egen setning på egen linje, ville den spist hele klippet og
// medlemmet sett høflighet i stedet for hva han faktisk fikk.
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
