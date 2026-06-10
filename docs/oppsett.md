# Oppsett fra scratch

Denne guiden beskriver hvordan du setter opp en ny instans av appen fra bunnen av. Bruk den ved nytt Supabase-prosjekt, testinstans eller katastrofegjenoppretting.

---

## Oversikt over komponenter

| Komponent | Hva det er | Hvor du oppretter det |
|---|---|---|
| **Vercel** | Hosting og CI/CD | vercel.com |
| **Supabase** | Database (Postgres + RLS), Auth, Realtime | supabase.com |
| **Cloudflare R2** | Bildelagring (S3-kompatibel, CDN) | dash.cloudflare.com |
| **Resend** | Transaksjonell e-post | resend.com |
| **VAPID-nøkler** | Web Push (push-varsler) | genereres lokalt |
| **GitHub Actions-cron** | Daglig påminnelsesjobb | `.github/workflows/paaminne.yml` (allerede i repoet) |

---

## Forutsetninger

- Node 20+
- Supabase CLI (`npm install -g supabase`)
- Git og GitHub-konto med tilgang til repoet
- Vercel-konto koblet til GitHub-repoet

---

## 1. Klon og installer

```bash
git clone <ditt-repo-url>
cd <ditt-repo>
npm install
```

---

## 2. Supabase-prosjekt

