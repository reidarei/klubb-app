import type { Page } from '@playwright/test'

/**
 * Felles innloggingshelper for e2e-tester. Hvis creds mangler, skal spec-en
 * kalle `test.skip(!harTestCreds(), ...)` slik at årsaken er tydelig i
 * rapporten.
 *
 * TEST_EPOST/TEST_PASSORD settes av playwright.config.ts til den seedede
 * testbrukeren (supabase/seed.sql) når E2E_SUPABASE_* er konfigurert — og
 * nullstilles når test-instansen mangler, slik at alle specs skipper.
 * Se docs/test-instans.md og e2e/README.md.
 */

export const TEST_EPOST = process.env.TEST_EPOST ?? ''
export const TEST_PASSORD = process.env.TEST_PASSORD ?? ''

export function harTestCreds(): boolean {
  return Boolean(TEST_EPOST) && Boolean(TEST_PASSORD)
}

export async function loggInn(page: Page): Promise<void> {
  await page.goto('/login')
  await page.fill('input[type="email"]', TEST_EPOST)
  await page.fill('input[type="password"]', TEST_PASSORD)
  await page.click('button[type="submit"]')
  // 30s timeout fordi treg /-lasting etter vellykket auth (ikke feilet innlogging)
  // har hengt suiten — login-siden resetter ikke `laster`-tilstand ved suksess,
  // så navigasjonen tar lengre tid enn selve auth-kallet. Se #381.
  await page.waitForURL('**/', { timeout: 30_000 })
}
