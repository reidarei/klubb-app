# Mortensrud Herreklubb — brukerbehov og use cases

> Status: **Spesifikasjon låst.** Klar for fase 2 — løsningsdesign.

## Kontekst

Mortensrud Herreklubb er en gruppe på ca. 17 venner som i dag bruker Facebook til å
koordinere aktivitetene i klubben.

Det er hovedsakelig tre typer arrangementer:
1. "Møte": Bi-månedlige møter som middager og sosiale samlinger
2. "Herreklubbtur"/"tur": Årlige turer/weekendopphold som kalles herreklubbtur, eller hurratur
3. "Julebord": Årlig julebord (datamessig et desember-møte med eget navn)

Det går på rundgang hvem som er ansvarlig for å arrangere disse, neste års ansvarlige bestemmes på julebordet.

Facebook har flere svakheter for dette formålet: dårlig oversikt over hvem som faktisk kommer, vanskelig
å finne gamle arrangementer, støyende feed, og det faktum at mange av klubbens medlemmer begynner å forlate Facebook.

Målet er å bygge en liten, privat webapp som erstatter Facebook-gruppen for klubbens
kjerne-arbeidsflyter. Appen skal føles som et naturlig sted å "sjekke hva som skjer"
fra mobilen, og skal eies og driftes av klubben selv.

I tillegg bruker herreklubben andre kanaler som skal bestå:
- En gruppesnap for kommunikasjon og deling av bilder, og 
- Det opprettes også av og til en egen signal-chat for turer

Prosjektmappen inneholder i dag en plan.md og en arkitekturskisse i `CLAUDE.md`
(Next.js 15 App Router + Supabase + PWA). Ingen kode er skrevet ennå.

## Roller

Appen har to roller:

### Admin (2 personer)
- Ingen begrensninger
- Oppretter og administrerer medlemmer via appen
- Registrerer kåringsresultater manuelt
- Redigerer vedtekter, regler og historikk
- Kan redigere og slette **alle** arrangementer (ikke bare egne)
- Er også medlemmer og kan gjøre alt en medlem kan

### Medlem (alle ~17)
- Oppretter egne arrangementer (møte/tur)
- Redigerer og sletter **egne** arrangementer
- Melder seg på (Ja/Nei/Kanskje) arrangementer
- Leser alt innhold (vedtekter, medlemsliste, statistikk, tidligere arrangementer, kåringer)

Alle admins er også medlemmer og kan gjøre alt en medlem kan. Det er ingen
selvregistrering.

## Brukere

17 medlemmer, 2 av dem admins. Antatte karakteristika:
- Voksne menn, variert teknisk kompetanse → UI må være enkelt og tilgivende
- Bruker appen **mest på mobil, når de er bedt om å svare på et arrangement, eller skal sjekke informasjon om et arrangement**
- Lav frekvens — sannsynligvis noen ganger per måned, ikke daglig

## Primære brukermål

1. **Få med seg hva som skjer** — vite om nye arrangementer uten å måtte lete
2. **Melde seg på/av raskt** — fra telefonen, med minimal friksjon
3. **Se hvem som kommer** — planlegge egen deltagelse basert på hvem andre kommer
4. **se hvor man skal møte opp og når** - spesielt viktig for turer
5. **Finne klubbinfo når man trenger det** — telefonnummer til et medlem, vedtekter,
   historikk, statistikk
6. **Føle tilhørighet** — se klubbens historie, kåringer og tradisjoner samlet ett sted
7. **Se klubbens kåringer** — hvem ble kåret til hva gjennom årene

## Arrangementtyper som må støttes

- **Møte** — 6 per år, annenhver måned. De fem første heter "januar-februar", "mars-april", "mai-juni", "august-september" og "oktober-november". Den sjette heter "julebord" (i desember). Enkelt-kveld, én lokasjon. Datamessig er julebord et møte, bare med sitt eget navn.
- **Tur** — Én gang i året. Weekendopphold, ofte utenlands, flerdags, med ekstra felter (se UC-3.2).

## Scope for versjon 1

**Inkludert i v1:**
- Alle use cases under (gruppe 1–7)
- To roller: admin og medlem, med tilgangskontroll håndhevet i RLS
- Arrangementer (møte + tur) med påmelding
- Kåringer (manuell registrering av resultater, admin legger inn)
- Web Push-varsler (iOS-brukere må installere PWA på hjemskjermen)
- E-post som fallback-varsel til alle medlemmer
- Påminnelse en uke og dagen før arrangement
- Klubbinfo: medlemsliste, vedtekter, historikk (admin-redigerbar), statistikk, kåringer

