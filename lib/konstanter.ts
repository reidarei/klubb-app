// Sentrale domene-konstanter. Tegnegrenser speiler check-constraints i
// databasen — endringer her må følges av tilsvarende migrasjon.

import type { LoggHendelse } from '@/lib/logg-hendelser'

export const CHAT_MIN_LENGDE = 1
export const CHAT_MAKS_LENGDE = 500

export const INNLEGG_MIN_LENGDE = 1
export const INNLEGG_MAKS_LENGDE = 2000

// Dager før et arrangement hver påminnelse sendes. PURRING går til dem som
// ikke har svart ennå.
export const PAAMINNELSE_DAGER = {
  LANG: 7,
  KORT: 1,
  PURRING: 3,
} as const

// Fra hvor mange dager før avreise tur-kortet viser avreise-blokka (#669).
// Lik PAAMINNELSE_DAGER.LANG i dag, men bevisst atskilt: den ene styrer når vi
// sender varsel, den andre når kortet skifter utseende.
export const AVREISE_VINDU_DAGER = 7

// Tilgangsvinduet etter pass-godkjenning. Kort med vilje: begrenser
// eksponeringen hvis godkjenneren glemmer å trekke tilbake.
export const PASS_TILGANG_TIMER = 24

// Møtemodus varer til dette klokkeslettet (norsk tid) dagen ETTER møtets
// startdato — også for et møte som starter 00:30. Møtets slutt_tidspunkt
// ignoreres bevisst (#780, se lib/moetemodus.ts).
export const MOETEMODUS_SLUTT_KLOKKE = '06:00'

// Møtemodus slår seg på så mange timer før start. Rådataspørringen i
// lib/posisjon.ts henter derfor også kommende møter — andre predikater over
// de radene må selv kreve start <= nå.
export const MOETEMODUS_FOER_START_TIMER = 2

// Retry-vindu for kåringsvarselet: cronen prøver på nytt til riktig markør
// (vinner_/tiebreak_varslet_paa, #521) er satt eller avsluttet_paa faller ut
// av vinduet. Kåringsblokka kjører kun på slot 1, så dette gir 7 forsøk (#504).
export const KAARING_VARSEL_RETRY_DAGER = 7

// Kommentarseksjonen på agenda-kort kollapses etter så mange stille dager (#316).
export const KOMMENTARER_KOLLAPS_DAGER = 4

// Forsiden viser innhold høyst så mange måneder gammelt; eldre ligger på
// /tidligere (#176).
export const AGENDA_VINDU_MND = 12

// Sidestørrelse for /tidligere (keyset-paginering).
export const TIDLIGERE_SIDESTOERRELSE = 30

// Maks bilder per melding — hindrer at én melding dominerer feeden og
// begrenser R2-opplastinger per POST.
export const MELDING_MAKS_BILDER = 10

// Innenfor så mange px fra bunnen auto-scroller chatten når andres melding
// kommer inn; lenger opp lar vi ham være i fred (#238).
export const CHAT_NAER_BUNN_TERSKEL_PX = 150

// Luft mellom skrivefeltet og tastaturet i kartets sidepaneler (#714, #716),
// der feltet ligger i normal flyt.
export const CHAT_TASTATUR_LUFT_PX = 12

// Maks tegn i hilsen ved purring. Lik CHAT_MAKS_LENGDE, men separat: hilsenen
// lagres ikke i DB og kan utvikle seg uavhengig (#267).
export const PURRING_MAKS_LENGDE = 500

// Maks tegn i hilsen ved «Varsle nå». Separat av samme grunn som over (#282).
export const VARSLE_MAKS_LENGDE = 500

// Emoji-pool for automatiske bursdagsgratulasjoner i klubb-chat (#328).
export const BURSDAG_EMOJI_POOL = [
  '🤩', '❤️', '🥂', '🎉', '🎩', '🍺', '🍻', '🌟',
  '🥳', '🍾', '💎', '😁', '👏', '🍸', '😘', '🥰',
] as const

// Antall cron-slots i det norske vinduet 07–10. Slot-logikken garanterer at
// meldingen sendes seinest i siste slot.
export const BURSDAG_VINDU_SLOTS = 4

