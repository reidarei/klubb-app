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

// Avreise-blokka nederst på tur-kortet (#669): ansiktene til alle som har
// svart ja, pluss kondensstripa. Vises fra AVREISE_VINDU_DAGER dager før
// avreise og kun på turer — møter har ingen reise å telle ned til.
//
// Verdien er den samme som PAAMINNELSE_DAGER.LANG i dag, men holdes bevisst
// atskilt: den ene styrer når vi SENDER et varsel, den andre når kortet
// skifter utseende. Flyttes den ene, skal ikke den andre følge med av vanvare.
export const AVREISE_VINDU_DAGER = 7

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

// Luft mellom skrivefeltet og tastaturets overkant i kartets sidepaneler
// (chat, #714, og timeplanen, #716), der feltet ligger i normal flyt i
// stedet for forankret til viewporten.
export const CHAT_TASTATUR_LUFT_PX = 12

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

// Grenser for rå nøkkelNAVN som gjengis i logg og feil_logg (#681, #711).
// Et feltnavn fra vår egen kode er alltid en kort JS-identifikator; er navnet
// lengre enn dette, er det per definisjon ikke et vi har skrevet, og skal
// kappes framfor å blåse opp raden. Verdien er samtidig lengdegrensen i
// NOEKKELNAVN_FORM (lib/logg-sanitering.ts) — regexen bygges AV konstanten, så
// de to kan ikke drifte fra hverandre.
export const LOGG_NOEKKEL_MAKS_TEGN = 40

// Maks antall nøkkelnavn vi gjengir fra ETT feilobjekt i feil_logg.kontekst
// (#711-review). En supabase-feil har fire; en fremmed feilstruktur kan ha
// hundrevis, og poenget med feltet er formen på feilen, ikke en full
// opptelling. Resten telles som «+N_flere» slik at kappingen aldri blir stille.
export const LOGG_NOEKLER_MAKS_ANTALL = 12

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

// Stikkord på medlemsprofilen (#639, fritekst siden #685). Grensen speiler
// check-constraint profiles_stikkord_gyldig (migrasjon 142) — endres den
// her, må migrasjonen følge etter. MERK semantikk-endring i #685: dette var
// tidligere maks tegn PER STIKKORD i en liste (STIKKORD_MAKS_ANTALL styrte
// antallet); stikkord ble fritekst i én streng, og grensen gjelder nå HELE
// feltet, som MATALLERGIER_MAKS_LENGDE under.
export const STIKKORD_MAKS_LENGDE = 200

// Matallergier på medlemsprofilen. Speiler check-constraint
// profiles_matallergier_gyldig (migrasjon 141) — endres den her, må
// migrasjonen følge etter. Fritekst og ikke avkrysning: allergier er for
// varierte til en fast liste, og «tåler ikke rå løk» skal kunne stå der.
export const MATALLERGIER_MAKS_LENGDE = 200

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

// ─── BURSDAGSBILDE (#641) ─────────────────────────────────────────────────

// Lease-vinduene under speiler EKSAKT migrasjon 140 (krev_bursdagsbilde()) —
// endres tallene her, må RPC-en i migrasjonen følge etter, og omvendt.
//
// Hvor lenge en 'paagaar'-rad regnes som en hengende (ikke bare treg) kjøring
// som kan reclaimes av neste cron-invokasjon.
export const BURSDAGSBILDE_LEASE_MIN = 10
// Hvor lenge en admin-tvunget generering («Generer»-knappen) blokkerer en NY
// tvunget generering av samme rad — kort, fordi en admin som dobbelttrykker
// skal vente sekunder, ikke minutter, men lang nok til at ett ekte
// Vertex-kall (§ *_MODELL_MS under) rekker å fullføre uforstyrret.
export const BURSDAGSBILDE_TVING_LEASE_SEK = 60
// Maks antall AUTOMATISKE forsøk før cron gir opp en rad permanent. Admins
// «Generer»-knapp går både RUNDT taket og teller ikke opp mot det (se
// migrasjon 140) — ellers ville to prøvegenereringer i september etterlatt
// cron med tre forsøk igjen på selve bursdagen.
export const BURSDAGSBILDE_MAKS_FORSOK = 5

