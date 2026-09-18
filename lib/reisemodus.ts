import { cache } from 'react'
import { cookies } from 'next/headers'
import { unstable_rethrow } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { finnPaagaaendeArrangementStrengt } from '@/lib/posisjon'
import { hentAppFlaggStrengt, REISEMODUS } from '@/lib/app-innstillinger'
import { logg } from '@/lib/logg'

// Cookie som bærer id-en til turen brukeren har slått reisemodus AV for, per
// enhet — et visningsvalg på linje med tema, ikke en kolonne i profiles (se
// arkitekturstyrets uttalelse i #723). HttpOnly: dette settes/leses kun
// server-side, via settReisemodus()/hentReisemodus().
export const REISEMODUS_COOKIE = 'reisemodus_av_for'

/**
 * Diskriminert union på `tilgjengelig` (#723-review).
 *
 * Er modusen tilgjengelig, har vi PER DEFINISJON en tur med sluttid: predikatet
 * i hentReisemodus() slipper ingenting annet gjennom. Fire uavhengig nullable
 * felter skjulte den garantien for typesystemet, og tvang settReisemodus() til
 * å finne på en fallback for `sluttTidspunkt` — den gjettet på ett døgn, slik
 * at et av-valg kunne leve lenger enn turen det gjaldt. Med unionen finnes ikke
 * den grenen å skrive.
 */
export type ReisemodusStatus =
  | {
      /**
       * Ingen tur med sluttid pågår, eller klubb-flagget er av. Toggelen vises
       * ikke i det hele tatt (Reidars avgjørelse: ingen toggle når ingen tur
       * pågår).
       */
      tilgjengelig: false
      paa: false
      arrangementId: null
      arrangementTittel: null
      sluttTidspunkt: null
    }
  | {
      /**
       * En tur med sluttid pågår OG klubb-flagget står på — uavhengig av om
       * DENNE brukeren har slått den av for turen. Styrer om toggelen vises.
       */
      tilgjengelig: true
      /**
       * tilgjengelig && ikke slått av for DENNE turen via REISEMODUS_COOKIE.
       * Styrer selve visningen: /kart fullskjerm uten header, / → /kart.
       */
      paa: boolean
      arrangementId: string
      arrangementTittel: string
      /**
       * Utløpet på REISEMODUS_COOKIE — av-valget skal ikke overleve turen.
       * Aldri null i denne grenen; det er hele poenget med unionen.
       */
      sluttTidspunkt: string
    }

const REISEMODUS_AV: ReisemodusStatus = {
  tilgjengelig: false,
  paa: false,
  arrangementId: null,
  arrangementTittel: null,
  sluttTidspunkt: null,
}

/**
 * Reisemodus = et PÅGÅENDE arrangement av type «tur» MED sluttid (ikke
 * passert) OG klubb-flagget `reisemodus` i app_innstillinger er på. Ingen tur
 * ⇒ vi spør aldri etter flagget — det er hele grunnen til at dette oppslaget
 * er gratis på de ~350 normaldagene i året klubben ikke er på tur (#723).
 *
 * Argumentløs og cache()-wrappet, akkurat som getInnloggetBruker()/getProfil()
 * i lib/auth-cache.ts — lager sin egen klient internt. En variant som tar
 * `supabase` inn som parameter cacher per REFERANSE, ikke per kall, og blir
 * 100 % miss uten noe symptom (samme feilklasse som #518) — det er det
 * enkleste stedet å ødelegge hele ytelsesargumentet uten at noe feiler synlig.
 *
 * Kalles fra AppLayout (før Suspense-grensen, så Suspense-fallbacken også får
 * riktig header-tilstand — se #707-symptomet) og fra kart/page.tsx (samme
 * cache()-instans i samme request, så det blir ÉN spørring, ikke to).
 */
export const hentReisemodus = cache(async (): Promise<ReisemodusStatus> => {
  try {
    const supabase = await createServerClient()
    // De STRENGE variantene, med vilje: fail-open-variantene gjør en
    // databasefeil om til `null` hhv. `false` FØR den når catch-grenen under,
    // og da kan prod ikke skille en feil fra «ingen tur» eller «kill-switchen
    // er av» (#723-review). Utfallet vårt er fortsatt det samme — vi vil bare
    // logge det.
    const paagaaende = await finnPaagaaendeArrangementStrengt(supabase)

    // tur_felt_kun_for_tur (migrasjon 002) gjør «type !== 'tur' ⇒ ingen
    // sluttTidspunkt» tautologisk i praksis — men implikasjonen skal stå
    // skrevet HER, ikke antas fra en migrasjon ingen leser når de endrer
    // dette predikatet.
    if (!paagaaende || paagaaende.type !== 'tur' || !paagaaende.sluttTidspunkt) {
      return REISEMODUS_AV
    }

    // null = ingen rad i app_innstillinger ⇒ av, som fallbacken alltid har
    // vært. Kun `true` slår modusen på.
    const flaggPaa = await hentAppFlaggStrengt(supabase, REISEMODUS)
    if (flaggPaa !== true) return REISEMODUS_AV

    const cookieStore = await cookies()
    const avForDenneTuren = cookieStore.get(REISEMODUS_COOKIE)?.value === paagaaende.id

    return {
      tilgjengelig: true,
      paa: !avForDenneTuren,
      arrangementId: paagaaende.id,
      arrangementTittel: paagaaende.tittel,
      sluttTidspunkt: paagaaende.sluttTidspunkt,
    }
  } catch (err) {
    // Next.js bruker en throw for å signalisere «denne ruten må rendres
    // dynamisk» under static-generation-forsøket ved build (createServerClient()
    // → cookies() kaster DynamicServerError). unstable_rethrow() kaster den
    // videre uendret — uten dette svelges signalet her, og hver av de ~30
    // sidene som kaller denne funksjonen ville logget en falsk
    // reisemodus.oppslag.feilet (med et ekte DB-skriv til feil_logg) for
    // HVERT sideoppslag under `next build`.
    unstable_rethrow(err)
    // Fail-open i retning VANLIG APP: en ekte feil skal aldri kunne sende noen
    // til fullskjermkart ved en feiltakelse, og aldri ta ned en side som ellers
    // hadde rendret fint. Men den skal ALLTID logges — aldri en stille
    // .catch(() => null). Se CLAUDE.md § Policy: Databasespørringer og
    // arkitekturstyrets «må med»-punkt i #723.
    await logg.feil('reisemodus.oppslag.feilet', err)
    return REISEMODUS_AV
  }
})
