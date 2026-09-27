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

// Tegn som kan inngå i et navn-ord. En tagg slutter der et navn slutter,
// så etter navnet må det komme et tegn UTENFOR denne klassen (eller slutt).
const NAVNETEGN = /[\wæøåÆØÅ-]/

export type MentionDel = { type: 'tekst' | 'mention'; verdi: string }

/**
 * Splitt meldingstekst i tekst- og mention-biter for rendering.
 *
 * En tagg er `@` + det LENGSTE kjente navnet (eller «alle») som står rett
 * etter — ikke alt fram til neste tegnsetting. Den gamle regexen tillot
 * mellomrom for flerords-navn og visste derfor ikke hvor navnet sluttet:
 * «@Ola Hansen og @Per Olav … er fortsatt på hotellet» ble tagget helt ut.
 * Matcher ingen kjent navn (tidligere medlem, kallenavn), tagges kun første
 * ord — samme grense som mentionExtractRegex bruker for varsling.
 */
export function splittPaaMentions(tekst: string, kjenteNavn: string[]): MentionDel[] {
  // Lengste først, så «Ola Hansen» vinner over et eventuelt «Ola».
  const navn = [...kjenteNavn, 'alle']
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
  const deler: MentionDel[] = []
  let buffer = ''
  let i = 0

  while (i < tekst.length) {
    const forrige = i > 0 ? tekst[i - 1] : ''
    // `@` midt i et ord (e-post: ola@vg.no) er ikke en tagg.
    if (tekst[i] !== '@' || NAVNETEGN.test(forrige)) {
      buffer += tekst[i++]
      continue
    }
    const etter = tekst.slice(i + 1)
    const lower = etter.toLowerCase()
    let lengde = 0
    for (const n of navn) {
      if (lower.startsWith(n.toLowerCase()) && !NAVNETEGN.test(etter[n.length] ?? '')) {
        lengde = n.length
        break
      }
    }
    if (!lengde) lengde = etter.match(/^[\wæøåÆØÅ-]+/)?.[0].length ?? 0
    if (!lengde) {
      buffer += tekst[i++]
      continue
    }
    if (buffer) deler.push({ type: 'tekst', verdi: buffer })
    buffer = ''
    deler.push({ type: 'mention', verdi: tekst.slice(i, i + 1 + lengde) })
    i += 1 + lengde
  }
  if (buffer) deler.push({ type: 'tekst', verdi: buffer })
  return deler
}

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
