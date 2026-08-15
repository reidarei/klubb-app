// Styrende regel for feilhåndtering i denne fila (#503):
// Feil skal aldri føre til at noen får noe de ikke skulle hatt. Oppslag
// som beskytter mot uønsket utsending (innstillinger, testmodus, mottakere,
// preferanser, fortids-sperre) feiler LUKKET (throw) — en feil der skal
// aldri tolkes som «send til alle». Oppslag der en feil i verste fall bare
// gir et duplikat (dedup-sjekk) eller en dårligere varseltekst (scope-oppslag
// for @-mention) feiler ÅPENT — det er mildere enn et tapt varsel. Fail-open
// betyr likevel ikke stille: de stiene logger med logg.feil.
//
// Ett oppført unntak fra listen over: push_subscriptions-oppslaget kaster også,
// selv om en feil der isolert sett bare degraderer til «ingen push». Grunnen er
// at et tomt resultat er bit-identisk med «ingen har registrert push», og vi tar
// en kanalbeslutning per mottaker på det grunnlaget — den som kun har push aktiv
// ville stille fått ingenting. Delvis kjent tilstand (epost kjent, push ukjent)
// behandles derfor som ukjent. (#503-review)
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPush } from '@/lib/push'
import { sendEpostBatch, arrangementEpostHtml } from '@/lib/epost'
import { formaterDato, FORMAT_DATO_KLOKKE } from '@/lib/dato'
import { BASE_URL, absoluttUrl } from '@/lib/config'
import { PURRING_MAKS_LENGDE, VARSLE_MAKS_LENGDE } from '@/lib/konstanter'
import { mentionExtractRegex } from '@/lib/mention'
import { logg } from '@/lib/logg'
// Mapping type → noekkel bor i lib/varsel-typer.ts sammen med de norske
// navnene på hver type, så kontrollpanelet og denne gaten aldri kan uenige
// om hvilken bryter som styrer hvilket varsel.
import { typeTilNoekkel } from '@/lib/varsel-typer'

const formaterDatoKlokke = (iso: string) => formaterDato(iso, FORMAT_DATO_KLOKKE)

// Sikkerhetsvakt: hvis BASE_URL peker til localhost, betyr det at vi kjører
// i dev og sannsynligvis mot prod-databasen. Push-varsler med lokal URL
// lander som ubrukelige lenker på ekte mobiler (bruker må restarte PWA
// for å komme videre). Refuser å sende push/epost i dette tilfellet
// med mindre utvikleren eksplisitt overstyrer med ALLOW_LOCAL_NOTIFICATIONS.
//
// Dette er en «belte og seler»-sjekk utover test_modus i varsel_innstillinger
// — fordi test_modus er admin-konfig som kan glemmes ved utvikling.
const ER_LOKAL_BASE =
  BASE_URL.includes('localhost') || BASE_URL.includes('127.0.0.1')
const TILLAT_LOKAL = process.env.ALLOW_LOCAL_NOTIFICATIONS === 'true'
// Unit-tester må kunne verifisere send-logikken uten å slå på miljøflagget.
// Vitest setter VITEST=true automatisk.
const ER_UNIT_TEST = !!process.env.VITEST
const BLOKKER_UTSENDING = ER_LOKAL_BASE && !TILLAT_LOKAL && !ER_UNIT_TEST

// Sjekk om en varseltype er aktivert i admin-innstillinger
async function erVarselAktiv(noekkel: string): Promise<boolean> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('varsel_innstillinger')
    .select('aktiv')
    .eq('noekkel', noekkel)
    .maybeSingle()
  // Fail closed: en feilet spørring skal aldri tolkes som «aktiv». Manglende
  // RAD er fortsatt legitimt (default true) — det er noe annet enn en feil.
  if (error) {
    // sample må ligge under ctx — logg.feil() leser kun opts.fingerprint og
    // opts.ctx på toppnivå, så et toppnivå-sample ville forsvunnet stille. (#503-review)
    await logg.feil('varsel.innstilling.feilet', error, { ctx: { sample: noekkel } })
    throw new Error(`Kunne ikke lese varsel-innstilling «${noekkel}»: ${error.message}`)
  }
  return data?.aktiv ?? true
}

// Eksportert variant for sendVarsel-flyten — bruker mapping og en
// snill default (true) hvis nøkkelen mangler.
async function erTypeAktiv(type: string): Promise<boolean> {
  return erVarselAktiv(typeTilNoekkel(type))
}

// Varseltyper som annonserer/minner om at selve arrangementet skjer. Disse
// skal aldri gå ut hvis arrangementet alt har skjedd — jf. backfill av gamle
// turer. Chat, innlegg, polls og arrangør-purring står bevisst UTENFOR: de
// handler ikke om at hendelsen inntreffer, og skal virke også for tidligere
// arrangementer.
//
// «oppdatert» (manuell «Varsle nå») er IKKE her: den knappen skjules i UI for
// passerte arrangementer i stedet (se arrangementer/[id]/page.tsx). Vi blokkerer
// altså ikke en bevisst manuell handling stille — vi fjerner muligheten.
const HENDELSE_VARSLER = new Set(['nytt_arrangement', 'paaminne_7', 'paaminne_1'])

