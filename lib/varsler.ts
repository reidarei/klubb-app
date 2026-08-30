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
import { formaterDato, FORMAT_DATO_KLOKKE, FORMAT_KLOKKE, FORMAT_DATO_KORT } from '@/lib/dato'
import { BASE_URL, absoluttUrl } from '@/lib/config'
import {
  PURRING_MAKS_LENGDE,
  VARSLE_MAKS_LENGDE,
  CHAT_FANOUT_TREG_MS,
  EPOST_DOEGNBUDSJETT_CHAT,
  EPOST_BUDSJETT_VINDU_TIMER,
} from '@/lib/konstanter'
import { mentionExtractRegex } from '@/lib/mention'
import { logg } from '@/lib/logg'
// Mapping type → noekkel bor i lib/varsel-typer.ts sammen med de norske
// navnene på hver type, så kontrollpanelet og denne gaten aldri kan uenige
// om hvilken bryter som styrer hvilket varsel.
import { typeTilNoekkel } from '@/lib/varsel-typer'

const formaterDatoKlokke = (iso: string) => formaterDato(iso, FORMAT_DATO_KLOKKE)
const formaterKlokke = (iso: string) => formaterDato(iso, FORMAT_KLOKKE)
const formaterDatoKort = (iso: string) => formaterDato(iso, FORMAT_DATO_KORT)

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
    .select('profil_id, push_aktiv, epost_aktiv, varsel_nivaa')
    .in('profil_id', profilIder)
  // Fail closed: en tom Map her tolkes lenger nede som epostAktiv: true for
  // ALLE — altså e-post til folk som bevisst har skrudd den av. Samme
  // resonnement gjelder varsel_nivaa: en feilet spørring skal aldri stille
  // gi 'viktige' til alle (som ville kuttet chat-varsling for hele klubben).
  if (error) {
    await logg.feil('varsel.preferanser.feilet', error, { ctx: { count: profilIder.length } })
    throw new Error(`Kunne ikke hente varselpreferanser: ${error.message}`)
  }
  const map = new Map<string, { push_aktiv: boolean; epost_aktiv: boolean; varsel_nivaa: string }>()
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

