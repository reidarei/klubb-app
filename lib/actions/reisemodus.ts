'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { ensureInnlogget } from '@/lib/auth'
import { hentReisemodus, REISEMODUS_COOKIE } from '@/lib/reisemodus'
import { logg } from '@/lib/logg'

/**
 * Slår reisemodus av/på for DENNE brukeren, for DENNE turen (HttpOnly-cookie,
 * se lib/reisemodus.ts). Klubb-globalt flagg (app_innstillinger.reisemodus)
 * styres separat fra /innstillinger (oppdaterAppInnstilling) — dette er kun
 * det per-enhet av-valget.
 *
 * Bevisst valg: toggelen river deg ikke ut av siden du står på.
 * `paa: false` redirecter til «/» KUN når brukeren faktisk står på /kart —
 * ellers ville avslåing midt i en chat kastet deg ut av samtalen. `paa: true`
 * går alltid til /kart, fordi han ber eksplisitt om kartet.
 *
 * `redirect()` kaster NEXT_REDIRECT og må ALDRI stå inne i en try/catch —
 * svelges den, får du en toggle som ikke gjør noe (se CLAUDE.md).
 */
export async function settReisemodus(paa: boolean, gjeldendeSti: string) {
  await ensureInnlogget()

  const status = await hentReisemodus()
  // Ingen pågående tur — toggelen vises ikke da (ReisemodusToggle), men et
  // race mot at turen akkurat ble avsluttet er ikke utenkelig. «Ingen
  // pågående tur» logges bevisst ikke (arkitekturstyrets uttalelse, #723) —
  // det er ikke en feil, bare et forbigått vindu.
  //
  // Denne ene linja er også type-vakten: ReisemodusStatus er en diskriminert
  // union, så etter returen har `status` garantert arrangementId OG
  // sluttTidspunkt som strenger (#723-review).
  if (!status.tilgjengelig) return

  const cookieStore = await cookies()

  if (paa) {
    cookieStore.delete(REISEMODUS_COOKIE)
    logg.warn('reisemodus.paa', { arrangement_id: status.arrangementId })
  } else {
    cookieStore.set(REISEMODUS_COOKIE, status.arrangementId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      // Av-valget skal ikke overleve turen — én cookie per tur, ikke en evig
      // «reisemodus av for alltid». Ingen fallback-levetid her: er modusen
      // tilgjengelig, GARANTERER typen en sluttid (se ReisemodusStatus), og et
      // gjettet døgn ville latt av-valget overleve en tur som endte før det.
      expires: new Date(status.sluttTidspunkt),
    })
    logg.warn('reisemodus.av', { arrangement_id: status.arrangementId })
  }

  // Layout leser hentReisemodus() på hver request uansett (cache() dedupliserer
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
