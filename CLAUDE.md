# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Prosjekt

Klubb-app — privat webapp for en vennegjeng (~15–20 personer) som erstatter Facebook for arrangementspåmelding, klubbinfo og kåringer. Ingen selvregistrering. Klubbidentitet er konfigurerbar via miljøvariabler (se `lib/klubb-config.ts` og [docs/klubb-tilpasning.md](docs/klubb-tilpasning.md)).

Detaljert brukerbehovsspesifikasjon (use cases, roller, scope, avklarte beslutninger) finnes i [HK-app_kravspesifikasjon.md](HK-app_kravspesifikasjon.md). Løsningsdesign (databaseskjema, sidestruktur, API-lag, varsler, tekniske beslutninger) finnes i [HK-app_losningsdesign.md](HK-app_losningsdesign.md). Kravspesifikasjonen er autoritativ — ved konflikt gjelder den foran dette dokumentet.

## Roller

- **Admin** : oppretter medlemmer, styrer kåringer, redigerer klubbinfo, kan redigere/slette alle arrangementer.
- **Generalsekretær**: har admin-rettigheter og markeres med gul glød på profilbildet.
- **Medlem**: oppretter egne arrangementer, melder seg på (Ja/Nei/Kanskje), leser alt innhold.

Admins og generalsekretær er også medlemmer. Tilgang håndheves i RLS — ikke bare i UI. Se **Policy: Roller** nedenfor for hvordan sjekker skal gjøres i kode.

## Kommandoer

```bash
npm run dev          # Start dev-server (localhost:3000)
npm run build        # Produksjonsbygg
npm run lint         # ESLint
npx supabase db push # Kjør migreringer mot Supabase
npx supabase gen types typescript --project-id <ditt-supabase-prosjekt-id> > lib/supabase/database.types.ts  # Regenerer typer etter migrering
```

## Arkitektur

**Next.js 15 App Router** med to route groups: `(auth)` for `/login`, `(app)` for alle beskyttede sider med bottom-nav.

Auth-guard via `middleware.ts` (`@supabase/ssr`). Bruk `createServerClient` (fra `lib/supabase/server.ts`) i Server Components og Route Handlers, og `createBrowserClient` (fra `lib/supabase/client.ts`) i Client Components.

**Supabase** for alt: Auth (email + passord), PostgreSQL med RLS, scheduled jobs for påminnelser. Migrasjonsfiler i `supabase/migrations/`. Databaseskjema er definert i løsningsdesignet.

**Varsler:** Sentral varslingsfunksjon `sendVarsel()` i `lib/varsler.ts` — all utgående kommunikasjon (push, epost) går gjennom denne. Se **Policy: Varsler** nedenfor.

**Tid:** All tidshåndtering går gjennom `lib/dato.ts` med `Europe/Oslo` tidssone. Se **Policy: Tidshåndtering** nedenfor.

**Roller:** Rettighetsmatrise i `lib/roller.ts` speiles av `er_admin()` i DB. Aldri sammenlign rolle-strenger direkte — bruk hjelperne. Se **Policy: Roller** nedenfor.

**Avatarer:** Alle profil-avatarer rendres via `components/ui/Avatar.tsx`. Komponenten holdes bevisst enkel — utvid ikke med nye props, lag heller lokale wrappere. Se **Policy: Avatar** nedenfor.

**Konfig:** Miljø-avhengige verdier (BASE_URL, VAPID-kontakt, GitHub-repo/label) sentraliseres i `lib/config.ts`. **Aldri** hardkode domenet eller lese `process.env.NEXT_PUBLIC_BASE_URL` direkte i actions/route handlers — importér fra `lib/config`. Se **Policy: Konfig** nedenfor.

**Auth:** Server actions og route handlers bruker `ensureAdmin()` / `ensureInnlogget()` fra `lib/auth.ts` for autorisasjons-sjekker. **Aldri** dupliser `getUser()` + rolle-oppslag inline. Se **Policy: Auth** nedenfor.

**Domene-konstanter:** Tegnegrenser, dag-vinduer, levetider o.l. ligger i `lib/konstanter.ts`. **Aldri** hardkode magiske tall som 500/2000/7/24 — referer konstanten. Se **Policy: Konstanter** nedenfor.

**Bildelagring:** Nye bilder lagres i Cloudflare R2 via `lib/r2.ts` + server actions i `lib/actions/bilde-opplasting.ts`. Klient-side komprimering først (1600 px / q0.85). Eldre profilbilder ligger fortsatt i Supabase Storage. Se **Policy: Bildelagring** nedenfor.

**Bildevisning:** Alle lagrede bilde-/video-URL-er skal gjennom `bildeSrc()` i `lib/bilde-utils.ts` før de settes som `src`. Se **Policy: Bildevisning** nedenfor.

**Migrasjoner:** Nye tabeller i `public`-schema må ha eksplisitte `GRANT`-statements til `anon`/`authenticated`/`service_role` — Supabase fjerner default-grants 30. mai 2026 for nye prosjekter og 30. oktober 2026 for eksisterende. Se **Policy: Migrasjoner** nedenfor.

**Geokoding:** Stedene-kartet (`/stedene`) plotter turer via koordinater lagret på arrangementet (`lat`/`lng`). `lib/geokoding.ts` geokoder `destinasjon` via nøkkelfri Nominatim (OpenStreetMap) ved oppretting/redigering av en tur — best-effort, server-side. **Aldri** hardkod by→koordinat-tabeller; coords skal komme fra geokoding og lagres på raden. Se [docs/geokoding.md](docs/geokoding.md).

**PWA:** Installerbar via Safari/Chrome. Manifest i `app/manifest.ts`.

