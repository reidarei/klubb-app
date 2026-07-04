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
// ALL e2e kjører mot en dedikert Supabase-testinstans (selvhostet, se
// docs/test-instans.md) — ALDRI mot prod. Bakgrunn: hendelsen 2026-07-04 der
// testkjøringer opprettet ekte poller og sendte push til alle medlemmer.
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
      'test-instans (#386) — se docs/test-instans.md.',
  )
}

// Innloggingen for testene er den seedede admin-brukeren fra supabase/seed.sql.
// Verdiene er ikke hemmeligheter — de finnes bare i test-instansen.
if (HAR_TEST_INSTANS) {
  process.env.TEST_EPOST = 'e2e-admin@klubb.test'
  process.env.TEST_PASSORD = 'e2e-lokal-hemmelighet'
} else {
  // Uten test-instans skal ingen spec kjøre — nullstill creds slik at
  // harTestCreds() i helpers/auth.ts gir skip med tydelig melding, selv om
  // gamle TEST_EPOST/TEST_PASSORD skulle ligge igjen i .env.local.
  delete process.env.TEST_EPOST
  delete process.env.TEST_PASSORD
}

// Egen port (3100) for test-dev-serveren: en vanlig `npm run dev` mot prod-DB
// kjører på 3000, og reuseExistingServer må aldri kunne gjenbruke den.
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3100'

export default defineConfig({
  testDir: './e2e',
  // Spec-ene deler én bruker og global agenda-state; parallellkjøring gir
  // kryss-interferens (f.eks. poll-cleanup sletter annens test-data).
  workers: 1,
  use: {
    baseURL: BASE_URL,
    screenshot: 'on',
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
          reuseExistingServer: true,
          timeout: 120_000,
          // Prosess-env overstyrer .env.local i Next.js — dev-serveren for
          // testene kobles til test-instansen, ikke prod. NEXT_PUBLIC_BASE_URL
          // settes til localhost slik at varsler-vakten i lib/varsler.ts
          // (BLOKKER_UTSENDING) blokkerer all push/epost-utsending.
          env: {
            NEXT_PUBLIC_SUPABASE_URL: E2E_SUPABASE_URL,
            NEXT_PUBLIC_SUPABASE_ANON_KEY: E2E_SUPABASE_ANON_KEY,
            SUPABASE_SERVICE_ROLE_KEY: E2E_SUPABASE_SERVICE_KEY,
            NEXT_PUBLIC_BASE_URL: BASE_URL,
          },
        },
      }
    : {}),
  projects: [
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