// Antall unike emoji som trekkes fra BURSDAG_EMOJI_POOL per gratulasjon.
export const BURSDAG_EMOJI_ANTALL = 5

// Variasjoner i hilsen-ord og utropstegn for bursdagsgratulasjoner (#328).
export const BURSDAG_HILSNER = ['Gratulerer', 'Grattis'] as const
export const BURSDAG_UTROPSTEGN = ['!', '!!'] as const

// Emoji-pool for reaksjons-pickeren i chat og kommentarer.
export const REAKSJON_EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥', '🙌'] as const

// Long-press før reaksjons-pickeren åpnes. 350 ms vinner over iOS sin
// link-preview (~500 ms) og er over terskelen for utilsiktet berøring (#468).
export const LONG_PRESS_MS = 350

// Bevegelse (px) før et hold tolkes som scroll og long-press avbrytes.
// Sammenlign mot kvadratet for å slippe kvadratrot (#468).
export const LONG_PRESS_BEVEGELSE_PX = 10

// Apples minste anbefalte trykkmål, kortside (#700). Se CLAUDE.md § Policy: Trykkflater.
export const MIN_TREFFMAAL_PX = 44

// ─── FEILLOGGING / OBSERVABILITY ─────────────────────────────────────────────

// Klientfeil per IP+profil per minutt via /api/logg-feil (429 over). In-memory
// per Vercel-instans — ikke globalt, men nok til å stoppe utilsiktede stormer.
export const LOGG_FEIL_RATE_LIMIT_PER_MIN = 10

// Levetid for feil_logg-rader (slettes av sjekk-klientfeil-cron). 180 og ikke
// 30 fordi loggen også tar server-feil og bør vise sesongmønstre (#496).
// Se docs/feilstrategi.md § 4.
export const LOGG_FEIL_RETENSJONSDAGER = 180

// Antall klientfeil siste 24 t som utløser admin-varsel. 0 = varsle på hver
// feil: etter #465/#466 skal loggen være stille.
export const KLIENT_FEIL_ALARM_TERSKEL = 0

// Event-navn som ikke teller mot alarmen — kjent transiente forhold som ikke
// krever inngripen (#498, #612). Radene skrives fortsatt til feil_logg.
//   ai.datoforslag.feilet     — 429/529/timeout fra Anthropic i bakgrunnen
//   varsel.push.feilet        — push mot offline/treg enhet (410 håndteres separat)
//   varsel.push.timeout       — PUSH_TIMEOUT_MS-deadlinen, samme klasse som over
//   varsel.logg.insert.feilet — én varsel_logg-rad feilet, varselet gikk ut
// Å legge til et event her gjør oss blinde for det i alarmkanalen — et bevisst
// valg, ikke opprydding. Å heve terskelen i stedet ville gjort ekte feil tause.
export const ALARM_IGNORERTE_EVENTS = [
  'ai.datoforslag.feilet',
  'varsel.push.feilet',
  'varsel.push.timeout',
  'varsel.logg.insert.feilet',
] as const satisfies readonly LoggHendelse[]

// Maks kontekst-JSON til /api/logg-feil (KB). Typisk stacktrace er < 2 KB.
export const LOGG_KONTEKST_MAKS_KB = 4

// Maks tegn i event-navn (dot-separert, f.eks. «varsel.push.feilet»).
export const LOGG_EVENT_MAKS_LENGDE = 128

// Maks lengde på rå nøkkelnavn i logg (#681, #711). Våre egne feltnavn er
// alltid kortere; lengre navn kappes. NOEKKELNAVN_FORM (lib/logg-sanitering.ts)
// bygges av denne, så de kan ikke drifte.
export const LOGG_NOEKKEL_MAKS_TEGN = 40

// Maks nøkkelnavn gjengitt fra ett feilobjekt i feil_logg.kontekst (#711).
// Resten telles som «+N_flere», så kappingen aldri blir stille.
export const LOGG_NOEKLER_MAKS_ANTALL = 12

// Sperrevindu mellom to automatiske reloads etter chunk-feil (#575). Hindrer
// evig reload-løkke hvis fersk HTML også feiler; 30 s er godt over en normal
// sidelast, men kort nok til at et nytt tilfelle senere selvhelbredes.
export const CHUNK_RELOAD_SPERRE_MS = 30_000