// Sjekk om test-modus er aktiv — returnerer test-epost eller null
async function hentTestModus(): Promise<string | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('varsel_innstillinger')
    .select('aktiv, beskrivelse')
    .eq('noekkel', 'test_modus')
    .maybeSingle()
  // Fail closed: testmodus er en sikkerhetssperre. Klarer vi ikke å lese den,
  // vet vi ikke om utsending skal begrenses til testprofilen — da sender vi
  // ikke i det hele tatt, i stedet for å risikere at alle 17 får varselet.
  if (error) {
    await logg.feil('varsel.innstilling.feilet', error, { ctx: { sample: 'test_modus' } })
    throw new Error(`Kunne ikke lese test_modus-innstilling: ${error.message}`)
  }
  if (data?.aktiv && data.beskrivelse) return data.beskrivelse
  return null
}

// Hent alle aktive profiler (i test-modus: kun profilen med test-eposten).
// Tar testEpost som parameter i stedet for å kalle hentTestModus() selv —
// begge kallstedene (sendVarsel og sendPurringVarsler) har allerede slått
// opp testmodus selv, og et internt kall her ville dobbeltspurt DB-en. (#503)
async function hentProfiler(testEpost: string | null) {
  const supabase = createAdminClient()

  const query = supabase.from('profiles').select('id, navn, epost').eq('aktiv', true)
  if (testEpost) query.eq('epost', testEpost)
  const { data, error } = await query
  // Fail closed: tomt array her er bit-identisk med «ingen aktive mottakere»
  // — uten denne sjekken ville en feilet spørring stille sendt til null personer.
  if (error) {
    // «broadcast» skiller denne fra de to andre stedene som sender samme event
    // (eksplisitt mottakerliste i sendVarsel, og @-mention). (#503-review)
    await logg.feil('varsel.mottakere.feilet', error, { ctx: { sample: 'broadcast' } })
    throw new Error(`Kunne ikke hente profiler: ${error.message}`)
  }
  return data ?? []
}

// Hent varselpreferanser for alle profiler
async function hentVarselPreferanser(profilIder: string[]) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('varsel_preferanser')
    .select('profil_id, push_aktiv, epost_aktiv')
    .in('profil_id', profilIder)
  // Fail closed: en tom Map her tolkes lenger nede som epostAktiv: true for
  // ALLE — altså e-post til folk som bevisst har skrudd den av.
  if (error) {
    await logg.feil('varsel.preferanser.feilet', error, { ctx: { count: profilIder.length } })
    throw new Error(`Kunne ikke hente varselpreferanser: ${error.message}`)
  }
  const map = new Map<string, { push_aktiv: boolean; epost_aktiv: boolean }>()
  for (const p of data ?? []) map.set(p.profil_id, p)
  return map
}

// Hent alle push-subscriptions for en liste med profil-IDer
async function hentPushSubscriptions(profilIder: string[]) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('profil_id, endpoint, p256dh, auth')
    .in('profil_id', profilIder)
  // Isolert sett kun degradering (tomt array = ingen push), men denne
  // kjører i samme Promise.all som preferanse-oppslaget over — en delvis
  // kjent tilstand (push ukjent, epost kjent) er ikke grunnlag å sende på.
  if (error) {
    await logg.feil('varsel.preferanser.feilet', error, { ctx: { count: profilIder.length } })
    throw new Error(`Kunne ikke hente push-subscriptions: ${error.message}`)
  }
  return data ?? []
}

// ─── HJELPEFUNKSJON FOR HILSENFORMATERING ───────────────────────────────────

/**
 * Formaterer en varselmelding med valgfri personlig hilsen. Når hilsen er
 * tom (eller mangler) returneres fallback uendret. Når hilsen er satt
 * flettes den inn som «{fraNavn} {verb} {basis} og skriver: «{hilsen}»».
 *
 * Sentralisert per #289 etter at samme mønster ble duplisert i tre
 * wrappers (#267, #282, #287).
 *
 * Helper er ren — ingen IO eller state.
 */
export function formaterHilsenMelding({
  fraNavn,
  hilsen,
  verb,
  basis,
  fallback,
  maksLengde,
}: {
  fraNavn?: string
  hilsen?: string
  verb: string         // f.eks. 'purrer deg på', 'varsler om'
  basis: string        // f.eks. 'Vårfest (15.06.2026)' eller 'Mars-møte 2026'
  fallback: string     // standard-melding når hilsen mangler
  maksLengde?: number  // valgfri lengde-validering
}): string {
  const trimmet = hilsen?.trim()
  if (trimmet && !fraNavn) {
    throw new Error('fraNavn må oppgis sammen med hilsen')
  }
  // Eksplisitt undefined-sjekk: maksLengde: 0 skal også validere (truthy-sjekk ville hoppet over 0)
  if (trimmet && maksLengde !== undefined && trimmet.length > maksLengde) {
    throw new Error(`Hilsen kan ikke være lengre enn ${maksLengde} tegn`)
  }
  return trimmet && fraNavn
    ? `${fraNavn} ${verb} ${basis} og skriver: «${trimmet}»`
    : fallback
}

// ─── SENTRAL VARSLINGSFUNKSJON ───────────────────────────────────────────────

// Utfallet fra sendVarsel — kontrakten kallere kan bygge kvitterings-logikk
// på (#504). «Kaster = ukjent utfall, retry er lov. Returnerer = terminalt
// avgjort, ikke retry.» Kallere som stempler en tilstandsrad (varslet_paa,
// vinner_varslet_paa) skal stemple på ALLE utfall her — også blokkert_lokal
// og type_deaktivert — fordi returverdien i seg selv betyr at rørledningen
// kjørte til ende for denne tilstandsendringen. Additiv endring: alle
// eksisterende ~30 kallsteder ignorerer returverdien uten å brekke.
export type VarselUtfall = {
  utfall:
    | 'sendt'
    | 'blokkert_lokal'
    | 'type_deaktivert'
    | 'hendelse_passert'
    | 'dedup'
    | 'ingen_mottakere'
  // Mottakere med MINST ÉN AKTIV KANAL (push og/eller epost) — ikke bekreftet
  // levering. Telleren økes før push forsøkes og før e-posten er i batchen, og
  // sendPush/sendEpostBatch svelger sine egne feil, så `levert` kan aldri gå
  // ned igjen. Den økes også når varsel_logg-inserten feilet med annet enn
  // 23505. Bruk den til observability, aldri som leverings-kvittering. (#504-review)
  levert: number
  kunApp: number       // mottakere som kun fikk in-app-rad (ingen kanal aktiv)
  dedupHoppet: number  // mottakere som traff 23505 på dedup_noekkel
}

