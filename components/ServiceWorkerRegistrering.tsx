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

// Tak på tilbakeskrivingen av forsøkstelleren (speiler public/sw.js): en
// hengende cache-skriving skal aldri blokkere navigasjonen — verste utfall er
// at loop-bryteren mister ett forsøk.
const NAV_SKRIV_TIMEOUT_MS = 1000

// Felt fra SW-ens check-pending-nav-svar. Kun telemetri — skal aldri styre
// forsøkstelling, ferskhet eller navigasjon (#626).
type KanalTelemetri = Pick<PendingNav, 'klikk_id' | 'forsok' | 'navigert'>

export default function ServiceWorkerRegistrering() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    // Meldes eksplisitt: FeilFangst ser ikke en fanget feil, og push kunne
    // vært dødt i månedsvis uten spor (#626).
    navigator.serviceWorker
      .register('/sw.js')
      .catch((err: unknown) => meldKlientfeil('klient.sw.registrering.feilet', err))

    // Push-klikk-navigasjon: SW kan ikke navigere appen selv (openWindow er
    // no-op i åpen PWA, client.navigate upålitelig på iOS — #233, #262). SW-en
    // legger URL-en i Cache Storage, som overlever SW-bytte, og vi leser den
    // ved mount og visibility-change (#626). Se CLAUDE.md § Policy: Navigasjon.
    function handterMelding(event: MessageEvent) {
      const data = event.data
      if (!data || data.type !== 'navigate' || typeof data.url !== 'string') return
      // Ikke awaitet — .catch() hindrer unhandled rejection og logger feilen.
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

    // `kilde` viser hvilken av tre stier som leverte URL-en (#676).
    // `entryHint` gjenbruker en allerede lest entry; uten den leser navigerTil
    // selv. Det finnes kun ÉN pending-nav-rad om gangen, så det er samme rad.

    // In-flight-guard: cache-pollen og SW-broadcasten kommer nesten samtidig,
    // og ville ellers gitt to navigasjoner og to telemetri-rader per klikk (PR #690).
    //  * `navKjede` serialiserer lese/øke/skrive.
    //  * `committetMaal`: etter assign() navigerer ingen annen kilde dit igjen.
    //  * `landingLogget`: kall nr. 2 kan ha en entryHint lest før nr. 1
    //    slettet raden, og ville logget samme landing to ganger.
    // Settes kun når stien fullførte, og lever i effekt-closuren (ny mount =
    // blanke ark).
    let navKjede: Promise<void> = Promise.resolve()
    let committetMaal: string | null = null
    let landingLogget = false

    function navigerTil(
      raw: string,
      kilde: 'broadcast' | 'cache' | 'kanal',
      entryHint?: PendingNav,
      kanalTelemetri?: KanalTelemetri,
    ): Promise<void> {
      const neste = navKjede.then(() => navigerTilIndre(raw, kilde, entryHint, kanalTelemetri))
      // Kjeden skal ikke forgiftes av en avvisning, men den returnerte
      // promisen beholder den — kallstedene rapporterer på den.
      navKjede = neste.catch(() => {})
      return neste
    }

    // Bevisst UTEN try/catch: feilen skal boble til kallstedene, som alle
    // logger `klient.sw.pendingnav.feilet` (PR #690).
    async function navigerTilIndre(
      raw: string,
      kilde: 'broadcast' | 'cache' | 'kanal',
      entryHint?: PendingNav,
      kanalTelemetri?: KanalTelemetri,
    ) {
      const sti = lokalSti(raw)
      if (sti === null) return // ugyldig eller kryss-origin
      const target = `${window.location.origin}${sti}`

      // Står vi allerede på målet (også cold-start via openWindow), lastes
      // ikke samme URL på nytt — vi konsumerer og logger landingen.
      if (target === window.location.href) {
        // LES FØR DU SLETTER: broadcast/kanal har ingen entryHint, og en
        // sletting først ville gjort lesningen null (#688). På kanal-stien har
        // SW-en alt slettet raden, så SW-svarets felt er eneste kilde.
        const entry: KanalTelemetri | null =
          entryHint ?? kanalTelemetri ?? (await lesPendingNav())
        await slettPendingNav()
        // `navigert: true` = en tidligere side logget navigasjonen rett før
        // assign; dette er landingen, egen hendelse så samme klikk ikke
        // dobbelttelles (per-klikk-dedup, migrasjon 154). Maks én rad per
        // sidevisning.
        if (!landingLogget) {
          landingLogget = true
          if (entry?.navigert === true) {
            loggPushLanding(kilde, entry.klikk_id, entry.forsok, sti)
          } else {
            loggPushNavigasjon(kilde, true, entry?.klikk_id, entry?.forsok, sti)
          }
        }
        return
      }

      if (committetMaal === target) return

      // `kanalTelemetri` styrer BEVISST ikke loop-bryteren her; kun klikk_id
      // lånes, som ren korrelasjon (#626).
      const entry = entryHint ?? (await lesPendingNav())
      const nesteForsok = (entry?.forsok ?? 0) + 1
      const klikkId = entry?.klikk_id ?? kanalTelemetri?.klikk_id
      // Telemetrien følger det FAKTISKE forsøket, ellers slukes et gjentatt
      // forsok=1 for samme klikk_id av per-klikk-dedupen (migrasjon 154).
      const loggForsok = kanalTelemetri?.forsok !== undefined && !entry
        ? kanalTelemetri.forsok + 1
        : nesteForsok

      // Må fullføre FØR assign, ellers river navigasjonen ned realmet før
      // cache.put er ferdig og loop-bryteren mister tellingen. Tidsbegrenset.
      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, NAV_SKRIV_TIMEOUT_MS)
        skrivPendingNav({
          url: raw,
          // `ts` friskes bevisst IKKE: den er det garanterte gulvet i
          // loop-bryteren (faller ut på PUSH_KLIKK_VINDU_MS). Forsøkstelleren
          // kan miste et forsøk ved timeout.
          ts: entry?.ts ?? Date.now(),
          klikk_id: klikkId,
          forsok: nesteForsok,
          navigert: true,
        }).finally(() => {
          window.clearTimeout(timer)
          resolve()
        })
      })

      committetMaal = target
      loggPushNavigasjon(kilde, false, klikkId, loggForsok, sti)
      window.location.assign(target)
    }

    function loggPushNavigasjon(
      kilde: string,
      alleredePaaMaal: boolean,
      klikkId?: string,
      forsok?: number,
      maal?: string,
    ) {
      // Objekt-nøklene MÅ stå i KONTEKST_WHITELIST i lib/logg-sanitering.ts
      // (#681). `url` (satt av sendFeilBeacon) er siden vi navigerer FRA;
      // `maal` er dit vi skal.
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
          maal,
        },
        'warn',
      )
    }

    // Bekrefter at en tidligere logget push.klikk.navigert faktisk landet.
    // Egen hendelse så klikket ikke dobbelttelles (#626).
    function loggPushLanding(kilde: string, klikkId: string | undefined, forsok: number | undefined, maal: string) {
      sendFeilBeacon(
        'push.klikk.landet',
        `push-klikk landet på mål via ${kilde}`,
        undefined,
        {
          kilde,
          klikk_id: klikkId,
          forsok,
          maal,
        },
        'warn',
      )
    }

    // Fallback-protokoll mot SW-en (#264). MessageChannel fordi
    // serviceWorker.controller er null ved cold-start; registration.active
    // virker uavhengig av kontroll-status.
    async function sjekkViaMessageChannel() {
      const reg = await navigator.serviceWorker.ready
      if (!reg.active) return
      const channel = new MessageChannel()
      channel.port1.onmessage = (event) => {
        const data = event.data
        if (!data || data.type !== 'navigate' || typeof data.url !== 'string') return
        // SW-en har alt slettet cache-raden, så feltene fra svaret er eneste
        // kilde. Sendes som telemetri, IKKE som entryHint, så de ikke styrer
        // forsøkstelling/ts (#626). Valideres: eldre SW sender dem ikke.
        const kanalTelemetri: KanalTelemetri = {
          klikk_id: typeof data.klikk_id === 'string' ? data.klikk_id : undefined,
          forsok: typeof data.forsok === 'number' ? data.forsok : undefined,
          navigert: data.navigert === true || undefined,
        }
        // Samme .catch() som broadcast-stien — ikke awaitet.
        navigerTil(data.url, 'kanal', undefined, kanalTelemetri).catch((err: unknown) => {
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

    // Cache-stien først og uavhengig av serviceWorker.ready, som kan henge.
    // Leser UTEN å slette: konsumering først når navigasjonen lyktes, ellers
    // er målet borte hvis auth omdirigerer til /login (#688).
    async function sjekkPendingNav() {
      const entry = await lesPendingNav()
      if (!entry) {
        await sjekkViaMessageChannel()
        return
      }

      const sti = lokalSti(entry.url)
      if (sti === null) {
        await slettPendingNav()
        return
      }

      // Identitet FØR ferskhet: en treg innlogging som lander riktig er en
      // suksess, ikke «foreldet» (#688).
      const target = `${window.location.origin}${sti}`
      if (target === window.location.href) {
        // Via navigerTil så også denne stien går gjennom navKjede og
        // landingLogget (PR #690).
        await navigerTil(entry.url, 'cache', entry)
        return
      }

      if (Date.now() - entry.ts >= PUSH_KLIKK_VINDU_MS) {
        // Ikke en programfeil, men verdt å se hvis det skjer ofte.
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
        // Loop-bryter: forkast etter PUSH_KLIKK_MAKS_FORSOK forsøk uten landing.
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

    // Kalles fra event-handler og setTimeout, som ikke håndterer avvisning
    // (f.eks. fra serviceWorker.ready). Logges, aldri stille (#626). Warn:
    // en avvist ready er som regel miljøet, ikke en programfeil.
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

    // Cold-start: klienten kan mounte FØR SW-en har skrevet cache-entryen,
    // derav poll med stigende delay. Første treff navigerer bort.
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
