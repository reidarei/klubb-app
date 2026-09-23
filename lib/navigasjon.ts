// Én sannhet for Chat-tab'ens omfang — brukes av DraNedForOppdater (for å
// deaktivere pull-to-refresh på chat-ruter). TopHeader bruker ikke lenger
// denne listen etter #256 — /samtaler aktiverer ikke chat-tabben visuelt.
// Se #231 for bakgrunn.

export const CHAT_TAB_PREFIKSER = ['/chat', '/samtaler'] as const

/**
 * Returnerer true når pathname hører til Chat-taben.
 *
 * Bruker streng segment-grense (`/chat` eller `/chat/...`, ikke `/chatannet`)
 * fordi denne brukes til å DEAKTIVERE pull-to-refresh — en false positive
 * her ville stille fjerne funksjonalitet på en urelatert rute.
 *
 * TopHeader's `erAktiv()` bruker bevisst løsere prefix-matching for visuell
 * highlight: en feilaktig markert tab er en kosmetisk bagatell sammenliknet
 * med tap av pull-to-refresh, så asymmetrien er tilsiktet.
 */
export function erChatTab(pathname: string): boolean {
  return CHAT_TAB_PREFIKSER.some(
    p => pathname === p || pathname.startsWith(p + '/')
  )
}

const KART_PREFIKS = '/kart'

/**
 * Returnerer true når pathname hører til kartsiden.
 *
 * Samme strenge segment-grense som `erChatTab` (`/kart` eller `/kart/...`,
 * ikke `/kartotek`) — og samme begrunnelse: dette brukes til å DEAKTIVERE
 * pull-to-refresh, så en false positive her ville stille fjerne
 * funksjonalitet på en urelatert rute.
 */
export function erKartSide(pathname: string): boolean {
  return pathname === KART_PREFIKS || pathname.startsWith(KART_PREFIKS + '/')
}

/**
 * Ett samlet predikat for hvilke ruter som skal deaktivere dra-ned-for-
 * oppdater (#718). Én begrunnelse per rute:
 *
 * - Chat (`erChatTab`): egen realtime-subscription + visibilitychange-
 *   refetch holder meldingslisten ajour, og en uventet router.refresh()
 *   scrollet tråden til bunn (#222).
 * - Kart (`erKartSide`): siden er scroll-låst (#706), så «i toppen»-
 *   betingelsen `window.scrollY > 0` i DraNedForOppdater er alltid usann —
 *   enhver panorering nedover leses derfor som en dra-ned-gest (#718).
 *   Oppdatering skjer i stedet via «Oppdater»-knappen i knapperaden.
 *
 * Blir denne lista fire ruter, bør mekanismen snus til opt-in fra siden
 * selv i stedet for opt-out herfra. To ruter med hver sin dokumenterte
 * grunn er ikke der ennå.
 */
export function draNedForOppdaterAv(pathname: string): boolean {
  return erChatTab(pathname) || erKartSide(pathname)
}
