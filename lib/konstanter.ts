// Sentrale domene-konstanter. Tegnegrenser speiler check-constraints i
// databasen (chatten har 500, innlegg/meldinger har 2000) — endringer
// her må følges av tilsvarende migrasjon.

export const CHAT_MIN_LENGDE = 1
export const CHAT_MAKS_LENGDE = 500

export const INNLEGG_MIN_LENGDE = 1
export const INNLEGG_MAKS_LENGDE = 2000

// Antall dager før et arrangement vi sender hver type påminnelse.
// LANG = lang varsel (uka før), KORT = dagen før, PURRING = purring til
// dem som ikke har svart enda.
export const PAAMINNELSE_DAGER = {
  LANG: 7,
  KORT: 1,
  PURRING: 3,
} as const

// Tilgangsvinduet etter en pass-godkjenning. Admin har eksplisitt sagt
// 1 dag — kort vindu reduserer eksponering hvis godkjenneren glemmer å
// trekke tilbake.
export const PASS_TILGANG_TIMER = 24

// Retry-vindu (i dager) for kåringsvinner-varselet: cronen leter etter
// avsluttede-men-uvarslede kåringspoller helt til riktig markør for pollens utfall er satt
// (vinner_varslet_paa eller tiebreak_varslet_paa, se #521)
// ELLER polls avsluttet_paa faller ut av dette vinduet. kjorPaaminnelser
// kjører kåringsblokka KUN på slot 1 (én gang daglig), altså 7 reelle
// retry-forsøk før en permanent uvarslebar poll faller ut av køen. Se #504.
export const KAARING_VARSEL_RETRY_DAGER = 7

// Kommentarseksjonen på agenda-arrangementer kollapses automatisk når
// det er stille i 4 dager; brukeren kan fortsatt åpne manuelt via chevron.
// se #316
export const KOMMENTARER_KOLLAPS_DAGER = 4

// Agenda-vinduet bakover: forsiden viser arrangementer, polls og meldinger
// som er høyst AGENDA_VINDU_MND måneder gamle. Alt eldre er tilgjengelig
// via /tidligere (full historikk, paginert). Issue #176.
export const AGENDA_VINDU_MND = 12

// Sidestørrelse for /tidligere-paginering (keyset/cursor-basert).
// Lavt nok til at siden er rask, høyt nok til at brukeren ikke trykker
// «Last mer» for mye.
export const TIDLIGERE_SIDESTOERRELSE = 30

// Maks antall bilder per melding-innlegg. Cap forhindrer at én melding
// dominerer feeden visuelt og begrenser R2-opplastinger per POST.
export const MELDING_MAKS_BILDER = 10

// Terskel i piksler fra bunnen av siden for å regne brukeren som «nær
// bunn» i chatten. Under terskelen auto-scroller vi når andres melding
// kommer inn; over terskelen lar vi ham være i fred. Se #238.
export const CHAT_NAER_BUNN_TERSKEL_PX = 150

// Maks tegn i valgfri hilsen ved purring av arrangøransvarlig.
// Tilfeldigvis samme verdi som CHAT_MAKS_LENGDE, men definert separat
// fordi hilsenen ikke lagres i DB — den går rett inn i sendVarsel-
// meldingen. De to grensene kan utvikle seg uavhengig. Se #267.
export const PURRING_MAKS_LENGDE = 500

// Maks tegn i valgfri hilsen ved varsling om arrangement.
// Tilfeldigvis samme verdi som PURRING_MAKS_LENGDE — semantisk separat
// så de to grensene kan utvikle seg uavhengig. Se #282.
export const VARSLE_MAKS_LENGDE = 500

// Emoji-pool for automatiske bursdagsgratulasjonar i klubb-chat.
// 16 symboler som passer tonen — alkohol, feiring, klasse. Se #328.
export const BURSDAG_EMOJI_POOL = [
  '🤩', '❤️', '🥂', '🎉', '🎩', '🍺', '🍻', '🌟',
  '🥳', '🍾', '💎', '😁', '👏', '🍸', '😘', '🥰',
] as const

