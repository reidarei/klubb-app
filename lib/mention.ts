// Sentral mention-logikk for chat- og kommentar-input.
//
// Brukes av både `components/chat/Chat.tsx` (full chat-flate) og
// `components/agenda/KommentarerPaaKort.tsx` (inline kommentar-felt på
// agenda-kort). Tidligere lå logikken kun i Chat.tsx — duplisering ble
// unngått ved å trekke den ut hit. Visningen håndteres av
// `components/agenda/MentionVelger.tsx`.

// Sentrale mention-regex'er. Vi har to varianter med ulike formål — hold
// dem her som én sannhetskilde i stedet for å duplisere på callsites.
// Begge eksporteres som getters fordi `/g`-regex har lastIndex-state;
// hver caller får sin egen instans og unngår state-leakage mellom kall.
//
// EXTRACT brukes for å hente ut hvilke navn som er nevnt (for varsling).
// Stopper ved mellomrom — `@alle andre` matcher kun `'alle'`. Capture-
// group fanger navnet uten `@`. Se bug 28. april 2026.
export const mentionExtractRegex = (): RegExp => /@([\wæøåÆØÅ-]+)/g

// SPLIT brukes til å splitte meldingstekst for rendering, der hele
// `@navn`-tokenet (med eventuelle mellomrom for flerords-navn) skal
// stylises. Capture-group fanger hele `@navn`-strengen inkludert `@`.
// Tillater mellomrom inni navnet fordi mention-velgeren setter inn
// fullt navn (f.eks. «@Lars Erik»). Bredere enn EXTRACT med vilje.
export const mentionSplitRegex = (): RegExp => /(@[\wæøåÆØÅ][\w æøåÆØÅ-]*)/g

export type ChatProfil = {
  id: string
  navn: string | null
  bilde_url: string | null
  rolle?: string | null
}

// `@alle` er et spesialvalg som ikke matcher en konkret profil — server-siden
// matcher strengen «alle» direkte og sender varsler bredt til hele klubben.
// Vi gir den en sentinel-id (`__alle__`) slik at React-keys og klikk-håndtering
// kan skille den fra ekte profiler uten å trenge en egen kodevei.
export const ALLE_VALG: ChatProfil = {
  id: '__alle__',
  navn: 'alle',
  bilde_url: null,
  rolle: null,
}

/**
 * Tolk hva brukeren har skrevet i input-feltet og returner aktivt mention-søk
 * — strengen etter siste `@` — eller `null` hvis ingen mention er aktiv.
 *
 * Avbryter mention-modus dersom det er to mellomrom på rad eller et linjeskift
 * etter `@` (typisk når brukeren har gått videre uten å velge noen).
 */
export function beregnMentionSøk(verdi: string): string | null {
  const sisteAt = verdi.lastIndexOf('@')
  if (sisteAt === -1) return null
  const etterAt = verdi.slice(sisteAt + 1)
  if (etterAt.endsWith('  ') || etterAt.includes('\n')) return null
  return etterAt
}

/**
 * Erstatt det aktive mention-søket (alt etter siste `@`) med valgt navn,
 * og legg til et trailing mellomrom så brukeren kan skrive videre.
 */
export function velgMentionTekst(tekst: string, navn: string): string {
  const sisteAt = tekst.lastIndexOf('@')
  if (sisteAt === -1) return tekst
  return tekst.slice(0, sisteAt) + '@' + navn + ' '
}

/**
 * Bygg listen av mention-forslag for et gitt søk. `@alle` plasseres først
 * når søket er prefiks av "alle"; deretter de første 5 profilene som matcher
 * (case-insensitive) — uten `eksluderId` (typisk innlogget bruker, så han
 * ikke nevner seg selv).
 */
export function lagMentionForslag(
  mentionSøk: string | null,
  profiler: ChatProfil[],
  ekskluderId?: string,
): ChatProfil[] {
  if (mentionSøk === null) return []
  const søkLower = mentionSøk.toLowerCase()
  const inkluderAlle = 'alle'.startsWith(søkLower)
  const treff = profiler
    .filter(p => p.id !== ekskluderId && p.navn)
    .filter(p => p.navn!.toLowerCase().includes(søkLower))
    .slice(0, 5)
  return inkluderAlle ? [ALLE_VALG, ...treff] : treff
}