**Produksjon:** Appen deployes på Vercel — se [docs/oppsett.md](docs/oppsett.md) for oppsettsveiledning.

## Scope

Se [HK-app_kravspesifikasjon.md](HK-app_kravspesifikasjon.md) for fullstendig scope. Kortversjon:
- **v1:** Arrangementer + påmelding, varsler, medlemsliste, vedtekter/historikk, statistikk, kåringer, roller/ansvar per år, chat per arrangement.
- **v2:** Bildedeling, kåringsavstemning.

## Ytelseskrav

- Appen skal være så rask som mulig for brukeren. Endringer som innføres skal ikke øke responstiden — mål alltid å forbedre eller beholde eksisterende ytelse.

## Konvensjoner

- UI-tekst og databasekolonner på norsk (f.eks. `opprettet_av`, `start_tidspunkt`)
- Datoer via `date-fns` med norsk locale (`nb`)
- Oslo-østkant-tone / oslo-losen i UI-tekst (a-endelser, f.eks. «gutta»)

## Arbeidsmåter

### Når patch-strategien har gått tom

Tre regresjoner i samme bug-klasse = arkitektonisk reversering, ikke fjerde patch. Skriv heller en CLAUDE.md-policy som lukker problemklassen enn enda en lapp. Gjelder generelt — UI-bugs, DB-bugs, varsel-bugs.

### Kommentarer i kode

**Overstyrer global default.** I dette prosjektet er kommentarer velkomne — også når WHY-en ikke er strengt ikke-åpenbar. Jeg setter pris på at subtile betingelser, edge-cases og «hvorfor akkurat sånn»-valg står forklart i koden, ikke bare i PR-historikk eller git blame.

- Skriv en kort kommentar når en betingelse, regex, off-by-one-justering eller tilsynelatende redundans har en grunn som ikke leses rett ut av variabelnavnene.
- Det er greit å referere til issue-nummer (f.eks. `// se #165 for bakgrunn`) når det hjelper en fremtidig leser å finne kontekst.
- Hold dem korte (én linje, maks to). Ikke skriv flerlinjede docstrings eller essays.
- Fortsatt nei: kommentarer som kun gjengir hva koden gjør (`// loop over array`), eller TODO-er uten eier/dato.

Når reviewer foreslår en forklarende kommentar — default er nå å legge den inn, ikke avvise den.

## Policy: Varsler

All utgående kommunikasjon (push, epost) skal gå gjennom `sendVarsel()` i `lib/varsler.ts`. **Aldri** importer `sendPush` eller `sendEpost` direkte i andre filer — bruk `sendVarsel`.

**Funksjonen håndterer:**
- Testmodus (filtrerer til kun testprofil)
- Brukerpreferanser (`push_aktiv`, `epost_aktiv` fra `varsel_preferanser`)
- Dedup via `tillatDuplikat`-parameter (false = sjekker `varsel_logg` for eksisterende type+arrangement_id)
- Deduplisering av mottakerliste (Set)
- Logging til `varsel_logg`-tabellen med kanal-info (push/epost/begge)
- URL-generering: oppgitt URL brukes (normalisert til absolutt via `absoluttUrl()` — e-postklienter kan ikke resolve relative lenker), ellers genereres `/varsler/{id}`

**Parametre:**
- `mottakere?: string[]` — profil_id-er, utelat = alle aktive
- `tittel`, `melding` — innhold i varselet
- `url?` — lenke i push/epost
- `knappTekst?` — epost CTA (default: "Åpne i appen")
- `type` — kategorisering for logging og dedup
- `arrangementId?` — referanse for dedup
- `tillatDuplikat?` — true = send alltid (default: false)
- `tellerUlest?` — om varselet skal telle mot ulest-badge (default: true). Sett til false for informative varsler som er gjeldende uten at brukeren *må* lese dem (f.eks. oppdaterte arrangementer).
- `pushTag?` — tag for push-gruppering på operativsystem-nivå (f.eks. `'chat-arrangement-123'`). Brukes til å kollapse/gruppere relaterte push-notifikasjoner. Hvis utelatt, kollapses ikke.

**Tabell:** `varsel_logg` (tidligere `personlige_varsler` + `varsler_logg` slått sammen). Kolonner: profil_id, tittel, melding, type, kanal, url, arrangement_id, lest, teller_ulest, opprettet. Kolonnen `teller_ulest` (default true) kontrollerer om varselet bidrar til ulest-badge på `/profil` — sett til false for informative varsler som ikke krever aksjon.

**Cron:** GitHub Actions (`.github/workflows/paaminne.yml`) kaller `/api/cron/paaminne` via POST kl 06:00 UTC (08:00 norsk sommertid) med `CRON_SECRET`-auth. Valgt foran Vercel cron for bedre logging og synlig feilrapportering. Datobasert sjekk — arrangementets dato sammenlignes med norsk dato, ikke tidspunkt.

**Viktig:** Bruk aldri `after()` fra `next/server` for varsler — det kjører ikke pålitelig på Vercel Hobby. Bruk `await` direkte.

**Kvitteringsdoktrine — sikker duplikat-eliminering:**

Varsler er asynkrone og kan mislykkes midt i utsendingen. For å unngå duplikater og sikre at hver hendelse varsles eksakt ett forsøk, følger vi en strict compare-and-swap-kontrakt:

1. **Ingen tilstandsendring får være sin egen varsel-nøkkel.** Markøren for «varslet om» (f.eks. `varslet_paa` på en rad) er et eget felt, satt som en atomic compare-and-swap når `sendVarsel()` returnerer **uten å kaste**. Hvis kallet feiler (throw), endres markøren ikke.

