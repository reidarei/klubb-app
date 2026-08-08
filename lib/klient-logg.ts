// Klient-side motstykke til lib/logg.ts (som er server-only — den lazy-
// importerer service_role-klienten og kan aldri havne i en klient-bundle).
//
// Bakgrunn: components/FeilFangst.tsx fanger kun `window.error` og
// `unhandledrejection`. En `console.error` i en hook treffer ingen av dem, så
// en feil som håndteres pent i klientkoden ble usynlig i observability — den
// kunne feile i månedsvis uten at noen fikk vite det. Denne helperen gir
// håndterte klientfeil samme vei til feil_logg som de ufangede har.
//
// Samme transport som FeilFangst: navigator.sendBeacon mot /api/logg-feil.
// Beacon fremfor fetch fordi den overlever navigasjon bort fra siden, og
// fordi den aldri kan velte kallstedet (ingen promise å håndtere).

import { CHUNK_RELOAD_SPERRE_MS } from '@/lib/konstanter'

const MELDING_MAKS_TEGN = 200
const STACK_MAKS_TEGN = 2000

// sessionStorage-nøkkel for chunk-reload-guarden. sessionStorage og ikke
// localStorage: sperren skal gjelde denne fanen/økten, ikke følge enheten
// på tvers av dager.
const RELOAD_NOEKKEL = 'hk_chunk_reload'

/**
 * Felles diagnosekontekst som legges på HVER klientfeil.
 *
 * Bakgrunn (#575): feilraden fra 7. august 2026 var `"Load failed"` uten
 * stack og uten digest. Den lot seg ikke diagnostisere — vi kunne ikke engang
 * se om klienten kjørte en gammel bundle, om enheten var online, eller om det
 * skjedde i PWA-en. Feltene under er valgt fordi de faktisk skiller
 * hypotesene fra hverandre, ikke fordi de er lette å hente.
 *
 * Alt her må stå i KONTEKST_WHITELIST i app/api/logg-feil/route.ts — felter
 * utenfor lista strippes stille bort av scrubberen.
 */
function diagnostikk(): Record<string, unknown> {
  const d: Record<string, unknown> = {}

  // Bakt inn i bundlen ved bygg (next.config.ts → env.APP_VERSION). En klient
  // som kjører gammel, cachet JS rapporterer den GAMLE versjonen mens
  // serveren er ny — det er nøyaktig signalet som skiller «kodebit borte
  // etter deploy» fra alt annet, og det vi manglet i august-analysen.
  d.appversjon = process.env.APP_VERSION ?? 'ukjent'

  if (typeof navigator !== 'undefined') {
    d.online = navigator.onLine
    // Nettverkstype finnes ikke i Safari — undefined-felter faller uansett
    // ut av JSON.stringify, så ingen grunn til å gjette en verdi.
    const forbindelse = (navigator as { connection?: { effectiveType?: string } }).connection
    if (forbindelse?.effectiveType) d.nettverk = forbindelse.effectiveType
  }

  if (typeof window !== 'undefined' && window.matchMedia) {
    // Skiller PWA fra vanlig Safari-fane. Service worker- og cache-oppførsel
    // er ulik i de to, så uten dette må vi gjette på hvilken vi feilsøker.
    d.standalone = window.matchMedia('(display-mode: standalone)').matches
  }

  return d
}

/**
 * Error-klassenavnet — ofte det eneste som skiller feiltypene fra hverandre
 * når stacken mangler: `TypeError` (feilet fetch) mot `ChunkLoadError`
 * (manglende kodebit) mot et vanlig `Error`. August-raden hadde ingen av
 * delene, og det er grunnen til at feltet finnes.
 */
export function feilNavn(feil: unknown): string {
  if (feil instanceof Error) return feil.name
  if (feil && typeof feil === 'object' && 'name' in feil) {
    return String((feil as { name: unknown }).name)
  }
  return typeof feil
}

/**
 * Kjenner igjen at nettleseren ikke fikk lastet en kodebit (chunk). Da kjører
 * klienten en HTML/bundle som peker på filer serveren ikke har lenger —
 * typisk etter en deploy mens PWA-en lå åpen i bakgrunnen.
 *
 * Meldingen varierer per nettleser: webpack/Chrome sier «ChunkLoadError» og
 * «Loading chunk … failed», mens Safari kun gir `TypeError: Load failed` —
 * nøyaktig samme tekst som en helt vanlig nettverksfeil gir. Safari-formen er
 * derfor ikke nok alene, og kallstedet MÅ kombinere den med `navigator.onLine`
 * før den handler på den (se proevChunkReload). Vi tar heller en manglende
 * reload enn å reloade folk som bare mistet dekningen.
 */
