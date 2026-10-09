// Sentral observability-modul. All server-side logging skal gå gjennom
// logg.warn() / logg.feil() — ikke console.error/warn direkte.
// Event-navnene er registrert som type i lib/logg-hendelser.ts.

import { naa } from '@/lib/dato'
import { SENTRY_DSN } from '@/lib/config'
import { maskerRadverdier } from '@/lib/sentry-scrub'
import type { Json } from '@/lib/supabase/database.types'
import { utdragNoekkelnavn } from '@/lib/logg-sanitering'
import { LOGG_NOEKLER_MAKS_ANTALL } from '@/lib/konstanter'
import type { LoggHendelse } from '@/lib/logg-hendelser'

// ─── PII-SCRUBBING ──────────────────────────────────────────────────────────

// Felter vi tillater i kontekst sendt til Sentry og feil_logg.
// Alt som ikke er på listen strippes ut. Formålet er å unngå at navn,
// epostadresser, telefonnummer e.l. havner i Sentry-kvotaen.
// Eksportert (#681) slik at __tests__/logg-kontekst-dekning.test.ts kan
// verifisere statisk at hvert felt et logg.warn()/logg.feil()-kall sender
// faktisk står her — samme mekanisme som strippet #676-feltene stille.
export const KONTEKST_WHITELIST = new Set([
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
  // Rent tall (varighet i millisekunder) — ingen PII. Lagt til for
  // varsel.chat.fanout.treg (#612), men generisk nok til gjenbruk av
  // fremtidige latency-målinger.
  'ms',
  // Rent tall (GitHub-issuenummer) — ingen PII. Gjør en tapt kobling (#632)
  // sporbar til riktig issue i stdout-linja og i Sentry-konteksten. Merk at
  // det IKKE når feil_logg.kontekst: persisterFeilLogg() skriver kun
  // { code, tabell, navn, noekler, status }, og den kontrakten utvides ikke
  // her utover disse fem (#711 runde 2 la til status).
  'issue_nummer',
  // Den deployede app-versjonen (f.eks. «V3.5.60») — en konstant fra
  // lib/versjon.json, aldri en radverdi. Uten den kan ikke
  // github.webhook.innspill.uten_endringslogg skilles i ettertid: dukker
  // oppføringen senere opp i en NYERE versjon enn den som var ute, ble issuet
  // lukket før deploy; dukker den aldri opp, ble merkelappen glemt (#633).
  'versjon',
  // GitHubs lukkeårsak ('completed' | 'not_planned' | 'duplicate' | null) —
  // fast enum fra GitHub, ingen PII.
  'state_reason',
  // Faste enums, ingen PII — brukt av bursdagsbilde-cronet (#641):
  // 'klasse' er VertexFeilKlasse ('auth'/'kvote'/'ugyldig'/'blokkert'/
  // 'transient'), 'slot' er cron-vinduets 0-baserte slot-indeks, 'pass' er
  // 'iMorgen'/'iDag' (hoved- vs. nødpass).
  'klasse',
  'slot',
  'pass',
  // R2-objektsti (f.eks. «bursdagsbilde/1757…-a1b2c3.jpg») — filnavnet er
  // tidsstempel + UUID (nyttR2Filnavn), aldri medlemsnavn eller annet fra
  // brukeren. Uten den er bursdagsbilde.slett.feilet ubrukelig: hele poenget
  // med det eventet er at noen skal kunne rydde objektet manuelt (#641).
  'sti',
  // Uuid-er, på linje med arrangement_id/profil_id over — ingen PII i seg
  // selv, kun en fremmednøkkel (#681, funnet i samme opprydding som #676-
  // feltene): album_id (album.profiler.oppslag.feilet) og medgjest_id
  // (bursdagsbilde-genereringens ctx, ved siden av profil_id for
  // bursdagsbarnet).
  'album_id',
  'medgjest_id',
  // Rent tall / konstante identifikatorer fra koden og leverandørsvaret,
  // aldri en radverdi — brukt av bursdagsbilde.generering.levert (#641/#681):
  // 'bytes' er byte-lengden på det genererte bildet, 'mime_type' og 'modell'
  // er faste strenger fra Vertex-svaret hhv. GOOGLE_VERTEX_MODELL-env-en.
  'bytes',
  'mime_type',
  'modell',
  // Rent tall: hvor mange strippede kontekst-nøkler som IKKE var
  // identifikator-formede, og derfor ikke gjengis i `sample`
  // (logg-feil.kontekst.strippet, #681). Nøkkelnavnene der kommer rått fra en
  // uautentisert klient, så formen er vakten mot PII — se
  // STRIPPET_NOEKKEL_FORM i app/api/logg-feil/route.ts.
  'ugyldige',
  // Fast enum ('ok'/'fremmed'/'ugyldig') fra lib/config.ts sin relativUrl()
  // — hvorfor en varsel-URL ble avvist til intern fallback (#687). Ingen PII:
  // beskriver URL-formen, aldri innholdet i den. Prefikset «url_» er bevisst:
  // whitelisten er global, så en naken «utfall»-nøkkel ville blitt arvet av
  // neste kallsted med et helt annet verdirom (og kollidert i navn med
  // VarselUtfall i lib/varsler.ts).
  'url_utfall',
  // Sorterte, kommaseparerte EGNE nøkkelnavn fra et normalisert feilobjekt
  // (f.eks. «code,details,hint,message») — struktur, ikke data. Lagt til av
  // normaliserFeil() (#711) for å hindre at feil_logg.kontekst blir {} for en
  // supabase-feil som verken er en Error-instans eller har `code` (typisk en
  // transport-/nettverksfeil). Verdiene bak nøklene skrives aldri. NAVNENE er
  // derimot IKKE garantert kodekontrollerte — normaliserFeil() tar `unknown`,
  // og en kastet struktur kan ha en epostadresse eller en URL som nøkkel — så
  // de går gjennom formvakten utdragNoekkelnavn() først (#711-review). Som
  // «navn» skrives feltet direkte inn i feil_logg.kontekst fra
  // persisterFeilLogg(), utenom scrubbet(ctx) — det står her for å dekke
  // tilfellet en fremtidig kaller sender det eksplisitt via ctx.
  'noekler',
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
  // Sorterte, kommaseparerte EGNE nøkkelnavn fra feilobjektet (f.eks.
  // «code,details,hint,message») — struktur, ikke data (#711). Dekker
  // objekter som verken er Error-instanser eller har en streng `code`
  // (typisk supabase-js-transportfeil, f.eks. `{ message: 'fetch failed' }`),
  // der `navn` alene ikke er nok til å unngå en tom kontekst-rad. Navnene er
  // formvaktet og kappet; det som ble filtrert bort står som «+N_ukjent_form»
  // / «+N_flere» i stedet for å forsvinne stille.
  noekler?: string
  // DB-svarets HTTP-status (0 = transport). Fanger `DbFeil.status` og ethvert
  // kastet objekt med en numerisk `status`-property (#711 runde 2) — selve
  // valideringen (heltall, 0–599) skjer i persisterFeilLogg(), ikke her.
  status?: number
} {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>
    let navn = err instanceof Error ? err.name : undefined
    // Formvakt og kapping FØR noe skrives (#711-review): et feilobjekt kan
    // like gjerne ha «ola@example.com», en URL eller tusen nøkler som de fire
    // fra supabase-js. Samme vakt som klientruta bruker på strippede nøkler —
    // delt i lib/logg-sanitering.ts, ikke duplisert.
    const { lesbare, ugyldige, utelatt } = utdragNoekkelnavn(
      Object.keys(e).sort(),
      LOGG_NOEKLER_MAKS_ANTALL,
    )
    // Markørene bærer det vakten fjernet. Uten dem ville et objekt med bare
    // PII-formede nøkler gitt et tomt felt, og vi hadde vært like blinde som
    // før #711 — bare med en pen begrunnelse. «+» kan aldri forveksles med et
    // ekte navn: NOEKKELNAVN_FORM krever bokstav som første tegn.
    const deler = [...lesbare]
    if (utelatt > 0) deler.push(`+${utelatt}_flere`)
    if (ugyldige > 0) deler.push(`+${ugyldige}_ukjent_form`)
    // Tom for en vanlig Error — message/stack ligger ikke som egne enumerable
    // felt på instansen — så vi lar feltet være undefined der. `navn` dekker
    // det tilfellet allerede, og feltet skal ikke bli støy på hver eneste rad.
    const noekler = deler.length > 0 ? deler.join(',') : undefined
    // INVARIANT (#711): en kastet verdi skal ALDRI kunne gi kontekst {} i
    // feil_logg — det gjorde raden umulig å feilsøke (vitals.insert.feilet).
    // navn og noekler dekker til sammen alle grener under, MEN et objekt UTEN
    // egne nøkler som heller ikke er en Error-instans (f.eks. et bokstavelig
    // `throw {}`) ville gitt begge undefined. Denne eksplisitte markøren
    // lukker akkurat det hullet uten å legge støy på de vanlige radene.
    // Formvakten over kan IKKE gjenåpne hullet: filtrerer den bort alt, står
    // «+N_ukjent_form» igjen, så noekler er fortsatt satt.
    if (navn === undefined && noekler === undefined) {
      navn = 'objekt-uten-egne-nokler'
    }
    // Kun formen sjekkes her — en 600 eller en 1.5 slipper gjennom til
    // persisterFeilLogg(), som er stedet den faktiske grensevalideringen
    // (heltall, 0–599) skjer. Ingen truthy-sjekk: 0 (transport) er en gyldig
    // status og skal ikke droppes av en `e.status &&`-vakt.
    const status = typeof e.status === 'number' ? e.status : undefined
    if (typeof e.code === 'string' && typeof e.message === 'string') {
      // Forsøk å ekstrahere en identifikator (tabell eller constraint) fra
      // PostgREST-meldingen. Typisk format:
      //   «duplicate key value violates unique constraint "tabell_col_key"»
      // Regex-en grupperer konsistent på snake_case-identifikatorer, men den
      // kan like gjerne treffe constraint-navn som selve tabell-navnet —
      // derfor navngir vi feltet «identifikator» videre.
      const identMatch = e.message.match(/"([^"]+?_[^"]+?)"/)
      return {
        code: e.code,
        tabell: identMatch?.[1],
        melding: e.message,
        navn,
        noekler,
        status,
      }
    }
    // Et vanlig objekt (IKKE en Error-instans) med en lesbar `message`, men
    // uten PostgREST sin `code` — typisk en gateway-/transport-feil (Kong,
    // undici) i CI. Falt tidligere til String(err) under, som for et vanlig
    // objekt uten egen toString() gir «[object Object]» — meldingsteksten
    // gikk tapt (#800, sett i stdout som `melding:"[object Object]"`).
    // `err instanceof Error` er bevisst utelatt her: en Error-instans skal
    // fortsatt gå til String(err) under (se den grenen for hvorfor).
    if (!(err instanceof Error) && typeof e.message === 'string') {
      return { melding: e.message, navn, noekler, status }
    }
    // Ikke-PostgREST-feil: for en Error-instans gir String(err) klassenavnet
    // foran meldingen («TypeError: fetch failed»), som er ønsket — se
    // __tests__/logg-render-feil.test.ts. For et objekt uten lesbar `message`
    // gir den «[object Object]», men da har vi ingen bedre tekst å vise uansett.
    return { melding: String(err), navn, noekler, status }
  }
  // err er ikke et objekt (streng, tall, boolean, null, undefined) — kastet
  // uten Error-innpakking. navn bærer typeof (typeof null er «object», så den
  // grenen treffes aldri av null) slik at raden fortsatt sier noe strukturelt
  // i stedet for å falle tilbake til en tom kontekst (#711).
  return { melding: String(err), navn: `primitiv:${typeof err}` }
}