// Antall cron-slots i det norske vinduet 07–10 der vi forsøker å sende.
// Slot-logikken garanterer at meldingen sendes seinest i siste slot.
export const BURSDAG_VINDU_SLOTS = 4

// Antall unike emoji som trekkes frå BURSDAG_EMOJI_POOL per gratulasjon.
export const BURSDAG_EMOJI_ANTALL = 5

// Variasjoner i hilsen-ord og utropstegn for bursdagsgratulasjonar.
// Kombinert gir fire mulige meldingsmønstre per post. Se #328.
export const BURSDAG_HILSNER = ['Gratulerer', 'Grattis'] as const
export const BURSDAG_UTROPSTEGN = ['!', '!!'] as const

// Emoji-pool for reaksjons-picker i chat og kommentarer.
// Brukes i Chat.tsx, MeldingReaksjoner.tsx og KommentarReaksjoner.tsx.
export const REAKSJON_EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥', '🙌'] as const

// Long-press-varighet før reaksjons-picker åpnes. 350 ms vinner kappløpet mot
// iOS sin innebygde link-preview (~500 ms) og er over accidental-touch-
// terskelen, men merkes umiddelbart som «noe skjer». Brukes av MeldingTommel,
// MeldingKort og KommentarerPaaKort. se #468.
export const LONG_PRESS_MS = 350

// Bevegelsesterskel (px) før et hold tolkes som scroll-intensjon og long-press-
// timeren avbrytes. Sammenlign kvadrert avstand mot LONG_PRESS_BEVEGELSE_PX ** 2
// for å slippe kvadratrot. se #359-review / #468.
export const LONG_PRESS_BEVEGELSE_PX = 10

// ─── FEILLOGGING / OBSERVABILITY ─────────────────────────────────────────────

// Antall klient-feil vi tillater per IP+profil per minutt via /api/logg-feil.
// Overskridelse returnerer 429. In-memory per Vercel-instans — deles ikke på
// tvers av instanser, men er god nok til å stoppe utilsiktede stormer.
export const LOGG_FEIL_RATE_LIMIT_PER_MIN = 10

// Antall dager feil_logg-rader beholdes. Sletting utføres av sjekk-klientfeil-cron.
// Hevet fra 30 til 180 da feilloggen begynte å motta server-feil og ikke bare
// klientfeil (#496) — 30 dager er nok til å feilsøke, men for kort til å se om
// noe kommer igjen sesongvis. Se docs/feilstrategi.md § 4.
export const LOGG_FEIL_RETENSJONSDAGER = 180

// Antall klientfeil siste 24t som trigger admin-varsel i sjekk-klientfeil-cron.
// 0 = varsle på alle feil (>= 1 feil siste døgn). Bevisst valg: etter at begge
// kjente feilklassene ble lukket (#465/#466) skal loggen være stille, så hver
// ny feil er verdt et varsel. Var kort innom 3 den 16. juli 2026.
export const KLIENT_FEIL_ALARM_TERSKEL = 0

// Event-navn som IKKE teller mot alarmen i sjekk-klientfeil-cronet (#498-review).
// Terskelen er bevisst 0 — ett treff i døgnet varsler alle med
// faar_feilvarsler. Disse fyrer på kjent transiente forhold som ikke
// krever menneskelig inngripen, og ville gjort morgenvarselet til støy:
//   ai.datoforslag.feilet     — 429/529/timeout fra Anthropic, i bakgrunnen
//                               mens brukeren skriver
//   varsel.push.feilet        — web-push mot en enhet som er offline/treg
//                               (410 Gone håndteres separat: abonnementet slettes)
//   varsel.push.timeout       — samme klasse som over, bare navngitt separat
//                               (#612): PUSH_TIMEOUT_MS-deadlinen ER tilfellet
//                               «treg enhet». Uten denne raden ville #612 gjort
//                               en bevisst ignorert klasse alarmerende igjen —
//                               i samme slengen som push-volumet ble ganget
//                               med 17. Se #612-review.
//   varsel.logg.insert.feilet — én varsel_logg-rad feilet, varselet gikk ut
//
// Radene skrives fortsatt til feil_logg og er søkbare der — de utløser bare
// ikke varsel. Å legge til et event her er en BEVISST handling som gjør oss
// blinde for akkurat den eventen i alarmkanalen; det er ikke en opprydding.
// Å heve terskelen i stedet ville gjort fire ekte feil tause, og det er feil
// retning for en alarm vi nettopp bygde for å slutte å være blinde.
export const ALARM_IGNORERTE_EVENTS = [
  'ai.datoforslag.feilet',
  'varsel.push.feilet',
  'varsel.push.timeout',
  'varsel.logg.insert.feilet',
] as const

