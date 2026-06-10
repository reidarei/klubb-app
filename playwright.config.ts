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
})
