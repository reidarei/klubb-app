// Feilhåndtering: se CLAUDE.md § Policy: Varsler (feilkontrakt, #503).
// Kort: oppslag som vokter mot uønsket utsending kaster; dedup-sjekk og
// scope-oppslag feiler åpent, men logger med logg.feil.
// push_subscriptions kaster også: tomt resultat er bit-identisk med «ingen
// push», og den som kun har push aktiv ville stille fått ingenting.
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPush } from '@/lib/push'
import { sendEpostBatch, arrangementEpostHtml } from '@/lib/epost'
import { formaterDato, FORMAT_DATO_KLOKKE, FORMAT_KLOKKE, FORMAT_DATO_KORT } from '@/lib/dato'
import { BASE_URL, getBaseUrl, absoluttUrl, relativUrl } from '@/lib/config'
import {
  PURRING_MAKS_LENGDE,
  VARSLE_MAKS_LENGDE,
  CHAT_FANOUT_TREG_MS,
  EPOST_DOEGNBUDSJETT_CHAT,
  EPOST_BUDSJETT_VINDU_TIMER,
} from '@/lib/konstanter'
import { splittPaaMentions } from '@/lib/mention'
import { logg } from '@/lib/logg'
// Delt med kontrollpanelet, så de to aldri er uenige om hvilken bryter som
// styrer hvilket varsel.
import { typeTilNoekkel } from '@/lib/varsel-typer'

const formaterDatoKlokke = (iso: string) => formaterDato(iso, FORMAT_DATO_KLOKKE)
const formaterKlokke = (iso: string) => formaterDato(iso, FORMAT_KLOKKE)
const formaterDatoKort = (iso: string) => formaterDato(iso, FORMAT_DATO_KORT)

// Localhost-BASE_URL betyr dev, trolig mot prod-DB: push med lokal URL blir
// ubrukelige lenker på ekte mobiler. Blokker med mindre
// ALLOW_LOCAL_NOTIFICATIONS=true. Belte og seler utover test_modus, som kan
// glemmes.
// Regnes ut per kall, ikke som modulnivå-konstant, så tester slipper
// vi.resetModules() (#765). getBaseUrl() er ingen ny feilkilde: BASE_URL
// kaster allerede ved modulinnlasting i de samme miljøene (#687).
function blokkerUtsending(): boolean {
  const ER_LOKAL_BASE =
    getBaseUrl().includes('localhost') || getBaseUrl().includes('127.0.0.1')
  const TILLAT_LOKAL = process.env.ALLOW_LOCAL_NOTIFICATIONS === 'true'
  // Vitest setter VITEST=true; testene skal kunne kjøre send-logikken.
  const ER_UNIT_TEST = !!process.env.VITEST
  return ER_LOKAL_BASE && !TILLAT_LOKAL && !ER_UNIT_TEST
}

async function erVarselAktiv(noekkel: string): Promise<boolean> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('varsel_innstillinger')
    .select('aktiv')
    .eq('noekkel', noekkel)
    .maybeSingle()
  // Fail closed. Manglende RAD er legitimt (default true), en feil er ikke.
  if (error) {
    // sample under ctx: logg.feil() leser kun opts.fingerprint/opts.ctx.
    await logg.feil('varsel.innstilling.feilet', error, { ctx: { sample: noekkel } })
    throw new Error(`Kunne ikke lese varsel-innstilling «${noekkel}»: ${error.message}`)
  }
  return data?.aktiv ?? true
}

async function erTypeAktiv(type: string): Promise<boolean> {
  return erVarselAktiv(typeTilNoekkel(type))
}

// Fortids-sperret — se CLAUDE.md § Policy: Varsler. «oppdatert» står bevisst
// utenfor: knappen skjules i UI for passerte arrangementer i stedet.
const HENDELSE_VARSLER = new Set(['nytt_arrangement', 'paaminne_7', 'paaminne_1'])

// Returnerer test-eposten når testmodus er på, ellers null.
async function hentTestModus(): Promise<string | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('varsel_innstillinger')
    .select('aktiv, beskrivelse')
    .eq('noekkel', 'test_modus')
    .maybeSingle()
  // Fail closed: uleselig testmodus kunne ellers sendt til alle 17.
  if (error) {
    await logg.feil('varsel.innstilling.feilet', error, { ctx: { sample: 'test_modus' } })
    throw new Error(`Kunne ikke lese test_modus-innstilling: ${error.message}`)
  }
  if (data?.aktiv && data.beskrivelse) return data.beskrivelse
  return null
}

// Aktive profiler (i testmodus: kun testprofilen). testEpost tas inn fordi
// begge kallstedene alt har slått den opp (#503).
async function hentProfiler(testEpost: string | null) {
  const supabase = createAdminClient()

  const query = supabase.from('profiles').select('id, navn, epost').eq('aktiv', true)
  if (testEpost) query.eq('epost', testEpost)
  const { data, error } = await query
  // Fail closed: tomt array er bit-identisk med «ingen aktive mottakere».
  if (error) {
    // «broadcast» skiller denne fra de andre kildene til samme event.
    await logg.feil('varsel.mottakere.feilet', error, { ctx: { sample: 'broadcast' } })
    throw new Error(`Kunne ikke hente profiler: ${error.message}`)
  }
  return data ?? []
}