2. **Kast = ukjent utfall.** Hvis `sendVarsel()` kaster, tolker den som «vi vet ikke hva som skjedde», og retry er tillatt (av samme eller annen jobbkjøring). Returnerer den normalt (uten exception) tolkes det som «tilstanden er nå gjort», og markøren er satt.

3. **Retry må være tidsbegrenset.** Retry-spørringen som søker etter rader med udefinert markør skal alltid ha en `WHERE created_at > now() - interval '…'` sånn at en permanentuleverbar rad ikke sitter og poller for alltid. Gjør også oppsett-guiden klar på hva verdien skal være når den settes opp.

4. **Duplikat-nøkkelen hindrer duplikater per mottaker.** `varsel_logg.dedup_noekkel` + partial unique index `(profil_id, type, arrangement_id) WHERE dedup_noekkel IS NOT NULL` låser at én (type, arrangement_id)-kombinasjon bare sendes en gang per medlem. Nøkkelen skal alltid være namespaced med typen (f.eks. `'paaminnelse_7_' || arrangement_id`).

5. **`23505` (UNIQUE-brudd) tolkes som suksess, ikke feil.** Hvis duplikat-indexen trigges under utsending til flere mottakere, fanger `.catch()` i utsendingsløkka `23505` **per mottaker** og tolker det som «denne mottakeren har allerede fått varslet» — feilen propageres aldri ut av `sendVarsel()`. Andre feil per mottaker (push-subscription invalid, preference blocked) kastes og bobler ut.

6. **`varsel_logg` er medlemmets innboks, ikke appens kvitteringsbok.** Logg-rader prunes aldri. De er brukerens synlige varselhistorikk.

7. **Markøren dekker det utfallet som var kjent da den ble satt.** Hvis to ulike varsler skal sendes for samme hendelse (f.eks. tiebreak-varslet «generalsekretæren må avgjøre» og senere vinner-varslet «kampen er avgjort»), krever det to markør-kolonner. Hver markør styrer sin egen retry-kø uavhengig. Prøv aldri å tolke én markør ut fra kontekst — lag en ny kolonne i stedet.

**Dedup-nøkkelen må finnes** for at `tillatDuplikat: false` skal ha effekt. Funksjonen sjekker duplikater kun for varsler som har enten `arrangementId` eller `pollId` (eller eksplisitt `dedupNoekkel`). Et varsel som sender ingen av disse med `tillatDuplikat: false` beskytter ingenting — det er en stille no-op. Varsler som tåler duplikater, som `arrangor_purring`, `melding-ny` og `klient_alarm`, setter `tillatDuplikat: true` eksplisitt for å være ærlige om oppførselen.

**Feilkontrakt — `sendVarsel()` kaster:**

Funksjonen feiler **lukket** (throw) ved innstillings-, testmodus-, mottaker-, preferanse-, push-subscription- og fortids-sperre-feil (se omtale av HENDELSE_VARSLER i kommentaren øverst i `lib/varsler.ts`). Disse er feil som betyr at et varsel *ikke burde sendes* — å dedup eller logge dem ville maskere at konfigurasjonen eller appen er i en gal tilstand.

Derimot feiler dedup-oppslag og `varsel_logg`-insert **åpent** (throw-en kastes ikke videre, men feilobjektet logges). Fail-open gjelder **leveranse** — hvis vi ikke kan sjekke duplikater eller skrive logg, sender vi varselet likevel. Men fail-open gjelder *ikke* **synlighet** — vi logger alltid med feilobjektet (via `logg.feil(…)`) så det finnes en spor.

**Kall etter en committet tilstandsendring** (f.eks. `sendVarsel()` etter å ha opprettet et arrangement eller passet et medlem) **må** ha eksplisitt `.catch(err => logg.feil(…))`. Eksempler: `lib/actions/pass.ts` (passa medlem → varsel skal sendes hvis pass ble godkjent), `lib/actions/meldinger.ts` (ny melding → varsler sendes; hvis varsel-feil kastes, reverter ikke meldingen). Regelen lukker klassen av stille feil hvor en tilstandsendring blir committed men varselet mislykkes — uten `.catch()` ser brukeren en server error, noe som kan få dem til å prøve på nytt og lag duplikater.

**Kall der varselet *er* handlingen** (f.eks. en admin som klikker en knapp «Varsle alle» på `/admin`) lar throw-en boble til brukeren. `.catch()` skal ikke legges der — brukeren må se feilen.

## Policy: Roller

Sentral rettighetsmatrise i `lib/roller.ts` definerer de tre rollene og hva hver rolle kan/mottar. **Aldri** sammenlign `rolle === 'admin'` direkte i kode — bruk hjelperne.

**Roller:** `medlem`, `admin`, `generalsekretaer`. Alle har medlem-rettigheter. Admin og generalsekretær har i tillegg admin-rettigheter (CRUD på tvers, kåringer, klubbinfo, alle arrangementer).

**Matrisen (`ROLLER`) har disse feltene per rolle:**
- `tittel` — visningsnavn i UI
- `kanAdministrere` — har admin-rettigheter
- `harGulGloed` — særegen gul ring rundt avatar
- `loeserTiebreak` — løser uavgjort i kåringspoll