// Budsjett per steg i genererBursdagsbilde() (lib/bursdagsbilde-generering.ts).
// Summen (5+30+10=45 s) skal være STRENGT mindre enn maxDuration (60 s) på
// cron-ruta, med minst 10 s margin — ellers dreper Vercel funksjonen midt i
// en R2-opplasting, og raden blir stående i status 'paagaar' til leasen
// utløper i stedet for å bli et ærlig 'feilet'.
export const BURSDAGSBILDE_BUDSJETT_HENT_MS = 5000 // hente profilbildet server-side
export const BURSDAGSBILDE_BUDSJETT_MODELL_MS = 30000 // Vertex-kallet
export const BURSDAGSBILDE_BUDSJETT_R2_MS = 10000 // opplasting til R2

// Størrelsescap på profilbildet vi sender til Vertex som input. Samme
// terskel som andre bilde-opplastinger i appen (lib/actions/bilde-
// opplasting.ts) — et profilbilde skal aldri være større enn dette uansett,
// men vi validerer eksplisitt siden bildet her hentes server-side fra en
// URL vi ikke selv kontrollerte opplastingen av (eldre Supabase Storage-bilder).
export const BURSDAGSBILDE_INPUT_MAKS_MB = 5

// Hvor mange klubbkamerater som er med på bursdagsbildet ved siden av
// bursdagsbarnet. Tallet er et TAK på tre ting samtidig, ikke en smakssak:
// hvor mange ansikter modellen klarer å holde gjenkjennelige i én scene,
// hvor mange profilbilder vi rekker å hente innenfor
// BURSDAGSBILDE_BUDSJETT_HENT_MS, og hvor mange menns ansikter som sendes
// til Google per bursdag (se docs/ai-act-vurdering.md). Økes det, må alle
// tre vurderes på nytt — særlig den siste.
export const MEDGJESTER_MAKS_ANTALL = 2

// Ferskhetsvindu for push-klikk-URL-en lagret i Cache Storage (#626).
// public/sw.js er en statisk fil og kan ikke importere denne konstanten —
// literalen der (30_000) må holdes i synk manuelt ved endring, samme mønster
// som tegnegrensene mot DB-constraints øverst i denne fila.
export const PUSH_KLIKK_VINDU_MS = 30_000

// ─── PUSH-KLIKK-TELEMETRI (#688) ──────────────────────────────────────────

// Egen rate-limit-bøtte for push-klikk-telemetri, adskilt fra vanlige
// klientfeil (LOGG_FEIL_RATE_LIMIT_PER_MIN). Uten skillet konkurrerer de om
// samme 10/min, og en droppet push-beacon er umulig å skille fra en tapt
// navigasjon — nøyaktig grunn 3 i #688. Høyere enn klientfeil-grensen fordi
// ett klikk normalt genererer FLERE rader (push.klikk + push.klikk.navigert
// + evt. push.klikk.innlogging) fra samme IP/profil i rask rekkefølge.
export const PUSH_TELEMETRI_RATE_LIMIT_PER_MIN = 20

// Eksplisitt liste (ikke en prefiks-regel) over event-navn som telles mot
// PUSH_TELEMETRI_RATE_LIMIT_PER_MIN i stedet for LOGG_FEIL_RATE_LIMIT_PER_MIN.
// En prefiks-regel («push.*») ville sluppet et feilstavet event inn i
// telemetri-bøtta usett — eksplisitt liste tvinger et bevisst valg per event.
export const PUSH_TELEMETRI_EVENTS = [
  'push.klikk',
  'push.klikk.navigert',
  'push.klikk.innlogging',
  'klient.pushklikk.foreldet',
  'klient.pushklikk.oppgitt',
] as const

