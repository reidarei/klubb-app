// Én kilde for hva hver varseltype heter på norsk — både i kontrollpanelet
// og i varselhistorikken. Ren data uten IO, så også 'use client'-filer
// (VarselLogg) kan importere den.
//
// Kartet-gruppen avledes av SYMBOLER_VARSLER (#767); teksten bor på symbolet
// i lib/markering-symboler.ts, så et nytt varslende symbol får rad her selv.

import { SYMBOLER_VARSLER } from './markering-symboler'

/**
 * `type` (varsel_logg) → `noekkel` (varsel_innstillinger). Kun de tre
 * påminnelses-/purretypene har avvikende navn; resten er identiske.
 */
export function typeTilNoekkel(type: string): string {
  if (type === 'paaminne_7') return 'paaminnelse_7d'
  if (type === 'paaminne_1') return 'paaminnelse_1d'
  if (type === 'purring') return 'purring_aktiv'
  return type
}

type VarselTekst = {
  /**
   * Etikett i kontrollpanelet. Utelates for typer uten bryter (i dag kun
   * bursdagsgratulasjon). Feltet er MARKØREN for «dette er en bryter» — les
   * det via erVarselBryter(), ikke direkte.
   */
  panel?: string
  /** Kort navn i varselhistorikken, der raden også viser mottaker og kanal. */
  kort: string
}

// Panel-etikettene i begge kartene følger én form:
//   1. Hendelsen som substantivfrase — aldri «Varsel ved …».
//   2. Tidspunktet eksplisitt når det finnes («7 dager før», «på purredatoen»).
//   3. I parentes: hvem som får det når det ikke er alle, eller hvilken knapp
//      som utløser det når det er manuelt.
/**
 * Kartet-gruppen, avledet av symbolregisteret (#767). Egen konstant, ikke
 * spread rett inn under, så nøkkelsettene kan sjekkes mot hverandre — i ett
 * objektliteral ville en navnekollisjon stille overstyrt symbolets tekst.
 * Pinnet i __tests__/varsel-typer.test.ts.
 */
export const SYMBOL_TEKSTER: Record<string, VarselTekst> = Object.fromEntries(
  SYMBOLER_VARSLER.map(s => [s.varsel.type, { panel: s.varsel.panel, kort: s.varsel.kort }]),
)

/**
 * Alle varseltyper som IKKE er avledet av symbolregisteret — håndskrevet.
 * **Rekkefølgen her er visningsrekkefølgen** etter Kartet-gruppen (se
 * VARSEL_REKKEFOLGE under) — grupper hører sammen, ikke alfabetisk.
 */