const INGEN_UTSENDING: Omit<VarselUtfall, 'utfall'> = { levert: 0, kunApp: 0, dedupHoppet: 0 }

export async function sendVarsel({
  mottakere,
  tittel,
  melding,
  url,
  knappTekst = 'Åpne i appen',
  type,
  arrangementId,
  pollId,
  tillatDuplikat = false,
  dedupNoekkel,
}: {
  mottakere?: string[]
  tittel: string
  melding: string
  url?: string
  knappTekst?: string
  type: string
  arrangementId?: string
  pollId?: string
  tillatDuplikat?: boolean
  // Navnerom-prefikset per-mottaker-guard (f.eks. «pass-godkjent:{id}»,
  // «bursdag:{barnId}:{aar}») — se varsel_logg_dedup_noekkel_uniq (mig. 121).
  dedupNoekkel?: string
}): Promise<VarselUtfall> {
  // Dev-guard: Blokker utsending fra lokal dev-server mot prod-DB.
  // Vi returnerer tidlig uten å skrive varsel_logg — det er bedre å ikke
  // forurense loggen med "late som"-rader. Logg til konsoll slik at
  // utvikleren ser hva som skjedde.
  if (BLOKKER_UTSENDING) {
    logg.warn('varsel.blokkert.lokal', { sample: type })
    return { utfall: 'blokkert_lokal', ...INGEN_UTSENDING }
  }

  // 0. Sjekk admin-kontrollpanelet — admin kan slå av en hel varseltype
  // sentralt. Manglende nøkkel teller som «aktiv» (default true).
  if (!(await erTypeAktiv(type))) {
    logg.warn('varsel.type.deaktivert', { sample: type })
    return { utfall: 'type_deaktivert', ...INGEN_UTSENDING }
  }

  const supabase = createAdminClient()

  // 0b. Fortids-sperre: hendelse-varsler skal ikke gå ut om arrangementet alt
  // har skjedd (start_tidspunkt i fortiden). Lukker hele problemklassen sentralt
  // — backfill av en gammel tur pinger ikke alle med «Nytt arrangement /
  // påminnelse». Kun ett lite oppslag, og bare for de tre hendelse-typene.
  // Sammenligner absolutte tidspunkt (begge er UTC-instanser), så tidssone
  // spiller ingen rolle her.
  if (arrangementId && HENDELSE_VARSLER.has(type)) {
    const { data: arr, error: arrFeil } = await supabase
      .from('arrangementer')
      .select('start_tidspunkt')
      .eq('id', arrangementId)
      .maybeSingle()
    // Fail closed: en sperre vi ikke klarer å lese skal ikke tolkes som
    // «ikke passert» — da ville en transient DB-feil kunne sende backfill-
    // varsler for gamle turer, nøyaktig det denne sperren finnes for å hindre.
    if (arrFeil) {
      // Eget event: dette er et arrangementer-oppslag, ikke varsel_innstillinger
      // — å låne innstilling-eventet ville feilmerket alarmen. (#503-review)
      await logg.feil('varsel.fortidssperre.feilet', arrFeil, {
        ctx: { sample: type, arrangement_id: arrangementId },
      })
      throw new Error(`Kunne ikke sjekke fortids-sperre for arrangement ${arrangementId}: ${arrFeil.message}`)
    }
    if (arr?.start_tidspunkt && new Date(arr.start_tidspunkt).getTime() < Date.now()) {
      logg.warn('varsel.hendelse.passert', { sample: type })
      return { utfall: 'hendelse_passert', ...INGEN_UTSENDING }
    }
  }

  // 1. Dedup-sjekk — gjelder enten arrangement_id eller poll_id alt etter
  // hvilken referanse varselet bærer. Først match som finnes vinner.
  //
  // Fail ÅPENT her (i motsetning til de fleste andre oppslagene i denne fila):
  // en throw ved feil gir et GARANTERT tapt varsel, mens fail-open i verste
  // fall gir et MULIG duplikat. Duplikatet er mildere, og dedup er en
  // bekvemmelighet — ikke en sikkerhetssperre mot uønsket utsending. (#503)

  // Fella i #518: tillatDuplikat: false ser beskyttende ut ved kallstedet,
  // men uten NOEN av de tre nøklene under er det ingenting å deduplisere
  // PÅ — verken sjekkene under eller dedup_noekkel-indeksen (mig. 121) har
  // noe å holde seg til. Gjør fraværet synlig i loggen i stedet for stille:
  // neste varseltype som skrives sånn arver ellers samme falske trygghet
  // som arrangor_purring og klient_alarm gjorde (nå rettet til
  // tillatDuplikat: true, som er den ærlige beskrivelsen av deres oppførsel).
  if (!tillatDuplikat && !arrangementId && !pollId && !dedupNoekkel) {
    logg.warn('varsel.dedup.ingen_noekkel', { sample: type })
  }

  if (!tillatDuplikat && arrangementId) {
    const { data: eksisterende, error: dedupFeil } = await supabase
      .from('varsel_logg')
      .select('id')
      .eq('type', type)
      .eq('arrangement_id', arrangementId)
      .limit(1)
    // logg.feil, ikke warn: at vi bevisst fortsetter er et valg om LEVERANSE,
    // ikke om synlighet. warn går aldri til Sentry, og den gamle varianten
    // sendte i tillegg ikke dedupFeil videre i det hele tatt — verken kode,
    // tabell eller melding overlevde. (#503-review)
    if (dedupFeil) {
      await logg.feil('varsel.dedup.feilet', dedupFeil, {
        ctx: { sample: type, arrangement_id: arrangementId },
      })
    }
    if (eksisterende && eksisterende.length > 0) return { utfall: 'dedup', ...INGEN_UTSENDING }
  }
  if (!tillatDuplikat && pollId) {
    const { data: eksisterende, error: dedupFeil } = await supabase
      .from('varsel_logg')
      .select('id')
      .eq('type', type)
      .eq('poll_id', pollId)
      .limit(1)
    if (dedupFeil) {
      await logg.feil('varsel.dedup.feilet', dedupFeil, { ctx: { sample: type } })
    }
    if (eksisterende && eksisterende.length > 0) return { utfall: 'dedup', ...INGEN_UTSENDING }
  }

  // 2. Testmodus
  const testEpost = await hentTestModus()

  // 3. Løs opp mottakere + dedupliser. Fail closed (hovedfiksen i #503):
  // tidligere ga en feilet spørring her `profiler = []`, bit-identisk med
  // «ingen aktive mottakere» — varselet gikk stille til null personer.
  let profiler: { id: string; navn: string | null; epost: string | null }[]
  if (mottakere) {
    const unikeIder = [...new Set(mottakere)]
    const { data, error } = await supabase
      .from('profiles')
      .select('id, navn, epost')
      .in('id', unikeIder)
      .eq('aktiv', true)
    if (error) {
      await logg.feil('varsel.mottakere.feilet', error, {
        ctx: { sample: type, count: unikeIder.length },
      })
      throw new Error(`Varsel «${type}»: kunne ikke hente mottakere: ${error.message}`)
    }
    profiler = data ?? []
  } else {
    profiler = await hentProfiler(testEpost)
  }

  // I testmodus: filtrer til kun testprofilen
  if (testEpost) {
    profiler = profiler.filter(p => p.epost === testEpost)
  }

  if (profiler.length === 0) {
    // Legitim tilstand (ingen aktive mottakere), men verdt å vite om. Vi tier
    // kun i testmodus, som rutinemessig filtrerer bort nesten alle og ville
    // druknet loggen. En BROADCAST som treffer 0 aktive profiler logges også
    // (#503-review): det er minst like mistenkelig som en tom eksplisitt liste
    // — en RLS-/grant-glipp mot profiles eller et masse-nullet `aktiv` ser
    // nøyaktig sånn ut. `count: 0` betyr broadcast (ingen liste oppgitt).
    if (!testEpost) {
      // Broadcast (mottakere er undefined) eskaleres til logg.feil → Sentry
      // (#504/#517): logg.warn går ALDRI til Sentry, og en broadcast som
      // treffer 0 er den mest mistenkelige ikke-feil-tilstanden i hele
      // varslingskjernen — den kan bety en RLS-/grant-glipp mot profiles.
      // En eksplisitt tom mottakerliste (mottakere: []) er derimot en
      // legitim kallested-avgjørelse og beholder warn. ctx (ikke toppnivå
      // sample) — se #517, logg.feil() leser kun opts.fingerprint/opts.ctx.
      if (mottakere === undefined) {
        await logg.feil('varsel.mottakere.tomme', new Error('Broadcast traff 0 aktive profiler'), {
          ctx: { sample: type },
        })
      } else {
        logg.warn('varsel.mottakere.tomme', { sample: type, count: mottakere.length })
      }
    }
    return { utfall: 'ingen_mottakere', ...INGEN_UTSENDING }
  }

  // 4. Hent preferanser + push-subscriptions
  const profilIder = profiler.map(p => p.id)
  const [subs, prefs] = await Promise.all([
    hentPushSubscriptions(profilIder),
    hentVarselPreferanser(profilIder),
  ])

  const subsByProfil = new Map<string, typeof subs>()
  for (const s of subs) {
    const arr = subsByProfil.get(s.profil_id) ?? []
    arr.push(s)
    subsByProfil.set(s.profil_id, arr)
  }

  // 5. For hver mottaker — parallelt. Sekvensiell loop tok ~7 sek
  // per mottaker pga epost-roundtrip, og med Vercel Hobbys 10s
  // funksjons-timeout ble bakgrunnsjobben kuttet etter 1–2 mottakere
  // når @alle ble brukt. Promise.all gjør at alle 16+ går samtidig.
  //
  // Logg-insert og push sendes fortsatt per mottaker i denne parallelle
  // loopen. E-post derimot samles i epostBatch og sendes med ETT kall til
  // Resend sitt batch-endepunkt etterpå — parallelliseringen som løste
  // Vercel-timeouten skapte samtidig 429-en fra Resend (16 samtidige
  // /emails-kall > 10 req/s), og batch løser begge problemene på én gang
  // (se #478). Push til epostBatch fra parallelle async-callbacks er trygt
  // uten låsing — JS er single-threaded, så to push() kan aldri kjøre samtidig.
  const epostBatch: { til: string; emne: string; html: string }[] = []

  // Normaliser URL-en én gang før loopen — push tåler relativ URL (SW resolver
  // mot origin), men e-post-malen setter den rett inn som href og har ingen
  // base-URL å resolve mot. Uten dette blir kallesteder som `url: '/chat'`
  // ødelagte lenker i innboksen (#507).
  const normalisertUrl = url ? absoluttUrl(url) : undefined
  // absoluttUrl kaster ikke på en verdi som verken er absolutt eller starter
  // med «/» (f.eks. `url: 'chat'`) — den slipper gjennom uendret og blir en
  // ødelagt lenke. Logg det så feilen ikke er stille (#507-review).
  if (url && normalisertUrl === url && !/^https?:\/\//i.test(url)) {
    logg.warn('varsel.url.relativ', { sample: type })
  }

  // Tellere for VarselUtfall — muteres fra parallelle async-callbacks under.
  // Trygt uten låsing av samme grunn som epostBatch.push over: JS er
  // single-threaded, så to inkrementeringer kan aldri kjøre samtidig.
  let levert = 0
  let kunApp = 0
  let dedupHoppet = 0

  await Promise.all(
    profiler.map(async profil => {
      const pref = prefs.get(profil.id)
      const pushAktiv = pref ? pref.push_aktiv : false
      const epostAktiv = pref ? pref.epost_aktiv : true
      const profilSubs = subsByProfil.get(profil.id) ?? []

      const kanPush = pushAktiv && profilSubs.length > 0
      const kanEpost = epostAktiv && !!profil.epost
      // 'kun_app' (i stedet for tidligere `if (!kanal) return`, #504): en
      // mottaker uten push eller epost aktiv skal likevel få en in-app-rad —
      // varsel_logg ER innboksen på /profil, og ingen rad skal noensinne
      // bety «forsøkt, ikke levert». Push/epost er allerede gated av
      // kanPush/kanEpost under, så utsendingen hoppes bare over av seg selv.
      const kanal = kanPush && kanEpost ? 'begge' : kanPush ? 'push' : kanEpost ? 'epost' : 'kun_app'

      const { data: loggRad, error: loggFeil } = await supabase
        .from('varsel_logg')
        .insert({
          profil_id: profil.id,
          tittel,
          melding,
          type,
          kanal,
          url: normalisertUrl ?? null,
          arrangement_id: arrangementId ?? null,
          poll_id: pollId ?? null,
          dedup_noekkel: dedupNoekkel ?? null,
        })
        .select('id')
        .single()

      // Fail ÅPENT — bevisst unntak: vi står midt i et Promise.all over alle
      // mottakere, og en throw her ville avbrutt loopen før sendEpostBatch (under)
      // rakk å kjøre — resultatet er noen som fikk push men ALDRI e-post, en
      // verre inkonsistens enn den manglende loggraden i seg selv. Merk: en tapt
      // rad her gjør `tillatDuplikat: false` upålitelig ved neste kjøring — neste
      // sendVarsel-kall for samme referanse ser ikke denne sendingen og sender på
      // nytt. Rammer de varseltypene som faktisk deduperes, dvs. de som sender
      // arrangementId eller pollId med tillatDuplikat: false — nytt_arrangement,
      // paaminne_7, paaminne_1, cron-purring og de fire kaaringspoll_*. Typer uten
      // slik referanse (arrangor_purring, klient_alarm, melding-ny) deduperes ikke
      // uansett — alle tre er derfor eksplisitt merket tillatDuplikat: true, så
      // koden sier sannheten om intensjonen. (#503, presisert i #518)
      //
      // 23505 fra dedup_noekkel-unique-indeksen (mig. 121) tolkes derimot som
      // SUKSESS: denne mottakeren er allerede kvittert for denne nøkkelen, så
      // vi hopper stille over utsendingen for HAM — men fortsetter loopen for
      // resten. Aldri throw her: én manns duplikat skal ikke rive med seg
      // hele broadcasten (#504).
      if (loggFeil) {
        if (loggFeil.code === '23505') {
          dedupHoppet++
          return
        }
        await logg.feil('varsel.logg.insert.feilet', loggFeil, { ctx: { profil_id: profil.id } })
      }

      if (kanal === 'kun_app') kunApp++
      else levert++

      const varselUrl = normalisertUrl ?? (loggRad ? `${BASE_URL}/varsler/${loggRad.id}` : BASE_URL)

      if (kanPush) {
        await Promise.all(
          profilSubs.map(s => sendPush(s, { tittel, melding, url: varselUrl })),
        )
      }

      if (kanEpost) {
        const html = arrangementEpostHtml({ tittel, tekst: melding, url: varselUrl, knappTekst })
        epostBatch.push({ til: profil.epost!, emne: tittel, html })
      }
    }),
  )

  await sendEpostBatch(epostBatch)

  return { utfall: 'sendt', levert, kunApp, dedupHoppet }
}

