# Feilstrategi

**Grunnregel: appen skal aldri late som om noe gikk bra når det ikke gjorde det.**

Innstillinger som kan endres står i [§ 4](#4-innstillinger).

---

## 1. Unngå feil

**Lukk klassen, ikke instansen.** Tredje forekomst av samme feil → bygg et gjerde, ikke en lapp nummer fire.

Gjerder i dag:

| Gjerde | Stopper | Hvor |
|---|---|---|
| `hk/supabase-feil-maa-hentes` | Databasespørringer som ikke leser `error` | `eslint.config.mjs` |
| `sjekkRotFilDekning()` | Filer som drifter usett mellom repoene | `scripts/sync-klubb-app.mjs` |
| Kvitteringsdoktrinen | Varsler som går tapt uten nytt forsøk | CLAUDE.md § Policy: Varsler |
| Fortids-sperren | Gammel tur som pinger alle ved etterregistrering | `lib/varsler.ts` |

**Bevis vakten.** Fjern den og se at en test blir rød. En vakt som ikke er mutasjonstestet regnes ikke som dekket.

**Defaulten er: stopp, si fra, logg.** Avvik krever begrunnelse på linja:

```ts
// eslint-disable-next-line hk/supabase-feil-maa-hentes -- <hvorfor det er trygt her>
```

**Ingen tilstandsendring er sin egen kvittering.** Skriving og varsling skal ha separate spor, ellers hopper retry over. Detaljer: CLAUDE.md § Policy: Varsler.

**Felles kode, ikke spredt håndtering:**

| Type | Skal gå via |
|---|---|
| Databasefeil | `error` hentes ut og leses |
| Server-logging | `logg.feil()` / `logg.warn()` |
| Klientfeil | `meldKlientfeil()` i `lib/klient-logg.ts` |
| Varsler | `sendVarsel()` |

---

## 2. Hva brukeren opplever

**Tre tilstander som aldri skal se like ut:**

| Tilstand | Vises som |
|---|---|
| Ingenting her | Tom liste med forklarende tekst |
| Finnes ikke | 404-side |
| Klarte ikke hente | Feilside |

**Oppførsel avgjøres av hva som står på spill:**

| Står på spill | Appen skal | Eksempel |
|---|---|---|
| Data eller tilgang | Stoppe. Alltid | Innlogging, rollesjekk, pass-tilgang |
| En handling han nettopp gjorde | Si fra straks, la ham prøve igjen | Lagre arrangement, melde seg på |
| Beskjed han ikke visste kom | Prøve på nytt, og fortelle admin | Bursdagsvarsel, kåringsresultat |
| Pynt | Skjule stille, men logge | Avatar, ulest-prikk, en lenke |

En feilende detalj skal aldri ta ned noe større enn seg selv.

**Feilteksten brukeren møter** (fast, i `app/error.tsx`):

> **Noe gikk galt**
> Vi klarte ikke hente dataene. Prøv igjen — hjelper det ikke, si fra til admin.
> *Feilkode: `<digest>`*

**Meldinger i `throw new Error(...)` er logg-tekst, ikke UI-tekst.** Next maskerer dem i produksjon. Skriv dem presist for loggens skyld, men brukeren ser teksten over.

---

## 3. Dokumentere og varsle

**To nivåer:**

| Nivå | Brukes når | Havner |
|---|---|---|
| `warn` | Forventet og håndtert | stdout. Ingen alarm |
| `feil` | Uventet | stdout + Sentry + `feil_logg` → døgnalarm |

I tvil: `feil`.

**Døgnalarm.** Én gang i døgnet. Minst én alarmverdig feil siste døgn → push og e-post til medlemmer merket med `faar_issue_varsler`. Meldingen lister de tre vanligste feilene med antall.

**Ingen straks-alarm.** Med et lite miljø gir åtte timers ventetid ingen reell skade, og en straks-kanal mister betydning raskt. Skal noe legges der senere, må det begrunnes med tap som ikke kan rettes.

**Ingen egen «noe er rart»-knapp.** Innspill-funksjonen dekker det.

**Hvem som varsles** styres av `faar_issue_varsler` per medlem, ikke av rolle — den som følger opp feil er ikke nødvendigvis den som administrerer.

**To logger:**

| Tabell | Innhold | Levetid |
|---|---|---|
| `feil_logg` | Feil fra server og nettleser. Driver alarmen | 180 dager |
| `varsel_logg` | Sendte varsler. Er også medlemmets innboks | Ubegrenset |

`varsel_logg` er ikke en feillogg. Den brukes som kvittering på at varsler gikk ut, og skal ikke ryddes uten at retry-vinduene vurderes først.

**Sentry** gir stacktrace og gruppering, men forutsetter at noen leser e-post. Døgnalarmen er primærkanalen.

---

## 4. Innstillinger

| Innstilling | Verdi | Hvor | Konsekvens ved endring |
|---|---|---|---|
| Alarmterskel | `0` | `KLIENT_FEIL_ALARM_TERSKEL` | `0` = alarm ved enhver feil. Heving gjør ekte feil tause — unnta heller enkelt-events |
| Unntatte events | 3 stk | `ALARM_IGNORERTE_EVENTS` | Skrives fortsatt til loggen, men utløser ikke alarm. Gjør oss blinde for den eventen |
| Alarmtidspunkt | 05:00 UTC | `.github/workflows/sjekk-klientfeil.yml` | Flere kjøringer = flere alarmer for samme feil |
| Hvem som varsles | Per medlem | `profiles.faar_issue_varsler` | Ingen merket = ingen alarm |
| Feillogg-levetid | 180 dager | `LOGG_FEIL_RETENSJONSDAGER` | Slettes av døgncronen. Kortere skjuler sesongmønstre; lengre lagrer profil-id og nettleser lenger |
| Varsellogg-levetid | Ubegrenset | — | Sletting bryter kvitteringsmekanismen |
| Antall i alarmteksten | Topp 3 | `lib/feil-alarm.ts` | Hvor mange event-navn meldingen lister |
| ESLint-gjerdet | `error` | `eslint.config.mjs` | `warn` lar feilklassen gjeninnføres |
| Sentry | På i prod, av lokalt | `SENTRY_DSN` | Tom = ingen Sentry. Døgnalarmen virker uansett |
| Rate-limit klientfeil | 10/min | `LOGG_FEIL_RATE_LIMIT_PER_MIN` | Hindrer at én nettleser i løkke fyller loggen |

Konstanter uten filsti ligger i `lib/konstanter.ts`.

---

**Se også:** CLAUDE.md § Policy: Databasespørringer · § Policy: Varsler · `lib/logg.ts` (event-taksonomi)
