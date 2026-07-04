import { test as setup } from '@playwright/test'
import path from 'node:path'
import { loggInn, harTestCreds } from './helpers/auth'

/**
 * Setup-steg som kjøres én gang per Playwright-kjøring (project: 'setup').
 * Logger inn og lagrer session til disk slik at alle spec-er kan gjenbruke
 * den via storageState uten å kalle login-endepunktet på nytt.
 *
 * Skipper stille hvis TEST_EPOST/TEST_PASSORD mangler — da vil spec-ene
 * selv skippe via harTestCreds()-guard.
 */

const AUTH_FIL = path.join('e2e', '.auth', 'state.json')

setup('logg inn og lagre session', async ({ page }) => {
  setup.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md')

  await loggInn(page)
  await page.context().storageState({ path: AUTH_FIL })
})