// Tak på rader sjekk-klientfeil henter for topp-3-eventene i alarmteksten
// (#496) — holder aggregeringen rask under en reell storm.
export const TOPP_EVENT_HENT_GRENSE = 5000

// Minste tekstlengde før auto-uttrekk av festedato kjøres. Lav fordi
// klubbens innlegg ofte er korte («Pils i dag?»).
export const DATO_FORSLAG_MIN_TEGN = 10

// ─── AKTIVITETSMÅLING ────────────────────────────────────────────────────────

// Et treff telles maks én gang per enhet per 30 min, så bla-runder ikke
// blåser opp tallet (#484).
export const AKTIVITET_TREFF_THROTTLE_MIN = 30

// Antall uker i uke-grafen på /innstillinger/bruk.
export const AKTIVITET_GRAF_UKER = 8

// Antall dager i snitt-beregningene på /innstillinger/bruk.
export const AKTIVITET_SNITT_DAGER = 30

// Tema-valg. Cookien er HttpOnly og speiles til localStorage for klient-synk.
export const TEMA_COOKIE = 'tema' as const
export const TEMA_STORAGE_KEY = 'hk-tema' as const
export const TEMA_VALG = ['system', 'dark', 'light'] as const
export type TemaValg = typeof TEMA_VALG[number]
// CustomEvent for klient-side tema-bytte (UtseendeValg → TemaSync).
export const TEMA_EVENT = 'temaEndret' as const

// Messenger-stickers fra Facebook-importen ligger som bilder med
// /sticker-<id>-filnavn. De er reaksjoner og holdes utenfor bildearkivet.
// Brukes som: .not('bilde_url', 'like', CHAT_STICKER_MONSTER)
export const CHAT_STICKER_MONSTER = '%/sticker-%'

// Rader i «Hva er nytt» (/om-appen) før «Vis eldre» trengs (#595).
export const ENDRINGSLOGG_SYNLIGE = 10

// Frist per web-push-forsøk (lib/push.ts). Uten den kan én hengende socket
// holde sendVarsel til Vercels 10 s-vegg — funksjonen drepes og avsenderen
// sender en lagret melding på nytt (#612). 3 s er godt over normal latency.
export const PUSH_TIMEOUT_MS = 3000

// Terskel for å logge varsel.chat.fanout.treg — en treg fanout skal synes
// før den merkes som en treg «Send»-knapp (#612).
export const CHAT_FANOUT_TREG_MS = 1500

// E-post-døgnbudsjett for chat_*-typene (#612). Resend free tier har 100
// e-poster per døgn (ikke det samme som RESEND_BATCH_MAKS per kall), og
// kvoten deles med påminnelses-cronen. 70 lar ~30 stå igjen til en full
// påminnelsesrunde. Push, in-app og ikke-chat-varsler rammes aldri.
export const EPOST_DOEGNBUDSJETT_CHAT = 70

// Budsjettet telles over rullerende 24 t, ikke kalenderdøgn — strengere enn
// Resends UTC-nullstilling, så kvoten aldri brukes opp rett før nullstilling.
export const EPOST_BUDSJETT_VINDU_TIMER = 24

// Hvor lenge dra-ned-for-oppdater venter på /api/ping (#572). Sjenerøs fordi
// tregt mobilnett ikke er det samme som ingen forbindelse; endepunktet gjør
// null arbeid, så alt over dette er reelt tapt kontakt.
export const DRA_NED_PING_TIMEOUT_MS = 6000

// Stikkord på medlemsprofilen (#639). Gjelder HELE fritekstfeltet siden #685,
// ikke per stikkord. Speiler check-constraint profiles_stikkord_gyldig
// (migrasjon 142).
export const STIKKORD_MAKS_LENGDE = 200

// Matallergier på profilen. Speiler profiles_matallergier_gyldig (migrasjon
// 141). Fritekst fordi allergier er for varierte til en fast liste.
export const MATALLERGIER_MAKS_LENGDE = 200

