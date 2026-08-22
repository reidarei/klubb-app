// Én kilde for hva hver varseltype HETER på norsk.
//
// Bakgrunn: teksten lå tidligere i to uavhengige maps på samme side —
// `innstillingLabels` i innstillinger/page.tsx (kontrollpanelet) og
// `typeLabels` i innstillinger/VarselLogg.tsx (historikken). De var nøklet
// forskjellig (noekkel vs. type), hadde ulike navn på samme varsel
// («@-mention i chat» / «Chat-mention») og manglet begge halvparten av
// typene — historikken viste rå nøkler som `kaaringspoll_ingen_stemmer`.
//
// Fila er ren data uten IO, slik at både server components og client
// components (VarselLogg er 'use client') kan importere den.

/**
 * Mapping fra `type` (slik den lagres i varsel_logg) til `noekkel` (slik den
 * ligger i varsel_innstillinger). Historisk fikk de litt forskjellige navn for
 * de tre påminnelses-/purretypene; resten er identiske.
 */
export function typeTilNoekkel(type: string): string {
  if (type === 'paaminne_7') return 'paaminnelse_7d'
  if (type === 'paaminne_1') return 'paaminnelse_1d'
  if (type === 'purring') return 'purring_aktiv'
  return type
}

type VarselTekst = {
  /**
   * Etikett i admin-kontrollpanelet. Utelates for typer som ikke har en egen
   * bryter i varsel_innstillinger (i dag kun bursdagsgratulasjon, som styres
   * per admin via profiles.bursdagsgratulasjon_aktiv).
   */
  panel?: string
  /** Kort navn i varselhistorikken, der raden også viser mottaker og kanal. */
  kort: string
}

/**
 * Alle varseltyper, nøklet på `noekkel`. **Rekkefølgen her er visnings-
 * rekkefølgen i kontrollpanelet** (se VARSEL_REKKEFOLGE under) — grupper hører
 * sammen, ikke alfabetisk.
 *
 * Panel-etikettene følger én form, slik at admin ser hva han faktisk skrur av
 * uten å slå opp i koden:
 *
 *   1. Hendelsen som utløser varselet, som substantivfrase — aldri
 *      «Varsel ved …» (raden ER et varsel; prefikset sa ingenting).
 *   2. Tidspunktet står alltid eksplisitt når det finnes («7 dager før»,
 *      «på purredatoen»). Tidligere hadde purringen «(3 d før)» mens
 *      arrangør-purringen ikke sa noe om når den går.
 *   3. Presiseringen i parentes: hvem som får varselet når det IKKE er alle,
 *      eller hvilken knapp som utløser det når det er manuelt.
 */
export const VARSEL_TEKSTER: Record<string, VarselTekst> = {
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
  // Egen nøkkel, ikke et unntak fra purring_aktiv: manuell purring er en
  // bevisst handling admin gjør, og skal kunne stå på selv om den automatiske
  // 3-dagers-purringen er skrudd av. Se #547 for hvorfor det ikke lot seg
  // gjøre med et «ignorer bryteren»-flagg.
  purring_manuell: {
    panel: 'Purring til de som ikke har svart (fra «Purre disse»-knappen)',
    kort: 'Purring uten svar (manuell)',
  },
  // Egen type, ikke et alias for purring_manuell: mottakergruppen er motsatt
  // (de som HAR svart kanskje, ikke de uten svar) og oppfordringen er en
  // annen («bestem deg», ikke «svar»). En som har svart kanskje skal ikke se
  // «Purring uten svar» i innboksen sin. Se #596.
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
  // Fem broadcast-typer, én per chat-flate (#612) — egen nøkkel per flate,
  // ikke én felles «chat_ny», slik at admin kan dempe f.eks. den varme
  // klubbchatten uten å samtidig kutte varsler om arrangement-kommentarer.
  // beskrivelse i migrasjon 134 er ordrett lik panel-teksten under.
  chat_klubb: { panel: 'Ny melding i klubbchatten', kort: 'Melding i klubbchat' },
  chat_arrangement: { panel: 'Ny melding i en arrangement-chat', kort: 'Melding i arrangement-chat' },
  chat_poll: { panel: 'Ny kommentar på en avstemming', kort: 'Kommentar på avstemming' },
  chat_melding: { panel: 'Ny kommentar på et innlegg', kort: 'Kommentar på innlegg' },
  chat_albumbilde: { panel: 'Ny kommentar på et bilde', kort: 'Kommentar på bilde' },
  'privat-melding': { panel: 'Ny privatmelding (til mottakeren)', kort: 'Ny privatmelding' },
  // Ingen bryter i varsel_innstillinger — styres per admin under
  // «Automatisering» (profiles.bursdagsgratulasjon_aktiv, migrasjon 100).
  // Står her fordi den fortsatt havner i varselhistorikken.
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
  // Ikke en varseltype, men en rad i samme tabell — den slår av utsending til
  // alle andre enn test-eposten. Ligger sist i panelet av samme grunn.
  test_modus: { panel: 'Testmodus — alle varsler går kun til test-eposten', kort: 'Testmodus' },
}

/**
 * Visningsrekkefølge i kontrollpanelet. Utledes av rekkefølgen nøklene står i
 * VARSEL_TEKSTER — string-nøkler i et JS-objekt bevarer insertion order, så vi
 * slipper en parallell liste som kan drifte fra tekstene. Nøkler som ikke står
 * her sorteres alfabetisk til slutt av kallstedet.
 */
export const VARSEL_REKKEFOLGE = Object.keys(VARSEL_TEKSTER)

/**
 * Panel-etikett for en `noekkel`. Faller tilbake til DB-ens beskrivelse og så
 * til selve nøkkelen, slik at en varseltype lagt inn direkte i databasen uten
 * tekst her fortsatt vises — bare med dårligere navn.
 */
export function varselPanelNavn(noekkel: string, fallback?: string | null): string {
  return VARSEL_TEKSTER[noekkel]?.panel ?? fallback ?? noekkel
}

/** Kort navn for en `type` slik den er lagret i varsel_logg. */
export function varselKortNavn(type: string | null): string {
  if (!type) return '—'
  return VARSEL_TEKSTER[typeTilNoekkel(type)]?.kort ?? type
}
