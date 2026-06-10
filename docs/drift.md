# Driftsguide

Denne guiden er for den som administrerer klubb-instansen løpende. Den forutsetter at appen allerede er satt opp — se [docs/oppsett.md](oppsett.md) for førstegangs-oppsett.

---

## 1. Legge til og administrere medlemmer

### Legge til nytt medlem

1. Logg inn som admin.
2. Gå til **Klubbinfo** → **Medlemmer** → «Legg til medlem».
3. Fyll inn navn og e-postadresse. Appen oppretter brukeren og genererer et **midlertidig passord**, som både vises i admin-UI-et og sendes til medlemmet i velkomst-e-post via Resend.
4. Etter første innlogging kan brukeren selv endre passord og redigere profilen (profilbilde, fødselsdato, varsel-innstillinger) under «Rediger profil».

### Deaktivere et medlem

Appen har bevisst en svært tilbakeholden slettings-modell for å bevare historikk i kåringer, påmeldinger og chat. Hard delete er ikke eksponert som vanlig drifts-handling — det finnes en «Slett medlem»-knapp i admin-redigering, men i praksis brukes deaktivering:

1. Klubbinfo → Medlemmer → velg personen → Rediger.
2. Under «Tilgang» → **Status**, velg segmentet **Deaktivert**.

En deaktivert bruker vises ikke i listen over påmeldte og kan ikke logge inn, men historiske data beholdes. Faktisk sletting (hard delete) av en profil bør gjøres via SQL hvis det noen gang trengs — kontakt utvikler.

### Sette generalsekretær

Bare én person kan ha generalsekretær-rollen. Den settes via Klubbinfo → Medlemmer → velg person → Rediger → «Generalsekretær»-toggle. Databasen avviser forsøk på å sette rollen på to personer samtidig.

---

## 2. Testmodus for varsler

Testmodus begrenser varsel-utsendelse til én bestemt e-postadresse i stedet for alle aktive brukere. Nyttig når du vil teste et oppsett uten å sende til hele klubben.

### Slå på/av testmodus

Testmodus styres i appen: **Innstillinger → «Testmodus»** (siden er kun synlig for admins). Togglen skrur testmodus på/av, og nedtrekkslisten rett under velger hvilken admin som mottar varslene. Når togglen er på, sender `sendVarsel()` kun til den valgte test-eposten, uansett hvem som faktisk skal varsles.

Bare aktive admin-profiler kan velges som test-mottaker — det garanterer at varsler i testmodus aldri havner hos et vanlig medlem, og at mottakeren alltid finnes i `profiles` (ellers ville varselet droppes stille).

### Lokalt utviklingsmiljø

Apper som kjører mot `localhost` blokkerer varsler automatisk (for å unngå at testdataene dukker opp på ekte mobiler). Denne sperren overstyres ved å sette `ALLOW_LOCAL_NOTIFICATIONS=true` i `.env.local` — men bruk det med omhu.

---

## 3. Varsel-feilsøking

### varsel_logg-tabellen

Alle utsendte push-varsler og e-poster logges i `varsel_logg`-tabellen. Kolonner av interesse:

| Kolonne | Innhold |
|---|---|
| `profil_id` | Hvem varselet ble sendt til |
| `type` | Varseltype (f.eks. `paaminne_7`, `ny_kommentar`, `purring`) |
| `kanal` | `push`, `epost`, eller `begge` |
| `tittel` / `melding` | Innholdet som ble sendt |
| `arrangement_id` | Koblet arrangement, om relevant |
| `opprettet` | Tidspunkt for utsendelse |

Spørring i SQL-editor for å se de siste varslene:

```sql
SELECT * FROM varsel_logg
ORDER BY opprettet DESC
LIMIT 50;
```

### Vanlige feil

**Push-varsler ankommer ikke:**
- Sjekk at `NEXT_PUBLIC_VAPID_PUBLIC_KEY` og `VAPID_PRIVATE_KEY` er satt og stemmer overens (de genereres som par).
- Sjekk at brukeren har godkjent push-tillatelse i nettleseren og slått på varsler under Profil → Innstillinger → Varsler.
- Push-abonnementer har begrenset levetid — brukeren må åpne appen for å fornye abonnementet.

**E-poster ankommer ikke:**
- Sjekk at `RESEND_API_KEY` er satt.
- Sjekk at domenet ditt er verifisert i Resend Dashboard.
- Resend har sending-kvote på gratis-plan — sjekk om kvoten er nådd.

**Cron-påminnelser kjører ikke:**
- Gå til GitHub → Actions → fanen for `paaminne.yml` og se loggene for siste kjøring.
- `401`-feil betyr at `CRON_SECRET` i GitHub Actions-secrets ikke stemmer med Vercel env-var `CRON_SECRET`.
- Sjekk at `APP_URL` i GitHub Actions-secrets peker til riktig prod-URL uten trailing slash.

---

## 4. Migrasjoner ved oppgradering

Når du oppdaterer kodebasen fra repoet, sjekk alltid om det er nye migrasjoner:

```bash
# Se om det er nye filer i supabase/migrations/ siden forrige kjøring
git log --oneline supabase/migrations/

# Kjør migrasjoner mot prod-databasen
npx supabase db push

# Regenerer TypeScript-typer (nødvendig hvis nye tabeller/kolonner er lagt til)
npx supabase gen types typescript --project-id <prosjekt-id> > lib/supabase/database.types.ts
```

Migrasjoner kjøres sekvensielt og er idempotente — det er trygt å kjøre `db push` selv om ingen nye filer er lagt til.

Se [docs/oppsett.md](oppsett.md) for full referanse til oppsett-kommandoene.

---

## 5. Backup

Supabase tar automatisk daglig backup av databasen. Slik finner du dem:

1. Supabase Dashboard → ditt prosjekt → **Database** → **Backups**.
2. Her vises daglige backups med mulighet for restore-on-demand (krever Pro-plan eller høyere) og point-in-time recovery.

Backup av bilder (Cloudflare R2) er ikke automatisk — R2 har ingen innebygd snapshot-funksjon på fri-tier. Kritiske bilder bør kopieres manuelt ved behov.

> Merk: automatisk backup finnes, men restore er ikke testet for denne appen. Test restore-prosessen på en dev-instans før du trenger den i krise.

---

## 6. Sikkerhet

En fullstendig gjennomgang av sikkerhetsmodellen er dokumentert i [docs/sikkerhetsgjennomgang-2026-06.md](sikkerhetsgjennomgang-2026-06.md). Viktigste punkter for løpende drift:

- Roter `VAPID_PRIVATE_KEY`, `RESEND_API_KEY`, `CRON_SECRET` og R2-nøklene ved mistanke om lekkasje — alle er enkle å regenerere.
- `SUPABASE_SERVICE_ROLE_KEY` omgår RLS. Oppbevar den som «Sensitive» i Vercel og aldri i kildekode.
- Admin-rettigheter i appen er ikke det samme som tilgang til Supabase Dashboard eller Vercel. Kontroller hvem som er invitert til disse tjenestene separat.
