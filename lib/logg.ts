// Sentral observability-modul. All server-side logging skal gå gjennom
// logg.warn() / logg.feil() — ikke console.error/warn direkte.
//
// Event-taksonomi (dot-separert navnerom):
//   varsel.send.feilet          — sendPush/sendEpost-feil i lib/varsler.ts
//   varsel.epost.feilet         — Resend API-feil i lib/epost.ts
//   varsel.url.relativ          — url som verken er absolutt eller starter med «/» (#507)
//   varsel.push.feilet          — web-push-feil i lib/push.ts
//   bilde.opplast.feilet        — R2-opplasting feiler
//   video.opplast.feilet        — video-upload feiler
//   tema.ugyldig                — ukjent tema-verdi
//   chat.varsler.feilet         — mention-varsler etter chat-post feiler
//   kaaringspoll.varsler.feilet — varsler etter kåringspoll-hendelse feiler
//   cron.paaminne.feilet        — enkelt-oppgave i påminnelses-cron feiler
//   bursdagsgratulasjon.feilet  — insert-feil eller uventet exception
//   vitals.insert.feilet        — web-vitals-rad feiler i DB
//   github.webhook.feilet       — webhook-konfigurasjons- eller varselfeil
//   bli-utvikler.issue.feilet   — GitHub Issue-oppretting feiler
//   ai.datoforslag.feilet       — Anthropic dato-forslag feiler (auth/transient)
//   aktivitet.tell.feilet       — tell_aktivitet-RPC feiler i /api/aktivitet
//   tidligere.hent.feilet       — arrangement/melding/poll-spørring feiler på /tidligere (#492)
//   poll.aggregat.feilet        — tell_poll_stemmer-RPC feiler i lib/queries/poll.ts (#492)
//   varsel.innstilling.feilet   — varsel_innstillinger-oppslag (aktiv/test-modus) feiler (#503)
//   varsel.fortidssperre.feilet — arrangementer-oppslag for fortids-sperren feiler (#503)
//   varsel.mottakere.feilet     — mottaker-oppslag (profiles) feiler i lib/varsler.ts (#503)
//   varsel.mottakere.tomme      — eksplisitt mottakerliste ga 0 aktive treff utenfor testmodus (#503)
//   varsel.dedup.feilet         — dedup-select mot varsel_logg feiler, sender likevel (#503)
//   varsel.preferanser.feilet   — varsel_preferanser/push_subscriptions-oppslag feiler (#503)
//   varsel.logg.insert.feilet   — insert i varsel_logg feiler for én mottaker, sender likevel (#503)
//   varsel.scope.feilet         — arrangement/poll-oppslag for @-mention-tittel feiler, sender likevel (#503)
//   pass.varsler.feilet         — varsel etter pass-tilgang-hendelse feiler i lib/actions/pass.ts (#503)
//   pass.stempel.feilet         — stemple_pass_varslet()-RPC feiler etter vellykket varsel (#504)
//   cron.klientfeil.varsel.feilet — alarm-varsel i sjekk-klientfeil-cronet feiler, retention kjører videre (#503)
//   cron.klientfeil.mottakere.tomme — warn: ingen har faar_feilvarsler, døgnalarmen fyrer aldri (#582)
//   github.webhook.mottakere.tomme  — warn: ingen har faar_issue_varsler, innspill når bare innsenderen (#582)
//   cron.paaminne.hentForDag.feilet          — arrangementer-oppslag for en påminnelsesdag feiler (#504)
//   cron.paaminne.hentArrangorPurringer.feilet — arrangoransvar-oppslag for dagens purringer feiler (#504)
//   cron.paaminne.kaaring.fersk.feilet   — «åpne kåringspoller»-spørringen feiler (#495/#504)
//   cron.paaminne.kaaring.retry.feilet   — «uvarslede avsluttede kåringspoller»-spørringen feiler (#495/#504)
//   cron.paaminne.kaaring.profiler.feilet — mottaker-oppslag for kåringsvarsel feiler, DEN ufravikelige (#495/#504)
//   cron.paaminne.kaaring.feilet — behandleKaaringspoller() kastet, fanget i kjorPaaminnelser (#504)
//   cron.paaminne.kaaring.rpc.feilet     — avslutt_kaaringspoll-RPC-en feilet for én poll (#504)
//   cron.paaminne.kaaring.tom_rpc        — avslutt_kaaringspoll returnerte ingen rad (#504)
//   cron.paaminne.kaaring.fersk_ikke_lukket — warn: fersk poll ble ikke lukket (ikke_moden / kappløp), utsettes til retry (#504)
//   bursdagsgratulasjon.profiler.feilet  — profiler-med-fødselsdato-oppslag feiler (#504)
//   bursdagsgratulasjon.avsendere.feilet — avsender-admin-oppslag feiler (#504)
//   bursdagsgratulasjon.varsel.feilet    — varsel til bursdagsbarnet feiler, telles som feil (#504)
//   logg.feillogg.insert.feilet — feil_logg-inserten fra logg.feil() selv feilet/timet ut (#496)
//   pass.varsel.oppslag.feilet  — navn-/tur-berikelse for pass-varsel feiler etter committet skriving, sender likevel (pulje A)
//   fond.eiendom.oppslag.feilet    — gammel markedsverdi-oppslag feiler før oppdatering/sletting (pulje A)
//   fond.verdipapir.oppslag.feilet — gammel verdi-oppslag feiler før oppdatering/sletting (pulje A)
//   fond.kontant.oppslag.feilet    — gammel kontantsaldo-oppslag feiler før oppdatering (pulje A)
//   fond.oppgjor.profiler.feilet   — profil-oppslag for visningsnavn-matching i fond-oppgjør feiler (pulje A)
//   fond.oppgjor.innskudd.feilet   — innskudd-rader-oppslag i fond-oppgjør feiler (pulje A)
//   fond.oppgjor.saldo.feilet      — kontantsaldo-oppslag for diff-visning i fond-oppgjør feiler (pulje A)
//   album.revalidering.oppslag.feilet    — arrangement_id-oppslag for revalidatePath feiler etter committet album-mutasjon (pulje A)
//   album.slett.bilder_oppslag.feilet    — bilder-oppslag for R2-opprydding feiler før album slettes (pulje A)
//   arrangement.slett.bilde_oppslag.feilet — bilde_url-oppslag for R2-opprydding feiler før arrangement slettes (pulje A)
//   arrangement.kobletPoll.oppslag.feilet  — koblet kåringspoll-oppslag feiler på arrangementsiden, siden rendres uten lenken (pulje B)
//   tidligere.minProfil.oppslag.feilet     — egen rolle-oppslag feiler på /tidligere, faller tilbake til «ikke admin» (pulje B)
//   album.profiler.oppslag.feilet          — @mention-profiler-oppslag feiler på albumsiden (pulje C)
//   arrangement.rediger.gjeldendeAnsvar.oppslag.feilet — forhåndsvalgt dropdown-verdi feiler på rediger-siden (pulje C)
//   innspill.profiler.oppslag.feilet       — innsender-navn-oppslag feiler på innspill-siden (pulje C)
//   tiebreak.profiler.oppslag.feilet       — kandidat-navn/bilde-oppslag feiler på tiebreak-siden (pulje C)
//   medlem.rediger.generalsekretaer.oppslag.feilet — GS-confirm-dialog-oppslag feiler på medlem-rediger-siden (pulje C)
//   bli-utvikler.profil.oppslag.feilet     — innsender-navn-oppslag feiler ved innspill-opprettelse (pulje C)
//   cron.klientfeil.mottakere.feilet       — admin-mottaker-oppslag feiler i sjekk-klientfeil-cronet, alarm uteblir (pulje C)
//   github.webhook.mottakere.feilet        — admin-mottaker-oppslag feiler i GitHub-webhooken, 500 så GitHub retryer (pulje C)
//   admin.varsel_logg.hent.feilet          — varsel_logg-oppslag feiler i admin-API-et; klienten får generisk 500 (pulje C-review)
//   klient.chat.meldinger.feilet           — chat-meldingshenting feiler i nettleseren (pulje C-review)
//   klient.chat.reaksjoner.feilet          — reaksjonshenting feiler i nettleseren (pulje C-review)
//   varsel.dedup.ingen_noekkel  — tillatDuplikat: false uten arrangementId/pollId/dedupNoekkel i lib/varsler.ts — ingen nøkkel å deduplisere på, sjekken under er en no-op (#518)
//   samtaler.marker_lest.oppdatering.feilet — samtale_chat-oppdateringen til lest = true feiler ved sidelast, siden rendres videre (#539)
//   samtaler.marker_lest.feilet — markerSamtaleLest() kastet uventet fra /samtaler/[id] (#539)
//   ulest.marker_chat_sett.feilet — markerChatSett() kastet uventet fra /chat, fire-and-forget under render (#539-review)
//   klient.ressurs.feilet       — en <script>/<link>/<img> lastet ikke i nettleseren; ressurs-URL i konteksten (#575)