// ─── WRAPPER-FUNKSJONER ─────────────────────────────────────────────────────

export async function sendNyttArrangementVarsler({
  arrangementId,
  tittel,
  startTidspunkt,
}: {
  arrangementId: string
  tittel: string
  startTidspunkt: string
}) {
  const dato = formaterDatoKlokke(startTidspunkt)
  await sendVarsel({
    tittel: 'Nytt arrangement',
    melding: `${tittel} — ${dato}`,
    url: `${BASE_URL}/arrangementer/${arrangementId}`,
    type: 'nytt_arrangement',
    arrangementId,
  })
}

export async function sendOppdatertVarsler({
  arrangementId,
  tittel,
  startTidspunkt,
  fraNavn,
  hilsen,
}: {
  arrangementId: string
  tittel: string
  startTidspunkt: string
  // Valgfri avsender og hilsen — satt når admin/arrangør varsler manuelt
  // via VarsleNuKnapp-modalen (#282). Uten disse to beholdes dagens
  // stille «Arrangement oppdatert»-melding.
  fraNavn?: string
  hilsen?: string
}) {
  const dato = formaterDatoKlokke(startTidspunkt)
  // Personlig melding med avsender og hilsen — ellers standard stille
  // oppdateringsmelding (bakoverkompatibel). Validering i formaterHilsenMelding.
  const melding = formaterHilsenMelding({
    fraNavn,
    hilsen,
    verb: 'varsler om',
    basis: `${tittel} (${dato})`,
    fallback: `${tittel} — ${dato}`,
    maksLengde: VARSLE_MAKS_LENGDE,
  })
  await sendVarsel({
    tittel: 'Arrangement oppdatert',
    melding,
    url: `${BASE_URL}/arrangementer/${arrangementId}`,
    type: 'oppdatert',
    arrangementId,
    tillatDuplikat: true,
  })
}

