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

const MELDING_MAKS_TEGN = 200
const STACK_MAKS_TEGN = 2000

export function sendFeilBeacon(event: string, message: string, stack?: string): void {
  if (typeof navigator === 'undefined' || !navigator.sendBeacon) return
  try {
    navigator.sendBeacon(
      '/api/logg-feil',
      new Blob(
        [
          JSON.stringify({
            event,
            nivaa: 'error',
            kontekst: {
              message: message.slice(0, MELDING_MAKS_TEGN),
              stack: stack?.slice(0, STACK_MAKS_TEGN),
              url: typeof window !== 'undefined' ? window.location.href : '',
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
  sendFeilBeacon(event, melding, stack)
}