/**
 * Feil som bærer PostgREST-koden (og HTTP-statusen) med seg gjennom en
 * innpakking.
 *
 * Pakker du en Supabase-feil inn i `new Error(\`… ${error.message}\`)`, ser
 * normaliserFeil() over ingen `code`-property og faller til else-grenen. Da er
 * `melding` det eneste som er igjen — og den persisteres bevisst aldri (den kan
 * bære radverdier). Resultatet er en rad i feil_logg som bare sier
 * `{"navn":"Error"}`: vi vet at noe feilet, ikke hva.
 *
 * Det var blindsonen `ulest.marker_chat_sett.feilet` lå i — fire rader over tre
 * dager i august 2026, alle uten en eneste ledetråd. Kast DbFeil i stedet når
 * feilen skal bobles opp til et `.catch(logg.feil)` lenger ute; koden overlever
 * da hele veien til raden.
 *
 * Kaster du derimot der du selv kan logge, er `logg.feil(event, error,
 * { ctx: { code: error.code } })` med det rå PostgREST-objektet like bra —
 * denne klassen er for stiene der kastet ER kanalen.
 *
 * `status` er DB-svarets HTTP-status (0 = transport/nettverksfeil), aldri
 * rutas egen svarkode — se persisterFeilLogg() for grensevalideringen (#711
 * runde 2).
 */