/**
 * Bygger 7-dagers-påminnelsesteksten (#591). Ren funksjon — eksportert for
 * testing, samme presedens som formaterHilsenMelding. «syv» i første setning
 * er hardkodet tekst, ikke avledet fra PAAMINNELSE_DAGER.LANG (=== 7) — endres
 * konstanten må denne teksten endres i samme håndgrep.
 */
export function byggPaaminne7Melding({
  tittel,
  startTidspunkt,
  oppmoetested,
  antallPaameldt,
}: {
  tittel: string
  startTidspunkt: string
  oppmoetested: string | null
  antallPaameldt: number
}): string {
  const sted = oppmoetested?.trim()
  const setninger = [
    `Det er syv dager til ${tittel}.`,
    sted
      ? `Vi starter ${formaterDatoKlokke(startTidspunkt)}, oppmøte på ${sted}.`
      : `Vi starter ${formaterDatoKlokke(startTidspunkt)}.`,
    antallPaameldt === 0 ? 'Ingen har meldt seg på ennå.' : `${antallPaameldt} påmeldt så langt.`,
    'Vel møtt!',
  ]
  return setninger.join(' ')
}

export async function sendPaaminneVarsler(
  params:
    | {
        type: 'paaminne_7'
        arrangementId: string
        tittel: string
        startTidspunkt: string
        oppmoetested: string | null
        antallPaameldt: number
      }
    | {
        type: 'paaminne_1'
        arrangementId: string
        tittel: string
        startTidspunkt: string
      },
) {
  const { arrangementId, tittel, startTidspunkt, type } = params
  const melding =
    type === 'paaminne_7'
      ? byggPaaminne7Melding({
          tittel,
          startTidspunkt,
          oppmoetested: params.oppmoetested,
          antallPaameldt: params.antallPaameldt,
        })
      : `${tittel} er i morgen — ${formaterDatoKlokke(startTidspunkt)}`
  await sendVarsel({
    tittel: `Påminnelse: ${tittel}`,
    melding,
    url: `${BASE_URL}/arrangementer/${arrangementId}`,
    type,
    arrangementId,
  })
}

