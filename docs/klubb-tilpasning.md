# Klubb-tilpasning

Denne guiden beskriver hva som må (eller bør) endres for å tilpasse appen til din egen klubb.

---

## 1. Klubbidentitet

Alle klubb-spesifikke tekstverdier samles i `lib/klubb-config.ts`. Verdiene leses fra `NEXT_PUBLIC_`-env-vars med hardkodede defaults som fallback. Det betyr at eksisterende deploy ikke endrer seg om du ikke setter env-varsene — men du bør sette dem alle for din instans.

| Env-var | Default | Beskrivelse | Eksempel |
|---|---|---|---|
| `NEXT_PUBLIC_KLUBB_NAVN` | `Min Klubb` | Fullt navn, brukes i titler og e-postutsendelser | `Bygdøy Vinterklubb` |
| `NEXT_PUBLIC_KLUBB_KORTNAVN` | `Klubben` | Kort navn, brukes i navigasjon og push-varsler | `Vinterklubb` |
| `NEXT_PUBLIC_KLUBB_NAVN_LINJE_1` | `Min` | Første linje i to-linjers hero-typografi (klubbinfo-siden, jubileumskort) | `Bygdøy` |
| `NEXT_PUBLIC_KLUBB_NAVN_LINJE_2` | `Klubb` | Andre linje i to-linjers hero-typografi | `Vinterklubb` |
| `NEXT_PUBLIC_KLUBB_BESKRIVELSE` | `Privat klubbapp for Min Klubb` | PWA-beskrivelse (manifest og meta-tags) | `Privat klubbapp for Bygdøy Vinterklubb` |
| `NEXT_PUBLIC_KLUBB_DOMENE` | `klubb.example.com` | Kun hostname — brukes som base for prod-URL og i ICS-UID/PRODID. Må være ASCII, ingen mellomrom eller skråstrek. | `bygdoyvinterklubb.no` |
| `NEXT_PUBLIC_KLUBB_STIFTET_AAR` | `2024` | Stiftelsesår — brukes til å beregne jubileum på agendaen | `2015` |
| `NEXT_PUBLIC_KLUBB_STIFTET_MAANED` | `1` | Stiftelsesmåned (1–12) | `3` |
| `NEXT_PUBLIC_KLUBB_STIFTET_DAG` | `1` | Stiftelsesdag (1–31) | `17` |
| `NEXT_PUBLIC_KLUBB_STED` | `Oslo` | Stiftelsessted, vises på klubbinfo-siden | `Frogner` |
| `NEXT_PUBLIC_KLUBB_OM` | generisk plassholder | «Om klubben»-avsnittene på klubbinfo-siden. Flere avsnitt separeres med `\|` | `Stiftet over en pils.\|Vi møtes hver måned.` |
| `NEXT_PUBLIC_KLUBB_MEDLEMMER_TITTEL` | `Medlemmene` | Overskrift på medlemslisten | `Gutta` |
| `NEXT_PUBLIC_DATA_LOKASJON` | *(instruktiv tekst om å sette variabelen)* | Personvern-teksten på `/om-appen` som forklarer medlemmene hvor deres data lagres. Sett denne til en beskrivelse av hvilke leverandører og regioner DIN instans bruker (Supabase-region, Cloudflare R2 bucket, Vercel-region osv.). | `Database hos Supabase i Stockholm. Bilder lagres i Cloudflare R2, EU-bucket. Hosting hos Vercel i Frankfurt-region.` |
| `NEXT_PUBLIC_ROLLE_TITTEL_GENERALSEKRETAER` | `Generalsekretær` | Visningsnavn for den særegne rollen med gul glød. Rolle-koden i DB (`generalsekretaer`) endres ikke. | `Æresmedlem` |

Sett disse i `.env.local` lokalt og som Vercel Environment Variables i produksjon.

> Merk at `NEXT_PUBLIC_KLUBB_DOMENE` kun er en identifikator — den brukes ikke til å generere live lenker. `BASE_URL` i `lib/config.ts` håndterer actual-URL. Defaults er generiske plassholdere — overstyres disse med dine egne verdier når du setter opp instansen.