export class DbFeil extends Error {
  readonly code?: string
  readonly status?: number

  constructor(melding: string, code?: string, status?: number) {
    super(melding)
    this.name = 'DbFeil'
    this.code = code
    this.status = status
  }
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
// Felles skrive-sti for alle feil_logg-rader fra serveren. Både
// persisterFeilLogg() (logg.feil) og loggRenderFeil() (onRequestError) går
// gjennom denne, slik at timeout-cappen, den tause catchen og 23505-
// håndteringen ikke drifter fra hverandre mellom de to kanalene.
async function skrivFeilLoggRad(
  event: string,
  kontekst: Record<string, unknown>,
  opts?: { profilId?: string | null; url?: string | null },
): Promise<void> {
  try {
    // Lazy import: ingen 'use client'-fil importerer @/lib/logg (verifisert),
    // så service_role-nøkkelen havner aldri i klient-bundlen. 0 kB vekst.
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()

    const { error } = await admin
      .from('feil_logg')
      .insert({
        event,
        nivaa: 'error',
        kontekst: kontekst as Json,
        profil_id: opts?.profilId ?? null,
        // url settes kun når kallstedet faktisk har en rute. Å alltid sende
        // `url: null` ville utvidet radformen logg.feil()-stien skriver, og
        // den formen er pinnet i __tests__/logg.test.ts med vilje.
        ...(opts?.url ? { url: opts.url } : {}),
      })
      // Hard cap: under pool-utmattelse skal ikke en logge-skriving legge
      // seg oppå trykket ved å vente ubegrenset på en ledig tilkobling.
      .abortSignal(AbortSignal.timeout(1000))

    // 23505 er burst-dedupen i feil_logg_profil_event_minutt_uq (mig. 122/154),
    // altså at vi allerede har en rad for (profil, event, minutt). Det er
    // indeksen som gjør jobben sin, ikke en feil — logger vi den som feilet
    // insert, blir stdout full av støy hver gang noe feiler to ganger på
    // samme minutt.
    if (error && error.code !== '23505') {
      // Ren stdout — IKKE logg.feil() her, det ville vært selv-rekursivt.
      console.log(JSON.stringify({ ts: naa(), nivaa: 'warn', event: 'logg.feillogg.insert.feilet', code: error.code }))
    }
  } catch {
    // Loggingen skal ALDRI kunne kaste — en logger som velter render-stien
    // er verre enn feilen den prøvde å logge. Fanger både nettverksfeil og
    // AbortError fra timeouten over.
  }
}

// Øvre grense for hva vi godtar som en HTTP-status i feil_logg.kontekst.
// Samme presedens som RENDER_MELDING_MAKS under: en ren loggedetalj som ikke
// speiler noen DB-constraint, derfor bor den her og ikke i lib/konstanter.ts.
const HTTP_STATUS_MAKS = 599

async function persisterFeilLogg(
  event: string,
  code: string | undefined,
  tabell: string | undefined,
  navn: string | undefined,
  noekler: string | undefined,
  status: number | undefined,
  ctx?: Record<string, unknown>,
): Promise<void> {
  // Kun profil_id tas med fra ctx — resten av KONTEKST_WHITELIST
  // (arrangement_id, count, fingerprint, sample) er ikke del av kontrakten
  // for denne tabellen. status ER det, fra og med #711 runde 2 — se under.
  // melding persisteres bevisst ALDRI her: normaliserFeil() returnerer
  // PostgREST-teksten rått, og den kan bære radverdier (f.eks.
  // «Key (epost)=(x@y.no) already exists»). Render-feil er unntaket — se
  // loggRenderFeil() under, som maskerer først.
  const ctxScrubbet = scrubbet(ctx)
  const profilId = typeof ctxScrubbet.profil_id === 'string' ? ctxScrubbet.profil_id : null

  // navn (feilklassen) og noekler (feilobjektets egne nøkkelnavn) er begge med
  // fordi code/tabell er undefined for alt som ikke er en PostgREST-feil med
  // code+message som strenger — uten dem ble raden skrevet som `{}` og var
  // verdiløs å lese (#711, samme fella #496 opprinnelig rettet med navn alene,
  // men som ikke dekket en supabase-feil uten `code` — se normaliserFeil()).
  // INVARIANT: normaliserFeil() garanterer at minst ett av
  // {code, tabell, navn, noekler} alltid er satt for enhver kastet verdi, så
  // denne linjen skal aldri kunne skrive en tom kontekst.
  //
  // status: ctx.status vinner over feilobjektets status (#711 runde 2) — en
  // kaller som eksplisitt setter { ctx: { status } } (f.eks. vitals- og
  // aktivitet-rutene, som leser status direkte fra Supabase-svaret) vet bedre
  // enn normaliserFeil()s beste gjetning fra et generisk feilobjekt.
  const ctxStatus = typeof ctxScrubbet.status === 'number' ? ctxScrubbet.status : undefined
  const statusKandidat = ctxStatus ?? status
  // EKSAKT validering, INGEN truthy-sjekk: 0 (transport) er en gyldig og
  // meningsbærende verdi og skal ikke droppes av en `if (statusKandidat)`.
  const validertStatus =
    typeof statusKandidat === 'number' &&
    Number.isInteger(statusKandidat) &&
    statusKandidat >= 0 &&
    statusKandidat <= HTTP_STATUS_MAKS
      ? statusKandidat
      : undefined

  await skrivFeilLoggRad(event, { code, tabell, navn, noekler, status: validertStatus }, { profilId })
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
  warn(event: LoggHendelse, data?: Record<string, unknown>) {
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
    event: LoggHendelse,
    error: unknown,
    opts?: {
      fingerprint?: string
      sample?: unknown   // eksempel på payload som forårsaket feilen
      ctx?: Record<string, unknown>
    },
  ) {
    const { code, tabell, melding, navn, noekler, status } = normaliserFeil(error)

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
        // FØR spread av ctx (#711 runde 2): en kaller som setter
        // opts.ctx.status skal kunne overstyre normaliserFeil()s gjetning.
        status,
        fingerprint: opts?.fingerprint,
        ...scrubbet(opts?.ctx),
      })
    )

    // await, ikke fire-and-forget — samme grunn som CLAUDE.mds forbud mot
    // after(): Vercel kan fryse funksjonen før en floating promise fullfører.
    // persisterFeilLogg() kaster aldri selv (intern try/catch), så denne
    // linjen kan ikke velte kallstedet uansett hva som skjer i DB-kallet.
    await persisterFeilLogg(event, code, tabell, navn, noekler, status, opts?.ctx)

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