**Innspill-varsler og feilvarsler er IKKE rollestyrt:** hvem som mottar hvilket varsel styres av to uavhengige kolonner, begge admin-styrt per medlem via RedigerMedlemSkjema — `profiles.faar_issue_varsler` for varsel om nye innspill (migrasjon 104) og `profiles.faar_feilvarsler` for den daglige klientfeil-alarmen (migrasjon 123). De to formålene delte opprinnelig én kolonne; skilt fordi innspill er dialog med medlemmene og feilalarmen er drift. Mottaker-spørringer filtrerer på riktig kolonne (`.eq('faar_issue_varsler', true)` hhv. `.eq('faar_feilvarsler', true)`) — aldri på rolle.

**Bruk disse hjelperne:**
- `kanAdministrere(rolle)` — admin-sjekk i UI, server actions, API-ruter
- `harGulGloed(rolle)` — avatar-styling
- `tittelFor(rolle)` — visning av rolle i UI
- `rettigheterFor(rolle)` — hele rettighetsobjektet
- `rollerMed(rettighet)` — liste over roller som har en gitt rettighet (for `.in('rolle', …)`-filtre)
- `VALGBARE_ROLLER` — roller som kan velges fra admin-UI (generalsekretær settes manuelt via SQL)

**Database-siden:** Funksjonen `er_admin()` returnerer true for både admin og generalsekretær og brukes i alle RLS-policies. Hvis matrisen endres slik at en ny rolle skal ha admin-rettigheter, må `er_admin()` oppdateres i en ny migrasjon — dette er duplisering vi lever med fordi RLS må kjøre i DB.

**Når nye RLS-policies skrives:** Bruk `er_admin()`, ikke inline `rolle = 'admin'`. Sistnevnte glipper unna når nye roller med admin-rettigheter kommer.

**Setting av generalsekretær-rollen:** Via SQL (`update profiles set rolle = 'generalsekretaer' where …`). UI-et til medlemsredigering kan ikke sette denne rollen — bare bevare den hvis den allerede er satt.

**Testing:** `__tests__/roller.test.ts` verifiserer at matrisen og hjelperne holder seg i synk. Oppdater testen hvis du legger til ny rolle eller rettighet.

## Policy: Tidshåndtering

All tidshåndtering skal gå gjennom `lib/dato.ts`. **Aldri** bruk `new Date()` for å bestemme "hvilken dag er det" — bruk `norskDatoNaa()`.

**Regler:**
- **Visning av dato/tid:** Bruk `formaterDato(iso, format)` — konverterer automatisk fra UTC til `Europe/Oslo`
- **"Er dette i dag/fortid?":** Bruk `norskDatoNaa()` og `norskDag(iso)` for sammenligning
- **Hvilket år er det?:** Bruk `norskAar()`
- **Lagring i database:** Alltid UTC. Bruk `naa()` fra `lib/dato.ts` for "nå"-tidsstempler i timestamp-kolonner (`oppdatert`, `besluttet_paa` osv.) i stedet for `new Date().toISOString()` direkte
- **Cron/datoberegning:** Bruk `norskDatoNaa()` som utgangspunkt, `addDays()` for å beregne fremtidige datoer
- **`new Date()` er OK for:** elapsed time-beregninger, unike ID-er, og når du trenger en `Date`-instans (ikke ISO-streng)

**Tidssone:** `Europe/Oslo` (eksportert som `TIDSSONE` fra `lib/dato.ts`). Håndterer automatisk sommertid/vintertid via `date-fns-tz`.

## Policy: Konfig

Miljø-avhengige verdier samles i `lib/config.ts`. **Aldri** hardkode domenet eller lese `process.env.NEXT_PUBLIC_BASE_URL` direkte i actions/route handlers/komponenter — importér fra `lib/config`.

**Eksporterer:**
- `BASE_URL` — applikasjonens base-URL. Kjenner Vercel-preview (`VERCEL_URL`), prod-default og dev-default. Brukes i absolutte URL-er for varsler, ICS-filer, GitHub-webhook-lenker.
- `getBaseUrl()` — funksjons-form av samme; bruk denne hvis du trenger å resolve på kall-tidspunkt heller enn modul-load. Trailing slash i `NEXT_PUBLIC_BASE_URL` strippes, så `${BASE_URL}/sti` aldri gir dobbel skråstrek.
- `absoluttUrl(url)` — gjør en relativ sti (`/chat`) absolutt med `BASE_URL`. Brukes av `sendVarsel()` fordi e-postklienter ikke har noen base-URL å resolve mot. Absolutte URL-er slipper uendret gjennom; protokoll-relative (`//host`) får https-prefiks.
- `VAPID_CONTACT_EMAIL` — kontakt for push-tjenester (env-overridable)
- `GITHUB_REPO`, `GITHUB_ONSKE_LABEL`, `githubIssuesUrl({state, perPage, page})` — for innspill-funksjonen mot GitHub Issues

**Når du legger til ny miljø-avhengig verdi:** legg den i `lib/config.ts` med fornuftig default + env-override. Ikke spred `process.env.X ?? 'fallback'`-mønsteret rundt i kodebasen.

## Policy: Auth

Server actions og route handlers skal bruke `ensureAdmin()` eller `ensureInnlogget()` fra `lib/auth.ts` for autorisasjons-sjekker. **Aldri** dupliser `supabase.auth.getUser()` + `from('profiles').select('rolle')` + `kanAdministrere(...)` inline i nye actions.

**Hjelpere:**
- `ensureAdmin()` → `{ supabase, user, profil }` — kaster ved manglende auth eller manglende admin-rolle. Returnerer samme supabase-klient for videre spørringer (RLS-kontekst bevart).
- `ensureInnlogget()` → `{ supabase, user }` — kaster kun ved manglende auth.

**Route handlers med status-koder:** Hvis du trenger å returnere 401/403 i stedet for å kaste, kan du fortsatt bruke inline-mønsteret (ensureAdmin kaster generisk Error). Vurder om try/catch rundt ensureAdmin er nok for ditt formål.