async function hentVarselPreferanser(profilIder: string[]) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('varsel_preferanser')
    .select('profil_id, push_aktiv, epost_aktiv, varsel_nivaa')
    .in('profil_id', profilIder)
  // Fail closed: en tom Map tolkes lenger nede som epostAktiv: true for alle,
  // også dem som har skrudd e-post av.
  if (error) {
    await logg.feil('varsel.preferanser.feilet', error, { ctx: { count: profilIder.length } })
    throw new Error(`Kunne ikke hente varselpreferanser: ${error.message}`)
  }
  const map = new Map<string, { push_aktiv: boolean; epost_aktiv: boolean; varsel_nivaa: string }>()
  for (const p of data ?? []) map.set(p.profil_id, p)
  return map
}

async function hentPushSubscriptions(profilIder: string[]) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('profil_id, endpoint, p256dh, auth')
    .in('profil_id', profilIder)
  // Kaster selv om feilen isolert bare er «ingen push» — se filhodet.
  if (error) {
    await logg.feil('varsel.preferanser.feilet', error, { ctx: { count: profilIder.length } })
    throw new Error(`Kunne ikke hente push-subscriptions: ${error.message}`)
  }
  return data ?? []
}

/**
 * Døgnbudsjett-vakt for e-post fra chat (#612). Resend free tier tar 100
 * e-poster i døgnet, og kvoten deles med 06:00-cronen — uten vakten kan en
 * kveld med chat gjøre at påminnelsene aldri når fram.
 *
 * Over EPOST_DOEGNBUDSJETT_CHAT hoppes kun e-postkanalen over for chat_*-
 * typene; push og in-app går som normalt. Andre typer passerer alltid.
 *
 * Fail ÅPENT: klarer vi ikke å telle, sendes som normalt (logges).
 * Telleren er en tilnærming (varsel_logg-rader, ikke Resend-kvitteringer),
 * så vakten er heller for streng enn for slapp.
 */
async function chatEpostBudsjettBrukt(
  supabase: ReturnType<typeof createAdminClient>,
  type: string,
): Promise<boolean> {
  if (!CHAT_BROADCAST_TYPER.has(type)) return false

  const vinduStart = new Date(
    Date.now() - EPOST_BUDSJETT_VINDU_TIMER * 60 * 60 * 1000,
  ).toISOString()
  const { count, error } = await supabase
    .from('varsel_logg')
    .select('id', { count: 'exact', head: true })
    // 'begge' = push + epost. 'kun_app'/'push' kostet ingen e-post.
    .in('kanal', ['epost', 'begge'])
    .gte('opprettet', vinduStart)

  if (error) {
    await logg.feil('varsel.epost.budsjett.feilet', error, { ctx: { sample: type } })
    return false
  }

  const brukt = count ?? 0
  if (brukt >= EPOST_DOEGNBUDSJETT_CHAT) {
    logg.warn('varsel.epost.budsjett.chat_hoppet', { sample: type, count: brukt })
    return true
  }
  return false
}

// ─── HJELPEFUNKSJON FOR HILSENFORMATERING ───────────────────────────────────

