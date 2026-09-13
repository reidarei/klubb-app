'use client'

import { useEffect } from 'react'
import { PUSH_KLIKK_VINDU_MS, PUSH_KLIKK_MAKS_FORSOK } from '@/lib/konstanter'
import { sendFeilBeacon, meldKlientfeil, feilNavn } from '@/lib/klient-logg'
import {
  lesPendingNav,
  slettPendingNav,
  skrivPendingNav,
  lokalSti,
  type PendingNav,
} from '@/lib/pending-nav'

// Hvor lenge vi lar tilbakeskrivingen av forsøkstelleren ta før vi navigerer
// videre uansett. Speiler NAV_SKRIV_TIMEOUT_MS i public/sw.js: en hengende
// Cache Storage-skriving skal aldri kunne blokkere selve navigasjonen — verste
// utfall er da at loop-brytelsen (PUSH_KLIKK_MAKS_FORSOK) mister ett forsøk i
// tellingen, ikke at push-klikket slutter å virke.
const NAV_SKRIV_TIMEOUT_MS = 1000

export default function ServiceWorkerRegistrering() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    // Hele push-klikk-flyten under avhenger av at denne registreringen går
    // gjennom. En console.error fanges verken av FeilFangst (den ser bare
    // window.error og unhandledrejection) eller av noe annet — feilen ville
    // forsvunnet sporløst, og push kunne vært dødt i månedsvis uten at vi
    // visste det (#626-review).
    navigator.serviceWorker
      .register('/sw.js')
      .catch((err: unknown) => meldKlientfeil('klient.sw.registrering.feilet', err))

    // Push-klikk-navigasjon: SW kan ikke navigere appen selv (openWindow er
    // no-op når PWA-en allerede er åpen, client.navigate er upålitelig på
    // iOS — #233, #262). I stedet lagrer SW-en URL-en i Cache Storage
    // (NAV_CACHE, lib/pending-nav.ts), og vi leser den direkte herfra ved
    // mount og hver visibility-change (#626).
    //
    // Cache Storage fremfor SW-melding/i-minne-tilstand er selve fiksen: en
    // i-minne-variabel i SW-en river bort med den SW-instansen — en push-
    // trigget SW-oppdatering (install kaller skipWaiting(), activate kaller
    // clients.claim()) forkaster den gamle instansen med overleveringen FØR
    // klienten rekker å lese den. Cache Storage er per-origin og upåvirket av
    // hvilken SW-instans som lever, er byttet ut, eller kontrollerer siden.
    function handterMelding(event: MessageEvent) {
      const data = event.data
      if (!data || data.type !== 'navigate' || typeof data.url !== 'string') return
      // navigerTil er nå async (utsatt konsumering + bounded tilbakeskriving,
      // #688) — denne callbacken awaiter den ikke, så en avvist promise ville
      // blitt en unhandled rejection uten denne .catch()-en. navigerTil selv
      // er fail-open og skal aldri kaste, men vi svelger den ikke stille: en
      // uventet feil her logges i stedet for å forsvinne sporløst.
      navigerTil(data.url, 'broadcast').catch((err: unknown) => {
        sendFeilBeacon(
          'klient.sw.pendingnav.feilet',
          err instanceof Error ? err.message : String(err),
          err instanceof Error ? err.stack : undefined,
          { name: feilNavn(err) },
          'warn',
        )
      })
    }

    // `kilde` sier hvilken av de tre stiene som faktisk leverte URL-en (#676).
    // SW-en teller klikk, vi teller navigasjoner — differansen er tapet, og
    // kilden viser hvilken sti som bærer i praksis. Uten det fikser vi i
    // blinde: seks runder (#233, #262, #264, #626) er gjort uten å vite hvor
    // ofte overleveringen ryker eller hvilken vei som faktisk virker.
    //
    // `entryHint` (#688) lar sjekkPendingNav gjenbruke entryen den allerede
    // har lest (unngår et unødvendig ekstra Cache Storage-oppslag) — broadcast-
    // og kanal-kallene under sender den ikke, og navigerTil leser da selv NAV-
    // raden for å finne klikk_id/forsok. Siden det kun finnes ÉN pending-nav-
    // rad om gangen (NAV_NOKKEL er en singel-nøkkel), er dette samme rad
    // uansett hvilken sti som trigget navigasjonen.

    // In-flight-guard for push-klikk-navigasjonen (review av PR #690).
    // Cache-pollen (t=0) og SW-broadcasten kommer normalt inn omtrent
    // samtidig — SW-en skriver entryen og broadcaster rett etterpå. Uten
    // serialisering leste begge samme `forsok`, regnet seg begge fram til 1,
    // skrev begge `navigert: true` og logget begge en rad: ett klikk ga to
    // navigasjoner og to telemetri-rader, altså nøyaktig korrelasjonen #688
    // innfører, ødelagt av seg selv.
    //
    // Tre deler, hver med sin grunn:
    //  * `navKjede` serialiserer lese/øke/skrive, så kall nr. 2 ser nr. 1
    //    sitt resultat i stedet for en foreldet lesning.
    //  * `committetMaal` er terminal per MÅL i denne sidevisningen: idet
    //    assign() er kalt, skal ingen annen kilde navigere dit igjen.
    //  * `landingLogget` dekker landings-grenen, der entryen konsumeres.
    //    Kall nr. 2 kan sitte på en entryHint lest FØR nr. 1 slettet raden,
    //    og ville ellers logget samme landing en gang til.
    //
    // Markørene settes kun på stiene som faktisk fullførte, så en tidlig
    // retur eller en kastet feil låser ingenting. De lever i effekt-closuren
    // (ikke på modulnivå) — alle tre kildene deler samme closure, mens en ny
    // mount starter med blanke ark.
    let navKjede: Promise<void> = Promise.resolve()
    let committetMaal: string | null = null
    let landingLogget = false

    function navigerTil(
      raw: string,
      kilde: 'broadcast' | 'cache' | 'kanal',
      entryHint?: PendingNav,
    ): Promise<void> {
      const neste = navKjede.then(() => navigerTilIndre(raw, kilde, entryHint))
      // Kjeden må ikke forgiftes av en avvisning (alle senere kall ville
      // arvet den), men den RETURNERTE promisen beholder den — det er den
      // kallstedene rapporterer på.
      navKjede = neste.catch(() => {})
      return neste
    }

    // Bevisst UTEN try/catch (review av PR #690): en intern catch gjorde
    // .catch()-ene på kallstedene til død kode, så en uventet feil kunne
    // aldri bli synlig noe sted. Feilen bobler nå ut, og alle tre inngangene
    // (broadcast, kanal, og cache via sjekkPendingNavTrygt) logger den som
    // `klient.sw.pendingnav.feilet` — fail-open står, men ikke i stillhet.
    async function navigerTilIndre(
      raw: string,
      kilde: 'broadcast' | 'cache' | 'kanal',
      entryHint?: PendingNav,
    ) {
      const sti = lokalSti(raw)
      if (sti === null) return // Ugyldig eller kryss-origin — ignorer.
      const target = `${window.location.origin}${sti}`

      // Identitets-vakt (#626-review): vi står allerede på målet. Uten den
      // laster vi samme URL to ganger. Dekker også cold-start, der
      // openWindow allerede har landet oss riktig sted.
      if (target === window.location.href) {
        // LES FØR DU SLETTER. Broadcast- og kanal-stien sender ingen
        // entryHint, så en sletting først gjorde lesningen null: guarden
        // under ble alltid sann, raden ble logget uten klikk_id/forsok, og
        // oppføringen ble revet bort under føttene på cache-pollen som
        // HADDE den (review av #688).
        const entry = entryHint ?? (await lesPendingNav())
        // Konsumer entryen: vi STÅR på målet, ingenting mer å bevare.
        await slettPendingNav()
        // `navigert: true` betyr at raden alt er logget som navigert fra
        // en TIDLIGERE side (item 7 under skrev den rett før assign) — en
        // ny logging her ville kollidert med varsel_logg sin dedup-indeks
        // og dobbelttalt samme klikk. `landingLogget` er samme vern mot to
        // samtidige kilder i SAMME sidevisning.
        if (entry?.navigert !== true && !landingLogget) {
          landingLogget = true
          loggPushNavigasjon(kilde, true, entry?.klikk_id, entry?.forsok)
        }
        return
      }

      // Én navigasjon per mål per sidevisning: kommer en annen kilde inn
      // etter at assign() er kalt, er siden alt på vei bort — et nytt assign
      // og en ny rad ville bare dobbelttalt klikket.
      if (committetMaal === target) return

      const entry = entryHint ?? (await lesPendingNav())
      const nesteForsok = (entry?.forsok ?? 0) + 1

      // Tilbakeskrivingen må fullføre FØR assign — ellers river navigasjonen
      // ned realmet før cache.put er ferdig, og loop-brytelsen
      // (PUSH_KLIKK_MAKS_FORSOK) mister tellingen. Bounded (samme mønster
      // som NAV_SKRIV_TIMEOUT_MS i public/sw.js): en hengende cache-skriving
      // skal aldri kunne blokkere navigasjonen.
      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, NAV_SKRIV_TIMEOUT_MS)
        skrivPendingNav({
          url: raw,
          // `ts` friskes bevisst IKKE: den bevarte verdien er det egentlige
          // gulvet i loop-brytelsen. Forsøkstelleren kan miste et forsøk
          // (timeouten over), men et uendret tidsstempel gjør at entryen
          // uansett faller ut på PUSH_KLIKK_VINDU_MS. Friskes den opp, blir
          // PUSH_KLIKK_MAKS_FORSOK eneste bremsen — og den er ikke garantert.
          ts: entry?.ts ?? Date.now(),
          klikk_id: entry?.klikk_id,
          forsok: nesteForsok,
          navigert: true,
        }).finally(() => {
          window.clearTimeout(timer)
          resolve()
        })
      })

      committetMaal = target
      loggPushNavigasjon(kilde, false, entry?.klikk_id, nesteForsok)
      window.location.assign(target)
    }

    function loggPushNavigasjon(
      kilde: string,
      alleredePaaMaal: boolean,
      klikkId?: string,
      forsok?: number,
    ) {
      // Nøkkelnavnene (kilde/allerede_paa_maal/synlighet/klikk_id/forsok) må
      // matche KONTEKST_WHITELIST i lib/logg-sanitering.ts — parameteret over
      // kan forbli camelCase, det er kun objekt-nøkkelen som teller (#681).
      sendFeilBeacon(
        'push.klikk.navigert',
        `push-klikk levert via ${kilde}`,
        undefined,
        {
          kilde,
          allerede_paa_maal: alleredePaaMaal,
          synlighet: document.visibilityState,
          klikk_id: klikkId,
          forsok,
        },
        'warn',
      )
    }

    // Fallback for en enhet med ny SW men gammel cachet klient-bundle
    // (#264): SW-en svarer på check-pending-nav ved å lese samme Cache
    // Storage internt, så protokollen fungerer uendret selv om denne
    // funksjonen aldri kalles av en gammel bundle. Bruker MessageChannel
    // fordi navigator.serviceWorker.controller er null ved cold-start (siden
    // lastet før SW tok kontroll) — registration.active fungerer uavhengig
    // av kontroll-status, og MessageChannel garanterer at SW kan svare.
    async function sjekkViaMessageChannel() {
      const reg = await navigator.serviceWorker.ready
      if (!reg.active) return
      const channel = new MessageChannel()
      channel.port1.onmessage = (event) => {
        const data = event.data
        if (!data || data.type !== 'navigate' || typeof data.url !== 'string') return
        // Samme .catch() som broadcast-søsteren over: callbacken awaiter ikke
        // den async navigerTil, så en avvist promise ville blitt en unhandled
        // rejection. Asymmetri her inviterer til feil antakelse om at den ene
        // stien er tryggere enn den andre (review av #688).
        navigerTil(data.url, 'kanal').catch((err: unknown) => {
          sendFeilBeacon(
            'klient.sw.pendingnav.feilet',
            err instanceof Error ? err.message : String(err),
            err instanceof Error ? err.stack : undefined,
            { name: feilNavn(err) },
            'warn',
          )
        })
      }
      reg.active.postMessage({ type: 'check-pending-nav' }, [channel.port2])
    }

    // Cache-stien prøves FØRST og er uavhengig av navigator.serviceWorker.
    // ready — det er kjernen i fiksen: er reg.active null, eller henger
    // ready-promiset, skal en fersk cache-entry likevel navigere.
    //
    // Leser UTEN å slette (#688, lib/pending-nav.ts): konsumering skal skje
    // når navigasjonen faktisk har lyktes, ikke ved lesing — leser og sletter
    // vi før auth får omdirigert til /login, er målet borte for godt selv om
    // vi aldri kom fram.
    async function sjekkPendingNav() {
      const entry = await lesPendingNav()
      if (!entry) {
        // Cachen var tom (eller Cache Storage utilgjengelig) — fall tilbake
        // til dagens MessageChannel-vei mot SW-en.
        await sjekkViaMessageChannel()
        return
      }

      const sti = lokalSti(entry.url)
      if (sti === null) {
        // Ugyldig eller kryss-origin mål — ingen navigasjon, ingen retry.
        await slettPendingNav()
        return
      }

      // Identitetssjekken kjører FØR ferskhetssjekken (review av #688): en
      // innlogging som tar lengre tid enn PUSH_KLIKK_VINDU_MS lander riktig,
      // og da er «foreldet» feil svar — det ville invertert signalet på selve
      // flyten dette issuet innfører. Står vi på målet, LYKTES navigasjonen,
      // uansett hvor lenge oppføringen har ligget.
      const target = `${window.location.origin}${sti}`
      if (target === window.location.href) {
        // Vi står allerede på målet. Delegér til navigerTil i stedet for å
        // konsumere her: landings-grenen der er identisk, og da går også
        // DENNE stien gjennom navKjede-serialiseringen og landingLogget-
        // guarden (review av PR #690). To samtidige kilder — cache-poll og
        // broadcast — ville ellers logget hver sin rad for samme landing.
        await navigerTil(entry.url, 'cache', entry)
        return
      }

      if (Date.now() - entry.ts >= PUSH_KLIKK_VINDU_MS) {
        // Eldre enn vinduet — ikke en programfeil (klienten kan ha vært
        // lukket lenge), men verdt å se i observability hvis det skjer ofte.
        await slettPendingNav()
        sendFeilBeacon(
          'klient.pushklikk.foreldet',
          `push-klikk-URL var ${Date.now() - entry.ts} ms gammel (grense ${PUSH_KLIKK_VINDU_MS} ms)`,
          undefined,
          undefined,
          'warn',
        )
        return
      }

      if ((entry.forsok ?? 0) >= PUSH_KLIKK_MAKS_FORSOK) {
        // Loop-bryter: målet er forsøkt PUSH_KLIKK_MAKS_FORSOK ganger uten
        // landing. Forkast oppføringen i stedet for å prøve i det uendelige.
        await slettPendingNav()
        sendFeilBeacon(
          'klient.pushklikk.oppgitt',
          `push-klikk-mål ${sti} nådd etter ${entry.forsok} forsøk uten landing`,
          undefined,
          { klikk_id: entry.klikk_id, maal: sti, forsok: entry.forsok },
          'warn',
        )
        return
      }

      await navigerTil(entry.url, 'cache', entry)
    }

    // sjekkPendingNav er async, men kalles fra en event-handler og fra
    // setTimeout — ingen av dem håndterer en avvist promise. De interne
    // try/catch-ene i lib/pending-nav.ts dekker bare cache-oppslagene;
    // fallback-stien (await navigator.serviceWorker.ready) er udekket, og en
    // reject der ville blitt en unhandledrejection. Vi svelger den ikke: en
    // stille catch her ville reintrodusert nøyaktig blindsonen #626 handler
    // om — at overleveringen svikter uten spor. Warn-nivå fordi en avvist
    // ready som regel er miljøet (privat modus, SW avregistrert), ikke en
    // programfeil.
    function sjekkPendingNavTrygt() {
      sjekkPendingNav().catch((err: unknown) => {
        sendFeilBeacon(
          'klient.sw.pendingnav.feilet',
          err instanceof Error ? err.message : String(err),
          err instanceof Error ? err.stack : undefined,
          { name: feilNavn(err) },
          'warn',
        )
      })
    }

    function handterVisibility() {
      if (document.visibilityState === 'visible') sjekkPendingNavTrygt()
    }

    navigator.serviceWorker.addEventListener('message', handterMelding)
    document.addEventListener('visibilitychange', handterVisibility)

    // Race: ved cold-start (PWA åpnes fra lukket via notifikasjon) kan
    // klienten mounte FØR SW har rukket å behandle notificationclick og
    // skrive cache-entryen. Polle flere ganger med stigende delay dekker
    // dette uten å spamme unødvendig hvis vi finner svaret tidlig.
    // navigerTil kalles av handteren ovenfor; den vil avslutte siden
    // umiddelbart, så ekstra poller blir aldri synlige etter første treff.
    const forsoek = [0, 200, 800, 2000]
    const timers = forsoek.map(ms => window.setTimeout(sjekkPendingNavTrygt, ms))

    return () => {
      navigator.serviceWorker.removeEventListener('message', handterMelding)
      document.removeEventListener('visibilitychange', handterVisibility)
      timers.forEach(t => window.clearTimeout(t))
    }
  }, [])
  return null
}