---

## 2. Ikoner og favicon

Disse filene i `public/` må byttes ut med dine egne bilder:

| Fil | Dimensjoner | Bruk |
|---|---|---|
| `public/favicon-16.png` | 16 × 16 px | Browser-fane (liten) — referert fra `app/layout.tsx` og `public/sw.js` |
| `public/favicon-32.png` | 32 × 32 px | Browser-fane (normal) — referert fra `app/layout.tsx` og `public/sw.js` |
| `public/icon-192.png` | 192 × 192 px | PWA-ikon, hjemskjerm — referert fra `manifest.ts`, `layout.tsx`, `sw.js` (også som push-badge) |
| `public/icon-512.png` | 512 × 512 px | PWA-ikon, splash-screen — referert fra `manifest.ts`, `layout.tsx`, `sw.js` og login-siden som logo |
| `public/icon-180.png` | 180 × 180 px | Apple Touch Icon (iOS hjemskjerm) — referert fra `app/layout.tsx` og `sw.js` |
| `public/icon-maskable-192.png` | 192 × 192 px | PWA-ikon med «safe zone» for adaptiv maskering (Android) |
| `public/icon-maskable-512.png` | 512 × 512 px | PWA-ikon med «safe zone» for adaptiv maskering (Android) |
| `public/bakgrunn.jpg` | Fri størrelse | Bakgrunnsbilde brukt på login-siden |

Filene `public/icon-1024.png` og `public/icon-2000.png` ligger i repoet som høyoppløselige master-bilder for fremtidig bruk (App Store-ikon, marketing), men refereres ikke i kode i dag. Du kan ignorere dem eller fjerne dem.

PWA-manifestet (`app/manifest.ts`) er allerede koblet til klubbnavnet via env-vars og peker på de to PWA-ikonene (192 og 512). Du trenger ikke endre kode — bare bytt bildefilene med samme filnavn.

