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

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

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
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    // Setup-prosjektet logger inn én gang og lagrer session til disk.
    // Reduserer auth-kall fra én per spec til én per kjøring — eliminerer
    // auth-rate-limit-eksponeringen som trolig lå bak det originale login-henget.
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
      // KARANTENE: spec-er i e2e/prod-muterende/ muterer prod-data (oppretter
      // poller som varsler ALLE medlemmer, endrer RSVP på ekte arrangementer).
      // De skal ALDRI kjøres av standard-kommandoen — kun via prod-muterende-
      // prosjektet under, som krever eksplisitt miljøflagg. Se #386 og
      // hendelsen 2026-07-04 der testkjøringer sendte push til hele klubben.
      testIgnore: /prod-muterende/,
      use: {
        // Bevisst INGEN devices['Desktop Chrome']-spread her: prosjekt-use
        // overstyrer global use, og desktop-presetet ville byttet ut
        // mobil-viewporten (390×844) som visuell/README-skjermbildene
        // baserer seg på. Kun storageState legges til. Se #381.
        storageState: 'e2e/.auth/state.json',
      },
      dependencies: ['setup'],
    },
    // Karantene-prosjektet finnes kun når E2E_TILLAT_PROD_MUTASJON=ja er satt —
    // uten flagget kjenner ikke Playwright igjen prosjektnavnet engang, så
    // hverken `npx playwright test` eller `--project prod-muterende` kan
    // treffe prod ved et uhell. Fjernes når test-instansen (#386) er på plass.
    ...(process.env.E2E_TILLAT_PROD_MUTASJON === 'ja'
      ? [
          {
            name: 'prod-muterende',
            testMatch: /prod-muterende[\\/].*\.spec\.ts$/,
            use: {
              storageState: 'e2e/.auth/state.json',
            },
            dependencies: ['setup'],
          },
        ]
      : []),
  ],
})
