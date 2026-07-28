# Feilstrategi

Dette dokumentet beskriver hvordan appen håndterer feil: hvordan vi hindrer at de oppstår, hva brukeren skal oppleve når noe likevel går galt, og hvordan feil registreres og varsles.

Alt som kan justeres uten å endre selve strategien står samlet i [§ 4 Innstillinger](#4-innstillinger).

**Grunnregelen er at appen aldri skal late som om noe gikk bra når det ikke gjorde det.** En tom side som egentlig skyldes en feilet spørring, en handling som ser lagret ut uten å være det, og et varsel som «ble sendt» til null personer er alle brudd på den samme regelen.

---

## 1. Hvordan vi unngår feil

### Vi lukker feilklassen, ikke den enkelte feilen

Når den samme typen feil dukker opp for tredje gang, skal vi ikke rette forekomst nummer fire. Vi skal bygge et *gjerde* — en automatisk sperre som gjør at feilen ikke lenger lar seg skrive. Sperren koster mer å bygge én gang, men fanger alle fremtidige tilfeller uten at noen må huske noe.

Disse gjerdene finnes i dag:

| Gjerde | Hva den stopper | Hvor den bor |
|---|---|---|
| ESLint-regelen `hk/supabase-feil-maa-hentes` | Databasespørringer som henter data uten å sjekke om spørringen feilet | `eslint.config.mjs` |
| `sjekkRotFilDekning()` | Filer som ellers ville blitt ulike i de to kodebasene uten at noen merket det | `scripts/sync-klubb-app.mjs` |
| Kvitteringsregelen for varsler (forklart under) | Varsler som går tapt uten at systemet kan prøve på nytt | `lib/varsler.ts` |
| Fortids-sperren | At registrering av et gammelt arrangement sender varsel til alle om noe som allerede har skjedd | `lib/varsler.ts` |

ESLint er verktøyet som leser gjennom koden før den bygges. Står en regel der på nivået `error`, stopper byggingen helt — koden kommer ikke i produksjon.

### En vakt vi ikke har bevist, regner vi ikke som en vakt

En test som ikke blir rød når du ødelegger koden den skal beskytte, kjører bare koden — den tester den ikke. Derfor skal vi *mutasjonsteste* nye vakter: fjern vakten med vilje, kjør testene, og bekreft at minst én blir rød. Sett den så tilbake.

Metoden har flere ganger avdekket tester som så ut til å dekke noe, men ikke gjorde det.

### Det trygge valget er standardvalget

Den som skriver kode fort, lander på det som er enklest. Derfor er standarden **stopp, si fra, logg**.

Å avvike fra den er lov, men begrunnelsen skal stå i koden, ikke bare i hodet til den som skrev den:

```ts
// eslint-disable-next-line hk/supabase-feil-maa-hentes -- <hvorfor det er trygt her>
```

### En handling skal aldri være sin egen kvittering på at varselet gikk ut

Når appen lagrer noe i databasen og deretter sender et varsel om det, må de to registreres hver for seg. Gjør de ikke det, ser neste forsøk at handlingen allerede er utført, hopper over — og varselet blir aldri sendt. Dette kalles kvitteringsregelen, og den er grunnen til at rader har et eget felt for «varslet om».

### All feilhåndtering går gjennom felles kode

En regel som må følges hundrevis av steder blir ikke fulgt. Derfor er det ett sted per type:

| Type | Skal gå gjennom |
|---|---|
| Databasefeil | Feilen hentes ut av svaret og sjekkes — aldri bare dataene |
| Feil på serveren | `logg.feil()` eller `logg.warn()` i `lib/logg.ts` |
| Feil i nettleseren | `meldKlientfeil()` i `lib/klient-logg.ts` |
| Varsler | `sendVarsel()` i `lib/varsler.ts` |

---

## 2. Hva brukeren skal oppleve

### Tre tilstander som aldri skal se like ut

| Tilstand | Hva brukeren ser |
|---|---|
| Det finnes ingenting her | En tom liste med en forklarende tekst |
| Dette finnes ikke | En 404-side |
| Vi klarte ikke å hente det | En feilside |

De to første er normale tilstander. Den tredje er en feil. Den vanligste og alvorligste feilen vi har gjort, er å vise den tredje som om den var den første — brukeren ser en tom side, tror det er tomt, og går videre.

### Hva appen gjør, avhenger av hva som står på spill

| Det som står på spill | Appen skal | Eksempel |
|---|---|---|
| Data eller tilgang | Stoppe. Er vi i tvil om hvem noen er eller hva de har lov til, slipper vi dem ikke inn | Innlogging, rollesjekk, tilgang til passinfo |
| En handling brukeren nettopp gjorde | Si fra med én gang, slik at han kan prøve på nytt | Lagre et arrangement, melde seg på, endre fondsverdier |
| En beskjed han ikke visste kom | Prøve å sende på nytt senere, og fortelle admin om det | Bursdagsvarsel, kåringsresultat, påminnelse |
| Pynt og detaljer | Skjule det uten å si fra til brukeren, men skrive det i loggen | Profilbilde, prikken som viser uleste varsler, en lenke |

Den siste raden er viktig: en detalj som feiler skal aldri ta ned noe større enn seg selv. En manglende ring rundt et profilbilde skal ikke gi feilside på hele appen.

### Teksten brukeren møter

Feilsiden viser alltid det samme, uansett hva som gikk galt:

> **Noe gikk galt**
> Vi klarte ikke hente dataene. Prøv igjen — hjelper det ikke, si fra til admin.
> *Feilkode: `<kode>`*

Feilkoden er en kort, tilfeldig streng som knytter det brukeren så til raden i feilloggen. Den er der kun så admin kan slå den opp.

Merk at feilmeldinger som skrives i koden — for eksempel `throw new Error('Kunne ikke hente turene')` — **aldri når brukeren i produksjon**. Rammeverket erstatter dem med en standardtekst, fordi databasemeldinger kan inneholde personopplysninger. Skriv dem derfor presist for loggens skyld, men vit at brukeren ser teksten over.

---

## 3. Hvordan feil registreres og varsles

### To alvorlighetsnivåer

Når koden skriver til loggen, velger den ett av to nivåer:

| Nivå | Brukes når | Hvor det havner |
|---|---|---|
| `warn` | Noe forventet skjedde, og det er allerede håndtert | Serverloggen. Utløser ingen alarm |
| `feil` | Noe uventet skjedde | Serverloggen, Sentry og tabellen `feil_logg`, som utløser døgnalarmen |

Er du i tvil, bruk `feil`. En alarm for mye koster mindre enn en tapt beskjed.

Sentry er en ekstern tjeneste som samler feil og viser hvor i koden de oppsto, og `feil_logg` er en tabell i vår egen database. Begge beskrives nærmere nedenfor.

Hver logglinje har et *event-navn* — en kort, punktdelt tekst som `varsel.send.feilet` — slik at samme type feil kan telles og grupperes. Navnene er samlet i `lib/logg.ts`.

### Døgnalarmen

Én gang i døgnet sjekker en automatisk jobb om det har kommet feil siste døgn. Har det det, sendes push og e-post til de medlemmene som er merket for å motta slike varsler. Meldingen inneholder de tre vanligste event-navnene med antall, slik at admin ser forskjell på at «noe skjedde» og at en bestemt side har sluttet å virke.

Enkelte event-navn er unntatt fra alarmen fordi de utløses av forbigående forhold utenfor vår kontroll. Radene skrives fortsatt til loggen, men de gir ikke varsel. Å legge til et nytt navn i det settet gjør oss blinde for akkurat den feilen, og skal derfor begrunnes.

### Ingen alarm som går umiddelbart

Miljøet er lite, og ingenting i appen er så tidskritisk at åtte timer gjør varig skade. En kanal som varsler med én gang mister dessuten betydning raskt hvis den brukes på noe annet enn det virkelig akutte. Skal noe legges der senere, må det begrunnes med et tap som ikke kan rettes opp i etterkant.

### Medlemmene er en del av varslingen

I et lite miljø der alle kjenner hverandre oppdages rare ting ofte raskere av et menneske enn av overvåkningen. Innspill-funksjonen i appen dekker dette behovet, og det er derfor ingen egen knapp for å melde fra om feil.

### Hvem som får alarmen

Det styres av et eget felt på hvert medlem, som admin setter i medlemsredigering. **Det er ikke knyttet til rollen.** Den som følger opp feil er ikke nødvendigvis den samme som administrerer, og et vanlig medlem kan derfor motta alarmer uten å være admin.

### To logger med hvert sitt formål

| Tabell | Hva den inneholder | Hvor lenge |
|---|---|---|
| `feil_logg` | Feil fra både server og nettleser. Den er grunnlaget for døgnalarmen | 180 dager |
| `varsel_logg` | Varsler som er sendt, og til hvem. Den er samtidig medlemmets innboks i appen | Slettes ikke |

`varsel_logg` er altså ikke en feillogg. Den brukes som bevis på at et varsel faktisk gikk ut, og en opprydding der ville ødelagt muligheten til å prøve på nytt.

### Sentry er sekundærkanalen

Sentry viser stakksporet og grupperer like feil, og er derfor nyttig når noe skal feilsøkes. Men den forutsetter at noen leser e-post. Døgnalarmen er primærkanalen, siden den kommer som varsel på telefonen.

---

## 4. Innstillinger

Verdiene her kan endres uten at strategien over endres. Konstanter uten oppgitt filsti ligger i `lib/konstanter.ts`.

| Innstilling | Verdi i dag | Hvor | Hva som skjer om den endres |
|---|---|---|---|
| Alarmterskel | `0` | `KLIENT_FEIL_ALARM_TERSKEL` | `0` betyr alarm ved enhver feil. Heves den, blir feil under terskelen tause. Det er som regel bedre å unnta enkelte event-navn enn å heve terskelen |
| Unntatte event-navn | 3 stk | `ALARM_IGNORERTE_EVENTS` | Radene skrives fortsatt til loggen, men gir ikke alarm. Vi blir blinde for akkurat de feilene |
| Når alarmen kjøres | 05:00 UTC | `.github/workflows/sjekk-klientfeil.yml` | Flere kjøringer i døgnet gir flere varsler om den samme feilen |
| Hvem som varsles | Per medlem | `profiles.faar_issue_varsler`, settes i medlemsredigering | Er ingen merket, går det ingen alarm |
| Hvor lenge feil beholdes | 180 dager | `LOGG_FEIL_RETENSJONSDAGER` | Eldre rader slettes automatisk. Kortere tid skjuler mønstre som gjentar seg sesongvis; lengre tid lagrer profil-id og nettleserinfo lenger |
| Hvor lenge varsler beholdes | Slettes ikke | — | Sletting ville brutt muligheten til å se om et varsel allerede er sendt |
| Antall feil i alarmteksten | 3 | `lib/feil-alarm.ts` | Hvor mange event-navn meldingen lister opp |
| ESLint-gjerdet | `error` | `eslint.config.mjs` | På `error` stopper byggingen. Settes den til `warn`, kan feilklassen snike seg inn igjen |
| Sentry | På i produksjon, av lokalt | Miljøvariabelen `SENTRY_DSN` | Uten verdi sendes ingenting til Sentry. Døgnalarmen virker uansett |
| Grense for klientfeil | 10 per minutt | `LOGG_FEIL_RATE_LIMIT_PER_MIN` | Hindrer at én nettleser som står og feiler i løkke fyller loggen |

---

**Utfyllende dokumentasjon:** CLAUDE.md § Policy: Databasespørringer beskriver kodereglene for databasefeil, og § Policy: Varsler beskriver kvitteringsregelen i detalj.
