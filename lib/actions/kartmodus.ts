'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { ensureInnlogget } from '@/lib/auth'
import { hentKartmodus } from '@/lib/kartmodus'
import { REISEMODUS_COOKIE } from '@/lib/reisemodus'
import { MOETEMODUS_COOKIE } from '@/lib/moetemodus'
import { logg } from '@/lib/logg'

/**
 * Slår kartmodus (reise ELLER møte, se lib/kartmodus.ts) av/på for DENNE
 * brukeren, for DETTE arrangementet (HttpOnly-cookie — REISEMODUS_COOKIE
 * eller MOETEMODUS_COOKIE, valgt fra status.modus). Klubb-globale flagg
 * (app_innstillinger.reisemodus/moetemodus) styres separat fra
 * /innstillinger (oppdaterAppInnstilling) — dette er kun det per-enhet
 * av-valget.
 *
 * Bevisst valg (uendret fra reisemodus, #723): toggelen river deg ikke ut av
 * siden du står på. `paa: false` redirecter til «/» KUN når brukeren faktisk
 * står på /kart — ellers ville avslåing midt i en chat kastet deg ut av
 * samtalen. `paa: true` går alltid til /kart, fordi han ber eksplisitt om
 * kartet.
 *
 * `redirect()` kaster NEXT_REDIRECT og må ALDRI stå inne i en try/catch —
 * svelges den, får du en toggle som ikke gjør noe (se CLAUDE.md).
 */
export async function settKartmodus(paa: boolean, gjeldendeSti: string) {
  await ensureInnlogget()

  const status = await hentKartmodus()
  // Ingen tur/møte i vinduet — toggelen vises ikke da (ReisemodusToggle), men
  // et race mot at arrangementet akkurat ble avsluttet er ikke utenkelig.
  // «Ikke tilgjengelig» logges bevisst ikke (arkitekturstyrets uttalelse,
  // #723) — det er ikke en feil, bare et forbigått vindu.
  //
  // Denne ene linja er også type-vakten: KartmodusStatus er en diskriminert
  // union, så etter returen har `status` garantert modus, arrangementId OG
  // sluttTidspunkt som ikke-null (#723-review).
  if (!status.tilgjengelig) return

  const cookieStore = await cookies()
  const cookieNavn = status.modus === 'reise' ? REISEMODUS_COOKIE : MOETEMODUS_COOKIE
  const eventPrefix = status.modus === 'reise' ? 'reisemodus' : 'moetemodus'

  if (paa) {
    cookieStore.delete(cookieNavn)
    logg.warn(`${eventPrefix}.paa`, { arrangement_id: status.arrangementId })
  } else {
    cookieStore.set(cookieNavn, status.arrangementId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      // Av-valget skal ikke overleve arrangementet — én cookie per tur/møte,
      // ikke en evig «av for alltid». Ingen fallback-levetid her: er modusen
      // tilgjengelig, GARANTERER typen en sluttid (se KartmodusStatus), og et
      // gjettet døgn ville latt av-valget overleve et arrangement som endte
      // før det.
      expires: new Date(status.sluttTidspunkt),
    })
    logg.warn(`${eventPrefix}.av`, { arrangement_id: status.arrangementId })
  }

  // Layout leser hentKartmodus() på hver request uansett (cache() dedupliserer
  // kun INNENFOR én render, ikke på tvers), men revalidatePath sikrer at
  // Next faktisk henter en fersk RSC-payload for gjeldende rute med det
  // samme — uten denne kunne toggelen sett uendret ut til neste navigasjon
  // når vi IKKE redirecter (paa:false utenfor /kart).
  revalidatePath('/', 'layout')

  if (paa) {
    redirect('/kart')
  } else if (gjeldendeSti === '/kart') {
    redirect('/')
  }
}