/**
 * Varselmelding med valgfri personlig hilsen: «{fraNavn} {verb} {basis} og
 * skriver: «{hilsen}»». Tom hilsen gir fallback uendret. Ren funksjon (#289).
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
  // !== undefined, ikke truthy: maksLengde: 0 skal også validere
  if (trimmet && maksLengde !== undefined && trimmet.length > maksLengde) {
    throw new Error(`Hilsen kan ikke være lengre enn ${maksLengde} tegn`)
  }
  return trimmet && fraNavn
    ? `${fraNavn} ${verb} ${basis} og skriver: «${trimmet}»`
    : fallback
}

// ─── SENTRAL VARSLINGSFUNKSJON ───────────────────────────────────────────────

// Kaster = ukjent utfall, retry er lov. Returnerer = terminalt avgjort; kallere
// som stempler en tilstandsrad stempler på ALLE utfall (#504, se CLAUDE.md
// § Policy: Varsler, doktrinen om kvittering).
//
// INVARIANT: sendVarsel kaster kun FØR utsendingsløkka — inne i løkka er alt
// fail-open. KASTER ⇒ ingen mottaker fikk noe. sendChatVarsler bygger på
// dette. Et nytt throw inne i løkka bryter kontrakten stille.
// Pinnet i __tests__/chat-varsler.test.ts § «mention-benet kaster».
export type VarselUtfall = {
  utfall:
    | 'sendt'
    | 'blokkert_lokal'
    | 'type_deaktivert'
    | 'hendelse_passert'
    | 'dedup'
    | 'ingen_mottakere'
  // Mottakere med minst én aktiv kanal — ikke leveringskvittering. Økes før
  // push/e-post forsøkes (og også om logg-inserten feilet). Kun observability.
  levert: number
  // Kun in-app-rad: kanalene er av, ELLER varsel_nivaa dempet et
  // lavsignal-varsel (#614). Tallet skiller ikke de to.
  kunApp: number
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
  tellerUlest = true,
  pushTag,
}: {
  mottakere?: string[]
  tittel: string
  // Funksjonsformen bygger teksten per mottaker (i dag kun paaminne_7). Del
  // aldri en slik sending i ett kall per gruppe: den globale dedup-sjekken
  // ville gitt gruppe 2..n 'dedup' (#547, se CLAUDE.md § Policy: Varsler).
  melding: string | ((profilId: string) => string)
  url?: string
  knappTekst?: string
  type: string
  arrangementId?: string
  pollId?: string
  tillatDuplikat?: boolean
  // Per-mottaker-guard med navnerom-prefiks («pass-godkjent:{id}»), se
  // varsel_logg_dedup_noekkel_uniq (mig. 121). Invariant (#612): en rad bærer
  // en kvittering HVISS dedup_noekkel er satt — rader uten kan trygt prunes.
  dedupNoekkel?: string
  // false = lavsignal (#612): teller ikke mot ulest/«Viktig», men står i «Alt».
  // Eksplisitt parameter, ikke utledet av `type` — en typeliste her ville
  // glemt neste lavsignal-type.
  tellerUlest?: boolean
  // Push med samme tag kollapser til én rad på låseskjermen (#612). Settes av
  // kallstedet, der tråd-identiteten finnes. Udefinert = ingen gruppe, så
  // påminnelser og kåringsvarsler kan aldri kollapses bort.
  pushTag?: string
}): Promise<VarselUtfall> {
  // Ingen varsel_logg-rad her — ikke forurens innboksen med late-som-rader.
  if (blokkerUtsending()) {
    logg.warn('varsel.blokkert.lokal', { sample: type })
    return { utfall: 'blokkert_lokal', ...INGEN_UTSENDING }
  }

  // 0. Admin-bryter per varseltype. Manglende nøkkel = aktiv.
  if (!(await erTypeAktiv(type))) {
    logg.warn('varsel.type.deaktivert', { sample: type })
    return { utfall: 'type_deaktivert', ...INGEN_UTSENDING }
  }

  const supabase = createAdminClient()

  // 0b. Fortids-sperre (backfill av gamle turer). Sammenligner to instanter,
  // så tidssone spiller ingen rolle.
  if (arrangementId && HENDELSE_VARSLER.has(type)) {
    const { data: arr, error: arrFeil } = await supabase
      .from('arrangementer')
      .select('start_tidspunkt')
      .eq('id', arrangementId)
      .maybeSingle()
    // Fail closed: uleselig sperre er ikke «ikke passert».
    if (arrFeil) {
      // Eget event — dette er ikke et varsel_innstillinger-oppslag.
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

  // 1. Dedup på arrangement_id eller poll_id. Fail ÅPENT: et mulig duplikat
  // er mildere enn et garantert tapt varsel (#503).

  // tillatDuplikat: false uten noen nøkkel er en stille no-op — gjør den
  // synlig i loggen (#518).
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
    // logg.feil, ikke warn: fail-open gjelder leveranse, ikke synlighet.
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

  // 3. Mottakere, deduplisert. Fail closed: feil ≠ «ingen mottakere» (#503).
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

  if (testEpost) {
    profiler = profiler.filter(p => p.epost === testEpost)
  }

  if (profiler.length === 0) {
    // Logges ikke i testmodus, som rutinemessig filtrerer bort nesten alle.
    if (!testEpost) {
      // Broadcast som treffer 0 aktive kan bety RLS-/grant-glipp mot profiles
      // → logg.feil (Sentry). En eksplisitt tom liste er et legitimt valg → warn.
      // (#504/#517)
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

  // 4. Preferanser + push-subscriptions
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

  // 5. Parallelt per mottaker — sekvensielt sprengte Vercel Hobbys 10 s-timeout.
  // E-post samles i én batch til Resend, ellers gir parallelle kall 429 (#478).
  const epostBatch: { til: string; emne: string; html: string }[] = []

  // Absolutt for e-post/varsel_logg — en innboks har ingen base-URL (#507).
  const normalisertUrl = url ? absoluttUrl(url) : undefined
  // 'chat' (verken absolutt eller «/…») slipper uendret gjennom absoluttUrl
  // og blir en ødelagt lenke — logg det.
  if (url && normalisertUrl === url && !/^https?:\/\//i.test(url)) {
    logg.warn('varsel.url.relativ', { sample: type })
  }

  // Push trenger relativ URL (SW-en sammenligner origin strengt, #687). Én gang
  // per sending: fremmed URL er en egenskap ved sendingen, ikke mottakeren.
  const relativt = url ? relativUrl(normalisertUrl!) : undefined
  if (relativt && relativt.utfall !== 'ok') {
    logg.warn('varsel.url.fremmed', { sample: type, url_utfall: relativt.utfall })
  }

  // Muteres fra parallelle callbacks under — trygt, JS er single-threaded.
  let levert = 0
  let kunApp = 0
  let dedupHoppet = 0

  // Én gang per sending, ikke per mottaker.
  const epostSperretAvBudsjett = await chatEpostBudsjettBrukt(supabase, type)

  await Promise.all(
    profiler.map(async profil => {
      const pref = prefs.get(profil.id)
      const pushAktiv = pref ? pref.push_aktiv : false
      const epostAktiv = pref ? pref.epost_aktiv : true
      // Manglende preferanse-rad = 'alle', så en profil uten rad ikke mister chat.
      const nivaa = pref ? pref.varsel_nivaa : 'alle'
      const profilSubs = subsByProfil.get(profil.id) ?? []

      // Nivået leser tellerUlest, aldri en egen typeliste (#614). Dempet ⇒
      // ingen push/e-post, men in-app-raden skrives og kanal blir 'kun_app'.
      const lavsignalDempet = !tellerUlest && nivaa === 'viktige'
      const kanPush = pushAktiv && profilSubs.length > 0 && !lavsignalDempet
      const kanEpost = epostAktiv && !!profil.epost && !epostSperretAvBudsjett && !lavsignalDempet
      // 'kun_app': raden skrives alltid — varsel_logg ER innboksen (#504).
      // Dekker både «kanaler av» og «nivå dempet» (#614).
      const kanal = kanPush && kanEpost ? 'begge' : kanPush ? 'push' : kanEpost ? 'epost' : 'kun_app'

      // Før logg-inserten, så innboks, push og e-post får samme tekst.
      const profilMelding = typeof melding === 'function' ? melding(profil.id) : melding

      const { data: loggRad, error: loggFeil } = await supabase
        .from('varsel_logg')
        .insert({
          profil_id: profil.id,
          tittel,
          melding: profilMelding,
          type,
          kanal,
          url: normalisertUrl ?? null,
          arrangement_id: arrangementId ?? null,
          poll_id: pollId ?? null,
          dedup_noekkel: dedupNoekkel ?? null,
          teller_ulest: tellerUlest,
        })
        .select('id')
        .single()

      // Fail ÅPENT: et throw her ville avbrutt løkka før sendEpostBatch (noen
      // får push, ingen får e-post). Kostnaden er at en tapt rad gjør neste
      // dedup-sjekk blind for denne sendingen (#503, #518).
      //
      // 23505 på dedup_noekkel = allerede kvittert for ham: hopp over ham,
      // fortsett med resten. Aldri throw (#504).
      if (loggFeil) {
        if (loggFeil.code === '23505') {
          dedupHoppet++
          return
        }
        await logg.feil('varsel.logg.insert.feilet', loggFeil, { ctx: { profil_id: profil.id } })
      }

      if (kanal === 'kun_app') kunApp++
      else levert++

      // Push relativ (#687), e-post absolutt (#507) — se CLAUDE.md § Policy:
      // Varsler. Fremmed/ugyldig URL faller for push til varsel-raden (som viser
      // hele varselet), ellers «/» — aldri til stien fra den fremmede URL-en.
      const varselUrl = normalisertUrl ?? (loggRad ? `${BASE_URL}/varsler/${loggRad.id}` : BASE_URL)
      const pushUrl =
        relativt?.utfall === 'ok'
          ? relativt.sti
          : loggRad
            ? `/varsler/${loggRad.id}`
            : '/'

      if (kanPush) {
        await Promise.all(
          profilSubs.map(s =>
            sendPush(s, { tittel, melding: profilMelding, url: pushUrl, tag: pushTag }),
          ),
        )
      }

      if (kanEpost) {
        const html = arrangementEpostHtml({ tittel, tekst: profilMelding, url: varselUrl, knappTekst })
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
  // Satt ved manuell varsling fra VarsleNuKnapp (#282).
  fraNavn?: string
  hilsen?: string
}) {
  const dato = formaterDatoKlokke(startTidspunkt)
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
 * «Oppmøte {sted} kl. {tid}.» — delt av begge påminnelsene, så de to aldri
 * kan drifte fra hverandre. Uten oppmøtested faller den tilbake til
 * «Vi starter kl. {tid}.»; «Oppmøte kl. 18:00» ville lest som en skrivefeil.
 */