/**
 * Døgnbudsjett-vakt for e-post fra chat (#612-review).
 *
 * Resend free tier har et hardt tak på 100 e-poster per døgn. Chat varsler nå
 * alle aktive medlemmer, og `epost_aktiv` defaulter til true — ~15 e-poster per
 * melding betyr at syv meldinger tømmer døgnkvoten. Kvoten deles med
 * 06:00-cronen, så uten denne vakten kan en kveld med gutteprat gjøre at
 * 7-dagers-påminnelsen for en tur aldri når innboksen til noen.
 *
 * Vakten hopper derfor over E-POSTKANALEN for chat_*-typene når forbruket
 * siste døgn er over EPOST_DOEGNBUDSJETT_CHAT. Push og in-app-raden går som
 * normalt — mannen mister ikke varselet, bare den ene kanalen. Ikke-chat-
 * varsler passerer alltid (returnerer false på første linje): hele poenget er
 * at påminnelsene har forrang.
 *
 * FAIL ÅPENT (bevisst unntak fra fail-closed-regelen i filhodet): klarer vi
 * ikke å telle, sender vi som normalt. Å feile lukket her ville gjort en
 * transient DB-feil til et tapt varsel — verre enn å risikere at vi bikker
 * Resends tak. Feilen logges likevel med logg.feil (fail-open ≠ stille).
 *
 * Merk at telleren er en TILNÆRMING: den teller varsel_logg-rader med e-post
 * som kanal, ikke kvitteringer fra Resend. En rad kan være skrevet uten at
 * e-posten kom fram (sendEpostBatch svelger sine egne feil), og den teller
 * likevel. Det gjør vakten litt for streng, som er riktig retning å bomme i.
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
//
// INVARIANT: «sendVarsel kaster kun FØR utsendingsløkka» (#612-review).
// Alle throw-punktene i sendVarsel ligger foran `Promise.all(profiler.map(…))`
// — innstillinger, testmodus, mottakere, preferanser, push-subscriptions,
// fortids-sperre. Inne i løkka er alt fail-open (varsel_logg-insert svelges,
// sendPush/sendEpostBatch svelger sine egne feil). Konsekvensen kallere kan
// stole på: KASTER ⇒ ingen mottaker fikk noe, det er trygt å prøve dem på nytt
// et annet sted. RETURNERER ⇒ terminalt avgjort. sendChatVarsler bygger direkte
// på dette når den legger de @-nevnte tilbake i broadcasten etter et kast.
// Legger du et nytt throw inne i løkka, brytes den kontrakten stille.
// Pinnet i __tests__/chat-varsler.test.ts § «mention-benet kaster».
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
  // Mottakere som kun fikk in-app-rad, altså uten aktiv kanal for DETTE
  // varselet — enten fordi push/epost er skrudd av, eller fordi mottakerens
  // varsel_nivaa dempet et lavsignal-varsel (#614). Samme tvetydighet ligger i
  // varsel_logg.kanal = 'kun_app': feilsøker du en manglende push må du lese
  // varsel_nivaa i tillegg, kanal-verdien alene skiller ikke de to årsakene.
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
  // Enten én felles tekst, eller en funksjon som bygger teksten per mottaker.
  // Funksjonsformen finnes for varsler som må si noe om MOTTAKEREN — i dag kun
  // 7-dagers-påminnelsen, som forteller hver mann hva han selv har svart.
  //
  // Hvorfor her og ikke som N kall fra wrapperen: gaten (varsel_innstillinger),
  // fortids-sperren, dedup-sjekken og e-post-batchen hører til SENDINGEN, ikke
  // til teksten. Fire kall ville kjørt alle fire fire ganger — fire oppslag mot
  // samme bryter, og fire samtidige Resend-batcher, som er rate limit-en #478
  // løste. Verre: dedup-sjekken på (type, arrangement_id) er global, så kall 1
  // ville skrevet radene som ga kall 2–4 'dedup' — tre firedeler av klubben
  // ville stille mistet påminnelsen. Én sending med variabel tekst har ingen av
  // de problemene, og lar wrapperen slippe å ha en egen mening om bryteren
  // (#547).
  melding: string | ((profilId: string) => string)
  url?: string
  knappTekst?: string
  type: string
  arrangementId?: string
  pollId?: string
  tillatDuplikat?: boolean
  // Navnerom-prefikset per-mottaker-guard (f.eks. «pass-godkjent:{id}»,
  // «bursdag:{barnId}:{aar}») — se varsel_logg_dedup_noekkel_uniq (mig. 121).
  //
  // Retensjonsinvarianten (#612, grunnlaget en fremtidig pruning-jobb i PR 2
  // vil stole blindt på): en varsel_logg-rad bærer en kvittering HVISS
  // dedup_noekkel er non-null. En rad uten dedup_noekkel kan trygt slettes
  // uten å ta med seg en kvittering en annen del av systemet er avhengig av.
  dedupNoekkel?: string
  // Default true (dagens oppførsel for alle eksisterende ~30 kallsteder).
  // Settes eksplisitt til false av chat-broadcastene (sendChatVarsler) —
  // de er lavsignal nok til at de ikke skal telle mot "Viktig"-fanen/
  // ulest-prikken på /profil, men skal fortsatt stå i "Alt"-historikken.
  // Eksplisitt parameter, ikke utledet fra `type` her: en utledning ville
  // krevd en hardkodet liste over chat-typer inne i kjernen, og neste
  // lavsignal-type (som ikke er chat) ville glemt å stå i den listen.
  tellerUlest?: boolean
  // Notifikasjons-gruppe for push (#612): to varsler med samme tag kollapser
  // til ÉN rad på låseskjermen (renotify: false i sw.js) i stedet for å stable
  // seg opp gjennom en burst. Settes av kallstedet, ikke utledet av `type` her
  // — kjernen kjenner bare typen, mens tråd-identiteten sitter i kallstedets
  // scope (hvilket album-bilde, hvilket innlegg). En utledning på `type` alene
  // ga tag til tre av fem chat-flater og undefined til de to burst-tyngste
  // (kommentarer på innlegg og bilde) — halvveis kollapsing er vanskeligere å
  // oppdage som mangel enn ingen kollapsing (#612-review).
  //
  // Default undefined = dagens oppførsel: én rad per varsel. Ingen påminnelse
  // eller kåringsvarsel setter tag, og de kan derfor ALDRI kollapses bort av
  // et senere varsel — tom tag betyr «ingen gruppe» i Notifications-specen,
  // ikke «gruppe med tomt navn».
  pushTag?: string
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

  // E-post-budsjettvakt for chat — se chatEpostBudsjettBrukt() over. Slås opp
  // ÉN gang per sending (ikke per mottaker), og er en no-op for alt som ikke
  // er en chat_*-type. Sperren slår kun ut e-postkanalen; push og in-app-raden
  // under er upåvirket.
  const epostSperretAvBudsjett = await chatEpostBudsjettBrukt(supabase, type)

  await Promise.all(
    profiler.map(async profil => {
      const pref = prefs.get(profil.id)
      const pushAktiv = pref ? pref.push_aktiv : false
      const epostAktiv = pref ? pref.epost_aktiv : true
      // Manglende preferanse-rad behandles som 'alle' (samme defensive linje
      // som epostAktiv over) — en profil uten rad skal ikke stille miste chat.
      const nivaa = pref ? pref.varsel_nivaa : 'alle'
      const profilSubs = subsByProfil.get(profil.id) ?? []

      // #614: nivåvalget gjenbruker tellerUlest — det ER «viktig vs. alt»-
      // skillet fra #612, ikke en ny typeliste. En mann på 'viktige' mister
      // push OG epost for lavsignal-varsler (chat), uansett kanalvalg. Han
      // mister IKKE varselet: in-app-raden skrives uansett under, og kanal
      // blir 'kun_app' av seg selv fordi kanPush/kanEpost er false for ham.
      const lavsignalDempet = !tellerUlest && nivaa === 'viktige'
      const kanPush = pushAktiv && profilSubs.length > 0 && !lavsignalDempet
      const kanEpost = epostAktiv && !!profil.epost && !epostSperretAvBudsjett && !lavsignalDempet
      // 'kun_app' (i stedet for tidligere `if (!kanal) return`, #504): en
      // mottaker uten aktiv kanal for dette varselet skal likevel få en
      // in-app-rad — varsel_logg ER innboksen på /profil, og ingen rad skal
      // noensinne bety «forsøkt, ikke levert». Push/epost er allerede gated av
      // kanPush/kanEpost under, så utsendingen hoppes bare over av seg selv.
      // NB (#614): verdien dekker nå to årsaker — kanalene er av, ELLER
      // nivået dempet et lavsignal-varsel. Bevisst ingen egen kanal-verdi for
      // det siste; feilsøking må lese varsel_nivaa ved siden av.
      const kanal = kanPush && kanEpost ? 'begge' : kanPush ? 'push' : kanEpost ? 'epost' : 'kun_app'

      // Resolves per mottaker — se melding-parameteren. Bygges før logg-inserten
      // så raden i innboksen og teksten i push/e-post garantert er den samme.
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
          profilSubs.map(s =>
            sendPush(s, { tittel, melding: profilMelding, url: varselUrl, tag: pushTag }),
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
 * Samme tall i 1-dagers-påminnelsen, men annen ordlyd: dagen før er tallet i
 * praksis endelig, og «5 kommer» er det man faktisk lurer på. Bevisst IKKE
 * delt med paameldtSetning over — de to sier ulike ting på ulikt tidspunkt.
 * Null-tilfellet er likt fordi «ingen kommer» leses som en avlysning.
 */
