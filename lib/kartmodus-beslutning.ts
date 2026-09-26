import type { NyligStartetArrangementRad } from '@/lib/posisjon'
import { velgReiseTur } from '@/lib/reisemodus'
import { velgMoete } from '@/lib/moetemodus'
import { REISEMODUS, MOETEMODUS } from '@/lib/app-innstillinger'

// Ren beslutningslogikk for kartmodus (#780), skilt ut fra lib/kartmodus.ts
// slik at testene kjører PRODUKSJONSREGELEN — ikke en kopi — uten å mocke
// createServerClient()/cookies(). Egen fil fordi lib/kartmodus.ts drar inn
// next/headers og Supabase-serverklienten ved import (se #780-review).

/**
 * Felles status for reisemodus (#723/#724) og møtemodus (#780) — begge er
 * SAMME unntak fra vanlig navigasjon (fullskjerm kart, «/» → «/kart»), bare
 * med ulik utløser og ulikt vindu. Diskriminert union på `tilgjengelig`,
 * samme argument som ReisemodusStatus hadde (#723-review): er modusen
 * tilgjengelig, GARANTERER unionen et arrangement med sluttid — ingen gren å
 * skrive en gjettet fallback-levetid i.
 */
export type KartmodusStatus =
  | {
      /** Ingen tur eller møte i vinduet, eller ingen av klubb-flaggene er på. */
      tilgjengelig: false
      modus: null
      paa: false
      arrangementId: null
      arrangementTittel: null
      sluttTidspunkt: null
    }
  | {
      tilgjengelig: true
      /** Hvilken av de to modusene som er aktuell — styrer tekst og cookie-navn. */
      modus: 'reise' | 'moete'
      /**
       * tilgjengelig && ikke slått av for DENNE turen/møtet via cookien for
       * modusen. Styrer selve visningen: /kart fullskjerm uten header,
       * «/» → /kart.
       */
      paa: boolean
      arrangementId: string
      arrangementTittel: string
      /** Utløpet på av-cookien — av-valget skal ikke overleve arrangementet. */
      sluttTidspunkt: string
    }

export const KARTMODUS_AV: KartmodusStatus = {
  tilgjengelig: false,
  modus: null,
  paa: false,
  arrangementId: null,
  arrangementTittel: null,
  sluttTidspunkt: null,
}

export type KartmodusInput = {
  rader: NyligStartetArrangementRad[]
  naaIso: string
  /**
   * Klubb-flagg-oppslag. Kalles KUN når en kandidat (tur/møte) faktisk finnes,
   * så en vanlig dag koster ingen ekstra DB-runde. null = ingen rad ⇒ av;
   * kun `true` slår modusen på.
   */
  hentFlagg: (noekkel: string) => Promise<boolean | null>
  /** Verdien i reisemodus-av-cookien (tur-id-en mannen har slått av for), om noen. */
  reiseAvFor: string | undefined
  /** Verdien i møtemodus-av-cookien (møte-id-en mannen har slått av for), om noen. */
  moeteAvFor: string | undefined
}

/**
 * Tur sjekkes FØR møte: pågår en tur MED reisemodus-flagget på, vinner
 * reisemodus alltid — også når mannen selv har slått den av for denne turen
 * (da får han vanlig app, men toggelen står der så han kan gå inn igjen; han
 * havner IKKE i møtemodus). Er reisemodus-flagget av (eller ingen tur i
 * vinduet), sjekkes møte.
 */
export async function avgjoerKartmodus({
  rader,
  naaIso,
  hentFlagg,
  reiseAvFor,
  moeteAvFor,
}: KartmodusInput): Promise<KartmodusStatus> {
  const tur = velgReiseTur(rader, naaIso)
  if (tur && (await hentFlagg(REISEMODUS)) === true) {
    return {
      tilgjengelig: true,
      modus: 'reise',
      paa: reiseAvFor !== tur.id,
      arrangementId: tur.id,
      arrangementTittel: tur.tittel,
      // tur.slutt_tidspunkt er garantert satt av velgReiseTur()s eget predikat.
      sluttTidspunkt: tur.slutt_tidspunkt as string,
    }
  }

  const moete = velgMoete(rader, naaIso)
  if (moete && (await hentFlagg(MOETEMODUS)) === true) {
    return {
      tilgjengelig: true,
      modus: 'moete',
      paa: moeteAvFor !== moete.id,
      arrangementId: moete.id,
      arrangementTittel: moete.tittel,
      sluttTidspunkt: moete.sluttTidspunkt,
    }
  }

  return KARTMODUS_AV
}