// Når innspill_kobling ble tatt i bruk (migrasjon 136). Et nyere ønske-issue
// uten kobling-rad kom ikke fra appen; eldre faller tilbake til markøren i
// body (#632, se lib/innspill-kobling.ts). Issues fra gapet mellom migrasjon
// og deploy har markøren og dekkes av fallbacken.
export const INNSPILL_KOBLING_INNFOERT = new Date('2026-08-26T19:47:00Z')

// ─── BURSDAGSBILDE (#641) ─────────────────────────────────────────────────

// Lease-vinduene under speiler EKSAKT krev_bursdagsbilde() i migrasjon 140 —
// endres de her, må RPC-en følge etter, og omvendt.
//
// Etter så lenge regnes en 'paagaar'-rad som hengende og kan reclaimes.
export const BURSDAGSBILDE_LEASE_MIN = 10
// Hvor lenge admins «Generer» blokkerer en ny tvunget generering av samme
// rad — sekunder ved dobbelttrykk, men nok til at ett Vertex-kall fullfører.
export const BURSDAGSBILDE_TVING_LEASE_SEK = 60
// Maks AUTOMATISKE forsøk før cron gir opp raden. Admins «Generer» går rundt
// taket og teller ikke, så prøvegenereringer ikke spiser bursdagens forsøk.
export const BURSDAGSBILDE_MAKS_FORSOK = 5

// Budsjett per steg i genererBursdagsbilde(). Summen (45 s) skal ligge minst
// 10 s under cron-ruta sin maxDuration (60 s) — ellers drepes funksjonen midt
// i en R2-opplasting og raden henger i 'paagaar' i stedet for 'feilet'.
export const BURSDAGSBILDE_BUDSJETT_HENT_MS = 5000 // hente profilbildet server-side
export const BURSDAGSBILDE_BUDSJETT_MODELL_MS = 30000 // Vertex-kallet
export const BURSDAGSBILDE_BUDSJETT_R2_MS = 10000 // opplasting til R2

// Størrelsescap på input-profilbildet. Samme som andre opplastinger, men
// valideres eksplisitt fordi bildet hentes fra en URL vi ikke selv
// kontrollerte opplastingen av (eldre Supabase Storage-bilder).
export const BURSDAGSBILDE_INPUT_MAKS_MB = 5

// Klubbkamerater på bursdagsbildet ved siden av bursdagsbarnet. Et TAK på tre
// ting: ansikter modellen holder gjenkjennelige, profilbilder vi rekker å hente
// innen HENT-budsjettet, og ansikter sendt til Google (docs/ai-act-vurdering.md).
// Økes det, må alle tre vurderes på nytt.
export const MEDGJESTER_MAKS_ANTALL = 2

// Ferskhetsvindu for push-klikk-URL-en i Cache Storage (#626). public/sw.js
// kan ikke importere denne — literalen der må holdes i synk manuelt.
export const PUSH_KLIKK_VINDU_MS = 30_000

// ─── PUSH-KLIKK-TELEMETRI (#688) ──────────────────────────────────────────

// Egen rate-limit-bøtte for push-klikk-telemetri, så en droppet beacon ikke
// konkurrerer med klientfeil og blir umulig å skille fra tapt navigasjon.
// Høyere fordi ett klikk normalt gir flere rader i rask rekkefølge.
export const PUSH_TELEMETRI_RATE_LIMIT_PER_MIN = 20

// Event-navn som telles mot telemetri-bøtta. Eksplisitt liste, ikke prefiks:
// et feilstavet «push.*»-event skal ikke slippe inn usett.
export const PUSH_TELEMETRI_EVENTS = [
  'push.klikk',
  'push.klikk.navigert',
  'push.klikk.landet',
  'push.klikk.innlogging',
  'klient.pushklikk.foreldet',
  'klient.pushklikk.oppgitt',
] as const satisfies readonly LoggHendelse[]

// Vindu for å bære et push-klikk-mål gjennom /login (#688). Lengre enn
// PUSH_KLIKK_VINDU_MS fordi brukeren selv logger inn og forventer å lande der;
// 10 min dekker en treg innlogging med passord-tilbakestilling.
export const PUSH_KLIKK_LOGIN_VINDU_MS = 600_000

