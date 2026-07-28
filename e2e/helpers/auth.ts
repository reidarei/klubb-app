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

// Felles passord for ALLE seedede brukere i supabase/seed.sql (admin, Petter,
// Ola). Eksporteres her fordi spec-er som logger inn som en annen bruker enn
// setup-prosjektets admin trenger det — uten dette ble strengen kopiert inn
// per spec, og en endring i seed.sql måtte jaktes opp flere steder.
export const SEED_PASSORD = 'e2e-lokal-hemmelighet'

export function harTestCreds(): boolean {
  return Boolean(TEST_EPOST) && Boolean(TEST_PASSORD)
}

// Valgfrie overstyringer brukes av spec-er som må logge inn som en ANNEN
// seedet bruker enn setup-prosjektets admin — f.eks. e2e/innstillinger.spec.ts
// (#485), som verifiserer at et vanlig medlem (Petter/Ola, seedet i
// supabase/seed.sql) ikke slipper inn på admin-only-sider. Disse testene må
// kombineres med `test.use({ storageState: { cookies: [], origins: [] } })`
// slik at de ikke gjenbruker admin-sesjonen fra e2e/.auth/state.json.
export async function loggInn(
  page: Page,
  overstyring?: { epost: string; passord: string },
): Promise<void> {
  const epost = overstyring?.epost ?? TEST_EPOST
  const passord = overstyring?.passord ?? TEST_PASSORD
  await page.goto('/login')
  await page.fill('input[type="email"]', epost)
  await page.fill('input[type="password"]', passord)
  await page.click('button[type="submit"]')
  // 30s timeout fordi treg /-lasting etter vellykket auth (ikke feilet innlogging)
  // har hengt suiten — login-siden resetter ikke `laster`-tilstand ved suksess,
  // så navigasjonen tar lengre tid enn selve auth-kallet. Se #381.
  await page.waitForURL('**/', { timeout: 30_000 })
}