function kommerSetning(antallPaameldt: number): string {
  return antallPaameldt === 0 ? 'Ingen har meldt seg på ennå.' : `${antallPaameldt} kommer.`
}

/**
 * Hva mottakeren har svart på arrangementet. 'ikke_svart' er ikke en status i
 * paameldinger-tabellen (der finnes bare raden eller ikke) — den utledes av at
 * profilen mangler en rad, og finnes her fordi 7-dagers-varselet må si noe til
 * den gruppa også. Speiler RsvpStatus i PaameldteListe.tsx bevisst uten å
 * importere den: den fila er 'use client' og hører til UI-laget.
 */
export type RsvpStatus = 'ja' | 'kanskje' | 'nei' | 'ikke_svart'

/**
 * Halen i 7-dagers-påminnelsen, per RSVP-status. Tabell i stedet for en
 * if-kjede av samme grunn som PURRE_VARIANTER lenger nede: hver variant er
 * data, og en ny status skal ikke kreve at man finner alle stedene teksten
 * forgrener seg.
 *
 * `visDetaljer: false` for 'nei' er ikke en detalj — den som har meldt avbud
 * skal ikke få oppmøtested og påmeldingstall han ikke har bruk for. Han får
 * datoen (så han vet hva det gjelder hvis han vil snu) og ingenting mer.
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
 * Bygger 7-dagers-påminnelsesteksten (#591). Ren funksjon — eksportert for
 * testing, samme presedens som formaterHilsenMelding. «syv» i første setning
 * er hardkodet tekst, ikke avledet fra PAAMINNELSE_DAGER.LANG (=== 7) — endres
 * konstanten må denne teksten endres i samme håndgrep.
 *
 * Halen er personlig: mottakeren får vite hva han selv har svart, og hva som
 * eventuelt forventes av ham. Det er derfor 7-dagers-varselet sendes som fire
 * grupperte kall og ikke som én broadcast — se sendPaaminneVarsler.
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
  // Datoen står her, ikke i oppmøte-setningen — klokkeslettet hører sammen med
  // stedet, og syv dager unna trenger man selve datoen for å planlegge.
  const setninger = [
    `Det er syv dager til ${tittel}, ${formaterDatoKort(startTidspunkt)}.`,
    ...(visDetaljer ? [oppmoteSetning(startTidspunkt, oppmoetested), paameldtSetning(antallPaameldt)] : []),
    hale,
  ]
  return setninger.join(' ')
}

/**
 * Meldingsteksten i 1-dagers-påminnelsen. Egen ren funksjon, eksportert for
 * testing — samme presedens som byggPaaminne7Melding. Datoen utelates bevisst:
 * «I morgen» gir den allerede, så bare klokkeslettet er ny informasjon.
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
  // Alle påmeldingsrader for arrangementet. Erstatter den tidligere
  // `antallPaameldt`-parameteren: tallet utledes her i stedet for hos kalleren,
  // så «N påmeldt»-teksten og gruppe-inndelingen under aldri kan bygge på to
  // ulike øyeblikksbilder av samme liste.
  paameldinger: { profil_id: string; status: string }[]
  type: 'paaminne_7' | 'paaminne_1'
}) {
  const antallPaameldt = paameldinger.filter(p => p.status === 'ja').length

  // 1-dagers er upersonlig: én felles tekst til alle. Dagen før er det for sent
  // å be noen bestemme seg, og «du har meldt avbud» til en som allerede vet det
  // er bare støy.
  //
  // 7-dagers forteller derimot hver mann hva HAN har svart, og bygges derfor per
  // mottaker. Fortsatt ÉN sending (broadcast) — se melding-parameteren i
  // sendVarsel for hvorfor det ikke er fire grupperte kall.
  const statusPerProfil = new Map(paameldinger.map(p => [p.profil_id, p.status]))
  const melding =
    type === 'paaminne_1'
      ? byggPaaminne1Melding({ tittel, startTidspunkt, oppmoetested, antallPaameldt })
      : (profilId: string) => {
          const svar = statusPerProfil.get(profilId)
          // Ukjent status fra DB (skal ikke forekomme) behandles som «ikke
          // svart» — en generisk oppfordring er tryggere enn en tekst som
          // påstår feil om hva mannen har svart.
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

// De tre variantene av «purr folk om å svare». 'auto' er cron (3 dager før),
// 'manuell' er «Purre disse» (uten svar), 'kanskje' er «Bestem dere» (#596).
// ÉN diskriminant, ikke to booleanske flagg (manuell + kanskje): en
// kombinasjon som «cron-jobb, men til kanskje-gruppa» finnes ikke i
// produktet og skal derfor være umulig å representere i typen, ikke bare
// utilsiktet i praksis.
export type PurreVariant = 'auto' | 'manuell' | 'kanskje'

// Varseltypene de tre variantene sender som. Union, ikke `string`: en skrivefeil
// her ville gitt en type uten etikett i historikken og uten bryter-rad i
// varsel_innstillinger — stille. `keyof typeof VARSEL_TEKSTER` duger ikke som
// kilde: tabellen er nøklet på NØKKEL, ikke type, og 'purring' er ingen nøkkel
// der (den mappes til 'purring_aktiv' av typeTilNoekkel). Den er dessuten
// annotert `Record<string, …>`, så keyof gir bare `string` tilbake.
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
    // Manuell purring fra admin er en bevisst handling — alltid send uavhengig av
    // om de allerede har mottatt en cron-purring for dette arrangementet. (#287)
    tillatDuplikat: true,
  },
  kanskje: {
    type: 'purring_kanskje',
    maalgruppe: 'kanskje',
    tittel: 'Bestem deg!',
    verb: 'ber deg bestemme deg for',
    fallback: (tittel, dato) => `${tittel} — ${dato}. Du har svart kanskje. Blir det noe på deg?`,
    knappTekst: 'Bestem deg',
    // Samme resonnement som manuell over — «Bestem dere» er også en bevisst
    // admin/oppretter-handling, ikke en cron-jobb.
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
  // Valgfri avsender og hilsen — satt ved manuell purring fra admin/oppretter (#287).
  // Når disse er oppgitt brukes personlig meldingstekst i stedet for cron-meldingen.
  fraNavn?: string
  hilsen?: string
  // Manuell purring fra «Purre disse»/«Bestem dere» skal ikke stanses av
  // cron-bryteren — det er en bevisst handling, ikke en cron-jobb (#287). Løsningen
  // er EGEN VARSELTYPE per variant, ikke et «hopp over sjekken»-flagg: flagget het
  // tidligere ignorerAktivBryter og hoppet kun over en sjekk her i wrapperen, mens
  // porten i sendVarsel slo opp samme nøkkel på nytt og stoppet purringen likevel —
  // stille, med grønn kvittering til admin. Se #547. Default 'auto' (cron-sti).
  variant?: PurreVariant
}) {
  const { type, maalgruppe, tittel: varselTittel, verb, fallback, knappTekst, tillatDuplikat } =
    PURRE_VARIANTER[variant]

  // Ingen bryter-sjekk her — porten i sendVarsel slår opp riktig nøkkel for
  // typen vi sender. Wrapperen skal ikke ha sin egen mening om det.

  // Beregn mottakere her — så tett opp mot utsendingen som mulig. Tidligere lot vi
  // kalleren sende inn en mottakerliste, men det åpnet et TOCTOU-vindu der noen
  // kunne svare mellom action-beregning og utsending og fortsatt få purring. (#287)
  const supabase = createAdminClient()
  const { data: paameldinger, error: paameldingerFeil } = await supabase
    .from('paameldinger')
    .select('profil_id, status')
    .eq('arrangement_id', arrangementId)

  // Fail closed, men feilmodusen avhenger av målgruppen: for uten_svar ville
  // et tomt resultat (paameldinger = []) sendt purringen til ALLE aktive
  // medlemmer — også de som for lengst har svart. For kanskje er det motsatt:
  // et tomt resultat gir INGEN treff i kanskje-settet, og purringen ville gått
  // ut til null mottakere med en grønn kvittering til admin (samme
  // feilmodus som #547, bare stille i stedet for feil retning). Begge er
  // uakseptable, så vi kaster i stedet for å late som spørringen ga et
  // meningsfullt tomt svar.
  if (paameldingerFeil) {
    throw new Error(`Kunne ikke hente påmeldinger for purring: ${paameldingerFeil.message}`)
  }

  // Filtreres alltid gjennom hentProfiler — aldri direkte over påmeldingsradene.
  // hentProfiler bevarer testmodus og aktiv=true, slik at en som svarte kanskje
  // og siden ble deaktivert ikke purres.
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
  // Personlig melding med avsender og hilsen — ellers standard cron-melding.
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
// Sentralisert handler for alle chat-scopes. Tidligere lå mention-matchingen
// som fire nesten-identiske kopier i lib/actions/chat.ts; en regex-bug
// (28. april 2026) traff alle fire steder fordi de var kopiert. Holdes her
// sammen med øvrig varsling for å forhindre repetisjon.
//
// #612: chat varsler nå ALLE aktive medlemmer minus avsender (ikke bare den
// som nevnes med @). sendChatVarsler() erstatter den tidligere mention-only-
// funksjonen med samme navnemønster — én inngangsport, ikke to, for samme
// grunn som #547 (to stier til samme sti drifter fra hverandre stille).

export type ChatVarselScope =
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

// Minimal profilform finnNevnte trenger — generisk over T slik at både
// sendChatVarsler (profiler med epost i tillegg) og en fremtidig kaller med
// en smalere projeksjon kan bruke den uendret.
type MentionKandidat = { id: string; navn: string | null; visningsnavn: string | null }

/**
 * Ren funksjon (ingen IO) som finner hvilke profiler en tekst @-nevner.
 * Trukket ut fra den tidligere mention-only-varslingen slik at selve
 * matchingen (inkl. `@alle` og flerords-navn) er testbar uten DB-mocking.
 * `avsenderId` ekskluderes alltid — man kan ikke nevne seg selv.
 */