// Maksimal størrelse på kontekst-JSON sendt til /api/logg-feil (i KB).
// Hindrer at store payloads metter tabellen — typisk stacktrace er < 2 KB.
export const LOGG_KONTEKST_MAKS_KB = 4

// Maks tegn i event-navn (dot-separert, f.eks. «varsel.send.feilet»).
export const LOGG_EVENT_MAKS_LENGDE = 128

// Sperrevindu mellom to automatiske reloads etter en chunk-feil (#575).
// Klienten reloader for å hente fersk HTML når den mangler en kodebit, men
// hvis den ferske HTML-en OGSÅ feiler ville vi reloadet i evig løkke. Andre
// forsøk innen vinduet gir feilsiden i stedet — en ærlig blindvei framfor en
// usynlig løkke. 30 s er godt over en normal sidelast og kort nok til at et
// ekte nytt tilfelle senere i økten fortsatt selvhelbredes.
export const CHUNK_RELOAD_SPERRE_MS = 30_000

// Hard cap på antall rader sjekk-klientfeil-cronet henter for å regne ut
// topp 3 event-navn i alarmteksten (#496). Dedup-indeksen i feil_logg
// begrenser allerede verste konsensfall per (profil/event/minutt), men
// grensen her hindrer at selve aggregerings-spørringen blir treg under en
// reell storm.
export const TOPP_EVENT_HENT_GRENSE = 5000

// Minste tekstlengde før auto-uttrekk av festedato kjøres (bakgrunnskall mens
// brukeren skriver + server-action-terskel). Satt lavt fordi klubbens innlegg
// ofte er korte og direkte («Pils i dag?», «Fotball i morgen») — en for høy
// terskel ville blokkert nettopp de innleggene funksjonen er til for.
export const DATO_FORSLAG_MIN_TEGN = 10

// ─── AKTIVITETSMÅLING ────────────────────────────────────────────────────────

// Ett treff telles maks én gang per enhet per 30 minutter — hindrer at en
// bruker som blar mellom flere sider på kort tid blåser opp treff-tallet.
// Admins beslutning, se #484.
export const AKTIVITET_TREFF_THROTTLE_MIN = 30

// Antall uker som vises i uke-grafen på /innstillinger/bruk.
export const AKTIVITET_GRAF_UKER = 8

// Antall dager som inngår i snitt-beregningene (DAU-snitt, snitt treff/dag)
// på /innstillinger/bruk.
export const AKTIVITET_SNITT_DAGER = 30

// Tema-valg — «dark» er default for alle eksisterende brukere.
// Cookie er HttpOnly og speiles til localStorage for klient-synk.
export const TEMA_COOKIE = 'tema' as const
export const TEMA_STORAGE_KEY = 'hk-tema' as const
export const TEMA_VALG = ['system', 'dark', 'light'] as const
export type TemaValg = typeof TEMA_VALG[number]
// CustomEvent-navn for klient-side tema-bytte. Dispatches av UtseendeValg,
// lyttes av TemaSync — bruk konstanten for å unngå magiske strenger.
export const TEMA_EVENT = 'temaEndret' as const

// Facebook-importen tok med Messenger-stickers som vanlige bilder — «likes»
// lagret som PNG. De er reaksjoner, ikke bilder noen har delt, og hører ikke
// hjemme i bildearkivet. Alle ligger under et /sticker-<id>-filnavn.
// Brukes som PostgREST-mønster: .not('bilde_url', 'like', CHAT_STICKER_MONSTER)
export const CHAT_STICKER_MONSTER = '%/sticker-%'

