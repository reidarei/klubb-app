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

// Tilgangsvinduet etter en pass-godkjenning. Bevisst satt til 1 dag —
// kort vindu reduserer eksponering hvis godkjenneren glemmer å
// trekke tilbake.
export const PASS_TILGANG_TIMER = 24

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

// ─── FEILLOGGING / OBSERVABILITY ─────────────────────────────────────────────

// Antall klient-feil vi tillater per IP+profil per minutt via /api/logg-feil.
// Overskridelse returnerer 429. In-memory per Vercel-instans — deles ikke på
// tvers av instanser, men er god nok til å stoppe utilsiktede stormer.
export const LOGG_FEIL_RATE_LIMIT_PER_MIN = 10

// Antall dager feil_logg-rader beholdes. Sletting utføres av sjekk-klientfeil-cron.
export const LOGG_FEIL_RETENSJONSDAGER = 30

// Antall klientfeil siste 24t som trigger admin-varsel i sjekk-klientfeil-cron.
// 0 = varsle på alle feil (>= 1 feil siste døgn). Startet lavt for å bygge
// intuisjon om baseline; strammes eventuelt inn senere.
export const KLIENT_FEIL_ALARM_TERSKEL = 0

// Maksimal størrelse på kontekst-JSON sendt til /api/logg-feil (i KB).
// Hindrer at store payloads metter tabellen — typisk stacktrace er < 2 KB.
export const LOGG_KONTEKST_MAKS_KB = 4

// Maks tegn i event-navn (dot-separert, f.eks. «varsel.send.feilet»).
export const LOGG_EVENT_MAKS_LENGDE = 128

// Minste tekstlengde før dato-forslag-knappen aktiveres og server-action
// godtar kallet. Speiles i UI (knapp disables) og server (action-terskel).
export const DATO_FORSLAG_MIN_TEGN = 15

// Tema-valg — «dark» er default for alle eksisterende brukere.
// Cookie er HttpOnly og speiles til localStorage for klient-synk.
export const TEMA_COOKIE = 'tema' as const
export const TEMA_STORAGE_KEY = 'hk-tema' as const
export const TEMA_VALG = ['system', 'dark', 'light'] as const
export type TemaValg = typeof TEMA_VALG[number]
// CustomEvent-navn for klient-side tema-bytte. Dispatches av UtseendeValg,
// lyttes av TemaSync — bruk konstanten for å unngå magiske strenger.
export const TEMA_EVENT = 'temaEndret' as const