For maskable-ikonene: selve motivet bør holdes innenfor en sirkel på ca. 80 % av bildeflaten («safe zone»). Verktøy som [maskable.app](https://maskable.app) lar deg forhåndsvise resultatet.

---

## 3. Farger og tema

Farger styres av CSS custom properties i **`app/globals.css`**. Det finnes ingen `tailwind.config.ts` — Tailwind v4 trenger den ikke. Tokenene bindes til Tailwind-utilities via `@theme inline`, slik at f.eks. `bg-accent` plukker `--accent` av seg selv. Komponenter bruker enten `var(--token)` eller Tailwind-klassen.

**Regelen i kodebasen:** ikke hardkod hex- eller rgba-verdier i komponenter. Bruk en eksisterende token, eller legg til en ny i `globals.css` og referer den. De få stedene som bryter regelen har en kommentar som forklarer hvorfor (avatar-farger, rene grafiske elementer, e-postmaler som ikke støtter CSS-variabler).

Temaet er brukerstyrt med tre valg — system, mørkt, lyst. `:root` holder mørke defaults, speilet i `[data-theme="dark"]` og overstyrt i `[data-theme="light"]`.

For JS-kontekster som ikke kan lese CSS-variabler — PWA-manifestet, e-postmaler og ICS-filer — finnes et tynt speil i **`lib/tema.ts`**. Endrer du bakgrunns- eller aksentfargen gjennomgående, oppdater den også, ellers spriker splash-skjermen og e-postene fra appen.

### Slik bytter du klubbens farger

Fire env-vars overstyrer brand-fargene uten at du rører koden:

| Env-var | Standardverdi | Beskrivelse |
|---|---|---|
| `NEXT_PUBLIC_KLUBB_FARGE_PRIMAER` | `#e8d9b5` | Aksentfarge (sand/beige) |
| `NEXT_PUBLIC_KLUBB_FARGE_PRIMAER_SOFT` | `rgba(232, 217, 181, 0.16)` | Myk aksent, brukt på bakgrunnsflater |
| `NEXT_PUBLIC_KLUBB_FARGE_PRIMAER_HOT` | `#f5e8c8` | Hover- og aktiv-tilstand |
| `NEXT_PUBLIC_KLUBB_FARGE_BAKGRUNN` | `#0e0f13` | Primær bakgrunn |

Sett dem i `.env.local` lokalt og som Environment Variables i Vercel i produksjon. De injiseres som en inline `<style>` i `<head>`, så `globals.css` forblir uendret — identiteten kommer inn ved deploy, ikke i kildekoden.

Skal du lenger enn de fire aksentfargene — bygge en helt egen palett — er det en manuell jobb i `globals.css`. Men for «gjør appen til vår» holder env-varene.

---

## 4. Roller

### De tre rollene

Appen har tre faste roller definert i `lib/roller.ts`:

| Rollekode (i DB) | Standardtittel | Har admin-rettigheter | Gul glød | Løser tiebreak |
|---|---|---|---|---|
| `medlem` | Medlem | Nei | Nei | Nei |
| `admin` | Admin | Ja | Nei | Nei |
| `generalsekretaer` | Generalsekretær | Ja | Ja | Ja |

Tittelen for `generalsekretaer`-rollen kan overstyres via env-var `NEXT_PUBLIC_ROLLE_TITTEL_GENERALSEKRETAER` (se tabell i seksjon 1). Rolle-koden i databasen endres ikke.

### Viktig: nye roller krever migrasjon

Rettighetsmatrisen i `lib/roller.ts` er kun kode-siden. Databasen har sin egen `er_admin()`-SQL-funksjon som brukes i alle RLS-policies. Denne returnerer `true` for `admin` og `generalsekretaer` — ingen andre roller. Hvis du legger til en ny rolle med admin-rettigheter i matrisen, **må du også oppdatere `er_admin()` i en ny migrasjon**. Uten dette vil RLS blokkere den nye rollen uansett hva kode-siden sier.

### Generalsekretær settes via UI

Etter opprettelse av et medlem settes generalsekretær-rollen via Innstillinger → Medlemmer → Rediger → «Generalsekretær»-toggle. Databasen håndhever at maks én person har rollen (partial unique index, migrasjon 094).

---

## 5. Arrangement-maler og arrangøransvar

Hvilke faste arrangementer som finnes (møter, turer, o.l.) og hvem som er ansvarlig for dem hvert år, er **data** i databasen — ikke hardkodet i koden.

Dette styres i `arrangoransvar`-tabellen. Kolonnene `aar`, `arrangement_navn` og `type` (moete|tur) bestemmer hva som vises i nedtrekk-menyen «Type arrangement» når en bruker oppretter et nytt arrangement.

For å sette opp ditt eget årshjul:

1. Logg inn som admin.
2. Gå til **Arrangoransvar** i menyen.
3. Opprett ansvar for hvert fast arrangement per år — hvem som er ansvarlig og for hva.

Arrangement-navnene du skriver der, vises som valg i nedtrekk-menyen. Det er ingen forhåndsdefinert liste i koden.

---

## 6. Andre miljø-avhengige verdier

Utover klubbidentiteten i seksjon 1 har `lib/config.ts` flere verdier med hardkodede defaults. **Disse må overstyres med dine egne verdier i Vercel-env-vars og `.env.local`** før din instans tas i bruk.

| Env-var | Default i koden | Hva den styrer | Når må den settes? |
|---|---|---|---|
| `NEXT_PUBLIC_BASE_URL` | Ingen — **påkrevd i produksjon** (`VERCEL_ENV=production`), bygget stopper uten den. Preview: utledes fra `VERCEL_URL` *hvis* du ikke setter variabelen på Preview-scopet — setter du den der, vinner den. Lokalt prod-bygg uten Vercel: `https://<KLUBB_DOMENE>` | Absolutte URL-er i e-postvarsler/ICS/GitHub-webhook-lenker, OG grunnlaget push-varsler normaliseres relativt til (Service Workeren avviser kryss-origin-URL-er) | **Må settes** til den kanoniske verten instansen din faktisk serveres fra — inkludert et eventuelt «www.»-subdomene. Feil verdi her (f.eks. apex mens appen serveres fra www) gjør at push-varsler leveres, men at klikk på dem lander på forsiden i stedet for siden de gjaldt. |
| `VAPID_CONTACT_EMAIL` | *(ingen — push feiler med tydelig melding uten)* | Kontakt-e-post i VAPID-headere — push-tjenester (Apple/Google) bruker den ved misbruk eller tekniske problemer. Ingen e-post sendes via denne — kun metadata. | **Må settes** for din instans. Bruk en e-post du faktisk leser. |
| `NEXT_PUBLIC_GITHUB_REPO` | `reidarei/klubb-app` | Hvilket GitHub-repo «innspill»-funksjonen leser issues fra | Sett til ditt eget repo (`brukernavn/reponavn`) hvis du bruker innspill-funksjonen. |
| `NEXT_PUBLIC_GITHUB_ONSKE_LABEL` | `ønske` | Hvilken issue-label som regnes som brukerønske | Bytt hvis du vil bruke en annen label-konvensjon. |
| `NEXT_PUBLIC_R2_PUBLIC_URL` (eller `R2_PUBLIC_URL`) | `''` (tom) | Public CDN-URL hvor bilder hentes fra (`https://<din-pub-id>.r2.dev` eller custom domain) | **Må settes** — bilder vises ikke uten. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Ingen | R2-credentials og bucket-navn (server-side; ALDRI med `NEXT_PUBLIC_`-prefiks) | **Må settes** for bildelagring. Marker som «Sensitive» i Vercel. |

### Fondssiden

Bruker klubben fondsfunksjonen, styres kontoinformasjonen av disse. Alle er `NEXT_PUBLIC_`, altså synlige for innloggede medlemmer i klientbundelen — sett aldri noe her du ikke vil at hele klubben skal se.

| Env-var | Default i koden | Hva den styrer |
|---|---|---|
| `NEXT_PUBLIC_FOND_KONTONUMMER` | `''` (tom) | Kontonummeret innskudd betales til. Tom verdi skjuler hele blokka med betalingsoppfordring |
| `NEXT_PUBLIC_FOND_KONTOEIER` | `kassereren` | Hvem kontoen står i navnet til. Brukes i forklaringen av rentefordeling |
| `NEXT_PUBLIC_FOND_FAST_TREKK_FORSLAG` | `500 kr` | Foreslått månedlig fast trekk, vist som oppfordring |

---

## 7. Endringslogg («Hva er nytt»)

Under «Om appen» vises en valgfri endringslogg som dokumenterer hva som er nytt i appen — både manuellt skrevne oppføringer (fra deg som eier) og automatisk utledede «mindre»-rader som reflekterer versjonsspreng.

Endringsene lagres i `lib/endringslogg-data.ts`. Filen starter tom og produserer en tom liste — seksjonen «Hva er nytt» skjules da fra medlemmene.

For å fylle inn dine egne oppføringer:

```ts
// lib/endringslogg-data.ts
import type { Endring } from '@/lib/endringslogg'

export const ENDRINGER: Endring[] = [
  {
    versjon: '1.2.0',
    dato: '2026-03-15',
    tittel: 'Nytt medlemskort med QR-kode',
    beskrivelse: 'Medlemmene kan nå vise sitt medlemskort som QR-kode på Steder-kartet.'
  },
  {
    versjon: '1.1.0',
    dato: '2026-02-01',
    tittel: 'Albumer er her',
    beskrivelse: 'Bilder fra arrangementene samles nå i separate album med lightbox-visning.'
  },
  // … flere oppføringer, nyeste først
]
```

**Retningslinjer:**
- Legg til oppføringer **nyeste først**
- Terskelen er: **«Merker et medlem dette?»** — rene refaktorer og test-dekning hører ikke hjemme
- Versjonnummeret skal matche det i `lib/versjon.json` (stampes automatisk før hver deploy via `npm run stamp-versjon`)
- Dato brukes kun i endringsloggen selv (ikke til versjonsstyring) — formatet er ISO (`YYYY-MM-DD`)

Hvis `ENDRINGER`-listen er tom, skjules hele seksjonen fra medlemmene.