export function finnNevnte<T extends MentionKandidat>(
  tekst: string,
  profiler: T[],
  avsenderId: string,
): T[] {
  const mentions = [...tekst.matchAll(mentionExtractRegex())].map(m =>
    m[1].trim().toLowerCase(),
  )
  if (mentions.length === 0) return []

  const erAlle = mentions.includes('alle')
  return erAlle
    ? profiler.filter(p => p.id !== avsenderId)
    : profiler.filter(p => {
        if (p.id === avsenderId) return false
        return mentions.some(
          m =>
            p.navn?.toLowerCase().includes(m) ||
            p.visningsnavn?.toLowerCase().includes(m),
        )
      })
}

function utdrag(tekst: string, maks = 80): string {
  return tekst.length > maks ? tekst.slice(0, maks - 3) + '...' : tekst
}

async function hentScopeInnhold(
  scope: ChatVarselScope,
  admin: ReturnType<typeof createAdminClient>,
): Promise<{ tittel: string; url: string; knappTekst: string }> {
  // Exhaustive switch med never-default (i stedet for if/else-kjede med
  // ubetinget melding-fallthrough) — lukker klassen av bugs der en ny
  // ChatVarselScope-variant stille ruter til feil URL. Se #481.
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
      // maybeSingle, ikke single: med en feil-vakt foran ville .single()s
      // PGRST116 på et slettet arrangement blitt logget som en ekte feil, selv
      // om koden allerede HAR en fallback-tittel for nettopp det tilfellet
      // (CLAUDE.md § Policy: Databasespørringer). Stien gikk før kun ved
      // @-mention; etter #612 går den ved hver arrangement-melding, så
      // støy-radiusen er en helt annen (#612-review).
      const { data, error } = await admin
        .from('arrangementer')
        .select('tittel')
        .eq('id', scope.id)
        .maybeSingle()
      // Fail-open, men ikke stille: feilobjektet skal videre til Sentry selv
      // om vi fortsetter med fallback-tittel. (#503-review)
      if (error) await logg.feil('varsel.scope.feilet', error, { ctx: { sample: 'chat.arrangement' } })
      return {
        tittel: `Chat: ${data?.tittel ?? 'et arrangement'}`,
        // #kommentarer-ankeret scroller direkte til chat-seksjonen på
        // arrangement-siden — brukeren trenger ikke lete etter chatten. Se #233.
        url: `${BASE_URL}/arrangementer/${scope.id}#kommentarer`,
        knappTekst: 'Åpne chatten',
      }
    }
    case 'poll': {
      // Samme resonnement som arrangement over — feiler kun tittel-teksten,
      // og maybeSingle av samme grunn (slettet poll ⇒ fallback, ikke feil).
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

// Mapping scope-type → broadcast-varseltype. `Record` over hele unionen (ikke
// `Partial`/`string`-keyed) gir en KOMPILERINGSFEIL hvis en sjette ChatVarselScope-
// variant legges til uten en tilhørende rad her — samme vakt som never-defaulten
// i hentScopeInnhold over (#481), brukt på mapping-siden i stedet for switchen.
// Se migrasjon 134 for seed-radene i varsel_innstillinger disse nøklene styres av.
const CHAT_BROADCAST_TYPE: Record<ChatVarselScope['type'], string> = {
  klubb: 'chat_klubb',
  arrangement: 'chat_arrangement',
  poll: 'chat_poll',
  melding: 'chat_melding',
  albumbilde: 'chat_albumbilde',
}

// Settet av de samme fem typene, UTLEDET av mappingen over så de to aldri kan
// drifte fra hverandre. Brukes av e-post-budsjettvakten (chatEpostBudsjettBrukt)
// som står lenger OPP i fila — lovlig forover-referanse: konstanten leses først
// når vakten kalles, altså etter at modulen er ferdig evaluert.
const CHAT_BROADCAST_TYPER: ReadonlySet<string> = new Set(Object.values(CHAT_BROADCAST_TYPE))

/**
 * Push-tag per chat-TRÅD (#612-review). Alle fem flatene får en tag, ikke bare
 * de tre som tilfeldigvis har en arrangementId/pollId å henge seg på — det er
 * nettopp kommentarfeltene under et innlegg og et albumbilde som går i burst.
 * Utledes her fordi det bare er her tråd-identiteten finnes (bildeId/albumId
 * når scopet er albumbilde); sendVarsel tar den imot som parameter.
 *
 * Samme never-default som hentScopeInnhold over: en sjette scope-variant skal
 * gi kompileringsfeil, ikke stille falle tilbake til «ingen tag».
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
 * Orkestrator for all chat-varsling (#612) — kalt fra sendVarslerEtterPost i
 * lib/actions/chat.ts for alle scopes utenom 'privat' (som har sin egen
 * sendPrivatMeldingVarsel). Erstatter den tidligere mention-only-funksjonen:
 * ÉN inngangsport i stedet for to, slik at det aldri finnes to stier inn til
 * samme sending som kan drifte fra hverandre (#547).
 *
 * `harBilde` inngår ikke i noen forgrening her i dag — `tekst`s nullity
 * (validerInnhold i lib/actions/chat.ts garanterer at minst én av de to er
 * satt) er allerede nok til å velge riktig fallback-tekst under. Parameteren
 * beholdes fordi kalleren uansett kjenner den, og en fremtidig variant som
 * skiller «tekst + bilde» fra «bare bilde» skal kunne legges til uten å endre
 * signaturen på nytt.
 *
 * To sendVarsel()-kall er BEVISST, ikke policybrudd (jf. CLAUDE.md § Policy:
 * Varsler): de har ULIK `type` (og dermed ulik bryter i varsel_innstillinger
 * — hele poenget med separate chat_*-nøkler), `tillatDuplikat: true` på begge
 * (dedup er dermed ute av bildet), og DISJUNKTE mottakerlister (nevnte er
 * eksplisitt trukket ut av broadcast-lista under). Policyen forbyr å splitte
 * ÉN sending (samme type, samme mottakere) i N kall — dette er to distinkte
 * sendinger som deler ett mottaker-oppslag for effektivitet.
 */
export async function sendChatVarsler(
  scope: ChatVarselScope,
  tekst: string | null,
  avsenderId: string,
  harBilde: boolean,
  // `dedupNoekkel` er `undefined` for en menneskeskrevet melding (ingen
  // dedup — hver post er per definisjon ny). En automatisk kaller (i dag
  // kun bursdagsgratulasjon, #642) oppgir samme nøkkel til BEGGE benene
  // under: indeksen er (dedup_noekkel, profil_id), så en mottaker får maks
  // én rad uansett hvilket ben som traff ham — det er dét som gjør «legg de
  // nevnte tilbake i broadcasten ved et kast» trygt ved retry fra et senere slot.
  //
  // `nevnte` overstyrer tekst-matchingen (finnNevnte) med en eksplisitt
  // mottakerliste. Tekstmatching er en heuristikk som bare trengs for
  // fritekst fra et menneske — en automatisk avsender som allerede kjenner
  // mottakerens id skal ikke gå veien om navnematching (en tagg på et fornavn
  // er tvetydig når flere medlemmer deler det; en profil-id er det ikke).
  // Merk skillet mellom utelatt og tom: `undefined` = «bruk tekstmatching»,
  // mens `[]` = «ingen skal mentions» og slår tekstmatchingen HELT av. Det er
  // med vilje — en automatisk kaller som vet at ingen skal tagges skal kunne
  // si det, uten at en @-lignende streng i teksten overstyrer ham.
  opts: { dedupNoekkel?: string; nevnte?: string[] } = {},
): Promise<void> {
  const start = Date.now()
  const admin = createAdminClient()

  // Ett felles profiles-oppslag for BEGGE sendingene under — garanterer at
  // mention-benet og broadcast-benet regner på nøyaktig samme snapshot av
  // aktive medlemmer. Fail closed, samme klasse som mottaker-oppslaget i
  // sendVarsel selv (#503): en feilet spørring her skal ALDRI tolkes som
  // «ingen å varsle» — det ville stille droppet både mention og broadcast.
  const { data, error } = await admin
    .from('profiles')
    .select('id, navn, visningsnavn, epost')
    .eq('aktiv', true)
  if (error) {
    await logg.feil('varsel.mottakere.feilet', error, { ctx: { sample: 'chat' } })
    throw new Error(`Kunne ikke hente profiler for chat-varsel: ${error.message}`)
  }
  // `data` er typet «| null», men throw-en over har allerede fanget det eneste
  // tilfellet som gir null — `?? []` er ren TS-narrowing. (#503-review)
  const profiler = data ?? []

  const innhold = await hentScopeInnhold(scope, admin)

  const avsender = profiler.find(p => p.id === avsenderId)
  const avsenderNavn = avsender?.visningsnavn ?? avsender?.navn ?? 'Noen'
  // Bilde-fallback er EGEN tekst («la ut et bilde»), ikke privat-meldingens
  // «Sendte deg et bilde» — den er skrevet for én-til-én, og «deg» er feil i
  // en broadcast alle 16 andre ser samme tekst i.
  const meldingTekst = tekst ? `${avsenderNavn}: ${utdrag(tekst)}` : `${avsenderNavn} la ut et bilde`

  // Eksplisitt liste (opts.nevnte) foran tekst-matching når begge er mulig —
  // filtreres på samme måte som finnNevnte() ville (avsenderen kan aldri
  // nevne seg selv, og kun aktive profiler kan motta et varsel).
  const eksplisitte = opts.nevnte
  const nevnte = eksplisitte
    ? profiler.filter(p => eksplisitte.includes(p.id) && p.id !== avsenderId)
    : tekst
      ? finnNevnte(tekst, profiler, avsenderId)
      : []

  // Mention FØRST. Kun mottakere som DENNE sendingen faktisk fikk noe fra
  // («sendt») ekskluderes fra broadcast-lista under — kaster mention-benet,
  // eller returnerer det type_deaktivert/ingen_mottakere/hendelse_passert/dedup,
  // legges de nevnte TILBAKE i broadcast automatisk (ekskludert forblir tom).
  // Ellers ville en avskrudd mention-bryter gjort de nevnte usynlige i BEGGE
  // sendingene — nøyaktig #504-kontrakten («kaster = ukjent utfall, returnerer
  // = terminalt avgjort») brukt til det den er til for.
  //
  // At det er TRYGT å legge dem tilbake ved et kast hviler på invarianten
  // «sendVarsel kaster kun FØR utsendingsløkka» (se VarselUtfall-kommentaren):
  // uten den kunne et kast midt i løkka gitt noen mention-varselet OG deretter
  // broadcast-varselet om samme melding.
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
      // Eget event, distinkt fra broadcast-benet under — ellers vet vi ikke
      // hvilket av de to benene som ryker når alarmen fyrer.
      await logg.feil('chat.varsler.mention.feilet', err)
    }
    if (mentionUtfall?.utfall === 'sendt') {
      ekskludert = new Set(nevnte.map(p => p.id))
    }
  }

  const rest = profiler.filter(p => p.id !== avsenderId && !ekskludert.has(p.id))

  // Tom rest er normalt for `@alle` (alle andre er alt dekket av mention-
  // benet) — ikke kall sendVarsel i det hele tatt, det ville bare vært en
  // ekstra "ingen_mottakere"-logglinje for en helt forventet tilstand.
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
        // Chat er lavsignal sammenlignet med resten av innboksen (opptil 17
        // varsler per melding) — skal stå i "Alt", ikke telle mot "Viktig"-
        // fanen eller ulest-prikken. Se migrasjon 134 § teller_ulest.
        tellerUlest: false,
        // Kollapser burst-en til én rad på låseskjermen per tråd. Settes KUN
        // på broadcasten — mention-sendingen over er bevisst utagget, ellers
        // kunne en helt vanlig chat-melding rett etterpå erstattet «Ola nevnte
        // deg» på låseskjermen med noe lavere signal.
        pushTag: chatPushTag(scope),
        arrangementId: scope.type === 'arrangement' ? scope.id : undefined,
        pollId: scope.type === 'poll' ? scope.id : undefined,
        dedupNoekkel: opts.dedupNoekkel,
      })
    } catch (err) {
      await logg.feil('chat.varsler.broadcast.feilet', err)
    }
  }

  // Fanout-måling (#612): chat gikk fra 0 varsler til opptil 17 push+epost per
  // melding — en treg fanout bør synes i loggen før noen merker den som en
  // treg "Send"-knapp. harBilde inngår ikke i selve fanouten (kun i
  // meldingTekst over), men holdes i `sample` for å skille bilde- fra
  // tekstmeldinger i loggen uten å måtte grave i kontekst.
  const ms = Date.now() - start
  if (ms > CHAT_FANOUT_TREG_MS) {
    logg.warn('varsel.chat.fanout.treg', { sample: `${scope.type}${harBilde ? ':bilde' : ''}`, count: profiler.length, ms })
  }
}