export async function sendArrangorPurringVarsler({
  ansvarligId,
  arrangementNavn,
  aar,
}: {
  ansvarligId: string
  arrangementNavn: string
  aar: number
}) {
  await sendVarsel({
    mottakere: [ansvarligId],
    tittel: 'Husk arrangøransvaret ditt!',
    melding: `Du er ansvarlig for å arrangere ${arrangementNavn} i ${aar}. Fint om du legger inn arrangementet!`,
    url: `${BASE_URL}/arrangementer/nytt`,
    knappTekst: 'Opprett arrangement',
    type: 'arrangor_purring',
    // Bærer verken arrangementId eller pollId — tillatDuplikat: false var
    // derfor en no-op (#518), ikke en reell sperre. Tåler duplikater i
    // praksis (cronen kjører én gang daglig per ubesatt ansvar), så
    // tillatDuplikat: true sier sannheten om oppførselen i stedet for å late
    // som en beskyttelse som ikke fantes.
    tillatDuplikat: true,
  })
}

export async function sendNyPollVarsler({
  pollId,
  spoersmaal,
  svarfrist,
}: {
  pollId: string
  spoersmaal: string
  svarfrist: string
}) {
  const frist = formaterDatoKlokke(svarfrist)
  await sendVarsel({
    tittel: 'Ny avstemming',
    melding: `${spoersmaal} — svarfrist ${frist}`,
    url: `${BASE_URL}/poll/${pollId}`,
    knappTekst: 'Stem nå',
    type: 'ny_poll',
    // Hver poll er unik — ingen dedup-behov. sendVarsel bruker arrangementId
    // for dedup, men vår pollId peker ikke dit. Sett tillatDuplikat for å
    // unngå at den uansett tolker vår context feil.
    tillatDuplikat: true,
  })
}

// ─── KÅRINGSPOLL-VARSLER (#87) ──────────────────────────────────────────────

export async function sendKaaringspollOpprettetVarsel({
  pollId,
  spoersmaal,
  svarfrist,
}: {
  pollId: string
  spoersmaal: string
  svarfrist: string
}) {
  const frist = formaterDatoKlokke(svarfrist)
  await sendVarsel({
    tittel: 'Ny kåring',
    melding: `${spoersmaal} — svarfrist ${frist}`,
    url: `${BASE_URL}/poll/${pollId}`,
    knappTekst: 'Stem nå',
    type: 'kaaringspoll_opprettet',
    pollId,
  })
}