// Loop-bryter: maks navigasjonsforsøk mot et push-klikk-mål før oppføringen
// forkastes, i tilfelle målet alltid redirecter et annet sted.
export const PUSH_KLIKK_MAKS_FORSOK = 2

// ─── POSISJONSDELING (#693) ───────────────────────────────────────────────

// Hvor lenge én «Del posisjonen min» varer. Avveid mot at noen deler og
// glemmer det: 8 t dekker en kveld eller en turdag, men ikke natta. Hvert
// trykk fornyer vinduet («8 timer fra nå»).
export const POSISJON_DELING_TIMER = 8

// Hvor langt tilbake sporet vises når det IKKE pågår et arrangement (#698).
// Uten grense ville sporet vokst så lenge delingen fornyes. Under et
// arrangement avgrenser arrangementet i stedet, så flerdagsturer vises hele.
export const POSISJON_SPOR_TIMER = 24

// Speiler PostgREST max_rows (supabase/config.toml), som kapper STILLE.
// Spørringen må derfor sortere synkende og snu i JS — ellers overlever de
// eldste punktene og kartet fryser på gamle posisjoner (#717).
export const POSISJON_PUNKT_MAKS = 1000

// Minste flytting (m) før en innmelding blir et NYTT punkt i stedet for å
// oppdatere forrige (#695). Over typisk GPS-drift i by (±10–30 m), så en mann
// som sitter på samme pub ikke tegner et spor som ser ut som vandring.
export const POSISJON_MIN_FLYTT_M = 60

// Over denne alderen dempes prikken, så den ikke leses som «her er han NÅ».
// Uten bakgrunnsposisjon på iOS er et punkt bare like ferskt som sist appen
// var oppe.
export const POSISJON_FERSK_MINUTTER = 30

// Markeringer på kartet (#697). Speiler kart_markering_tekst_gyldig
// (migrasjon 145). Lav fordi det er en etikett ved en nål, ikke et innlegg.
export const KART_MARKERING_MAKS_LENGDE = 60

// Navn og emoji på de varslende kartsymbolene. Speiler migrasjon 156. Navnet
// står i versaler i en smal knapp; emoji-grensen er i code points (en
// sammensatt emoji kan være ~10), «én emoji» sjekkes for seg.
export const KART_SYMBOL_NAVN_MAKS = 16
export const KART_SYMBOL_EMOJI_MAKS = 16

// «Om klubben». Speiler migrasjon 157 (klubb_info.sted / om_tekst).
export const KLUBB_STED_MAKS = 60
export const KLUBB_OM_MAKS = 2000

// Levetid for en markering satt UTENOM et arrangement (ellers arver den
// arrangementets sluttid). 12 t dekker en kveld og natta etter.
export const KART_MARKERING_TIMER = 12

// Hvor lenge «Pling» står låst og dempet etter et trykk. En kvittering for at
// plinget gikk ut, ikke en spam-sperre.
export const POSISJON_PLING_KVITTERING_SEK = 10

// Startzoom med punkter å vise. 14 er gatenivå.
export const POSISJON_KART_ZOOM = 14

// Zoom når ingen deler. Selve koordinatene bor i klubb-config, fordi en
// nedstrøms klubb holder til et annet sted.
export const POSISJON_KART_FALLBACK_ZOOM = 12

// Timeplan på kartet (#716). Speiler timeplan_post_tekst_gyldig (migrasjon
// 147). Høyere enn markeringer fordi en timeplanlinje ikke står ved en nål.
export const TIMEPLAN_TEKST_MAKS_LENGDE = 120

// Adresse i timeplanen (#732). Speiler timeplan_post_adresse_gyldig
// (migrasjon 149).
export const TIMEPLAN_ADRESSE_MAKS_LENGDE = 120

// Hvor lenge «Lenke kopiert» står etter langtrykk på en markering (#719).
export const KART_LENKE_KOPIERT_KVITTERING_SEK = 3

// Ankomst via delt steds-lenke (#753): kartet starter vidt og zoomer synlig inn.
//
// Sluttzoom: på 390 px er z17 ≈ 360 m (kvartal og gatenavn leselig). Ikke 18:
// koordinatet er siktet inn for hånd, og 30–50 m siktefeil blir da en
// fjerdedel av skjermen.
export const KART_DELT_STED_ZOOM = 17