**Utsatt til v2:**
- **Bildedeling + Web Share Target (`/del`)** — droppes fra v1 for å holde scope
  lite. `bilder`-tabell, storage, komprimering og share target bygges senere.
- **Kåringsavstemning** — digital avstemning med anonyme stemmer, løpende stemmetall, admin lukker og kunngjør vinner. Inntil da registrerer admin kåringsresultater manuelt i appen.

**Eksplisitt ikke med (verken v1 eller v2):**
- Kommentarer, diskusjonstråder, chat

## Use cases — innholdsfortegnelse

Use case-ene er gruppert etter funksjonelt område. Hver gruppe svarer omtrent til ett
sett med tabeller og én rute-seksjon i `(app)`, slik at løsningsdesignet kan ta én
gruppe om gangen.

1. **Autentisering og sesjon** — Supabase Auth, `middleware.ts`, login-route group
2. **Medlemmer og profiler** — `profiles`-tabell, service-role endpoint, RLS
3. **Arrangementer** — `arrangementer` + `paameldinger`, blåtur-sensurering
4. **Arrangøransvar** — `arrangoransvar`-tabell, kobling til arrangementer
5. **Varsler og påminnelser** — Web Push, e-post, scheduler, varselinnstillinger
6. **Kåringer** — `kaaringer`-tabell, manuell registrering av vinnere
7. **Klubbinfo (innhold)** — vedtekter, statistikk-views, versjonering

## Use cases

## Gruppe 1 — Autentisering og sesjon

### UC-1.1: Logge inn
- **Aktør:** Medlem eller admin
- **Forutsetning:** Konto opprettet av en admin
- **Flyt:** Åpne app → legitimasjon (e-post + passord) → lande på forside med
  kommende arrangementer
- **Etterbetingelse:** Session-cookie; auth-guard slipper brukeren inn i `(app)`.
  UI tilpasser seg rolle (admin-knapper vises kun for admins).
- **Merknader:** Etter installasjon som PWA skal innlogging være "sticky"

### UC-1.2: Glemt passord
- **Aktør:** Medlem eller admin
- **Flyt:** På login-siden → "Glemt passord" → skriv inn e-post → mottar e-post med lenke → sett nytt passord
- **Merknader:** Bruker Supabase Auth sin innebygde password reset-flyt.

### UC-1.3: Logge ut
- **Aktør:** Alle
- **Flyt:** Åpne "Profil" → "Logg ut" → sesjon avsluttes → sendes til login-siden
- **Merknader:** Sjelden brukt i praksis siden innlogging er "sticky" (UC-1.1).

## Gruppe 2 — Medlemmer og profiler

### UC-2.1: Se og søke i medlemslisten
- **Aktør:** Alle
- **Flyt:** Åpne "Klubbinfo" → "Medlemmer" → liste med navn, bilde, kontaktinfo
  (telefon/e-post). Tapp på telefonnummer → ringer. Tapp på e-post → åpner
  e-postklient.
- **Merknader:** det bør være en knapp for send epost til alle medlemmer, bare mailto, medlemmenes e-postadresser er ingen hemmelighet.

### UC-2.2: Admin oppretter og administrerer medlemmer
- **Aktør:** Kun admin
- **Flyt:** Åpne "Medlemmer" → "Legg til medlem" → fyll inn navn og e-postadresse → opprett konto → nytt medlem får e-post med innloggingsinformasjon og lenke til appen
- **Rediger/deaktiver:** Admin kan redigere profilinfo (navn, kontaktinfo, bilde) og deaktivere medlemmer som slutter i klubben
- **Merknader:** Ingen selvregistrering. Krever et service-role API-endepunkt på serversiden.

### UC-2.3: Se og redigere egen profil
- **Aktør:** Alle (hvert medlem inkl. admin)
- **Flyt:** Åpne "Profil" → se eget navn, bilde, telefon, e-post → trykk "Rediger" → endre ønskede felt → lagre
- **Merknader:** Kun egne opplysninger kan redigeres her. Admin redigerer andres profiler via UC-2.2. Profilen viser også egne kommende arrangøransvar — full oversikt finnes i UC-4.2.

## Gruppe 3 — Arrangementer