function oppmoteSetning(startTidspunkt: string, oppmoetested: string | null): string {
  const sted = oppmoetested?.trim()
  const tid = formaterKlokke(startTidspunkt)
  return sted ? `Oppmøte ${sted} ${tid}.` : `Vi starter ${tid}.`
}

/**
 * Påmeldingstallet i 7-dagers-påminnelsen. «så langt» er poenget syv dager ut:
 * tallet er ikke endelig, og flere kan fortsatt melde seg på.
 */
function paameldtSetning(antallPaameldt: number): string {
  return antallPaameldt === 0 ? 'Ingen har meldt seg på ennå.' : `${antallPaameldt} påmeldt så langt.`
}

/**
 * 1-dagers-varianten: dagen før er tallet i praksis endelig, så «5 kommer».
 * Bevisst ikke slått sammen med paameldtSetning. Null-tilfellet er likt fordi
 * «ingen kommer» leses som en avlysning.
 */
function kommerSetning(antallPaameldt: number): string {
  return antallPaameldt === 0 ? 'Ingen har meldt seg på ennå.' : `${antallPaameldt} kommer.`
}

/**
 * Mottakerens svar. 'ikke_svart' finnes ikke i paameldinger — den utledes av at
 * raden mangler. Speiler RsvpStatus i PaameldteListe.tsx uten å importere den
 * ('use client'-fil i UI-laget).
 */