// Startutsnittet før innflyvningen — fem nivåer (32×) under sluttzoom, så
// bevegelsen ikke kan overses. Samme tall som POSISJON_KART_FALLBACK_ZOOM,
// men annen betydning.
export const KART_DELT_STED_START_ZOOM = 12

// Eksplisitt varighet: uten den regner Leaflet varigheten fra
// panoreringsavstanden (her null) og blir for rask til å legges merke til.
export const KART_DELT_STED_FLY_SEK = 1.2

// Maks ventetid på at startflisene er tegnet før innzoomingen. Fail-open
// ved siden av 'load', så et hengende flislag aldri blokkerer ankomsten.
export const KART_DELT_STED_FLY_VENT_MS = 1200

// Avstand for å regne to punkter som samme «sted» i velgKlyngeUtsnitt()
// (lib/kart-klynge.ts, #735). 50 km: Gardermoen–Oslo (37 km) teller med,
// en splitt over et hav gjør det ikke.
export const KART_KLYNGE_AVSTAND_M = 50_000

// Andel av POSISJONENE hovedklyngen må ha for at startutsnittet rammer inn
// kun den. Strengt flertall: ved 5/4/3-splitt vises alle (#735).
export const KART_KLYNGE_MIN_ANDEL = 0.5

// ─── STEDSSØK PÅ KARTET (#757) ────────────────────────────────────────────

// Tegngrenser for søket. Nedre hindrer enkelt-tegn-søk mot Nominatim.
export const STED_SOK_MIN_LENGDE = 2
export const STED_SOK_MAKS_LENGDE = 120

// Maks kandidater vist; Nominatims `limit` settes likt.
export const STED_SOK_MAKS_TREFF = 5

// Timeout på ETT Nominatim-kall (delt av geokod() og sokSteder()).
export const GEOKODING_TIMEOUT_MS = 5000

// Cache-levetid for søkeresultater. Nominatims vilkår krever caching; 7 dager
// lar et omdøpt sted rette seg selv innen rimelig tid.
export const STED_SOK_CACHE_SEK = 7 * 24 * 3600

// Minste avstand mellom Nominatim-kall (grense 1 req/s). Per server-instans,
// ikke globalt — se docs/geokoding.md § Interaktivt stedssøk.
export const NOMINATIM_MIN_AVSTAND_MS = 1000

// Halv bredde/høyde (grader) på viewbox rundt kartets senter. Med bounded=0
// er boksen en preferanse, ikke et filter. 0,5° ≈ en storby-region (~55 km
// nord-sør), så nabobyen fortsatt treffes.
export const STED_SOK_VIEWBOX_GRADER = 0.5

// «Nærmeste pub» (#727): søkeradius i meter. Ingen innenfor = «ingen i
// nærheten» heller enn en pub man ikke gidder gå til.
export const PUB_SOK_RADIUS_M = 5000

// Overpass-serverens egen tidsgrense. Klientens GEOKODING_TIMEOUT_MS er den
// som faktisk teller.
export const OVERPASS_TIMEOUT_SEK = 5

// Lenke-forhåndsvisning i chatten. Tidsgrensen hindrer at et tregt nettsted
// henger kortet; bytegrensen holder oss unna å laste hele artikkelen (alt vi
// trenger står i <head>).
export const LENKE_HENT_TIDSGRENSE_MS = 5000
export const LENKE_HENT_MAKS_BYTES = 512 * 1024
export const LENKE_MAKS_OMDIRIGERINGER = 4
// Levetid for en hentet forhåndsvisning, i serverminne og telefonens HTTP-cache.
export const LENKE_CACHE_SEK = 24 * 3600
export const LENKE_MAKS_LENGDE = 2048

// Fondsrapport (#785), se lib/fondsrapport.ts.
// Antall egne farge-tokens (--fond-farge-1..6) før resten deler den nøytrale
// --fond-farge-7 (fargeToken()).
// Lengden på eier-ref-en (siste hex-tegn av profil-UUID) — nok til å skille
// medlemmene uten å lekke hele id-en (refFor()).
export const FONDSRAPPORT_EGNE_FARGER = 6
export const FONDSRAPPORT_REF_LENGDE = 8