export const OEVRIGE_TEKSTER: Record<string, VarselTekst> = {
  // ── Arrangementer ────────────────────────────────────────────────────────
  nytt_arrangement: { panel: 'Nytt arrangement lagt ut', kort: 'Nytt arrangement' },
  oppdatert: {
    panel: 'Oppdatering av arrangement (fra «Varsle nå»-knappen)',
    kort: 'Arrangement oppdatert',
  },
  paaminnelse_7d: { panel: 'Påminnelse 7 dager før arrangementet', kort: 'Påminnelse 7 dager' },
  paaminnelse_1d: { panel: 'Påminnelse 1 dag før arrangementet', kort: 'Påminnelse 1 dag' },
  purring_aktiv: {
    panel: 'Purring til de som ikke har svart (automatisk 3 dager før)',
    kort: 'Purring uten svar',
  },
  // Egen nøkkel, så manuell purring virker selv om den automatiske er av (#547).
  purring_manuell: {
    panel: 'Purring til de som ikke har svart (fra «Purre disse»-knappen)',
    kort: 'Purring uten svar (manuell)',
  },
  // Egen type, ikke alias for purring_manuell: annen mottakergruppe og annen
  // oppfordring — en kanskje-svarer skal ikke se «Purring uten svar» (#596).
  purring_kanskje: {
    panel: 'Purring til de som har svart kanskje (fra «Bestem dere»-knappen)',
    kort: 'Purring til kanskje-gruppa (manuell)',
  },

  // ── Arrangøransvar ───────────────────────────────────────────────────────
  arrangor_purring: {
    panel: 'Purring til arrangøransvarlig (automatisk på purredatoen)',
    kort: 'Purring arrangøransvar',
  },
  purring_ansvar: {
    panel: 'Purring til arrangøransvarlig (fra «Purre»-knappen)',
    kort: 'Purring arrangøransvar (manuell)',
  },

  // ── Avstemminger og innlegg ──────────────────────────────────────────────
  ny_poll: { panel: 'Ny avstemming opprettet', kort: 'Ny avstemming' },
  'melding-ny': { panel: 'Nytt innlegg på agendaen', kort: 'Nytt innlegg' },

  // ── Kåringer ─────────────────────────────────────────────────────────────
  kaaringspoll_opprettet: { panel: 'Ny kåring åpnet for stemming', kort: 'Ny kåring' },
  kaaringspoll_vinner: { panel: 'Kåringen er avgjort', kort: 'Kåring avgjort' },
  kaaringspoll_tiebreak: {
    panel: 'Kåring uavgjort (til generalsekretæren)',
    kort: 'Kåring uavgjort',
  },
  kaaringspoll_ingen_stemmer: {
    panel: 'Kåring lukket uten stemmer (til admin)',
    kort: 'Kåring uten stemmer',
  },

  // ── Chat ─────────────────────────────────────────────────────────────────
  mention: { panel: '@-mention i chat (til den som nevnes)', kort: '@-mention i chat' },
  // Én nøkkel per chat-flate (#612), så admin kan dempe klubbchatten alene.
  // beskrivelse i migrasjon 134 er ordrett lik panel-teksten.
  chat_klubb: { panel: 'Ny melding i klubbchatten', kort: 'Melding i klubbchat' },
  chat_arrangement: { panel: 'Ny melding i en arrangement-chat', kort: 'Melding i arrangement-chat' },
  chat_poll: { panel: 'Ny kommentar på en avstemming', kort: 'Kommentar på avstemming' },
  chat_melding: { panel: 'Ny kommentar på et innlegg', kort: 'Kommentar på innlegg' },
  chat_albumbilde: { panel: 'Ny kommentar på et bilde', kort: 'Kommentar på bilde' },
  'privat-melding': { panel: 'Ny privatmelding (til mottakeren)', kort: 'Ny privatmelding' },

  // ── Posisjon ─────────────────────────────────────────────────────────────
  // Manuell erstatning for bakgrunnssporing, som iOS ikke gir en PWA (#695).
  posisjon_pling: {
    panel: 'Pling om hvor noen er (fra «Pling»-knappen på kartet)',
    kort: 'Pling om posisjon',
  },

  // ── Bursdag ──────────────────────────────────────────────────────────────
  // Ikke etterfølgeren til bursdagsgratulasjon: denne går til alle ANDRE (#638).
  bursdag_i_dag: {
    panel: 'Bursdag i klubben (om morgenen, til alle andre enn bursdagsbarnet)',
    kort: 'Bursdag i klubben',
  },
  // Sendes ikke lenger (#643), men etiketten må stå for historiske rader.
  bursdagsgratulasjon: { kort: 'Bursdagsgratulasjon' },

  // ── Pass ─────────────────────────────────────────────────────────────────
  'pass-forespørsel': {
    panel: 'Forespørsel om passinfo (til generalsekretæren)',
    kort: 'Passinfo etterspurt',
  },
  'pass-godkjent': {
    panel: 'Passtilgang godkjent (til den som spurte)',
    kort: 'Passtilgang godkjent',
  },
  'pass-avslatt': {
    panel: 'Passtilgang avslått (til den som spurte)',
    kort: 'Passtilgang avslått',
  },

  // ── Innspill ─────────────────────────────────────────────────────────────
  ønske_ny: { panel: 'Nytt innspill sendt inn (til admin)', kort: 'Nytt innspill' },
  ønske_lukket: {
    panel: 'Innspill lukket og håndtert (til den som foreslo)',
    kort: 'Innspill håndtert',
  },

  // ── Drift ────────────────────────────────────────────────────────────────
  klient_alarm: {
    panel: 'Daglig alarm om feil i appen (til de som får feilvarsler)',
    kort: 'Feilalarm',
  },
  // Ikke en varseltype, men en rad i samme tabell — derfor sist i panelet.
  test_modus: { panel: 'Testmodus — alle varsler går kun til test-eposten', kort: 'Testmodus' },
}

/**
 * Alle varseltyper, nøklet på `noekkel`. Kartet-gruppen først — rekkefølgen
 * her ER visningsrekkefølgen i kontrollpanelet (se VARSEL_REKKEFOLGE under).
 */
export const VARSEL_TEKSTER: Record<string, VarselTekst> = {
  ...SYMBOL_TEKSTER,
  ...OEVRIGE_TEKSTER,
}

/**
 * Visningsrekkefølge i kontrollpanelet — insertion order i VARSEL_TEKSTER, så
 * ingen parallell liste kan drifte. Ukjente nøkler sorteres alfabetisk sist
 * av kallstedet.
 */
export const VARSEL_REKKEFOLGE = Object.keys(VARSEL_TEKSTER)

/**
 * Er `noekkel` en bryter i kontrollpanelet, altså lov å ha en rad i
 * varsel_innstillinger? Speiler erKjentFlagg() i lib/app-innstillinger.ts.
 * Ikke det samme som «finnes i VARSEL_TEKSTER»: oppføringer kun for historiske
 * rader (bursdagsgratulasjon, #643) har ingen `panel` (#767).
 *
 * Object.hasOwn, ikke `in` — `'toString' in VARSEL_TEKSTER` er sant.
 */
export function erVarselBryter(noekkel: string): boolean {
  return Object.hasOwn(VARSEL_TEKSTER, noekkel) && VARSEL_TEKSTER[noekkel].panel !== undefined
}

/**
 * Panel-etikett for en `noekkel`, med fallback til DB-ens beskrivelse og så
 * nøkkelen — en type lagt inn direkte i DB vises da fortsatt.
 */
export function varselPanelNavn(noekkel: string, fallback?: string | null): string {
  return VARSEL_TEKSTER[noekkel]?.panel ?? fallback ?? noekkel
}

/** Kort navn for en `type` slik den er lagret i varsel_logg. */
export function varselKortNavn(type: string | null): string {
  if (!type) return '—'
  return VARSEL_TEKSTER[typeTilNoekkel(type)]?.kort ?? type
}