### UC-3.1: Se kommende arrangementer (forside)
- **Aktør:** Alle
- **Flyt:** Etter innlogging vises en liste over kommende arrangementer sortert etter
  dato, med tittel, dato/tid, lokasjon, valgfritt bilde, egen påmeldingsstatus, og antall Ja/Kanskje
- **Merknader:** Dette er appens "hjem". Må være rask og tydelig på mobil.

### UC-3.2: Opprette nytt arrangement
- **Aktør:** Alle (medlemmer og admins)
- **Flyt:** Trykk "+" → velg type → fyll inn felter → publiser
- **Felter for møte:** tittel, beskrivelse, start-tidspunkt, oppmøtested
- **Felter for tur:** tittel, beskrivelse, start-tidspunkt, slutt-tidspunkt, oppmøtested, destinasjon, pris per person.
- **Etterbetingelse:** Arrangementet er synlig for alle. Push-varsel sendes til medlemmer med installert PWA. E-post sendes til **alle** medlemmer som fallback.
- **Merknader:** Turer er ofte blåtur. Når arrangøren fyller inn felter for en tur, kan han krysse av "merk som sensurert" på enkeltfelter i stedet for å fylle inn noe. Sensurerte felter vises visuelt sladdet, uavhengig om det står noe der eller ikke. Arrangøren kan fjerne sensureringen manuelt når han vil.

### UC-3.3: Melde seg på eller av et arrangement
- **Aktør:** Alle
- **Flyt:** Åpne et arrangement → velg **Ja / Nei / Kanskje** → status oppdateres
  umiddelbart
- **Merknader:** Ingen påmeldingsfrist — man kan endre svar helt frem til
  arrangementet starter. Default-status for medlemmer som ikke har svart er
  "ikke svart".

### UC-3.4: Se detaljer om et arrangement + hvem som kommer
- **Aktør:** Alle
- **Flyt:** Trykk på arrangement i listen → se full beskrivelse, tid, sted, liste
  gruppert etter status (Ja / Kanskje / Nei / Ikke svart), egen status øverst

### UC-3.5: Redigere eller slette et arrangement
- **Aktør:** Oppretteren av arrangementet, **eller** en admin
- **Flyt:** Fra arrangementsiden → "Rediger" eller "Slett" → bekreft
- **Merknader:** Medlemmer ser knappene kun for egne arrangementer. Admins ser
  dem alltid. Tilgangen håndheves i RLS (ikke bare UI).

### UC-3.6: Tidligere arrangementer
- **Aktør:** Alle
- **Flyt:** Fra en "Historikk"-fane, se liste over avholdte
  arrangementer med dato, hvem som arrangerte og hvem som deltok
- **Merknader:** Grunnlag for automatisk statistikk i UC-7.3.

## Gruppe 4 — Arrangøransvar

### UC-4.1: Sette årets arrangøransvar
- **Aktør:** Admin
- **Flyt:** Åpne "Arrangøransvar" → velg år → for hvert arrangement (6 møter, julebord, utenlandstur) velg én eller to ansvarlige fra medlemslisten → lagre
- **Etterbetingelse:** Ansvar er registrert og synlig for alle (UC-4.2). Hvert ansvarlig medlem mottar umiddelbart et varsel (UC-5.3).
- **Merknader:** Gjøres typisk rett etter julebordet der neste års ansvar ble vedtatt. Kan redigeres i ettertid ved f.eks. frafall.

### UC-4.2: Se årets arrangøransvar
- **Aktør:** Alle
- **Flyt:** Åpne "Arrangøransvar" → se oversikt over alle arrangementer for inneværende og kommende år med navn på ansvarlige. Egne ansvar utheves. ELLER: åpne "profil" → se egne arrangementer og ansvar.
- **Merknader:** Alle kan se hvem som har ansvar for hva. Siden viser også om arrangementet er lagt inn ennå (kobling til arrangementer-tabellen).

## Gruppe 5 — Varsler og påminnelser

### UC-5.1: Få push-varsel om nytt arrangement
- **Aktør:** Mottakere (alle medlemmer)
- **Trigger:** Et medlem eller admin oppretter et arrangement
- **Flyt:**
  - Medlemmer med installert PWA + godkjente varsler → Web Push-notifikasjon
    på telefonen
  - **Alle** medlemmer → e-post med lenke til arrangementet (fallback som sikrer
    at ingen går glipp av det, uavhengig av om PWA er installert)
  - Tapp på varsel/e-post → lande direkte på arrangementet