// Antall rader vist i «Hva er nytt»-endringsloggen (/om-appen) før «Vis
// eldre» trengs. Se #595.
export const ENDRINGSLOGG_SYNLIGE = 10

// Hard deadline på et enkelt web-push-forsøk (lib/push.ts). Uten en frist kan
// én hengende APNs/FCM-socket holde hele sendVarsel-Promise.all-en til Vercels
// 10 s-funksjonsvegg — funksjonen drepes, klienten får 500 på en melding som
// ER lagret, og mannen sender den samme meldingen på nytt (#612). 3 s er godt
// over normal push-latency (typisk < 500 ms) og godt under 10 s-veggen selv
// med andre mottakere i samme Promise.all.
export const PUSH_TIMEOUT_MS = 3000

// Terskel (ms) for fanout-varigheten i sendChatVarsler før vi logger
// varsel.chat.fanout.treg — chat går fra 0 til opptil 17 mottakere per
// melding (#612), og en treg fanout bør synes før den oppleves som en treg
// «Send»-knapp av avsenderen.
export const CHAT_FANOUT_TREG_MS = 1500

// E-post-døgnbudsjett for chat (#612-review). Resend free tier har et hardt
// tak på 100 e-poster per DØGN — en helt annen grense enn RESEND_BATCH_MAKS
// (100 per kall) i lib/epost.ts, som ikke beskytter mot noe her. Chat kan med
// ~15 e-postaktive mottakere brenne hele døgnkvoten på syv meldinger, og
// kvoten deles med 06:00-cronen: uten en vakt kan gutteprat spise
// 7-dagers-påminnelsen for en tur.
//
// Vakten gjelder KUN e-postkanalen for chat_*-typene. Push og in-app-raden går
// alltid, og ikke-chat-varsler (påminnelser, pass-tilgang, kåringer) rammes
// aldri — hele poenget er at de har forrang. 70 gir ~30 e-posters margin til
// resten av døgnet, som holder til en full påminnelsesrunde til alle 18.
export const EPOST_DOEGNBUDSJETT_CHAT = 70

// Vinduet (timer) budsjettet telles over. Rullerende 24 t, ikke kalenderdøgn:
// Resend nullstiller på UTC-midnatt, men et rullerende vindu er strengere enn
// leverandørens og kan aldri la oss bruke opp kvoten rett før nullstilling.
export const EPOST_BUDSJETT_VINDU_TIMER = 24

// Hvor lenge dra-ned-for-oppdater venter på /api/ping før den gir opp og viser
// «Oppdatering feilet» (#572). Sjenerøs med vilje: på ustabilt mobilnett er en
// treg forbindelse ikke det samme som ingen forbindelse, og en falsk «feilet»
// er verre enn å vente et sekund til. Endepunktet gjør null arbeid, så alt
// over dette er reelt tapt kontakt.
export const DRA_NED_PING_TIMEOUT_MS = 6000

// Tidspunktet koblingstabellen `innspill_kobling` ble tatt i bruk (migrasjon
// 136, kjørt mot prod 2026-08-26 19:47 UTC). Fra og med da skriver
// innsendings-ruten alltid en kobling-rad, så «ingen rad» på et nyere
// ønske-issue betyr at det ikke kom fra appen — ikke at koblingen er tapt.
// Brukes av lib/innspill-kobling.ts som diskriminator i stedet for å tolke
// overskriften i issue-teksten. Se #632.
//
// Merk det smale gapet mellom migrasjonen og deployen av koden som skriver
// raden: app-issues fra det vinduet har fortsatt markøren i body, så de
// dekkes av fallbacken. En fersk instans har ingen eldre issues i det hele
// tatt, og treffer aldri fallback-grenen.
export const INNSPILL_KOBLING_INNFOERT = new Date('2026-08-26T19:47:00Z')

// Ferskhetsvindu for push-klikk-URL-en lagret i Cache Storage (#626).
// public/sw.js er en statisk fil og kan ikke importere denne konstanten —
// literalen der (30_000) må holdes i synk manuelt ved endring, samme mønster
// som tegnegrensene mot DB-constraints øverst i denne fila.
export const PUSH_KLIKK_VINDU_MS = 30_000
