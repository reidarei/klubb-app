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

// ─── FANENE ──────────────────────────────────────────────────────────────────
//
// Definisjonen lå tidligere inne i TopHeader. Flyttet hit fordi FaneSveip må
// kjenne nøyaktig samme liste OG samme rekkefølge: sveiper man mot en fane
// headeren ikke viser, havner man på en side uten vei tilbake i navigasjonen.
// To lister som må holdes i synk manuelt ville drevet fra hverandre første gang
// noen la til en fane.

import { kanAdministrere } from '@/lib/roller'

export type FaneNokkel = 'agenda' | 'chat' | 'fond' | 'klubb'

export type Fane = {
  href: string
  label: string
  nokkel: FaneNokkel
  /** Path-prefikser som markerer denne fanen som aktiv. */
  prefikser: string[]
  /** Kun synlig for admin-brukere (brukes i testfase-gating per #443). */
  kunAdmin?: boolean
}

// Rekkefølgen her ER sveiperekkefølgen, ikke bare visningsrekkefølgen.
export const FANER: Fane[] = [
  { href: '/', label: 'Agenda', nokkel: 'agenda', prefikser: ['/poll', '/arrangementer', '/meldinger'] },
  // /samtaler aktiverer IKKE chat-tabben visuelt. Privatmeldinger åpnes fra profil-siden (#256). CHAT_TAB_PREFIKSER over beholdes for pull-to-refresh-deaktivering.
  { href: '/chat', label: 'Chat', nokkel: 'chat', prefikser: ['/chat'] },
  { href: '/klubbinfo', label: 'Klubb', nokkel: 'klubb', prefikser: ['/klubbinfo', '/kaaringer', '/album'] },
  // Fond ligger bevisst lengst til høyre (admins ønske). Alltid synlig for admin;
  // for vanlige medlemmer styres synligheten av bryteren i /innstillinger (#447).
  { href: '/fond', label: 'Fond', nokkel: 'fond', prefikser: ['/fond'], kunAdmin: true },
]

/** Fanene denne brukeren faktisk ser, i rekkefølge. */
export function synligeFaner(
  rolle: string | null | undefined,
  visFond: boolean,
  visChat: boolean,
): Fane[] {
  return FANER.filter(f => {
    // Chat er motsatt av Fond: synlig som default, men kan skrus av for
    // vanlige medlemmer via chat_fane-flagget — admin ser den alltid.
    if (f.nokkel === 'chat') return visChat || kanAdministrere(rolle)
    return !f.kunAdmin || kanAdministrere(rolle) || (f.nokkel === 'fond' && visFond)
  })
}

export function erAktivFane(fane: Fane, pathname: string): boolean {
  if (fane.href === '/') {
    if (pathname === '/') return true
    return fane.prefikser.some(p => pathname.startsWith(p))
  }
  return fane.prefikser.some(p => pathname.startsWith(p))
}

/**
 * Indeksen til fanen brukeren står på — men KUN når han står på selve
 * fane-siden, ikke på en underside av den.
 *
 * Sveip skal ikke bytte fane fra `/arrangementer/123`: der er sveipen mot
 * høyre iOS' egen tilbake-gest, og den er verdt mer enn et faneskifte. Man
 * mister heller ikke plassen sin i en liste man nettopp klikket seg inn fra.
 * Headerens `erAktivFane()` er bevisst løsere — den skal markere Agenda som
 * aktiv også på undersider — så de to spørsmålene har hvert sitt svar.
 */
export function toppnivaaFaneIndeks(faner: Fane[], pathname: string): number {
  return faner.findIndex(f => f.href === pathname)
}