**RLS er fortsatt sannheten:** `ensureAdmin()` er en raskere/penere feilmelding — sikkerhetsmessig stoles det fortsatt på `er_admin()`-policyer i Postgres.

## Policy: Databasespørringer

`error` skal **alltid** hentes ut fra en Supabase-spørring, ikke bare `data`. `const { data } = await supabase.from(...)` gjør «ingen rader» umulig å skille fra «spørringen feilet» — begge gir `data = null`/`[]`. Konsekvensen har historisk vært tapte varsler og sider som ser tomme ut i stedet for å feile synlig.

**`.single()` vs `.maybeSingle()`-fella:** `.single()` setter `Accept: application/vnd.pgrst.object+json`, og PostgREST rapporterer 0 rader fra den som **error `PGRST116`**, ikke som `data = null`. Det slår ut på to måter:
- **Med vakt:** legger du en `if (error) throw`-vakt foran et `.single()`-oppslag, treffer vakten på 0-rader-tilfellet også — koden din som skulle skille «finnes ikke» fra «spørringen feilet» blir død kode, og «raden finnes ikke» eskalerer til en feilside.
- **Uten vakt:** `const x = await …single()` uten at `x.error` leses gir `data = null` på 0 rader, og en `?? 'fallback'` slår stille inn — ingen spørringsfeil blir synlig.

**Hva brukeren faktisk ser:** feilmeldings-teksten du skriver i `throw new Error(...)` er **logg-tekst, ikke UI-tekst**. Next 15 maskerer meldinger fra server components i prod-bygg, og `app/error.tsx` viser uansett alltid en fast norsk brødtekst + digest-hashen — aldri `error.message`. Meldingen din havner i feil-logging, og det er der den skal være presis.

**Regel: legger du en feil-vakt foran et Supabase-oppslag, bytt `.single()` til `.maybeSingle()` i samme håndgrep.**

Unntak: mutasjoner som returnerer raden (`insert().select().single()`), og den etablerte kombiformen `if (error || !x) throw new Error(...)` der 0-rader og feil bevisst behandles likt.

**Bestem hva «0 rader» skal bety per kallsted FØR du skriver vakten — tre utfall:**
- **Kast** — raden finnes ikke. Detaljsider med `[id]` bruker `notFound()`, andre steder et kastet `Error`.
- **Fallback** — oppslaget beriker noe annet (en lenke, et navn); manglende rad er en normal tilstand, ikke en feil.
- **Fortsett stille (men logg feilen)** — idempotent eller ikke-kritisk nok til å ta ned resten. Bruk `logg.warn()`/`logg.feil()` slik feilen er synlig i observability uten å blokkere brukeren.

**Bevisst fail-open:** hvis du med vilje lar en spørring feile stille, skriv `eslint-disable-next-line hk/supabase-feil-maa-hentes` med en kort begrunnelse på linjen over. (Destrukturerer du `error` og faktisk bruker den, f.eks. i logging, trenger du **ikke** disable — regelen krever kun at `error` hentes ut og leses.)

## Policy: Konstanter

Domene-konstanter (tegnegrenser, dag-vinduer, levetider) ligger i `lib/konstanter.ts`. **Aldri** hardkode magiske tall som 500/2000/7/24 i actions eller komponenter — importér konstanten.

**Eksporterer:**
- `CHAT_MIN_LENGDE` / `CHAT_MAKS_LENGDE` (1, 500) — for arrangement-, klubb-, poll- og melding-chat
- `INNLEGG_MIN_LENGDE` / `INNLEGG_MAKS_LENGDE` (1, 2000) — for samtaler og meldinger på vegglignende feed
- `PAAMINNELSE_DAGER` `{ LANG: 7, KORT: 1, PURRING: 3 }` — dager før et arrangement vi sender hver type påminnelse
- `PASS_TILGANG_TIMER` (24) — tilgangsvinduet etter pass-godkjenning

**Når du legger til ny konstant:** Hvis verdien speiler en DB check-constraint (f.eks. tegnegrenser), nevn det i kommentaren og oppdater migrasjonsfilen ved endring.

## Policy: Bildelagring

Bilder lagres i Cloudflare R2 (S3-kompatibel objektlagring). Profilbilder ligger fortsatt i Supabase Storage av historiske grunner — nye bildelagrings-stier skal bruke R2.

**Hvorfor R2:** ~95 % billigere enn Supabase Pro for vår skala, $0 egress uansett volum, Cloudflare CDN innebygd. Beslutning dokumentert i issue #66.

**Sentral modul:** `lib/r2.ts` — `lastOppR2(sti, data, contentType)` og `slettR2(sti)`. Bruker `aws4fetch` for signing (~5 KB bundle, ingen S3-SDK). Helpers er server-side only — kaller fra klient er forbudt fordi det krever access-key.

**Klient-flyt:**
1. Velg fil i UI
2. `komprimer(fil)` fra `lib/bilde-utils.ts` — Canvas API skalerer til maks 1600 px lang side, JPEG kvalitet 0.85
3. `genererFilnavn(fil)` lager unik path-prefiks
4. Send komprimert fil + filnavn til server action via FormData
5. Server action validerer + kaller `lastOppR2()` + returnerer public URL

**Server actions:** `lib/actions/bilde-opplasting.ts` har `lastOppArrangementBilde(formData)` og `slettArrangementBilde(url)`. Begge krever `ensureInnlogget()`. Fil-størrelse er capet til 5 MB og MIME-typer begrenset til JPEG/PNG/WebP.

