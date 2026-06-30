import { createAdminClient } from '@/lib/supabase/admin'
import { sendPush } from '@/lib/push'
import { sendEpost, arrangementEpostHtml } from '@/lib/epost'
import { formaterDato, FORMAT_DATO_KLOKKE } from '@/lib/dato'
import { BASE_URL } from '@/lib/config'
import { PURRING_MAKS_LENGDE, VARSLE_MAKS_LENGDE } from '@/lib/konstanter'
import { mentionExtractRegex } from '@/lib/mention'

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

// Mapping fra type (slik den lagres i varsel_logg) til noekkel
// (slik den ligger i varsel_innstillinger). Historisk har de fått
// litt forskjellige navn; mapping holder det fra å bli rotete.
function typeTilNoekkel(type: string): string {
  if (type === 'paaminne_7') return 'paaminnelse_7d'
  if (type === 'paaminne_1') return 'paaminnelse_1d'
  if (type === 'purring') return 'purring_aktiv'
  return type
}

// Sjekk om en varseltype er aktivert i admin-innstillinger
async function erVarselAktiv(noekkel: string): Promise<boolean> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('varsel_innstillinger')
    .select('aktiv')
    .eq('noekkel', noekkel)
    .maybeSingle()
  return data?.aktiv ?? true
}

// Eksportert variant for sendVarsel-flyten — bruker mapping og en
// snill default (true) hvis nøkkelen mangler.
async function erTypeAktiv(type: string): Promise<boolean> {
  return erVarselAktiv(typeTilNoekkel(type))
}

// Sjekk om test-modus er aktiv — returnerer test-epost eller null
async function hentTestModus(): Promise<string | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('varsel_innstillinger')
    .select('aktiv, beskrivelse')
    .eq('noekkel', 'test_modus')
    .maybeSingle()
  if (data?.aktiv && data.beskrivelse) return data.beskrivelse
  return null
}

// Hent alle aktive profiler (i test-modus: kun profilen med test-eposten)
async function hentProfiler() {
  const supabase = createAdminClient()
  const testEpost = await hentTestModus()

  const query = supabase.from('profiles').select('id, navn, epost').eq('aktiv', true)
  if (testEpost) query.eq('epost', testEpost)
  const { data } = await query
  return data ?? []
}

// Hent varselpreferanser for alle profiler
async function hentVarselPreferanser(profilIder: string[]) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('varsel_preferanser')
    .select('profil_id, push_aktiv, epost_aktiv')
    .in('profil_id', profilIder)
  const map = new Map<string, { push_aktiv: boolean; epost_aktiv: boolean }>()
  for (const p of data ?? []) map.set(p.profil_id, p)
  return map
}

