import { cache } from 'react'
import { cookies } from 'next/headers'
import { unstable_rethrow } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { hentNyligStartedeArrangementerStrengt } from '@/lib/posisjon'
import { REISEMODUS_COOKIE } from '@/lib/reisemodus'
import { MOETEMODUS_COOKIE } from '@/lib/moetemodus'
import { hentAppFlaggStrengt } from '@/lib/app-innstillinger'
import { avgjoerKartmodus, KARTMODUS_AV, type KartmodusStatus } from '@/lib/kartmodus-beslutning'
import { naa } from '@/lib/dato'
import { logg } from '@/lib/logg'

// Typen og selve beslutningen bor i lib/kartmodus-beslutning.ts (ren, testbar);
// denne fila leverer kun I/O rundt den.
export type { KartmodusStatus } from '@/lib/kartmodus-beslutning'

/**
 * Argumentløs og cache()-wrappet, akkurat som getInnloggetBruker()/getProfil()
 * i lib/auth-cache.ts — lager sin egen klient internt. En variant som tar
 * `supabase` inn som parameter cacher per REFERANSE, ikke per kall, og blir
 * 100 % miss uten noe symptom (samme feilklasse som #518) — se det
 * opprinnelige, per-modus-resonnementet i git-historikken til
 * lib/reisemodus.ts (#723).
 *
 * Kalles fra AppLayout (før Suspense-grensen, så Suspense-fallbacken også får
 * riktig header-tilstand — se #707-symptomet) og fra kart/page.tsx (samme
 * cache()-instans i samme request, så det blir ÉN spørring, ikke to).
 *
 * Rekkefølge (#780): rådataspørringen (hentNyligStartedeArrangementerStrengt)
 * kjøres ÉN gang og dekker begge moduser — dette er den eneste spørringen på
 * de fleste dager, der verken en tur eller et møte er i vinduet. Tur sjekkes
 * FØR møte, og klubb-flagget for hver modus slås KUN opp når en kandidat
 * faktisk finnes — se avgjoerKartmodus() i lib/kartmodus-beslutning.ts.
 */
export const hentKartmodus = cache(async (): Promise<KartmodusStatus> => {
  try {
    const supabase = await createServerClient()
    const naaIso = naa()
    const rader = await hentNyligStartedeArrangementerStrengt(supabase)

    // cookies() er allerede lest av createServerClient() — ingen ekstra kostnad.
    const cookieStore = await cookies()
    return await avgjoerKartmodus({
      rader,
      naaIso,
      hentFlagg: (noekkel) => hentAppFlaggStrengt(supabase, noekkel),
      reiseAvFor: cookieStore.get(REISEMODUS_COOKIE)?.value,
      moeteAvFor: cookieStore.get(MOETEMODUS_COOKIE)?.value,
    })
  } catch (err) {
    // Next.js bruker en throw for å signalisere «denne ruten må rendres
    // dynamisk» under static-generation-forsøket ved build (createServerClient()
    // → cookies() kaster DynamicServerError). unstable_rethrow() kaster den
    // videre uendret — uten dette svelges signalet her, og hver av de ~30
    // sidene som kaller denne funksjonen ville logget en falsk
    // kartmodus.oppslag.feilet (med et ekte DB-skriv til feil_logg) for
    // HVERT sideoppslag under `next build`.
    unstable_rethrow(err)
    // Fail-open i retning VANLIG APP: en ekte feil skal aldri kunne sende noen
    // til fullskjermkart ved en feiltakelse, og aldri ta ned en side som ellers
    // hadde rendret fint. Men den skal ALLTID logges — aldri en stille
    // .catch(() => null). Se CLAUDE.md § Policy: Databasespørringer og
    // arkitekturstyrets «må med»-punkt i #723.
    await logg.feil('kartmodus.oppslag.feilet', err)
    return KARTMODUS_AV
  }
})
