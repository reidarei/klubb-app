// Lansér Playwright-browser brukeren kan interagere med direkte.
// Persistent context lagres i .cache/r2-browser/ slik at innlogging huskes.
//
//   node scripts/r2-browser.mjs [URL]

import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const userDataDir = join(__dirname, '..', '.cache', 'r2-browser')

const url = process.argv[2] ?? 'about:blank'

const ctx = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  viewport: null,
})
const page = ctx.pages()[0] ?? (await ctx.newPage())
await page.goto(url)

ctx.on('close', () => process.exit(0))

// Hold prosessen i live til browser lukkes
await new Promise(() => {})