export async function sendKaaringspollVinnerVarsel({
  pollId,
  spoersmaal,
}: {
  pollId: string
  spoersmaal: string
}) {
  await sendVarsel({
    tittel: 'Kåringen er avgjort',
    melding: `${spoersmaal} — vinneren er kåret`,
    url: `${BASE_URL}/poll/${pollId}`,
    knappTekst: 'Se vinneren',
    type: 'kaaringspoll_vinner',
    pollId,
  })
}

export async function sendKaaringspollTiebreakVarsel({
  pollId,
  spoersmaal,
  mottakere,
}: {
  pollId: string
  spoersmaal: string
  mottakere: string[]
}) {
  await sendVarsel({
    mottakere,
    tittel: 'Likt antall stemmer',
    melding: `${spoersmaal} — du må velge vinneren`,
    url: `${BASE_URL}/kaaringspoll/${pollId}/tiebreak`,
    knappTekst: 'Velg vinner',
    type: 'kaaringspoll_tiebreak',
    pollId,
  })
}

export async function sendKaaringspollIngenStemmerVarsel({
  pollId,
  spoersmaal,
  mottakere,
}: {
  pollId: string
  spoersmaal: string
  mottakere: string[]
}) {
  await sendVarsel({
    mottakere,
    tittel: 'Kåring uten stemmer',
    melding: `${spoersmaal} — ingen stemte, ingen vinner kåret`,
    url: `${BASE_URL}/poll/${pollId}`,
    type: 'kaaringspoll_ingen_stemmer',
    pollId,
  })
}

export async function sendPurringVarsler({
  arrangementId,
  tittel,
  startTidspunkt,
  fraNavn,
  hilsen,
  manuell = false,
}: {
  arrangementId: string
  tittel: string
  startTidspunkt: string
  // Valgfri avsender og hilsen — satt ved manuell purring fra admin/oppretter (#287).
  // Når disse er oppgitt brukes personlig meldingstekst i stedet for cron-meldingen.
  fraNavn?: string
  hilsen?: string
  // Manuell purring fra «Purre disse» skal ikke stanses av cron-bryteren — det er
  // en bevisst handling, ikke en cron-jobb (#287). Løsningen er EGEN VARSELTYPE,
  // ikke et «hopp over sjekken»-flagg: flagget het tidligere ignorerAktivBryter og
  // hoppet kun over en sjekk her i wrapperen, mens porten i sendVarsel slo opp
  // samme nøkkel på nytt og stoppet purringen likevel — stille, med grønn
  // kvittering til admin. Se #547. Nå bærer manuell purring typen
  // 'purring_manuell' med sin egen bryter, så porten kan skille de to uten at
  // noen trenger å overstyre den. Default false (cron-sti).
  manuell?: boolean
}) {
  // Ingen bryter-sjekk her — porten i sendVarsel slår opp riktig nøkkel for
  // typen vi sender. Wrapperen skal ikke ha sin egen mening om det.

  // Beregn mottakere her — så tett opp mot utsendingen som mulig. Tidligere lot vi
  // kalleren sende inn en mottakerliste, men det åpnet et TOCTOU-vindu der noen
  // kunne svare mellom action-beregning og utsending og fortsatt få purring. (#287)
  const supabase = createAdminClient()
  const { data: paameldinger, error: paameldingerFeil } = await supabase
    .from('paameldinger')
    .select('profil_id')
    .eq('arrangement_id', arrangementId)

  // Fail closed: hvis spørringen feiler er harSvart tomt, og uten denne
  // sjekken ville purringen gått til ALLE aktive medlemmer — også de som
  // for lengst har svart. Manuell purring skal aldri eksplodere til hele
  // klubben pga en transient DB-feil. (#287)
  if (paameldingerFeil) {
    throw new Error(`Kunne ikke hente påmeldinger for purring: ${paameldingerFeil.message}`)
  }

  const harSvart = new Set((paameldinger ?? []).map(p => p.profil_id))
  const profiler = await hentProfiler(await hentTestModus())
  const sendTil = profiler.filter(p => !harSvart.has(p.id)).map(p => p.id)

  if (sendTil.length === 0) return

  const dato = formaterDatoKlokke(startTidspunkt)
  // Personlig melding med avsender og hilsen — ellers standard cron-melding.
  const melding = formaterHilsenMelding({
    fraNavn,
    hilsen,
    verb: 'purrer deg på',
    basis: `${tittel} (${dato})`,
    fallback: `${tittel} — ${dato}. Du har ikke svart enda.`,
    maksLengde: PURRING_MAKS_LENGDE,
  })

  await sendVarsel({
    mottakere: sendTil,
    tittel: 'Husk å svare!',
    melding,
    url: `${BASE_URL}/arrangementer/${arrangementId}`,
    knappTekst: 'Svar nå',
    type: manuell ? 'purring_manuell' : 'purring',
    arrangementId,
    // Manuell purring fra admin er en bevisst handling — alltid send uavhengig av
    // om de allerede har mottatt en cron-purring for dette arrangementet. (#287)
    tillatDuplikat: manuell,
  })
}

// ─── @-MENTION I CHAT ───────────────────────────────────────────────────────
// Sentralisert mention-handler for alle chat-scopes. Tidligere lå det
// fire nesten-identiske kopier i lib/actions/chat.ts; en regex-bug
// (28. april 2026) traff alle fire steder fordi de var kopiert. Holdes
// her sammen med øvrig varsling for å forhindre repetisjon.