// ─── RENDER-FEIL (onRequestError) ────────────────────────────────────────────

// Hvor mye av feilmeldingen vi tar vare på. Meldingene våre er korte
// («Kunne ikke hente arrangementer: TypeError: fetch failed» ≈ 55 tegn), men
// en rå PostgREST-melding med hint og details kan bli lang. Konstanten bor
// her og ikke i lib/konstanter.ts fordi den er en ren logge-detalj — den
// speiler ingen DB-constraint og hører ikke til domenet.
const RENDER_MELDING_MAKS = 500

/**
 * Skriver en server-render-feil til feil_logg. Kalles fra `onRequestError` i
 * instrumentation.ts, altså for feil kastet i server components, server
 * actions og route handlers.
 *
 * **Hvorfor denne finnes:** `app/error.tsx` viser brukeren en `digest` — en
 * djb2-hash av melding + stack — og klient-beaconen skriver den til feil_logg.
 * Men ingenting lagret noen gang hva den hashen *var* en hash av. Serverfeilen
 * gikk kun til Sentry, og `SENTRY_DSN` er env-styrt uten default, så en instans
 * uten nøkkel hadde null server-side feilrapportering. Resultatet så vi i
 * august 2026: 13 render-feil på forsiden over tre dager, med sju forskjellige
 * digest-verdier og ingen mulighet til å lese hva som faktisk feilet. Se #631.
 *
 * **Meldingen persisteres her, i motsetning til i persisterFeilLogg().** Det er
 * et bevisst unntak fra regelen over, og hviler på to ting: (1) meldingen går
 * gjennom `maskerRadverdier()` — nøyaktig samme maske som allerede sendes til
 * Sentry, altså til en tredjepart, så dette er strengt mindre eksponering enn
 * det vi gjør i dag; (2) uten meldingen er raden verdiløs, for da vet vi bare
 * at «en Error skjedde på /», som er akkurat det vi allerede visste.
 * Utvid ALDRI dette unntaket til logg.feil()-stien uten samme vurdering —
 * der er `melding` rå PostgREST-tekst som kan bære radverdier.
 *
 * Kaster aldri (skrivFeilLoggRad fanger alt): kalles fra Next sin
 * feilhåndtering, og en logger som velter der ville skjult den ekte feilen.
 */