export type RsvpStatus = 'ja' | 'kanskje' | 'nei' | 'ikke_svart'

/**
 * Halen i 7-dagers-påminnelsen per RSVP-status, som data i stedet for en
 * if-kjede. 'nei' får bevisst bare datoen — ikke oppmøtested og påmeldingstall.
 */
const PAAMINNE_7_HALER: Record<RsvpStatus, { visDetaljer: boolean; hale: string }> = {
  ja: { visDetaljer: true, hale: 'Du har svart ja — vel møtt!' },
  kanskje: {
    visDetaljer: true,
    hale: 'Du har svart kanskje — bestem deg, så arrangøren vet hvor mange han skal planlegge for.',
  },
  nei: { visDetaljer: false, hale: 'Du har meldt avbud.' },
  ikke_svart: {
    visDetaljer: true,
    // «enda», ikke «ennå» — samme ordvalg som purringens fallback-tekst.
    hale: 'Du har ikke svart enda — gi beskjed, så arrangøren vet hvor mange han skal planlegge for.',
  },
}

/**
 * 7-dagers-påminnelsesteksten (#591), personlig hale per RSVP. Ren funksjon,
 * eksportert for testing. «syv» er hardkodet, ikke avledet av
 * PAAMINNELSE_DAGER.LANG — endres konstanten, må teksten endres samtidig.
 */
export function byggPaaminne7Melding({
  tittel,
  startTidspunkt,
  oppmoetested,
  antallPaameldt,
  rsvp,
}: {
  tittel: string
  startTidspunkt: string
  oppmoetested: string | null
  antallPaameldt: number
  rsvp: RsvpStatus
}): string {
  const { visDetaljer, hale } = PAAMINNE_7_HALER[rsvp]
  // Datoen her, klokkeslettet sammen med stedet i oppmøte-setningen.
  const setninger = [
    `Det er syv dager til ${tittel}, ${formaterDatoKort(startTidspunkt)}.`,
    ...(visDetaljer ? [oppmoteSetning(startTidspunkt, oppmoetested), paameldtSetning(antallPaameldt)] : []),
    hale,
  ]
  return setninger.join(' ')
}

/**
 * 1-dagers-påminnelsesteksten. Ren funksjon, eksportert for testing. Datoen
 * utelates bevisst — «I morgen» gir den.
 */