- **Merknader:** E-post er hovedmekanismen for å sikre at alle får beskjed, siden
  iOS krever hjemskjerminstallasjon for Web Push.

### UC-5.2: Få påminnelse 7 dager og 1 dag før et arrangement
- **Aktør:** Alle
- **Trigger:** 7 dager og 1 dag før arrangementets start-tidspunkt
- **Flyt:** Alle medlemmer får påminnelse (push hvis tilgjengelig + e-post). Tapp
  → lander på arrangementet og kan bekrefte/endre påmelding
- **Merknader:** Går til **alle** medlemmer, også de som allerede har svart Ja

### UC-5.3: Varsling til de som har fått arrangøransvar
- **Aktør:** System (automatisk)
- **Trigger:** Admin registrerer årets ansvarlige (UC-4.1)
- **Flyt:** Hver person som har fått tildelt ansvar for et arrangement mottar et varsel (push + e-post): "Du er ansvarlig for å arrangere januar-februar-møtet i 2027"
- **Merknader:** Varslingen skjer umiddelbart når ansvar registreres. Innhold og kanal (push/e-post) styres av innstillingene i UC-5.5.

### UC-5.4: Purring til ansvarlige som ikke har lagt inn arrangement
- **Aktør:** System (automatisk, tidsbasert)
- **Trigger:** Konfigurerbar dato per arrangementstype (se UC-5.5)
- **Flyt:** Dersom den/de ansvarlige for et arrangement ikke har opprettet arrangementet innen purredatoen, sendes purring (push + e-post): "Husk at du er ansvarlig for mars-april-møtet — det er ikke lagt inn ennå"
- **Standard purredatoer:**
  - Møter: 1. første måned i perioden (f.eks. 1. mars for mars-april-møtet)
  - Julebord: 1. september
  - Utenlandstur: ingen purring
- **Merknader:** Purringer og purredatoer kan skrus av/på og justeres i UC-5.5.

### UC-5.5: Redigere varslings- og purringsinnstillinger
- **Aktør:** admin
- **Flyt:** Fra et "innstillinger" tannhjul-ikon øverst til høyre på siden, se innstillinger for varslinger. Her kan admin velge enkle innstillinger, pt. er det en varsling 7 dager før og 1 dag før arrangementer, samt purring som beskrevet i UC-5.4.
- **Merknader:** Grunnlag for varslinger i UC-5.1, UC-5.2, UC-5.3 og UC-5.4.

## Gruppe 6 — Kåringer

### UC-6.1: Admin registrerer kåringsresultat
- **Aktør:** **Kun admin**
- **Flyt:** Åpne "Kåringer" → "+" → fyll inn år, kategori (f.eks. "Årets herre 2026") og vinner → lagre
- **Merknader:** Brukes for å dokumentere resultater fra avstemninger som skjer utenfor appen (f.eks. på julebordet). Også for å legge inn historiske kåringer fra før appens tid. Admin kan redigere og slette eksisterende kåringer.

### UC-6.2: Se kåringer
- **Aktør:** Alle
- **Flyt:** Åpne "Kåringer" → se liste over kåringer sortert etter år, med kategori og vinner, f.eks. "Årets herre 2024: Ola Nordmann"
- **Merknader:** Inkluderer kåringer fra før appens tid, registrert manuelt av admin. Digital avstemning er planlagt for V2.

## Gruppe 7 — Klubbinfo (innhold)

### UC-7.1: Se vedtekter, regler og historikk
- **Aktør:** Alle (lese)
- **Flyt:** Åpne "Klubbinfo" → "Vedtekter" (eller "Historikk") → les innhold

### UC-7.2: Redigere vedtekter, regler og historikk
- **Aktør:** **Kun admin**
- **Flyt:** Åpne "Vedtekter" → "Rediger" → endre teksten → lagre
- **Merknader:** Redigeringsknapp vises kun for admins. RLS håndhever at kun
  admins kan skrive til klubbinfo-tabellen.
- **Merknad:** Endringer skal versjoneres, admin må bekrefte at endringen er hjemlet i gyldig vedtak og skrive et fritekstfelt som beskriver endringen og dato for vedtaket.

### UC-7.3: Se statistikk
- **Aktør:** Alle
- **Flyt:** Åpne "Klubbinfo" → "Statistikk" → se automatisk beregnede tall
- **Automatisk beregnet statistikk (fra påmeldingsdata):**
  - Deltagelse per medlem (totalt og siste 12 mnd)
  - Hvem har arrangert flest arrangementer
  - Antall arrangementer per år
