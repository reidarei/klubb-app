import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import { harTestCreds } from './helpers/auth'

// «Min andel» på profilsiden (#443/#447-oppfølger). Etiketten ble kortet ned
// fra «Min andel av fondet» da heroen ble en kompakt rad (#589).
// e2e-brukeren er admin, så andelen vises uavhengig av fond_fane-bryteren.

const UT_DIR = '.screenshots/fond'

test.describe('Profil — fond-andel', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md og docs/test-instans.md')

  test.beforeAll(() => {
    fs.mkdirSync(UT_DIR, { recursive: true })
  })

  test('viser «Min andel» i profil-hero', async ({ page }) => {
    await page.goto('/profil')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Min andel', { exact: true })).toBeVisible()
    // Test-instansen har ingen innskudd for e2e-admin — andelen skal være 0 kr
    await expect(page.getByText('0,00 kr', { exact: true })).toBeVisible()
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
    await page.screenshot({ path: `${UT_DIR}/profil-fond-andel.png` })
  })
})