import { naa } from '@/lib/dato'
import { SENTRY_DSN } from '@/lib/config'
import type { Json } from '@/lib/supabase/database.types'

// ─── PII-SCRUBBING ──────────────────────────────────────────────────────────

// Felter vi tillater i kontekst sendt til Sentry og feil_logg.
// Alt som ikke er på listen strippes ut. Formålet er å unngå at navn,
// epostadresser, telefonnummer e.l. havner i Sentry-kvotaen.
const KONTEKST_WHITELIST = new Set([
  'profil_id',
  'arrangement_id',
  'event',
  'code',
  'nivaa',
  'count',
  'tabell',
  'fingerprint',
  'sample',
  'status',
])

function scrubbet(data?: Record<string, unknown>): Record<string, unknown> {
  if (!data) return {}
  // Tillat også felter som er nestet under «ctx» — planleggeren la ctx-støtte
  // til for cron-aggregering (f.eks. ctx: { count: 3 }).
  const ctx = data.ctx && typeof data.ctx === 'object' ? (data.ctx as Record<string, unknown>) : {}
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries({ ...data, ...ctx })) {
    if (k !== 'ctx' && KONTEKST_WHITELIST.has(k)) result[k] = v
  }
  return result
}

// ─── POSTGREST-NORMALISERING ─────────────────────────────────────────────────

