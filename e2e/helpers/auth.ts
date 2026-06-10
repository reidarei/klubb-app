import type { Page } from '@playwright/test'

/**
 * Felles innloggingshelper for e2e-tester. Tidligere ble samme `loggInn`
 * duplisert i hver spec-fil med en hardkodet placeholder-passord-default, som
 * stille feilet ved første assertion. Nå sentralisert: hvis creds mangler,
 * skal spec-en kalle `test.skip(!harTestCreds(), ...)` slik at årsaken er
 * tydelig i rapporten.
 *
 * Sett `TEST_PASSORD` i `.env.local` (`TEST_EPOST` har default på reidars
 * bruker — overstyr hvis du vil teste som en annen). Se `e2e/README.md`.
 */

export const TEST_EPOST = process.env.TEST_EPOST ?? 'reidar.haavik@gmail.com'
export const TEST_PASSORD = process.env.TEST_PASSORD ?? ''

export function harTestCreds(): boolean {
  return Boolean(TEST_EPOST) && Boolean(TEST_PASSORD)
}

export async function loggInn(page: Page): Promise<void> {
  await page.goto('/login')
  await page.fill('input[type="email"]', TEST_EPOST)
  await page.fill('input[type="password"]', TEST_PASSORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/', { timeout: 15_000 })
}