**Konvensjon for paths i R2:**
- `arrangementer/{filnavn}` — bilder knyttet til arrangementer
- (Senere: `profilbilder/{filnavn}`, `albums/{aar}/{filnavn}`, etc. — legg til hjelpere i `bilde-utils.ts` per kategori)

**Cache-headers:** Alle objekter får `Cache-Control: public, max-age=31536000, immutable` ved upload. Det er trygt fordi vi alltid genererer unike filnavn — vi gjenbruker aldri en sti.

**Public URL:** `R2_PUBLIC_URL` (i `lib/config.ts`) er base-URL-en. Bilder hentes via `${R2_PUBLIC_URL}/${sti}`. URL-en er trygg å eksponere til klienten — bare access-keyen er hemmelig.

**`next/image`:** R2-domenet (`*.r2.dev` og eventuell custom domain) er tillatt i `next.config.ts → images.remotePatterns`. Bruk `<Image>` med `fill` + `sizes` for responsiv leverering.

**Sletting:** Når en URL i DB skal slettes, kall `slettArrangementBilde(url)`. Helperen sjekker først at URL-en faktisk peker til vår R2 (via `r2StiFraUrl()`) før den prøver å slette — Supabase-URL-er passerer uberørt.

**Migrering av eksisterende bilder:** Profilbilder og eldre arrangement-bilder ligger fortsatt i Supabase Storage. Migrering er bevisst ikke gjort — koden støtter begge så lenge man ikke endrer bilde-URL-en i DB.

**Secrets (Vercel env vars):** `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` (eller `NEXT_PUBLIC_R2_PUBLIC_URL` om public-URL skal være tilgjengelig på klient). Secret-keyen skal ALDRI ha `NEXT_PUBLIC_`-prefiks.

## Policy: Bildevisning

Alle lagrede bilde- og video-URL-er skal gjennom `bildeSrc()` i `lib/bilde-utils.ts` før de settes som `src` — eneste trakt inn i et `src`-attributt. **Aldri** sett `bilde_url`/`thumb_url`/`video_url`/`bildeUrl` rått inn i `<Image>`, `<img>` eller `<video>`.

**Hvorfor:** i dag returnerer `bildeSrc()` URL-en uendret — funksjonen er identitet. Verdien ligger i at det finnes ett sted å endre den dagen bildeleveransen skal legges bak innlogging (signerte lenker, tilgangssjekk, e.l.). Uten dette samlepunktet er det et redesign spredt over hele kodebasen i stedet for én funksjon. Samme grep som `sendVarsel()` for utgående kommunikasjon.

**Dekker `<video src>` på lik linje** med `<Image>`/`<img>`.

**Kalles i komponenten som eier `src=`, ikke hos den som sender URL-en videre som prop.** Blad-komponenter som `BildeLightbox`, `BildeBunke` og `KommentarMiniatyr` kaller `bildeSrc()` selv — kallere lenger oppe i treet sender fortsatt rå `bilde_url` videre som prop, akkurat som før.

**`blob:`-URL-er passerer uendret** — de er lokale forhåndsvisninger i opplastingsflyten og treffer aldri R2. Funksjonen må aldri nekte dem. Hvorvidt kallstedet *skal* kalle `bildeSrc()` avgjøres av hva som kan komme inn på samme variabel — ikke av skjønn:

- **Blob og lagret URL kommer gjennom samme prop/variabel → kall `bildeSrc()`.** Den slipper blob-en uendret gjennom, så én trakt dekker begge. Gjelder komponenter som viser både lokale opplastinger og lagrede bilder (f.eks. preview-bildet ved arrangementredigering).
- **Kallstedet rendrer KUN en lokal blob, aldri en lagret URL → unntatt.** Komponenter som kun viser den filen brukeren nettopp valgte; det finnes ingen lagret URL å trakte, og en fremtidig tilgangssjekk ville uansett ikke gjelde dem.

**`null` betyr *ingen URL*, ikke *nektet tilgang*.** Kallstedene tolker i dag null som «vis fallback / ingenting». Det er riktig så lenge null kun oppstår ved tom input. Skal `bildeSrc()` en dag kunne **nekte** en URL (utløpt signatur, manglende tilgang), er `return null` feil kanal: da forsvinner bildet uten spor. Nektelse må bli en egen, synlig tilstand i kallstedene — ikke en stille null fra en `.map()`.

**Profilbilder rendres fortsatt gjennom `components/ui/Avatar.tsx`** — og Avatar kaller selv `bildeSrc()` internt. Avatar er ikke et unntak fra regelen, den er et kallsted som alle andre.

**Funksjonen skal aldri bli asynkron eller importere `lib/r2.ts`.** Den er en ren, synkron strengoperasjon — ingen I/O, ingen oppslag. En async-versjon ville brutt server component-rendring på tvers av kodebasen.

## Policy: Arrangøransvar-kobling

Når en bruker oppretter et arrangement velger han **eksplisitt** hvilken mal det hører til i en nedtrekk-meny (`TypeVelger`). Menyen lister alle uoppfylte `(aar, arrangement_navn)`-kombinasjoner fra `arrangoransvar` + et `Annet`-valg som alltid ligger nederst. Valget styrer både kobling, type (møte/tur), purredato og forhåndsutfylt tittel.

**Komponenter:**
- `components/arrangement/TypeVelger.tsx` — dropdown + typen `MalValg`
- `lib/mal-valg.ts → hentMalValg(supabase, includeArrangementId?)` — henter og sorterer valg (aar asc, purredato asc nulls last, Annet sist). `includeArrangementId` tar med gjeldende kobling slik at rediger-siden fortsatt viser valget selv når det er oppfylt.