// Supabase-klienten pakker DB-feil inn som { code, message, details, hint }.
// For Sentry er det nyttigere å gruppere etter feil-kode (f.eks. «23505»)
// enn etter den lange meldingsstrengen. Normalisering gir bedre fingerprinting.
function normaliserFeil(err: unknown): {
  code?: string
  tabell?: string
  melding: string
  // Feilklassens navn («TypeError», «IkkeInnloggetFeil», …). Persisteres i
  // feil_logg fordi meldingen bevisst ikke er det: uten dette ble raden for en
  // vanlig Error skrevet med kontekst `{}`, og det var umulig å se om feilen var
  // en programfeil eller en vi selv hadde kastet. Navnet er en konstant fra
  // koden, aldri en radverdi, så det er trygt å lagre.
  navn?: string
} {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>
    const navn = err instanceof Error ? err.name : undefined
    if (typeof e.code === 'string' && typeof e.message === 'string') {
      // Forsøk å ekstrahere en identifikator (tabell eller constraint) fra
      // PostgREST-meldingen. Typisk format:
      //   «duplicate key value violates unique constraint "tabell_col_key"»
      // Regex-en grupperer konsistent på snake_case-identifikatorer, men den
      // kan like gjerne treffe constraint-navn som selve tabell-navnet —
      // derfor navngir vi feltet «identifikator» videre.
      const identMatch = String(e.message).match(/"([^"]+?_[^"]+?)"/)
      return {
        code: e.code,
        tabell: identMatch?.[1],
        melding: e.message,
        navn,
      }
    }
    // Ikke-PostgREST-feil: meldingsformen holdes uendret (String(err) gir
    // «Error: …»), kun navnet kommer i tillegg.
    return { melding: String(err), navn }
  }
  return { melding: String(err) }
}