1. Opprett nytt prosjekt på [supabase.com](https://supabase.com).
2. Koble CLI til prosjektet:
   ```bash
   npx supabase login
   npx supabase link --project-ref <prosjekt-id>
   ```
3. Kjør alle migrasjoner (oppretter tabeller, RLS-policies, funksjoner):
   ```bash
   npx supabase db push
   ```
   Migrasjonsfilene ligger i `supabase/migrations/` og kjøres sekvensielt.

4. Regenerer TypeScript-typer etter migrasjon:
   ```bash
   npx supabase gen types typescript --project-id <prosjekt-id> > lib/supabase/database.types.ts
   ```

**Storage-buckets:** Opprettes automatisk av migrasjon 017 (`arrangement_bilder`) og 037 (`profilbilder`). Du trenger ikke opprette dem manuelt.

---

## 3. Cloudflare R2

1. Logg inn på [dash.cloudflare.com](https://dash.cloudflare.com) → R2.
2. Opprett ny bucket (f.eks. `herreklubben-bilder`).
3. Aktiver «Public access» på bucketen (bilder hentes direkte av klienten).
4. Opprett API-token med «Object Read & Write»-tilgang for bucketen.
5. Kopier: `Account ID`, `Access Key ID`, `Secret Access Key`, `Public URL`.

---

## 4. VAPID-nøkler (Web Push)

```bash
npx web-push generate-vapid-keys
```

Kopier `Public Key` og `Private Key` fra output.

---

## 5. Resend (e-post)

1. Opprett konto på [resend.com](https://resend.com).
2. Legg til og verifiser domenet ditt (eller bruk `@resend.dev` for testing).
3. Opprett API-nøkkel med «Sending access».

---

## 6. Miljøvariabler

Kopier malen og fyll inn:

```bash
cp .env.example .env.local
# rediger .env.local med verdiene fra stegene over
npm run sjekk-miljo   # verifiserer kritiske variabler
```

Sjekk `sjekk-miljo`-scriptet for alle påkrevde variabler. Kritiske er:
- `NEXT_PUBLIC_SUPABASE_URL` og `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `NEXT_PUBLIC_R2_PUBLIC_URL`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`
- `RESEND_API_KEY`

---

## 7. Første admin

### Primær fremgangsmåte: Supabase Dashboard (anbefalt)

Dette er den tryggeste og enkleste veien for en engangsoperasjon:

1. Gå til Supabase Dashboard → Authentication → Users → «Add user».
2. Fyll inn e-post og passord.
3. Gå til SQL-editoren og kjør:
   ```sql
   UPDATE profiles
   SET rolle = 'admin',
       navn  = 'Ditt navn'
   WHERE epost = 'din@epost.no';
   ```
4. Logg inn i appen og bytt passordet under Profil → Rediger.

### Alternativ: init-admin-script

For scripted oppsett eller gjenoppretting. Scriptet nekter å kjøre mot kjent prod-instans og mot en instans med eksisterende profiler.

```bash
node --env-file=.env.local scripts/init-admin.mjs din@epost.no "Ditt navn"
```

Passordet skrives til `./init-admin-passord.txt` (aldri til stdout). Slett filen straks etter bruk. Se kommentarer i scriptet for tre-lags sikkerhetssjekker.

---

## 8. Vercel-deploy

1. Koble repoet til Vercel (Import Project på vercel.com).
2. Legg til alle miljøvariabler fra `.env.local` som Vercel Environment Variables.
   - `R2_SECRET_ACCESS_KEY` og `VAPID_PRIVATE_KEY`: merk som «Sensitive».
3. Trigger deploy (push til `main` deployer automatisk).

**`CRON_SECRET` og `APP_URL`:** Disse settes to steder med **identisk verdi** og **ingen trailing slash**:
- `CRON_SECRET`: Vercel env-var (runtime-sjekk i cron-endepunktet) + GitHub Actions-secret (sendes som `Authorization`-header).
- `APP_URL`: GitHub Actions-secret (peker cron-jobben til prod-URL). Brukes ikke av appen i runtime.

Mismatch eller manglende verdi gir `401` fra `/api/cron/paaminne`.

---

## 9. GitHub Actions-secrets

For at daglig påminnelsesjobb (`.github/workflows/paaminne.yml`) skal virke:

| Secret | Verdi |
|---|---|
| `CRON_SECRET` | Samme som Vercel env-var `CRON_SECRET` |
| `APP_URL` | Prod-URL uten trailing slash, f.eks. `https://din-klubb.example.com` |

Se `.github/workflows/paaminne.yml` for secret-oppsett-referanse.

---

## 10. Sett generalsekretær

Generalsekretær settes i appen etter at første admin er opprettet:

1. Logg inn som admin.
2. Gå til Klubbinfo → Medlemmer → velg riktig person → Rediger.
3. Skru på «Generalsekretær»-togglen (bekreft dialogen).

Maks én generalsekretær er garantert av databasen (migrasjon 094: partial unique index + atomisk RPC).

---

## Feilsøking

### `42501` fra Supabase (PostgREST)

Betyr at Data API-rollen mangler `GRANT` på tabellen. Kjør `npx supabase db push` på nytt — migrasjon 086 gir eksplisitte grants til alle tabeller. Fra oktober 2026 håndheves dette på alle Supabase-prosjekter.

### `401` fra `/api/cron/paaminne`

`CRON_SECRET` i GitHub Actions-secrets stemmer ikke med Vercel env-var `CRON_SECRET`. Verdiene **må** være identiske. Sjekk at det ikke er trailing whitespace i noen av dem.

### Push-varsler virker ikke

- Sjekk at `NEXT_PUBLIC_VAPID_PUBLIC_KEY` og `VAPID_PRIVATE_KEY` er satt korrekt.
- Sjekk at brukeren har slått på push under Profil → Innstillinger → Varsler.
- Sjekk `varsel_logg`-tabellen i Supabase for eventuelle feilmeldinger.

### Bilder lastes ikke

- Sjekk at `NEXT_PUBLIC_R2_PUBLIC_URL` peker til riktig R2-bucket-URL.
- Sjekk at bucketen har «Public access» aktivert i Cloudflare Dashboard.

---

## Neste steg

Etter at appen er oppe og første admin er innlogget, se **[docs/klubb-tilpasning.md](klubb-tilpasning.md)** for å bytte navn, ikoner og annen klubbidentitet. Drifts-guiden for løpende vedlikehold finnes i **[docs/drift.md](drift.md)**.
