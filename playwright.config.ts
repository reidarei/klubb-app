import { defineConfig } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

// Last .env.local manuelt (Playwright bruker ikke Next.js sin env-lasting)
const envPath = path.resolve(__dirname, '.env.local')
if (fs.existsSync(envPath)) {
  for (const linje of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmet = linje.trim()
    if (!trimmet || trimmet.startsWith('#')) continue
    const likhetstegn = trimmet.indexOf('=')
    if (likhetstegn === -1) continue
    const key = trimmet.slice(0, likhetstegn).trim()
    let val = trimmet.slice(likhetstegn + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = val
  }
}

// ─── Test-instans (#386) ─────────────────────────────────────────────────────
// ALL e2e kjører mot en dedikert Supabase-testinstans (se e2e/README.md for
// oppsett) — ALDRI mot prod. Bakgrunn: en testkjøring mot prod opprettet ekte
// poller og sendte push til alle medlemmer.
const E2E_SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? ''
const E2E_SUPABASE_ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY ?? ''
const E2E_SUPABASE_SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY ?? ''

const HAR_TEST_INSTANS = Boolean(
  E2E_SUPABASE_URL && E2E_SUPABASE_ANON_KEY && E2E_SUPABASE_SERVICE_KEY,
)

// Vakt: nekt å kjøre hvis noen (menneske eller agent) peker E2E-variablene mot
// sky-Supabase. Testene muterer data fritt — de skal fysisk ikke kunne nå prod.
if (/supabase\.(co|com)/.test(E2E_SUPABASE_URL)) {
  throw new Error(
    'E2E_SUPABASE_URL peker mot sky-Supabase. e2e kjører KUN mot lokal/selvhostet ' +
      'test-instans (#386) — se e2e/README.md.',
  )
}

// Egen port (3100) for test-dev-serveren: en vanlig `npm run dev` mot prod-DB
// kjører på 3000, og reuseExistingServer må aldri kunne gjenbruke den.
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3100'

// Innloggingen for testene er den seedede admin-brukeren fra supabase/seed.sql.
// Verdiene er ikke hemmeligheter — de finnes bare i test-instansen.
if (HAR_TEST_INSTANS) {
  // Literalen er bevisst duplisert fra SEED_PASSORD i e2e/helpers/auth.ts og
  // ikke importert derfra: auth.ts leser TEST_EPOST/TEST_PASSORD på modul-
  // last, så en import her ville evaluert modulen FØR linjene under kjørte og
  // låst begge til tom streng — hvorpå harTestCreds() ville skippet alt.
  process.env.TEST_EPOST = 'e2e-admin@klubb.test'
  process.env.TEST_PASSORD = 'e2e-lokal-hemmelighet'

  // Overstyr prod-verdiene fra .env.local i SELVE TESTPROSESSEN, ikke bare i
  // dev-server-barnet via webServer.env. Uten dette satt testrunneren igjen
  // med prod-Supabase (URL + service-key) og prod-BASE_URL i process.env —
  // og siden BLOKKER_UTSENDING i lib/varsler.ts utledes av at BASE_URL er
  // lokal, ville en spec som importerer server-kode direkte (i stedet for å
  // gå via HTTP mot :3100) truffet prod med varselvakten AV. Ingen spec gjør
  // det i dag; dette er felle-fjerning, ikke bugfiks. Se e2e/README.md
  // § Sikkerhetsmodellen.
  //
  // Rekkefølgen er trygg: dev-server-barnet arver process.env OG får
  // webServer.env på toppen, så barnet ser samme verdier uansett.
  process.env.NEXT_PUBLIC_SUPABASE_URL = E2E_SUPABASE_URL
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = E2E_SUPABASE_ANON_KEY
  process.env.SUPABASE_SERVICE_ROLE_KEY = E2E_SUPABASE_SERVICE_KEY
  process.env.NEXT_PUBLIC_BASE_URL = BASE_URL
} else {
  // Uten test-instans skal ingen spec kjøre — nullstill creds slik at
  // harTestCreds() i helpers/auth.ts gir skip med tydelig melding, selv om
  // gamle TEST_EPOST/TEST_PASSORD skulle ligge igjen i .env.local.
  delete process.env.TEST_EPOST
  delete process.env.TEST_PASSORD
}

export default defineConfig({
  testDir: './e2e',
  // Kjører ÉN gang per kjøring, i runner-prosessen — ikke per worker. Fanger
  // høyeste feil_logg.id før første test, slik at feil_logg-vakten i
  // sider-laster.spec.ts har en grense som en retry ikke kan flytte på. Se
  // e2e/global-setup.ts for hvorfor test.beforeAll ikke holdt (#539-review).
  globalSetup: './e2e/global-setup.ts',
  // Spec-ene deler én bruker og global agenda-state; parallellkjøring gir
  // kryss-interferens (f.eks. poll-cleanup sletter annens test-data).
  workers: 1,
  // En gjenglemt test.only ville lokalt bare redusert porten til én spec uten
  // at noen så det — i CI (#534) er det en usynlig hull i dekningen på hver
  // PR, så der skal Playwright nekte å starte i stedet.
  forbidOnly: !!process.env.CI,
  // CI-instansen er fersk hver gang (ingen lokal flakiness-historikk å lene seg
  // på), så vi tillater én retry der. Lokalt vil vi se feilen umiddelbart.
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: BASE_URL,
    // I CI vil vi ikke fylle artefakt-opplastingen med skjermbilder fra de
    // ~35 testene som består — kun ved feil. Lokalt vil vi fortsatt se alle
    // (bl.a. brukt av visuell.spec.ts til side-ved-side-sammenligning).
    screenshot: process.env.CI ? 'only-on-failure' : 'on',
    viewport: { width: 390, height: 844 }, // iPhone 14-størrelse
  },
  // webServer defineres kun når test-instansen er konfigurert — uten den
  // skipper alle specs uansett, og en dev-server mot tomme env-verdier ville
  // bare feilet i oppstart.
  ...(HAR_TEST_INSTANS
    ? {
        webServer: {
          command: 'npm run dev -- -p 3100',
          url: BASE_URL,
          // Lokalt vil vi gjenbruke en dev-server utvikleren allerede har
          // kjørende på :3100. I CI (#534) finnes aldri en forhåndskjørende
          // server — reuseExistingServer der ville i beste fall vært en
          // no-op, men i verste fall gjenbrukt en server fra en forrige,
          // krasjet jobb-kjøring på samme runner-image.
          reuseExistingServer: !process.env.CI,
          // CI har mer variabel oppstartstid (delt runner, kaldere cache) enn
          // en utviklers egen maskin — 180s mot 120s lokalt.
          timeout: process.env.CI ? 180_000 : 120_000,
          // Prosess-env overstyrer .env.local i Next.js — dev-serveren for
          // testene kobles til test-instansen, ikke prod. NEXT_PUBLIC_BASE_URL
          // settes til localhost slik at varsler-vakten i lib/varsler.ts
          // (BLOKKER_UTSENDING) blokkerer all push/epost-utsending.
          env: {
            NEXT_PUBLIC_SUPABASE_URL: E2E_SUPABASE_URL,
            NEXT_PUBLIC_SUPABASE_ANON_KEY: E2E_SUPABASE_ANON_KEY,
            SUPABASE_SERVICE_ROLE_KEY: E2E_SUPABASE_SERVICE_KEY,
            NEXT_PUBLIC_BASE_URL: BASE_URL,
            // Pinnes eksplisitt til 'false': barnet arver process.env, så en
            // ALLOW_LOCAL_NOTIFICATIONS=true som en utvikler har lagt i
            // .env.local for feilsøking ville ellers sluppet e2e-suiten
            // (som med vilje kjører hele varsel-cronen) helt frem til
            // sendEpostBatch/sendPush med prod-Resend- og VAPID-nøkler.
            ALLOW_LOCAL_NOTIFICATIONS: 'false',
          },
        },
      }
    : {}),
  projects: [
    // RLS-suiten (#533) kjøres FØRST og HELT UAVHENGIG av setup/chromium:
    // spec-ene tar ingen `page`-fixture (de snakker direkte med supabase-js/
    // fetch, se e2e/README.md § RLS-tester), så de trenger verken en dev-
    // server-session eller `auth.setup.ts` sin lagrede storageState. Ingen
    // `dependencies`, ingen `storageState` — bevisst, ikke en forglemmelse:
    // sikkerhetsgrensen skal gi raskest mulig feedback, og skal aldri kunne
    // gå glipp av å kjøre fordi setup-prosjektet feilet.
    //
    // Presisering: spec-ene BRUKER ikke dev-serveren, men de venter fortsatt
    // på den. `webServer` over er global i Playwright og startes før alle
    // prosjekter — også ved `--project=rls`. Vi gjør den ikke betinget: det
    // ville krevd å utlede prosjektvalget fra process.argv i configen, som er
    // mer risiko (en feiltolkning skrur av serveren for HELE suiten) enn de
    // sekundene det sparer.
    {
      name: 'rls',
      testMatch: /rls[\\/].*\.spec\.ts$/,
    },
    // Setup-prosjektet logger inn én gang og lagrer session til disk.
    // Reduserer auth-kall fra én per spec til én per kjøring. Se #381.
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      // Eksplisitt testMatch: kjør kun .spec.ts. Uten dette faller vi tilbake
      // på Playwrights default som riktignok ekskluderer .setup.ts, men det er
      // en implisitt avhengighet — vi vil ikke at auth.setup.ts skal kjøres to
      // ganger (én gang som setup-prosjekt, én gang her). Se #381.
      testMatch: /\.spec\.ts$/,
      // rls/-mappen har sitt EGET prosjekt over og skal aldri også kjøre her
      // — uten denne linjen (ikke betinget av CI, i motsetning til
      // unntakene under) ville hver RLS-spec kjørt to ganger på enhver
      // maskin. De to øvrige unntakene gjelder KUN i CI (#534):
      // - visuell.spec.ts fanger hver rute i try/catch og lagrer et
      //   skjermbilde uansett status — en 500-side blir «ok» der, så den
      //   asserterer i praksis ingenting. Den er et verktøy for MANUELL
      //   sammenligning mot Design/skjermbilder/, ikke en regresjonstest.
      // - readme-skjermbilder.spec.ts krever ekte medlemsnavn/prod-data (se
      //   e2e/README.md) og produserer «riktige men tomme» bilder mot
      //   test-instansens fiktive seed-data — ingen verdi i CI.
      // Lokal kjøring er upåvirket utover rls-utelatelsen: de to CI-spesifikke
      // unntakene er fortsatt tom liste utenfor CI.
      testIgnore: [
        /rls[\\/]/,
        ...(process.env.CI ? [/visuell\.spec\.ts$/, /readme-skjermbilder\.spec\.ts$/] : []),
      ],
      use: {
        // Bevisst INGEN devices['Desktop Chrome']-spread her: prosjekt-use
        // overstyrer global use, og desktop-presetet ville byttet ut
        // mobil-viewporten (390×844) som visuell/README-skjermbildene
        // baserer seg på. Kun storageState legges til. Se #381.
        storageState: 'e2e/.auth/state.json',
      },
      dependencies: ['setup'],
    },
  ],
})