// Vindu (ms) for å bære et push-klikk-mål gjennom /login (#688). Lengre enn
// PUSH_KLIKK_VINDU_MS med vilje: her skjer ingen overraskende navigasjon —
// brukeren har nettopp logget inn selv og forventer å lande der varselet
// pekte. 10 minutter dekker en treg innlogging (glemt passord, tilbakestilling
// underveis) uten å holde målet i live så lenge at det føles vilkårlig.
export const PUSH_KLIKK_LOGIN_VINDU_MS = 600_000

// Maks antall ganger klienten forsøker å navigere til et push-klikk-mål før
// oppføringen forkastes. Loop-bryter: uten et tak kunne en målside som alltid
// redirecter et annet sted (eller en URL som aldri blir «vi står her») holde
// klienten i en evig runde med tilbakeskriving + navigasjon.
export const PUSH_KLIKK_MAKS_FORSOK = 2

// ─── POSISJONSDELING (#693) ───────────────────────────────────────────────

// Hvor lenge én «Del posisjonen min» varer før den slår seg av selv. Verdien
// er en avveining mot NØYAKTIG ETT problem: at noen deler og glemmer det.
// For kort, og du må trykke på nytt midt i kvelden; for lang, og «tidsbegrenset»
// blir en påstand uten innhold. 8 timer dekker en kveld ute eller en dag på
// tur, og er kort nok til at ingenting står og deler mens du sover.
//
// Hvert trykk FORNYER vinduet — knappen er «del i 8 timer fra nå», ikke
// «del til et fast klokkeslett».
export const POSISJON_DELING_TIMER = 8

// Hvor langt tilbake sporet vises når det IKKE pågår et arrangement (#698).
//
// Opprinnelig ble sporet kun tegnet under et arrangement, og ellers klippet til
// siste punkt. Reidar flyttet seg hjemmefra til jobb og så at bildet hans
// flyttet seg uten å legge igjen noe — for ham var hele poenget å se hvor man
// har vært, ikke bare hvor man er. Punktene ble lagret hele tiden; det var kun
// visningen som skjulte dem.
//
// 24 timer avgrenser det til «hvor har vi vært i dag og i natt». Uten en grense
// ville et spor vokst så lenge delingen ble fornyet, og kartet blitt uleselig.
// Pågår et arrangement, gjelder ikke grensen — da avgrenser arrangementet
// isteden, og en tur over flere dager skal vises i sin helhet.
export const POSISJON_SPOR_TIMER = 24

// Maks antall posisjonspunkter kartet henter i én spørring. Speiler PostgREST
// sin max_rows (supabase/config.toml) — ber vi om mer, kapper den likevel der,
// og gjør det STILLE. Spørringen må derfor sortere synkende og snu i JS, ellers
// er det de ELDSTE punktene som overlever avkortingen og kartet viser alle
// frosset på gamle posisjoner uten en eneste feilmelding (#717).
export const POSISJON_PUNKT_MAKS = 1000

// Over denne alderen regnes et punkt som gammelt, og kartet demper prikken.
// Poenget er ikke å skjule punktet, men å hindre at det leses som «her er han
// NÅ»: uten bakgrunnsposisjon på iOS er et punkt bare like ferskt som forrige
// gang mannen hadde appen oppe, og 30 minutter er nok til at han har rukket å
// gå et helt annet sted.
// Minste flytting (meter) før en innmelding blir et NYTT punkt i sporet i
// stedet for å oppdatere tiden på det forrige (#695). Terskelen er bevisst
// større enn typisk GPS-drift i by (±10–30 m): uten den ville en mann som
// sitter tre timer på samme pub tegnet et spor som ser ut som vandring, og
// prikkene ville ligget oppå hverandre på samme fortau.
export const POSISJON_MIN_FLYTT_M = 60

export const POSISJON_FERSK_MINUTTER = 30

// Markeringer på kartet (#697) — «møt meg her», «bussen går herfra».
//
// Tegngrensen speiler check-constraint kart_markering_tekst_gyldig (migrasjon
// 145) — endres den her, må migrasjonen følge etter. 60 er lavt med vilje: en
// markering er en etikett ved siden av en nål på et kart, ikke et innlegg, og
// lengre tekst ville uansett ikke fått plass uten å dekke kartet under.
export const KART_MARKERING_MAKS_LENGDE = 60

