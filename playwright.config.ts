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
// ALL e2e kjører mot en dedikert testinstans, ALDRI prod (se e2e/README.md).
const E2E_SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? ''
const E2E_SUPABASE_ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY ?? ''
const E2E_SUPABASE_SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_KEY ?? ''

const HAR_TEST_INSTANS = Boolean(
  E2E_SUPABASE_URL && E2E_SUPABASE_ANON_KEY && E2E_SUPABASE_SERVICE_KEY,
)

// Testene muterer data fritt — de skal fysisk ikke kunne nå sky-Supabase.
if (/supabase\.(co|com)/.test(E2E_SUPABASE_URL)) {
  throw new Error(
    'E2E_SUPABASE_URL peker mot sky-Supabase. e2e kjører KUN mot lokal/selvhostet ' +
      'test-instans (#386) — se e2e/README.md.',
  )
}

// Egen port (3100) så en vanlig `npm run dev` mot prod-DB på 3000 aldri gjenbrukes.
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3100'

// Seedet admin-bruker fra supabase/seed.sql — ikke hemmeligheter.
if (HAR_TEST_INSTANS) {
  // Duplisert fra SEED_PASSORD i e2e/helpers/auth.ts med vilje: auth.ts leser
  // env på modul-last, så en import herfra ville låst begge til tom streng.
  process.env.TEST_EPOST = 'e2e-admin@klubb.test'
  process.env.TEST_PASSORD = 'e2e-lokal-hemmelighet'

  // Overstyr prod-verdiene i SELVE TESTPROSESSEN, ikke bare i webServer.env:
  // en spec som importerer server-kode direkte ville ellers truffet prod med
  // varselvakten (BLOKKER_UTSENDING utledes av BASE_URL) AV.
  // Se e2e/README.md § Sikkerhetsmodellen.
  process.env.NEXT_PUBLIC_SUPABASE_URL = E2E_SUPABASE_URL
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = E2E_SUPABASE_ANON_KEY
  process.env.SUPABASE_SERVICE_ROLE_KEY = E2E_SUPABASE_SERVICE_KEY
  process.env.NEXT_PUBLIC_BASE_URL = BASE_URL
} else {
  // Nullstill så harTestCreds() skipper alt, også med gamle creds i .env.local.
  delete process.env.TEST_EPOST
  delete process.env.TEST_PASSORD
}

export default defineConfig({
  testDir: './e2e',
  // Én tsconfig for hele prosessen, ellers brukes rot-tsconfig for lib/ og
  // 'server-only'-mappingen i e2e/tsconfig.json glipper (#687).
  tsconfig: './e2e/tsconfig.json',
  // Én gang per kjøring: fanger høyeste feil_logg.id som grense for vakten i
  // sider-laster.spec.ts, som en retry ikke kan flytte (#539).
  globalSetup: './e2e/global-setup.ts',
  // Spec-ene deler én bruker og global agenda-state; parallellkjøring gir
  // kryss-interferens (f.eks. poll-cleanup sletter annens test-data).
  workers: 1,
  // En glemt test.only i CI ville vært et usynlig dekningshull på PR-en (#534).
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Eksplisitt for å få trykkflate-rapporten (#700) i tillegg til vanlig output.
  reporter: [[process.env.CI ? 'dot' : 'list'], ['./e2e/reportere/treffmaal-rapport.ts']],
  use: {
    baseURL: BASE_URL,
    // Lokalt alle (visuell.spec.ts sammenligner side ved side), i CI kun ved feil.
    screenshot: process.env.CI ? 'only-on-failure' : 'on',
    viewport: { width: 390, height: 844 }, // iPhone 14-størrelse
    // Bevisst INGEN global trace: tracing ga SIGSEGV i chrome-headless-shell
    // ved `browser.newContext` (årsak ukjent, #800). Bruk `--trace on` lokalt.
  },
  // Uten test-instans skipper alle specs, og serveren ville feilet i oppstart.
  ...(HAR_TEST_INSTANS
    ? {
        webServer: {
          // Produksjonsbygg (`next start`), ikke `next dev`: dev-serveren
          // restarter ved høy heap og river åpne forbindelser (#659).
          // CI: kun start — bygget er et eget steg i pr-check.yml, så RLS-
          // suiten slipper å vente på et fullt bygg. Lokalt: bygg i kommandoen,
          // ellers serveres et gammelt bygg stille.
          // `npm run`, ikke `npx`: npx kan laste ned `next@latest` uten TTY
          // hvis node_modules er ødelagt, i stedet for å feile.
          command: process.env.CI ? 'npm run start -- -p 3100' : 'npm run build && npm run start -- -p 3100',
          url: BASE_URL,
          // Alltid false: en glemt server på :3100 ville servert et gammelt
          // bygg stille — testene ser grønne ut mot gammel kode (#659).
          reuseExistingServer: false,
          // Kort i CI (bygget er ferdig) så en død server feiler raskt;
          // lokalt dekker 300 s et kaldt `next build`.
          timeout: process.env.CI ? 60_000 : 300_000,
          // Gir «Ready in Xms» i loggen som positivt bevis på hvilken server
          // som startet (default 'ignore' viser ingenting, #659).
          stdout: 'pipe',
          // NEXT_PUBLIC_* bakes inn ved byggetid, så i CI er disse inerte —
          // gaten er env-en i pr-check.yml sitt «Bygg»-steg. Lokalt (bygg +
          // start i samme kommando) virker de (#659).
          env: {
            NEXT_PUBLIC_SUPABASE_URL: E2E_SUPABASE_URL,
            NEXT_PUBLIC_SUPABASE_ANON_KEY: E2E_SUPABASE_ANON_KEY,
            SUPABASE_SERVICE_ROLE_KEY: E2E_SUPABASE_SERVICE_KEY,
            NEXT_PUBLIC_BASE_URL: BASE_URL,
            // Eksplisitt 'false': en ALLOW_LOCAL_NOTIFICATIONS=true i .env.local
            // ville latt e2e (som kjører varsel-cronen) sende med prod-nøkler.
            ALLOW_LOCAL_NOTIFICATIONS: 'false',
           },
        },
      }
    : {}),
  projects: [
    // RLS-suiten (#533) bevisst uten `dependencies`/`storageState`: den snakker
    // direkte med supabase-js og skal aldri hoppes over fordi setup feilet.
    // Den venter likevel på webServer (global i Playwright) — å gjøre den
    // betinget via process.argv er mer risiko enn sekundene det sparer.
    {
      name: 'rls',
      testMatch: /rls[\\/].*\.spec\.ts$/,
    },
    // Logger inn én gang per kjøring og lagrer session til disk (#381).
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      // Eksplisitt, så auth.setup.ts aldri kjøres to ganger (#381).
      testMatch: /\.spec\.ts$/,
      // rls/ har eget prosjekt. Kun i CI (#534): visuell.spec.ts asserterer
      // ingenting (manuelt sammenligningsverktøy), og readme-skjermbilder
      // krever prod-data.
      testIgnore: [
        /rls[\\/]/,
        ...(process.env.CI ? [/visuell\.spec\.ts$/, /readme-skjermbilder\.spec\.ts$/] : []),
      ],
      use: {
        // Bevisst INGEN devices['Desktop Chrome']: presetet ville overstyrt
        // mobil-viewporten fra global use (#381).
        storageState: 'e2e/.auth/state.json',
      },
      dependencies: ['setup'],
    },
  ],
})
