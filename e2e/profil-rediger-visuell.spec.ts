import { test } from '@playwright/test'
import fs from 'node:fs'
import { harTestCreds } from './helpers/auth'

// Visuell akseptanse for #685 — «jeg vil ha det samme bildet når jeg
// redigerer som når det ikke redigeres». Skjermbilder er selve akseptansen
// her (jf. issuets verifikasjonsramme), ikke en boundingBox-sammenligning:
// kravet er at et menneske kjenner igjen «Om deg»-seksjonen som samme
// skjema i to tilstander, og det er ikke noe en assert fanger presist.
//
// /klubbinfo/medlemmer/[id] er med fordi #685 endret utseendet der også
// (stikkord ble fritekst i stedet for pills, se komponentendringen) — selv
// om siden er referansen for #683, ikke gjenstand for #683 selv.
//
// Mønster fra e2e/fond.spec.ts. E2E Admin (id under) er den eneste seed-
// profilen med utfylte stikkord/matallergier (se supabase/seed.sql), og er
// samtidig sesjonen setup-prosjektet allerede er innlogget som.

const UT_DIR = '.screenshots/profil'
const E2E_ADMIN_ID = '00000000-0000-4000-8000-000000000001'

const SIDER = [
  { navn: 'profil', url: '/profil' },
  { navn: 'profil-rediger', url: '/profil/rediger' },
  { navn: 'medlem-detalj', url: `/klubbinfo/medlemmer/${E2E_ADMIN_ID}` },
]

test.describe('Profil / rediger — visuell kontinuitet (#685)', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md og docs/test-instans.md')

  test.beforeAll(() => {
    fs.mkdirSync(UT_DIR, { recursive: true })
  })

  for (const { navn, url } of SIDER) {
    test(`${navn} — dark og light`, async ({ page }) => {
      await page.goto(url)
      await page.waitForLoadState('networkidle')
      await page.evaluate(() => document.fonts.ready)
      // Skjul Next.js dev-indikatoren — den havner midt i fullPage-screenshots
      await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })

      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
      await page.waitForTimeout(100)
      await page.screenshot({ path: `${UT_DIR}/${navn}-dark.png`, fullPage: true })

      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
      await page.waitForTimeout(150)
      await page.screenshot({ path: `${UT_DIR}/${navn}-light.png`, fullPage: true })
    })
  }
})
