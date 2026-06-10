# Bidra til klubb-app

Takk for at du vurderer å bidra! Dette prosjektet er bygget for én klubb og
publisert slik at andre vennegjenger kan kjøre sin egen instans. Bidrag som
gjør appen bedre for alle instanser er velkomne.

## Før du starter

- Sjekk eksisterende issues før du oppretter et nytt.
- For større endringer: opprett et issue og beskriv idéen først, så vi er
  enige om retningen før du bruker tid på kode.
- Klubbspesifikke tilpasninger (egne farger, egne sider) hører hjemme i din
  egen fork — ikke i dette repoet. Konfigurerbarhet via miljøvariabler
  (se `lib/klubb-config.ts`) er derimot velkomment.

## Norsk konvensjon — viktig å vite

Dette prosjektet bruker **norsk** i både UI-tekst, databasekolonner og
identifikatorer. Det er et bevisst valg: appen er laget for norske
vennegjenger, og koden leses lettest når domenespråket matcher.

- Databasekolonner: `opprettet_av`, `start_tidspunkt`, `paamelding`
- Funksjoner og variabler: `hentMalValg()`, `sendVarsel()`, `norskDatoNaa()`
- UI-tekst: Oslo-østkant-tone («gutta», a-endelser)
- Tekniske begreper forblir engelske der det er vanligst (commit-meldinger
  kan være norske eller engelske)

## Oppsett

Se [docs/oppsett.md](docs/oppsett.md) for komplett guide. Kortversjon:

```bash
npm install
cp .env.example .env.local   # fyll inn verdiene
npm run sjekk-miljo          # validerer miljøvariablene
npm run dev
```

## Kodestil og arkitektur

`CLAUDE.md` i rot er den autoritative beskrivelsen av arkitektur og policies
(varsler, roller, tidshåndtering, auth, konstanter m.m.). Les den før du
endrer kode — policyene gjelder også for bidrag. De viktigste:

- All utgående kommunikasjon via `sendVarsel()` (`lib/varsler.ts`)
- All tidshåndtering via `lib/dato.ts` (`Europe/Oslo`)
- Rollesjekker via hjelperne i `lib/roller.ts` — aldri sammenlign
  rolle-strenger direkte
- Autorisasjon i server actions via `ensureAdmin()` / `ensureInnlogget()`
- Nye tabeller trenger eksplisitte `GRANT`-statements (se Policy: Migrasjoner)

## Tester og verifisering

```bash
npm run lint          # ESLint
npm test              # Vitest enhets-tester
npx playwright test   # E2E (krever kjørende instans, se e2e/README.md)
npm run build         # produksjonsbygg skal være grønt
```

Kjør lint + test + build før du åpner PR.

## Pull requests

- Hold PR-er små og fokuserte — én endring per PR.
- Beskriv *hvorfor*, ikke bare *hva*.
- Migrasjoner: nye SQL-filer i `supabase/migrations/` med fortløpende
  nummerering. Aldri endre en eksisterende migrasjon — skriv en ny.
- Etter migrasjonsendringer: regenerer `lib/supabase/database.types.ts`.