// Hent alle push-subscriptions for en liste med profil-IDer
async function hentPushSubscriptions(profilIder: string[]) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('push_subscriptions')
    .select('profil_id, endpoint, p256dh, auth')
    .in('profil_id', profilIder)
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
}) {
  // Dev-guard: Blokker utsending fra lokal dev-server mot prod-DB.
  // Vi returnerer tidlig uten å skrive varsel_logg — det er bedre å ikke
  // forurense loggen med "late som"-rader. Logg til konsoll slik at
  // utvikleren ser hva som skjedde.
  if (BLOKKER_UTSENDING) {
    console.warn(
      `[varsler] BLOKKERT: BASE_URL='${BASE_URL}' ser lokal ut. ` +
      `Varselet '${tittel}' (type=${type}) ble IKKE sendt. ` +
      `Sett NEXT_PUBLIC_BASE_URL til prod-URL eller ALLOW_LOCAL_NOTIFICATIONS=true for å overstyre.`
    )
    return
  }

  // 0. Sjekk admin-kontrollpanelet — admin kan slå av en hel varseltype
  // sentralt. Manglende nøkkel teller som «aktiv» (default true).
  if (!(await erTypeAktiv(type))) {
    console.log(`[varsler] Type '${type}' er deaktivert i admin-innstillinger — varsel ikke sendt`)
    return
  }

  const supabase = createAdminClient()

  // 1. Dedup-sjekk — gjelder enten arrangement_id eller poll_id alt etter
  // hvilken referanse varselet bærer. Først match som finnes vinner.
  if (!tillatDuplikat && arrangementId) {
    const { data: eksisterende } = await supabase
      .from('varsel_logg')
      .select('id')
      .eq('type', type)
      .eq('arrangement_id', arrangementId)
      .limit(1)
    if (eksisterende && eksisterende.length > 0) return
  }
  if (!tillatDuplikat && pollId) {
    const { data: eksisterende } = await supabase
      .from('varsel_logg')
      .select('id')
      .eq('type', type)
      .eq('poll_id', pollId)
      .limit(1)
    if (eksisterende && eksisterende.length > 0) return
  }

  // 2. Testmodus
  const testEpost = await hentTestModus()

  // 3. Løs opp mottakere + dedupliser
  let profiler: { id: string; navn: string | null; epost: string | null }[]
  if (mottakere) {
    const unikeIder = [...new Set(mottakere)]
    const { data } = await supabase
      .from('profiles')
      .select('id, navn, epost')
      .in('id', unikeIder)
      .eq('aktiv', true)
    profiler = data ?? []
  } else {
    profiler = await hentProfiler()
  }

  // I testmodus: filtrer til kun testprofilen
  if (testEpost) {
    profiler = profiler.filter(p => p.epost === testEpost)
  }

  if (profiler.length === 0) return

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
  await Promise.all(
    profiler.map(async profil => {
      const pref = prefs.get(profil.id)
      const pushAktiv = pref ? pref.push_aktiv : false
      const epostAktiv = pref ? pref.epost_aktiv : true
      const profilSubs = subsByProfil.get(profil.id) ?? []

      const kanPush = pushAktiv && profilSubs.length > 0
      const kanEpost = epostAktiv && !!profil.epost
      const kanal = kanPush && kanEpost ? 'begge' : kanPush ? 'push' : kanEpost ? 'epost' : null
      if (!kanal) return

      const { data: loggRad } = await supabase
        .from('varsel_logg')
        .insert({
          profil_id: profil.id,
          tittel,
          melding,
          type,
          kanal,
          url: url ?? null,
          arrangement_id: arrangementId ?? null,
          poll_id: pollId ?? null,
        })
        .select('id')
        .single()

      const varselUrl = url ?? (loggRad ? `${BASE_URL}/varsler/${loggRad.id}` : BASE_URL)

      if (kanPush) {
        await Promise.all(
          profilSubs.map(s => sendPush(s, { tittel, melding, url: varselUrl })),
        )
      }

      if (kanEpost) {
        const html = arrangementEpostHtml({ tittel, tekst: melding, url: varselUrl, knappTekst })
        await sendEpost({ til: profil.epost!, emne: tittel, html })
      }
    }),
  )
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
  if (!(await erVarselAktiv('nytt_arrangement'))) return
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

export async function sendPaaminneVarsler({
  arrangementId,
  tittel,
  startTidspunkt,
  type,
}: {
  arrangementId: string
  tittel: string
  startTidspunkt: string
  type: 'paaminne_7' | 'paaminne_1'
}) {
  const noekkel = type === 'paaminne_7' ? 'paaminnelse_7d' : 'paaminnelse_1d'
  if (!(await erVarselAktiv(noekkel))) return
  const dato = formaterDatoKlokke(startTidspunkt)
  const dager = type === 'paaminne_7' ? 7 : 1
  await sendVarsel({
    tittel: `Påminnelse: ${tittel}`,
    melding: dager === 7 ? `${tittel} er om 7 dager — ${dato}` : `${tittel} er i morgen — ${dato}`,
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
  if (!(await erVarselAktiv('arrangor_purring'))) return
  await sendVarsel({
    mottakere: [ansvarligId],
    tittel: 'Husk arrangøransvaret ditt!',
    melding: `Du er ansvarlig for å arrangere ${arrangementNavn} i ${aar}. Fint om du legger inn arrangementet!`,
    url: `${BASE_URL}/arrangementer/nytt`,
    knappTekst: 'Opprett arrangement',
    type: 'arrangor_purring',
    tillatDuplikat: false,
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
  if (!(await erVarselAktiv('ny_poll'))) return
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
  ignorerAktivBryter = false,
}: {
  arrangementId: string
  tittel: string
  startTidspunkt: string
  // Valgfri avsender og hilsen — satt ved manuell purring fra admin/oppretter (#287).
  // Når disse er oppgitt brukes personlig meldingstekst i stedet for cron-meldingen.
  fraNavn?: string
  hilsen?: string
  // Manuell admin-purring skal ikke gates av cron-bryteren purring_aktiv — det er
  // en bevisst handling, ikke en cron-jobb. Default false (cron-sti). (#287)
  ignorerAktivBryter?: boolean
}) {
  if (!ignorerAktivBryter) {
    if (!(await erVarselAktiv('purring_aktiv'))) return
  }

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
  const profiler = await hentProfiler()
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
    type: 'purring',
    arrangementId,
    // Manuell purring fra admin er en bevisst handling — alltid send uavhengig av
    // om de allerede har mottatt en cron-purring for dette arrangementet. (#287)
    tillatDuplikat: ignorerAktivBryter,
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
  if (scope.type === 'klubb') {
    return {
      tittel: 'Klubbchat',
      url: `${BASE_URL}/chat`,
      knappTekst: 'Åpne chatten',
    }
  }
  if (scope.type === 'arrangement') {
    const { data } = await admin
      .from('arrangementer')
      .select('tittel')
      .eq('id', scope.id)
      .single()
    return {
      tittel: `Chat: ${data?.tittel ?? 'et arrangement'}`,
      // #kommentarer-ankeret scroller direkte til chat-seksjonen på
      // arrangement-siden — brukeren trenger ikke lete etter chatten. Se #233.
      url: `${BASE_URL}/arrangementer/${scope.id}#kommentarer`,
      knappTekst: 'Åpne chatten',
    }
  }
  if (scope.type === 'poll') {
    const { data } = await admin
      .from('poll')
      .select('spoersmaal')
      .eq('id', scope.id)
      .single()
    return {
      tittel: `Kommentar: ${data?.spoersmaal ?? 'en avstemming'}`,
      url: `${BASE_URL}/poll/${scope.id}`,
      knappTekst: 'Åpne avstemmingen',
    }
  }
  // melding
  return {
    tittel: 'Kommentar i innlegg',
    url: `${BASE_URL}/meldinger/${scope.id}`,
    knappTekst: 'Åpne innlegget',
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

  const { data: profiler } = await admin
    .from('profiles')
    .select('id, navn, visningsnavn, epost')
    .eq('aktiv', true)
  if (!profiler) return

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