// ─── TILGANGSFEIL-KLASSIFISERING (42501) + DØD SESJON (PGRST301) ────────────
//
// PGRST301 er IKKE en variant av 42501 — det var en gal premiss i #497 og i
// den opprinnelige kommentaren her. PostgREST bruker PGRST301 for utløpt eller
// ugyldig JWT (HTTP 401, melding «JWT expired»). Den teksten matcher ingen av
// regexene under, så den falt til error → Sentry-event + feil_logg-rad +
// morgenalarm. En død sesjon i en iOS-PWA er rutine og brukerutløst (ITP
// spiser cookies), ikke en programfeil — den skal være warn. Se #498-review.
//
// 42501 (Postgres «permission denied») beholdes UENDRET: den er tripwiren for
// GRANT-klippen 30.10.2026 og skjuler to helt ulike årsaker bak samme kode:
//
//   1. «permission denied for table/view/function/sequence/schema …»
//      → manglende GRANT. PostgREST returnerer IKKE 42501 når en RLS-policy
//        filtrerer bort rader ved SELECT — da får du bare en tom liste og
//        HTTP 200. Så 42501 på en SELECT kan i vårt oppsett KUN bety at en
//        GRANT mangler, altså et ødelagt deploy. Supabase fjerner
//        default-grants på public-schema 30. oktober 2026 (CLAUDE.md §
//        Policy: Migrasjoner) — dette er tripwiren for akkurat den datoen,
//        og skal derfor aldri kunne nedgraderes til warn.
//   2. «… violates row-level security policy …»
//      → ekte policy-avvisning, trigget av lovlig brukeradferd (f.eks. en
//        insert avvist fordi raden ikke tilhører brukeren). Fortsatt warn.
//   3. Alt annet med denne SQLSTATE-en → error. Før #497 falt ALT i denne
//      koden til warn uansett meldingstekst, noe som holdt alarmen taus helt
//      fram til 30.10.2026-fristen. Snur vi defaulten blir feilmoden «litt
//      for mye støy» i stedet for «taus» — og endrer Postgres ordlyden sin
//      ved en fremtidig oppgradering, blir vi støyete, ikke blinde.
function klassifiserTilgangsfeil(melding: string, code?: string): 'error' | 'warn' | null {
  // Død/ugyldig sesjon → warn. Både på kode og på meldingstekst: PostgREST
  // svarer PGRST301, mens GoTrue-/PostgREST-varianter kan komme uten kode i
  // det hele tatt, og da er teksten det eneste signalet vi har.
  //
  // AUTH_INGEN_SESJON er vår egen kode (IkkeInnloggetFeil i lib/auth.ts) for
  // «getUser() ga ingen bruker». Samme rotårsak som PGRST301 — utløpt eller
  // manglende sesjon — men den kom aldri hit som PostgREST-feil, så #498-
  // nedgraderingen traff den ikke. Den falt derfor til error og fyrte Sentry
  // + morgenalarm på noe som er rutine når iOS spiser cookies.
  if (
    code === 'PGRST301' ||
    code === 'AUTH_INGEN_SESJON' ||
    /JWT (expired|invalid)|JWSError/i.test(melding)
  ) {
    return 'warn'
  }
  if (code !== '42501') return null
  if (/permission denied for (table|view|function|sequence|schema)/i.test(melding)) {
    return 'error'
  }
  if (/violates row-level security policy/i.test(melding)) {
    return 'warn'
  }
  return 'error'
}

// ─── FEIL_LOGG-PERSISTERING ──────────────────────────────────────────────────
//
// Skriver server-feil til feil_logg (#496) slik at sjekk-klientfeil-cronet —
// som i dag kun teller rader satt inn av klienten via /api/logg-feil — også
// fanger opp server-feil. Lukker hullet mellom de to feilkanalene beskrevet
// i #492: Sentry er avhengig av at noen leser eposten, feil_logg driver en
// bevist-i-drift daglig alarm.
async function persisterFeilLogg(
  event: string,
  code: string | undefined,
  tabell: string | undefined,
  navn: string | undefined,
  ctx?: Record<string, unknown>,
): Promise<void> {
  try {
    // Lazy import: ingen 'use client'-fil importerer @/lib/logg (verifisert),
    // så service_role-nøkkelen havner aldri i klient-bundlen. 0 kB vekst.
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()

    // Kun profil_id tas med fra ctx — resten av KONTEKST_WHITELIST
    // (arrangement_id, count, fingerprint, sample, status) er ikke del av
    // kontrakten for denne tabellen. melding persisteres bevisst ALDRI:
    // normaliserFeil() returnerer PostgREST-teksten rått, og den kan bære
    // radverdier (f.eks. «Key (epost)=(x@y.no) already exists»).
    const ctxScrubbet = scrubbet(ctx)
    const profilId = typeof ctxScrubbet.profil_id === 'string' ? ctxScrubbet.profil_id : null

    const { error } = await admin
      .from('feil_logg')
      .insert({
        event,
        // logg.feil() har i dag bare denne ene veien fram hit — warn
        // returnerer tidlig lenger opp i feil() og treffer aldri persist.
        // Skriv nivået eksplisitt likevel fremfor å anta, i tilfelle en
        // egen fatal-vei legges til senere.
        nivaa: 'error',
        // navn (feilklassen) er med fordi code/tabell begge er undefined for en
        // vanlig Error — raden ble da skrevet som `{}` og var verdiløs å lese.
        kontekst: { code, tabell, navn } as Json,
        profil_id: profilId,
      })
      // Hard cap: under pool-utmattelse skal ikke en logge-skriving legge
      // seg oppå trykket ved å vente ubegrenset på en ledig tilkobling.
      .abortSignal(AbortSignal.timeout(1000))

    if (error) {
      // Ren stdout — IKKE logg.feil() her, det ville vært selv-rekursivt.
      console.log(JSON.stringify({ ts: naa(), nivaa: 'warn', event: 'logg.feillogg.insert.feilet', code: error.code }))
    }
  } catch {
    // Loggingen skal ALDRI kunne kaste — en logger som velter render-stien
    // er verre enn feilen den prøvde å logge. Fanger både nettverksfeil og
    // AbortError fra timeouten over.
  }
}