export function byggPaaminne1Melding({
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
  const setninger = [
    `I morgen er det ${tittel}.`,
    oppmoteSetning(startTidspunkt, oppmoetested),
    kommerSetning(antallPaameldt),
    'Vel møtt!',
  ]
  return setninger.join(' ')
}

export async function sendPaaminneVarsler({
  arrangementId,
  tittel,
  startTidspunkt,
  oppmoetested,
  paameldinger,
  type,
}: {
  arrangementId: string
  tittel: string
  startTidspunkt: string
  oppmoetested: string | null
  // Antallet utledes her, så tallet og per-mottaker-teksten bygger på samme
  // øyeblikksbilde.
  paameldinger: { profil_id: string; status: string }[]
  type: 'paaminne_7' | 'paaminne_1'
}) {
  const antallPaameldt = paameldinger.filter(p => p.status === 'ja').length

  // 1-dagers er felles tekst — dagen før er det for sent å be noen bestemme
  // seg. 7-dagers bygges per mottaker, men er fortsatt ÉN sending.
  const statusPerProfil = new Map(paameldinger.map(p => [p.profil_id, p.status]))
  const melding =
    type === 'paaminne_1'
      ? byggPaaminne1Melding({ tittel, startTidspunkt, oppmoetested, antallPaameldt })
      : (profilId: string) => {
          const svar = statusPerProfil.get(profilId)
          // Ukjent status → «ikke svart»: tryggere enn å påstå feil svar.
          const rsvp: RsvpStatus =
            svar === 'ja' || svar === 'nei' || svar === 'kanskje' ? svar : 'ikke_svart'
          return byggPaaminne7Melding({ tittel, startTidspunkt, oppmoetested, antallPaameldt, rsvp })
        }

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
    // Ingen dedup-nøkkel å deduplisere på (#518); tåler duplikater (cron én
    // gang daglig).
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
    // Ingen pollId sendes, så ingen dedup-nøkkel (#518) — hver poll er unik.
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

// 'auto' = cron (3 dager før), 'manuell' = «Purre disse» (uten svar),
// 'kanskje' = «Bestem dere» (#596). Én diskriminant, ikke to booleans, så
// umulige kombinasjoner ikke kan representeres.
export type PurreVariant = 'auto' | 'manuell' | 'kanskje'

// Union, ikke `string`: en skrivefeil ville gitt en type uten etikett og uten
// bryter — stille. keyof VARSEL_TEKSTER duger ikke: den er nøklet på nøkkel,
// ikke type, og annotert Record<string, …>.
type PurreVarselType = 'purring' | 'purring_manuell' | 'purring_kanskje'

const PURRE_VARIANTER: Record<
  PurreVariant,
  {
    type: PurreVarselType
    maalgruppe: 'uten_svar' | 'kanskje'
    tittel: string
    verb: string
    fallback: (tittel: string, dato: string) => string
    knappTekst: string
    tillatDuplikat: boolean
  }
> = {
  auto: {
    type: 'purring',
    maalgruppe: 'uten_svar',
    tittel: 'Husk å svare!',
    verb: 'purrer deg på',
    fallback: (tittel, dato) => `${tittel} — ${dato}. Du har ikke svart enda.`,
    knappTekst: 'Svar nå',
    tillatDuplikat: false,
  },
  manuell: {
    type: 'purring_manuell',
    maalgruppe: 'uten_svar',
    tittel: 'Husk å svare!',
    verb: 'purrer deg på',
    fallback: (tittel, dato) => `${tittel} — ${dato}. Du har ikke svart enda.`,
    knappTekst: 'Svar nå',
    // Bevisst handling — sendes selv om cron-purringen alt har gått (#287).
    tillatDuplikat: true,
  },
  kanskje: {
    type: 'purring_kanskje',
    maalgruppe: 'kanskje',
    tittel: 'Bestem deg!',
    verb: 'ber deg bestemme deg for',
    fallback: (tittel, dato) => `${tittel} — ${dato}. Du har svart kanskje. Blir det noe på deg?`,
    knappTekst: 'Bestem deg',
    // Bevisst handling, som manuell.
    tillatDuplikat: true,
  },
}

export async function sendPurringVarsler({
  arrangementId,
  tittel,
  startTidspunkt,
  fraNavn,
  hilsen,
  variant = 'auto',
}: {
  arrangementId: string
  tittel: string
  startTidspunkt: string
  // Satt ved manuell purring (#287).
  fraNavn?: string
  hilsen?: string
  // Egen varseltype per variant, så manuell purring ikke stanses av
  // cron-bryteren. Et «hopp over sjekken»-flagg i wrapperen virket ikke —
  // sendVarsel slår opp bryteren selv (#547).
  variant?: PurreVariant
}) {
  const { type, maalgruppe, tittel: varselTittel, verb, fallback, knappTekst, tillatDuplikat } =
    PURRE_VARIANTER[variant]

  // Mottakere beregnes her, tett på utsendingen, for å lukke TOCTOU-vinduet
  // (TOCTOU: tilstanden endres mellom sjekk og bruk) der en som nettopp
  // svarte likevel ble purret (#287).
  const supabase = createAdminClient()
  const { data: paameldinger, error: paameldingerFeil } = await supabase
    .from('paameldinger')
    .select('profil_id, status')
    .eq('arrangement_id', arrangementId)

  // Fail closed: tomt resultat ville for uten_svar purret ALLE (også dem som
  // har svart), og for kanskje purret ingen med grønn kvittering.
  if (paameldingerFeil) {
    throw new Error(`Kunne ikke hente påmeldinger for purring: ${paameldingerFeil.message}`)
  }

  // Alltid via hentProfiler, aldri rett fra påmeldingsradene — bevarer testmodus
  // og aktiv=true (en deaktivert kanskje-svarer skal ikke purres).
  const profiler = await hentProfiler(await hentTestModus())
  let sendTil: string[]
  if (maalgruppe === 'uten_svar') {
    const harSvart = new Set((paameldinger ?? []).map(p => p.profil_id))
    sendTil = profiler.filter(p => !harSvart.has(p.id)).map(p => p.id)
  } else {
    const harSvartKanskje = new Set(
      (paameldinger ?? []).filter(p => p.status === 'kanskje').map(p => p.profil_id),
    )
    sendTil = profiler.filter(p => harSvartKanskje.has(p.id)).map(p => p.id)
  }

  if (sendTil.length === 0) return

  const dato = formaterDatoKlokke(startTidspunkt)
  const melding = formaterHilsenMelding({
    fraNavn,
    hilsen,
    verb,
    basis: `${tittel} (${dato})`,
    fallback: fallback(tittel, dato),
    maksLengde: PURRING_MAKS_LENGDE,
  })

  await sendVarsel({
    mottakere: sendTil,
    tittel: varselTittel,
    melding,
    url: `${BASE_URL}/arrangementer/${arrangementId}`,
    knappTekst,
    type,
    arrangementId,
    tillatDuplikat,
  })
}

// ─── CHAT-VARSLER (BROADCAST + @-MENTION) ───────────────────────────────────
// Én felles handler for alle chat-scopes, så mention-logikken ikke kopieres.
// Chat varsler alle aktive minus avsender (#612).

export type ChatVarselScope =
  | { type: 'arrangement'; id: string }
  | { type: 'klubb' }
  | { type: 'poll'; id: string }
  | { type: 'melding'; id: string }
  | { type: 'albumbilde'; bildeId: string; albumId: string }

// Minimal profilform finnNevnte trenger; generisk over T så kallere kan sende
// bredere projeksjoner.
type MentionKandidat = { id: string; navn: string | null; visningsnavn: string | null }

/**
 * Hvilke profiler en tekst @-nevner (inkl. `@alle`). Ren funksjon, testbar
 * uten DB. `avsenderId` ekskluderes alltid.
 */
export function finnNevnte<T extends MentionKandidat>(
  tekst: string,
  profiler: T[],
  avsenderId: string,
): T[] {
  // Taggene avgrenses mot kjente navn (lengste først), så «@Ola Hansen»
  // blir ÉN tagg på hele navnet — ikke søket «ola», som traff alle Ola-er.
  const kjente = profiler.flatMap(p => [p.navn, p.visningsnavn].filter((n): n is string => !!n))
  const mentions = splittPaaMentions(tekst, kjente)
    .filter(d => d.type === 'mention')
    .map(d => d.verdi.slice(1).trim().toLowerCase())
  if (mentions.length === 0) return []

  const andre = profiler.filter(p => p.id !== avsenderId)
  if (mentions.includes('alle')) return andre

  const likt = (p: T, m: string) =>
    p.navn?.toLowerCase() === m || p.visningsnavn?.toLowerCase() === m
  const delvis = (p: T, m: string) =>
    !!(p.navn?.toLowerCase().includes(m) || p.visningsnavn?.toLowerCase().includes(m))
  // Eksakt navn vinner. Delstreng kun når ingen heter nøyaktig det
  // (håndskrevet «@Lars» for «Lars Erik Nordmann»).
  return andre.filter(p =>
    mentions.some(m => {
      const eksakt = profiler.some(q => likt(q, m))
      return eksakt ? likt(p, m) : delvis(p, m)
    }),
  )
}

function utdrag(tekst: string, maks = 80): string {
  return tekst.length > maks ? tekst.slice(0, maks - 3) + '...' : tekst
}

async function hentScopeInnhold(
  scope: ChatVarselScope,
  admin: ReturnType<typeof createAdminClient>,
): Promise<{ tittel: string; url: string; knappTekst: string }> {
  // never-default: en ny scope-variant gir kompileringsfeil, ikke stille feil URL (#481).
  switch (scope.type) {
    case 'klubb':
      return {
        tittel: 'Klubbchat',
        url: `${BASE_URL}/chat`,
        knappTekst: 'Åpne chatten',
      }
    case 'arrangement': {
      // Fail ÅPENT: rammer kun tittelen, ikke mottakerne (#503). maybeSingle,
      // så et slettet arrangement gir fallback, ikke en logget PGRST116.
      const { data, error } = await admin
        .from('arrangementer')
        .select('tittel')
        .eq('id', scope.id)
        .maybeSingle()
      if (error) await logg.feil('varsel.scope.feilet', error, { ctx: { sample: 'chat.arrangement' } })
      return {
        tittel: `Chat: ${data?.tittel ?? 'et arrangement'}`,
        // Ankeret scroller rett til chatten på arrangement-siden (#233).
        url: `${BASE_URL}/arrangementer/${scope.id}#kommentarer`,
        knappTekst: 'Åpne chatten',
      }
    }
    case 'poll': {
      // Som arrangement over: fail-open, maybeSingle.
      const { data, error } = await admin
        .from('poll')
        .select('spoersmaal')
        .eq('id', scope.id)
        .maybeSingle()
      if (error) await logg.feil('varsel.scope.feilet', error, { ctx: { sample: 'chat.poll' } })
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
      throw new Error(`Ukjent chat-varsel-scope: ${JSON.stringify(ukjent)}`)
    }
  }
}

// Record over hele unionen: en ny scope-variant uten rad her gir
// kompileringsfeil (#481). Bryter-radene seedes i migrasjon 134.
const CHAT_BROADCAST_TYPE: Record<ChatVarselScope['type'], string> = {
  klubb: 'chat_klubb',
  arrangement: 'chat_arrangement',
  poll: 'chat_poll',
  melding: 'chat_melding',
  albumbilde: 'chat_albumbilde',
}

// Utledet av mappingen over, så de ikke drifter. Brukes av
// chatEpostBudsjettBrukt lenger opp — lovlig, den leses først ved kall.
const CHAT_BROADCAST_TYPER: ReadonlySet<string> = new Set(Object.values(CHAT_BROADCAST_TYPE))

/**
 * Push-tag per chat-tråd (#612). Alle fem flatene skal ha tag — innlegg og
 * albumbilde er de som går i burst. never-default som i hentScopeInnhold.
 */
function chatPushTag(scope: ChatVarselScope): string {
  switch (scope.type) {
    case 'klubb':
      return 'chat:klubb'
    case 'arrangement':
      return `chat:arrangement:${scope.id}`
    case 'poll':
      return `chat:poll:${scope.id}`
    case 'melding':
      return `chat:melding:${scope.id}`
    case 'albumbilde':
      // bildeId, ikke albumId: tråden er kommentarfeltet under ETT bilde.
      return `chat:albumbilde:${scope.bildeId}`
    default: {
      const ukjent: never = scope
      throw new Error(`Ukjent chat-varsel-scope: ${JSON.stringify(ukjent)}`)
    }
  }
}

/**
 * Eneste inngang for chat-varsling (#612), alle scopes unntatt 'privat'.
 *
 * `harBilde` brukes i dag kun i fanout-loggens sample; fallback-teksten
 * velges av om `tekst` er null.
 *
 * To sendVarsel()-kall er ikke policybrudd: ulik `type` (ulik bryter),
 * tillatDuplikat på begge og disjunkte mottakerlister — to sendinger, ikke
 * én splittet (jf. CLAUDE.md § Policy: Varsler).
 */
export async function sendChatVarsler(
  scope: ChatVarselScope,
  tekst: string | null,
  avsenderId: string,
  harBilde: boolean,
  // dedupNoekkel: kun automatiske kallere (bursdag, #642). Samme nøkkel på
  // begge benene — indeksen (dedup_noekkel, profil_id) gir maks én rad per
  // mottaker, så retry fra et senere slot er trygt.
  //
  // nevnte: eksplisitte profil-id-er i stedet for navnematching (fornavn kan
  // være tvetydige). undefined = tekstmatching; [] = slå tekstmatching AV.
  opts: { dedupNoekkel?: string; nevnte?: string[] } = {},
): Promise<void> {
  const start = Date.now()
  const admin = createAdminClient()

  // Felles oppslag, så begge benene regner på samme snapshot. Fail closed (#503).
  const { data, error } = await admin
    .from('profiles')
    .select('id, navn, visningsnavn, epost')
    .eq('aktiv', true)
  if (error) {
    await logg.feil('varsel.mottakere.feilet', error, { ctx: { sample: 'chat' } })
    throw new Error(`Kunne ikke hente profiler for chat-varsel: ${error.message}`)
  }
  // `?? []` er ren TS-narrowing — null er fanget av throw-en over.
  const profiler = data ?? []

  const innhold = await hentScopeInnhold(scope, admin)

  const avsender = profiler.find(p => p.id === avsenderId)
  const avsenderNavn = avsender?.visningsnavn ?? avsender?.navn ?? 'Noen'
  // Ikke privatmeldingens «Sendte deg et bilde» — «deg» er feil i en broadcast.
  const meldingTekst = tekst ? `${avsenderNavn}: ${utdrag(tekst)}` : `${avsenderNavn} la ut et bilde`

  // Eksplisitt liste filtreres som finnNevnte(): kun aktive, aldri avsender.
  const eksplisitte = opts.nevnte
  const nevnte = eksplisitte
    ? profiler.filter(p => eksplisitte.includes(p.id) && p.id !== avsenderId)
    : tekst
      ? finnNevnte(tekst, profiler, avsenderId)
      : []

  // Mention først. De nevnte ekskluderes fra broadcasten KUN ved utfall
  // 'sendt' — ved kast eller annet utfall får de broadcasten i stedet, så en
  // avskrudd mention-bryter ikke gjør dem usynlige. Trygt ved kast pga.
  // invarianten «sendVarsel kaster kun FØR utsendingsløkka» (se VarselUtfall).
  let ekskludert = new Set<string>()
  if (nevnte.length > 0) {
    let mentionUtfall: VarselUtfall | null = null
    try {
      mentionUtfall = await sendVarsel({
        mottakere: nevnte.map(p => p.id),
        tittel: innhold.tittel,
        melding: meldingTekst,
        url: innhold.url,
        knappTekst: innhold.knappTekst,
        type: 'mention',
        tillatDuplikat: true,
        dedupNoekkel: opts.dedupNoekkel,
      })
    } catch (err) {
      // Eget event, så alarmen sier hvilket ben som røk.
      await logg.feil('chat.varsler.mention.feilet', err)
    }
    if (mentionUtfall?.utfall === 'sendt') {
      ekskludert = new Set(nevnte.map(p => p.id))
    }
  }

  const rest = profiler.filter(p => p.id !== avsenderId && !ekskludert.has(p.id))

  // Tom rest er normalt ved `@alle` — unngå en meningsløs ingen_mottakere-logg.
  if (rest.length > 0) {
    try {
      await sendVarsel({
        mottakere: rest.map(p => p.id),
        tittel: innhold.tittel,
        melding: meldingTekst,
        url: innhold.url,
        knappTekst: innhold.knappTekst,
        type: CHAT_BROADCAST_TYPE[scope.type],
        tillatDuplikat: true,
        // Lavsignal: står i «Alt», teller ikke ulest (mig. 134).
        tellerUlest: false,
        // Kun på broadcasten — en utagget mention kan ikke erstattes på
        // låseskjermen av en vanlig chat-melding rett etterpå.
        pushTag: chatPushTag(scope),
        arrangementId: scope.type === 'arrangement' ? scope.id : undefined,
        pollId: scope.type === 'poll' ? scope.id : undefined,
        dedupNoekkel: opts.dedupNoekkel,
      })
    } catch (err) {
      await logg.feil('chat.varsler.broadcast.feilet', err)
    }
  }

  // Treg fanout skal synes i loggen før noen merker en treg «Send»-knapp (#612).
  // harBilde i sample skiller bilde- fra tekstmeldinger.
  const ms = Date.now() - start
  if (ms > CHAT_FANOUT_TREG_MS) {
    logg.warn('varsel.chat.fanout.treg', { sample: `${scope.type}${harBilde ? ':bilde' : ''}`, count: profiler.length, ms })
  }
}