// Levetid for en markering satt UTENOM et arrangement. Pågår et arrangement med
// sluttid, arver markeringen den i stedet. 12 timer dekker en kveld og natta
// etter, og er kort nok til at kartet ikke fylles opp av gamle nåler ingen
// husker hvorfor står der.
export const KART_MARKERING_TIMER = 12

// Hvor lenge «Pling»-knappen står låst og dempet etter et trykk. Den er en
// KVITTERING, ikke en sperre mot spam: uten den så knappen helt uendret ut
// etter trykket, og man visste ikke om plinget faktisk gikk ut. Når den går
// tilbake til normal er det samtidig invitasjonen til å spørre en gang til.
export const POSISJON_PLING_KVITTERING_SEK = 10

// Startzoom når kartet har ett eller flere punkter å vise. 14 er gatenivå —
// nært nok til at du ser hvilken kvartal han står i, men ikke så nært at to
// menn i samme gate faller utenfor hverandres skjermbilde.
export const POSISJON_KART_ZOOM = 14

// Fallback-utsnitt når INGEN deler. Kartet må åpne et sted, og et tomt
// verdenskart sier mindre enn klubbens egen bydel. Verdiene er eksempel-bydel;
// de bor i klubb-config fordi en nedstrøms klubb holder til et annet sted.
export const POSISJON_KART_FALLBACK_ZOOM = 12

// Timeplan på kartet (#716) — «17:00 Middag på Lorry», én linje per post.
//
// Speiler check-constraint timeplan_post_tekst_gyldig (migrasjon 147) —
// endres den her, må migrasjonen følge etter. 120, ikke KART_MARKERING_
// MAKS_LENGDEs 60: en timeplanlinje («Avgang fra Grønland, husk pass») har
// ikke samme plassbegrensning som en etikett ved siden av en nål.
export const TIMEPLAN_TEKST_MAKS_LENGDE = 120

// Adresse som alternativ til å velge punkt i kartet (#732) — «Karl Johans
// gate 1». Speiler check-constraint timeplan_post_adresse_gyldig (migrasjon
// 149). Samme 120 som TIMEPLAN_TEKST_MAKS_LENGDE: begge er fritekst uten
// spesiell plassbegrensning, og to ulike tall ville vært en vilkårlig
// forskjell å huske.
export const TIMEPLAN_ADRESSE_MAKS_LENGDE = 120

// Hvor lenge «Lenke kopiert»-kvitteringen står etter et langtrykk på en
// kartmarkering (#719). Samme rolle som POSISJON_PLING_KVITTERING_SEK —
// lenge nok til å se den, ikke så lenge at den føles klistret fast.
export const KART_LENKE_KOPIERT_KVITTERING_SEK = 3

// Kartets startutsnitt (#735) — hvor nært to punkter må være for å regnes
// som samme «sted» når velgKlyngeUtsnitt() (lib/kart-klynge.ts) avgjør hvem
// startutsnittet skal ramme inn. 50 km: en mann på Gardermoen mens resten
// er i Oslo (37 km) skal fortsatt telle med i utsnittet før avreise, mens en
// splitt over et helt hav (fly-avstand) er godt utenfor.
export const KART_KLYNGE_AVSTAND_M = 50_000

// Hvor stor andel av POSISJONENE hovedklyngen må utgjøre for at startutsnittet
// skal ramme inn KUN den (markeringer stemmer ikke — se lib/kart-klynge.ts).
// STRENGT flertall (mer enn halvparten) — en klynge på akkurat halvparten
// vinner ikke alene, og ved en 5/4/3-splitt (42 %) viser kartet fortsatt alt
// i stedet for å gjemme to tredjedeler av gjengen bak den største
// enkeltgruppa (#735).
export const KART_KLYNGE_MIN_ANDEL = 0.5