// ─── SENTRY LAZY IMPORT ──────────────────────────────────────────────────────

// Dynamisk import for å unngå hard avhengighet til @sentry/nextjs i dev
// (appen kjøres uten DSN lokalt, og lib/logg.ts skal fungere uten Sentry).
// Importeres kun i logg.feil() slik at Sentry aldri initialiseres i warn-sti.
async function getSentry() {
  if (!SENTRY_DSN) return null
  try {
    const Sentry = await import('@sentry/nextjs')
    return Sentry
  } catch {
    return null
  }
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

export const logg = {
  /**
   * Logg en forventet, ikke-kritisk hendelse til stdout. Ikke Sentry.
   * Bruk for: validerings-avvisning, blokkert utsending, manglende konfig.
   */
  warn(event: string, data?: Record<string, unknown>) {
    const ts = naa()
    console.log(
      JSON.stringify({ ts, nivaa: 'warn', event, ...scrubbet(data) })
    )
  },

  /**
   * Logg en uventet feil til stdout, feil_logg og Sentry.
   *
   * 42501 klassifiseres etter meldingstekst, ikke bare kode — se
   * klassifiserTilgangsfeil() over. Kort versjon: «permission denied for
   * table/view/…» er alltid error (manglende GRANT), «violates row-level
   * security policy» er warn (legitim avvisning), alt annet med samme kode
   * er også error (defaulten snudd i #497 — se kommentaren over).
   * PGRST301 (utløpt JWT) er alltid warn — død sesjon, ikke programfeil.
   *
   * PostgREST-feil normaliseres til {code, tabell} for å gi Sentry og
   * feil_logg bedre fingerprint-gruppering på tvers av instanser.
   */
  async feil(
    event: string,
    error: unknown,
    opts?: {
      fingerprint?: string
      sample?: unknown   // eksempel på payload som forårsaket feilen
      ctx?: Record<string, unknown>
    },
  ) {
    const { code, tabell, melding, navn } = normaliserFeil(error)

    const tilgangsklasse = klassifiserTilgangsfeil(melding, code)
    if (tilgangsklasse === 'warn') {
      // Ikke en programfeil — logg som warn og returner tidlig (ingen
      // feil_logg-rad, ingen Sentry-event).
      logg.warn(event, { code, ...opts?.ctx })
      return
    }

    const ts = naa()
    // stdout-logg leses av Vercel Log Drain / GitHub Actions
    console.log(
      JSON.stringify({
        ts,
        nivaa: 'error',
        event,
        code,
        tabell,
        melding,
        fingerprint: opts?.fingerprint,
        ...scrubbet(opts?.ctx),
      })
    )

    // await, ikke fire-and-forget — samme grunn som CLAUDE.mds forbud mot
    // after(): Vercel kan fryse funksjonen før en floating promise fullfører.
    // persisterFeilLogg() kaster aldri selv (intern try/catch), så denne
    // linjen kan ikke velte kallstedet uansett hva som skjer i DB-kallet.
    await persisterFeilLogg(event, code, tabell, navn, opts?.ctx)

    const Sentry = await getSentry()
    if (!Sentry) return

    Sentry.withScope((scope) => {
      if (opts?.fingerprint) {
        // Egendefinert fingerprint grupperer alle instanser av denne feil-typen
        // under én Sentry-issue, uavhengig av meldingstekst.
        scope.setFingerprint([opts.fingerprint])
      }
      if (code) scope.setTag('pg.code', code)
      // Kan være tabell- eller constraint-navn — se normaliserFeil() over.
      if (tabell) scope.setTag('pg.identifikator', tabell)
      scope.setExtra('event', event)
      // setContext (ikke setExtra) — kontekst-API-en går ikke gjennom
      // beforeSend-extra-whitelisten, så cron-aggregerings-count o.l.
      // overlever helt fram til Sentry-UI-et. Se #366 review.
      scope.setContext('ctx', scrubbet(opts?.ctx) as Record<string, unknown>)
      Sentry.captureException(error instanceof Error ? error : new Error(melding))
    })
  },
}