export function erChunkFeil(feil: unknown): boolean {
  const navn = feilNavn(feil)
  if (navn === 'ChunkLoadError') return true

  const melding =
    feil && typeof feil === 'object' && 'message' in feil
      ? String((feil as { message: unknown }).message)
      : String(feil)

  if (/Loading (CSS )?chunk .* failed/i.test(melding)) return true
  // Safari: «Load failed» / «Importing a module script failed».
  // Ankrene i ^…$ er ikke pynt: uten dem ville en hvilken som helst feiltekst
  // som inneholder ordene («Image load failed for avatar») utløst reload.
  if (/^Load failed$/i.test(melding)) return true
  if (/Importing a module script failed/i.test(melding)) return true
  return false
}

/**
 * Laster siden på nytt for å hente fersk HTML med gyldige chunk-referanser.
 * Returnerer true hvis reload ble startet.
 *
 * To sperrer, begge nødvendige:
 *  - `navigator.onLine` — er enheten offline er dette en nettverksfeil, ikke
 *    en gammel bundle, og en reload gjør bare vondt verre (jf. at Safari gir
 *    identisk melding for begge).
 *  - Tidssperre i sessionStorage — hvis den ferske HTML-en OGSÅ feiler (f.eks.
 *    fordi service workeren serverer en cachet gammel side) ville vi ellers
 *    reloadet i evig løkke. Andre forsøk innen vinduet gir feilsiden i stedet,
 *    som er en ærlig blindvei framfor en usynlig løkke.
 *
 * Begge sperrene er mutasjonstestet i __tests__/klient-logg.test.ts — fjernes
 * én av dem, blir en test rød.
 */
export function proevChunkReload(): boolean {
  if (typeof window === 'undefined') return false
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false
  try {
    const sist = Number(sessionStorage.getItem(RELOAD_NOEKKEL) ?? 0)
    if (Date.now() - sist < CHUNK_RELOAD_SPERRE_MS) return false
    sessionStorage.setItem(RELOAD_NOEKKEL, String(Date.now()))
  } catch {
    // Privat modus / blokkert storage: uten guard tør vi ikke reloade i det
    // hele tatt, for da har vi ingen bremse mot løkka.
    return false
  }
  window.location.reload()
  return true
}

export function sendFeilBeacon(
  event: string,
  message: string,
  stack?: string,
  ekstra?: Record<string, unknown>,
  // 'fatal' er forbeholdt root-boundaryen (global-error) — der har hele
  // layoutet knekt, ikke bare en side. Default holder alle andre kallsteder
  // uendret.
  nivaa: 'error' | 'fatal' = 'error',
): void {
  if (typeof navigator === 'undefined' || !navigator.sendBeacon) return
  try {
    navigator.sendBeacon(
      '/api/logg-feil',
      new Blob(
        [
          JSON.stringify({
            event,
            nivaa,
            kontekst: {
              message: message.slice(0, MELDING_MAKS_TEGN),
              stack: stack?.slice(0, STACK_MAKS_TEGN),
              url: typeof window !== 'undefined' ? window.location.href : '',
              ...diagnostikk(),
              // Kallstedets egne felter sist: en konkret `ressurs` eller
              // `name` skal kunne overstyre et generisk diagnostikk-felt.
              ...ekstra,
            },
          }),
        ],
        { type: 'application/json' },
      ),
    )
  } catch {
    // sendBeacon kaster på for stor payload og i enkelte privacy-moduser.
    // En logger som velter kallstedet er verre enn feilen den skulle logge.
  }
}

/**
 * Meld fra om en feil vi HAR håndtert i klientkoden (fanget error fra en
 * Supabase-spørring, en avvist fetch o.l.). Ruten svarer 204 uansett og
 * rate-limiter per IP+profil, så kallstedet trenger ikke tenke på storm.
 *
 * Ikke for uventede exceptions — de fanges allerede av FeilFangst.
 */
export function meldKlientfeil(event: string, feil: unknown): void {
  const melding =
    feil && typeof feil === 'object' && 'message' in feil
      ? String((feil as { message: unknown }).message)
      : String(feil)
  const stack = feil instanceof Error ? feil.stack : undefined
  sendFeilBeacon(event, melding, stack, { name: feilNavn(feil) })
}