export type MentionScope =
  | { type: 'arrangement'; id: string }
  | { type: 'klubb' }
  | { type: 'poll'; id: string }
  | { type: 'melding'; id: string }
  | { type: 'albumbilde'; bildeId: string; albumId: string }

// Mention-extract-regex er sentralisert i lib/mention.ts.
// Stopper ved space — `@alle andre` matcher som `'alle'`, ikke
// `'alle andre'`. Flerords-navn håndteres fortsatt riktig fordi
// matching-funksjonen bruker `.includes()` på fullt profilnavn:
// `@Ola` treffer «Ola Petter Nordmann», og `@Ola Nordmann` treffer
// også (etternavnet blir bare vanlig tekst i meldingen).

function utdrag(tekst: string, maks = 80): string {
  return tekst.length > maks ? tekst.slice(0, maks - 3) + '...' : tekst
}

async function hentScopeInnhold(
  scope: MentionScope,
  admin: ReturnType<typeof createAdminClient>,
): Promise<{ tittel: string; url: string; knappTekst: string }> {
  // Exhaustive switch med never-default (i stedet for if/else-kjede med
  // ubetinget melding-fallthrough) — lukker klassen av bugs der en ny
  // MentionScope-variant stille ruter til feil URL. Se #481.
  switch (scope.type) {
    case 'klubb':
      return {
        tittel: 'Klubbchat',
        url: `${BASE_URL}/chat`,
        knappTekst: 'Åpne chatten',
      }
    case 'arrangement': {
      // Fail ÅPENT (bevisst): en feil her rammer kun tittel-teksten i varselet
      // (fallback under), ikke hvem som mottar det. Ikke verdt å kaste for. (#503)
      const { data, error } = await admin
        .from('arrangementer')
        .select('tittel')
        .eq('id', scope.id)
        .single()
      // Fail-open, men ikke stille: feilobjektet skal videre til Sentry selv
      // om vi fortsetter med fallback-tittel. (#503-review)
      if (error) await logg.feil('varsel.scope.feilet', error, { ctx: { sample: 'mention.arrangement' } })
      return {
        tittel: `Chat: ${data?.tittel ?? 'et arrangement'}`,
        // #kommentarer-ankeret scroller direkte til chat-seksjonen på
        // arrangement-siden — brukeren trenger ikke lete etter chatten. Se #233.
        url: `${BASE_URL}/arrangementer/${scope.id}#kommentarer`,
        knappTekst: 'Åpne chatten',
      }
    }
    case 'poll': {
      // Samme resonnement som arrangement over — feiler kun tittel-teksten.
      const { data, error } = await admin
        .from('poll')
        .select('spoersmaal')
        .eq('id', scope.id)
        .single()
      if (error) await logg.feil('varsel.scope.feilet', error, { ctx: { sample: 'mention.poll' } })
      return {
        tittel: `Kommentar: ${data?.spoersmaal ?? 'en avstemming'}`,
        url: `${BASE_URL}/poll/${scope.id}`,
        knappTekst: 'Åpne avstemmingen',
      }
    }
    case 'melding':
      return {
        tittel: 'Kommentar i innlegg',
        url: `${BASE_URL}/meldinger/${scope.id}`,
        knappTekst: 'Åpne innlegget',
      }
    case 'albumbilde':
      return {
        tittel: 'Ny kommentar på bilde',
        url: `${BASE_URL}/album/${scope.albumId}?bilde=${scope.bildeId}`,
        knappTekst: 'Åpne bildet',
      }
    default: {
      const ukjent: never = scope
      throw new Error(`Ukjent mention-scope: ${JSON.stringify(ukjent)}`)
    }
  }
}

export async function sendChatMentionVarsler(
  scope: MentionScope,
  tekst: string,
  avsenderId: string,
) {
  const mentions = [...tekst.matchAll(mentionExtractRegex())].map(m =>
    m[1].trim().toLowerCase(),
  )
  if (mentions.length === 0) return

  const admin = createAdminClient()

  // Fail closed — samme klasse feil som mottaker-oppslaget i sendVarsel:
  // en feilet spørring skal ikke tolkes som «ingen mentions å varsle». (#503)
  const { data, error } = await admin
    .from('profiles')
    .select('id, navn, visningsnavn, epost')
    .eq('aktiv', true)
  if (error) {
    await logg.feil('varsel.mottakere.feilet', error, { ctx: { sample: 'mention' } })
    throw new Error(`Kunne ikke hente profiler for @-mention: ${error.message}`)
  }
  // `data` er typet «| null», men throw-en over har allerede fanget det eneste
  // tilfellet som gir null — `?? []` er ren TS-narrowing, ikke en skjult
  // stille-retur. (#503-review)
  const profiler = data ?? []

  const erAlle = mentions.includes('alle')
  const nevnte = erAlle
    ? profiler.filter(p => p.id !== avsenderId)
    : profiler.filter(p => {
        if (p.id === avsenderId) return false
        return mentions.some(
          m =>
            p.navn?.toLowerCase().includes(m) ||
            p.visningsnavn?.toLowerCase().includes(m),
        )
      })
  if (nevnte.length === 0) return

  const avsender = profiler.find(p => p.id === avsenderId)
  const avsenderNavn = avsender?.visningsnavn ?? avsender?.navn ?? 'Noen'

  const innhold = await hentScopeInnhold(scope, admin)

  await sendVarsel({
    mottakere: nevnte.map(p => p.id),
    tittel: innhold.tittel,
    melding: `${avsenderNavn}: ${utdrag(tekst)}`,
    url: innhold.url,
    knappTekst: innhold.knappTekst,
    type: 'mention',
    tillatDuplikat: true,
  })
}
