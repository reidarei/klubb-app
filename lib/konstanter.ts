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

// Tilgangsvinduet etter en pass-godkjenning. Reidar har eksplisitt sagt
// 1 dag — kort vindu reduserer eksponering hvis godkjenneren glemmer å
// trekke tilbake.
export const PASS_TILGANG_TIMER = 24

// Kommentarseksjonen på agenda-arrangementer kollapses automatisk når
// det er stille; brukeren kan fortsatt åpne manuelt via chevron.
export const KOMMENTARER_KOLLAPS_DAGER = 7

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