**Flyt:** `opprettArrangement` og `oppdaterArrangement` tar `mal_navn` + `aar`. Hjelperne `koble()` og `losne()` i `lib/actions/arrangementer.ts` oppdaterer ALLE arrangoransvar-rader med samme `(aar, arrangement_navn)` atomisk — flere ansvarlige deler samme arrangement.

**Utkast på agendaen:** `UtkastKort` lenker ansvarlige rett til `/arrangementer/ny?mal=X&aar=Y` (mal forhåndsvalgt), andre til `/arrangoransvar#ansvar-Y-slug` (stabil anker for purring).

**Detaljer:** Se [løsningsdesign §5.4](HK-app_losningsdesign.md#54-kobling-mellom-nytt-arrangement-og-arrangøransvar).

## Policy: Avatar

Alle profil-avatarer (medlemsansikter) skal rendres via `components/ui/Avatar.tsx`. **Aldri** skriv inline `<img src={bilde_url}>` eller en rund div med initialer andre steder — bruk komponenten.

**Props (fulle settet, utvides ikke):**
- `name: string` — fullt navn, brukes til initialer og hue-beregning
- `size?: number` — piksler (default 32)
- `src?: string | null` — bildeUrl, fallback til initialer ved null
- `rolle?: string | null` — brukes kun til gul glød for generalsekretær via `harGulGloed()`

**Enkel kjerne — lag lokale wrappere for særtilfeller:** Hvis et sted trenger status-dot, krone-badge, aktiv-ring eller annen dekor rundt avataren, lag en liten wrapper-komponent lokalt (f.eks. `<AvatarMedKrone>`) som bruker Avatar inni. Legg **aldri** til props som `aktiv`, `badge`, `border`, `style` eller `children` på kjerne-komponenten — det gjør den til en konfigmatrise som er vanskelig å resonnere om.

**Når du legger til nye steder som viser profilbilder:** Bruk `<Avatar name={...} src={bilde_url} rolle={rolle} />`. Gul glød for generalsekretær faller da inn av seg selv — sjekker for dette skal ikke duplikeres utenfor komponenten.

## Policy: AI-funksjoner

Appen har **én** KI-flate: dato-uttrekket i `lib/actions/dato-forslag.ts`, som sender et innleggsutkast til Anthropic via `lib/anthropic.ts`. Den er **av som standard** — uten `ANTHROPIC_API_KEY` forlater ingen tekst instansen. Alt annet automatisk i appen (agenda-sortering, feil-alarm, geokoding, kåringer) er regelbasert og er ikke KI-systemer i forordningens forstand.

Hele risikovurderingen i [docs/ai-act-vurdering.md](docs/ai-act-vurdering.md) hviler på at det forblir én, snever flate. Konklusjonen der — minimal risiko, ingen forbudt praksis, ikke høyrisiko — er **ikke** en egenskap ved appen, men ved den ene funksjonen. Legger du på en ny KI-flate, er vurderingen utdatert til noen har skrevet den om.

**Alle KI-kall går gjennom `kallClaude()` i `lib/anthropic.ts`.** Aldri `fetch` mot en modell-leverandør direkte fra en action eller komponent — da mister du timeout, feilnormalisering og den PII-frie logge-garantien.

**`AI_PAA` (fra `lib/config.ts`) er sannheten om hvorvidt funksjonene er på.** Den er avledet av `ANTHROPIC_API_KEY`, ikke en egen bryter, så de to kan ikke komme i utakt. Enhver UI-tekst som forteller medlemmene at noe sendes ut, skal være betinget av den — ellers lyver en instans uten nøkkel til brukerne sine. Nøkkelen selv skal aldri til klienten; send `AI_PAA` som bool.

**Sjekkliste før du lander en ny KI-funksjon:**

1. **Utløser den AI Act art. 50?** En samtaleflate (chatbot, «spør appen») utløser art. 50(1) — plikt til å informere om at man snakker med en maskin. Genererer den tekst, bilde, lyd eller video som publiseres i appen, utløser den art. 50(2) — plikt til maskinlesbar merking av output. Begge er reelle plikter, ikke formaliteter.
2. **Endrer den klassifiseringen?** Automatisk moderering, rangering eller vurdering *av medlemmer* er en annen samtale enn å lese en dato ut av en tekst — den nærmer seg profilering og må vurderes særskilt før den bygges.
3. **Er `/om-appen` oppdatert?** Personvern-seksjonen skal beskrive hva som faktisk sendes ut, til hvem, og i hvilket land. Teksten skal være betinget av `AI_PAA`.
4. **Er nye env-variabler dokumentert?** `.env.example` *og* `scripts/sjekk-miljo.mjs` — begge, ellers er funksjonen usynlig for den som setter opp instansen.
5. **Oppdater `docs/ai-act-vurdering.md`.** Ny rad i funksjonsoversikten, ny vurdering mot art. 50. Vurderingen er en levende fil, ikke et engangsstempel.

**Modellbytte teller også.** `ANTHROPIC_MODEL` er env-styrt, og et bytte av leverandør kan flytte databehandlingen til en annen jurisdiksjon — da er teksten på `/om-appen` blitt feil uten at noen kodeendring fanget det.

## Policy: Navigasjon

App-navigasjon består av sticky TopHeader med tre alltid-synlige tekst-tabs (Agenda/Chat/Klubb) og en animert pill-bakgrunn som glir til aktiv tab; profil-avatar høyre som snarvei til /profil. I tillegg kontekstuelle FAB-er (NyFAB på agenda for å opprette innhold). **Ingen bottom-nav.** Dette eliminerer hele bug-klassen vi traff i #99, #104, #147, #151, #153 hvor iOS-tastatur kolliderte med fixed bottom-elementer. Hvis du finner deg selv i å legge til en `position: fixed; bottom: 0` UI-flate som ikke er en modal eller toast — løft det til diskusjon først.

## Policy: Migrasjoner

Nye tabeller i `public`-schema må eksplisitt gi tilgang til Data API-rollene. Supabase fjerner de implisitte default-grants på `public`-schema: **30. mai 2026** for nye prosjekter, **30. oktober 2026** håndhevet på alle eksisterende prosjekter (inkludert vårt). Uten `GRANT` returnerer PostgREST `42501` selv om RLS-policyen tillater raden — `supabase-js` ser ikke at tabellen finnes.

**Mal for nye tabeller i migrasjon:**

```sql
create table public.<tabell> (
  ...
);

alter table public.<tabell> enable row level security;

-- Data API-tilgang (kreves fra 2026-10-30 på vårt prosjekt)
-- IKKE grant til anon: en privat klubb-app har normalt ingen offentlige flater.
-- Legg kun anon-grant til hvis en konkret ikke-innlogget flate faktisk trenger det.
grant select, insert, update, delete  on public.<tabell> to authenticated;
grant select, insert, update, delete  on public.<tabell> to service_role;

-- Policies (tilpass per tabell)
create policy "..." on public.<tabell> ...;
```

**Justér scope per tabell — minste privilegium:** Gi `authenticated` kun de kommandoene tabellens RLS-policyer faktisk tillater (én grant per policy-kommando). `anon` skal normalt ikke ha noe (ingen offentlige flater). `service_role` bypasser RLS uansett, men trenger fortsatt grants for å se tabellen via PostgREST.

**Sekvenser:** Hvis tabellen har en `serial`/`identity`-kolonne brukt fra klient, husk `grant usage, select on sequence public.<tabell>_<kol>_seq to authenticated;`.

**Grants-opprydding:** Migrasjonene som følger med (grants-audit + `alter default privileges ... revoke all on tables/sequences/functions from anon`) trimmer eksisterende tabeller til minste privilegium og skrur av anon-default på public-schema, så nye tabeller ikke arver anon-grants. `authenticated`-default røres ikke (RLS backstopper; Supabase fjerner uansett alle default-grants 30. oktober 2026). Følg malen over for nye tabeller.

## Policy: Side-effekter ved sidelast

En server action kalt som løs promise **under render** av en server component får **ikke** kalle `revalidatePath`/`revalidateTag` — Next 15 kaster på det, og kallet nådde uansett aldri klienten (ingen Full Route Cache å invalidere på en dynamisk rendret side). Et `.catch(console.error)`/`.catch(() => {})` på kallet svelger kastet i taushet, så siden ser helt normal ut mens effekten aldri fullfører.

To tillatte mønstre:
- **(a) Server-side fire-and-forget uten revalidering**, der ferskheten kommer av at målsiden er dynamisk rendret.
- **(b) Klientkomponent + `useEffect` + action + `router.refresh()`** når tellingen må oppdateres umiddelbart i UI-et.

**Ufravikelig for mønster (a): catch-en skal alltid gå til `logg.feil('<omraade>.feilet', err)` — aldri `console.error`, aldri en tom lambda.** `logg.feil()` returnerer en promise, så formen er `.catch((err: unknown) => logg.feil('<omraade>.feilet', err).catch(() => {}))` (den ytre catch-en hindrer at loggingen selv blir en uhåndtert rejection). Raden i `feil_logg` er kvitteringen e2e-tester leser: en side som svarer 200 og rendrer fint, men svelger et kast i en tom lambda, er per definisjon usynlig for dem. Nytt event-navn skal samtidig inn i event-taksonomien i filhodet til `lib/logg.ts`.

Tredje gang samme problem slår til bør vurderes som en arkitektonisk vakt (jf. § Arbeidsmåter), ikke en ny lapp.

## Policy: Visuell verifikasjon

For UI-endringer på vanlig flyt: kjør Playwright lokalt før push (`npx playwright test`). Se `e2e/README.md` for setup.

**E2e er også en CI-port på hver PR** (`.github/workflows/pr-check.yml`, mot en fersk `supabase start` i selve jobben). Lokal kjøring er førstelinjen for rask iterasjon, men er ikke eneste dekning — en PR som glemmer suiten lokalt fanges likevel før merge.

Samme workflow kjører på `push` til main, men da kun kjerneporten (lint, typecheck, vitest, bygg — uten e2e). **Kodeendringer bør derfor gå gjennom PR**; en direkte push til main får aldri e2e. Budsjettvakten (`.github/scripts/ci-minuttbudsjett.mjs`) kan i tillegg kutte e2e-steget på et privat repo når Actions-kvoten er knapp — en grønn kjøring med kuttet e2e er «ukjent», ikke «grønt». Se [docs/ci-minuttbudsjett.md](docs/ci-minuttbudsjett.md).

For iOS-PWA-quirks (visualViewport, safe-area, focus/blur på iOS): Playwright reproduserer ikke, verken lokalt eller i CI. Test manuelt på iPhone og dokumenter i PR-en at automatisk verifikasjon ikke er mulig.

Supabase: ditt eget prosjekt (se [docs/oppsett.md](docs/oppsett.md)). Database-passordet ligger i `.env.local` som `SUPABASE_DB_PASSWORD`. Hent fra Supabase Dashboard → Project Settings → Database. Skript som trenger direkte Postgres-tilgang kjøres med `node --env-file=.env.local scripts/<navn>.mjs`.