export async function loggRenderFeil(opts: {
  error: unknown
  /** Rute-mønsteret fra Next («/», «/arrangementer/[id]») — aldri en URL med query. */
  rute?: string | null
  /** Next sin `error.digest` — koblingen til raden klienten skriver fra app/error.tsx. */
  digest?: string | null
}): Promise<void> {
  const { code, tabell, melding, navn } = normaliserFeil(opts.error)

  // Samme klassifisering som logg.feil(): en død sesjon (PGRST301 /
  // AUTH_INGEN_SESJON) er rutine når iOS spiser cookies, ikke en programfeil.
  // Uten denne ville hver utløpte innlogging skrevet en error-rad og vekket
  // døgnalarmen — nøyaktig regresjonen #602 og #604 rettet.
  if (klassifiserTilgangsfeil(melding, code) === 'warn') {
    logg.warn('server.render.sesjon_utloept', { code })
    return
  }

  const maskert = maskerRadverdier(melding).slice(0, RENDER_MELDING_MAKS)

  console.log(
    JSON.stringify({
      ts: naa(),
      nivaa: 'error',
      event: 'server.render.feilet',
      code,
      tabell,
      navn,
      digest: opts.digest,
      rute: opts.rute,
      melding: maskert,
    }),
  )

  await skrivFeilLoggRad(
    'server.render.feilet',
    { code, tabell, navn, digest: opts.digest ?? null, melding: maskert },
    { url: opts.rute ?? null },
  )
}