- **Merknader:** Kåringsvinnere vises i UC-6.2, ikke her.

## Ikke-funksjonelle krav

- **Norsk UI** i hele appen, datoer formatert med norsk locale (`nb`), med oslo-østkant-dialekt med a-endelser som 'gutta'.
- **Mobile-first** — UI må fungere godt på iPhone og Android i stående format
- **PWA-installerbar** — brukerne skal kunne legge den til på hjemskjermen både på iPhone og Android
- **Privat** — ingen offentlig tilgjengelig informasjon, alt bak auth, RLS på alle
  tabeller
- **Tilgangskontroll i RLS** — admin-rettigheter håndheves i databasen, ikke bare
  i UI. Medlemsrollen må kunne identifiseres via en kolonne på `profiles`
  (f.eks. `rolle: 'medlem' | 'admin'`) eller gjennom en egen tabell/claim.
- **Persistent innlogging** — brukere skal sjelden måtte logge inn på nytt
- **Lav drift** — klubben skal selv kunne vedlikeholde dette med minimal innsats
- **Liten belastning** — 17 brukere, ved enkelte anledninger vil alle være aktive samtidig (avstemminger) ellers lite bruk, ingen skaleringskrav
  utover gratis-tier Supabase
- **Reaksjonstid** — appen skal oppleves rask. Endringer skal ikke øke responstiden for brukeren.
- **E-post-leveranse** — må være pålitelig siden e-post er primærvarsel-fallback

## Avklarte beslutninger

| # | Tema | Beslutning |
|---|---|---|
| 1 | Bildedeling | **Utsettes til v2.** |
| 2 | Push-varsler | **Web Push + e-post som fallback.** E-post til alle, push bonus for PWA-installerte. |
| 3 | Kåringer | **Manuell registrering i V1.** Admin legger inn resultater. Avstemningsmekanisme utsettes til V2. |
| 4 | Statistikk | **Automatisk beregnet** fra påmeldingsdata. |
| 5 | Turer | **Egne felter** utover møte (slutt-tidspunkt, destinasjon, pris per person). Innkvartering og transport dekkes i beskrivelse. |
| 6 | Påmeldingsvalg | **Ja / Nei / Kanskje** |
| 7 | Påmeldingsfrist | **Nei, alltid åpen** frem til arrangementets start |
| 8 | Påminnelser | **Ja, 7 dager før og dagen før til alle** medlemmer |
| 9 | Roller | **2 admins + ~15 medlemmer.** RLS håndhever tilgang. |
| 10 | Vedtekter | **Kun admins** kan redigere. Alle kan lese. |
| 11 | Redigere arrangement | **Oppretter + admins** kan redigere/slette. |
| 12 | Medlemsopprettelse | **Via appen.** Admin oppretter og administrerer medlemmer fra en admin-side i appen. |
| 13 | Anonymitet i kåringer | **Utsatt til V2** sammen med avstemningsmekanismen. |
| 14 | Julebord | **Møte med eget navn.** Datamessig et desember-møte som heter "julebord". |
| 15 | Blåtur | **Per-felt sensurering valgt av arrangør.** Sensurerte felter sladdes visuelt for alle; arrangøren kan fjerne sensureringen manuelt. |

## Ting å ta stilling til i løsningsdesign (fase 2)

Tekniske valg som hører hjemme i løsningsdesignen:

- **Versjonshistorikk** for vedtekter — enkel `updated_at` eller full historikk?
- **Rollemodell i database:** `profiles.rolle` (enum), eller egen `admins`-tabell?
- **Valg av e-post-tjeneste** (Resend / Postmark / Supabase SMTP)
- **Triggering av påminnelser** (Supabase `pg_cron` / Edge Functions / ekstern scheduler)
- **Datamodell for turer:** utvide `arrangementer` med nullable felter, eller
  separat tabell/discriminator?
- **Datamodell for kåringer:** enkel `kaaringer`-tabell (år, kategori, vinner). `kaaring_stemmer` utsatt til V2
- **Editor for vedtekter:** plain textarea, markdown, eller rik-tekst
- **Web Push-oppsett:** VAPID-nøkler, service worker, subscription-lagring per medlem

---

*Spesifikasjonen er nå låst. Neste steg: fase 2 — løsningsdesign basert på denne
spesifikasjonen.*
