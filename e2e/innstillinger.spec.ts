import { test, expect } from '@playwright/test'
import { harTestCreds, loggInn, SEED_PASSORD } from './helpers/auth'

// Varig dekning for /innstillinger og /innstillinger/bruk — admin-only
// dashboard (#485). Under #484 ble dette dekket med en ad-hoc-spec som ble
// slettet etterpå; denne erstatter den permanent.
//
// Begge sidene kaster ved manglende data (Policy: Databasespørringer, se
// app/(app)/innstillinger/page.tsx og .../bruk/page.tsx) i stedet for å falle
// tilbake til et stille 0/tomt — så «siden laster uten feil» er i seg selv en
// reell regresjonssjekk, ikke bare en smoke test.

test.describe('/innstillinger — admin-only dashboard (#485)', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md og docs/test-instans.md')

  test('laster for admin og viser nøkkeltall-kortene', async ({ page }) => {
    await page.goto('/innstillinger')

    await expect(page.getByRole('heading', { name: 'Innstillinger' })).toBeVisible()
    await expect(page.getByText('Push-varsler')).toBeVisible()
    await expect(page.getByText('Varsler — kontrollpanel')).toBeVisible()
    await expect(page.getByText('Faste arrangementer')).toBeVisible()
    await expect(page.getByText('Kåringer')).toBeVisible()
    await expect(page.getByText('Pass-godkjenninger')).toBeVisible()
    await expect(page.getByText('Varselhistorikk')).toBeVisible()
    // «Bruk» og «Ytelse» — begge kjører aktivitet_dag/aktivitet_uke/
    // vitals_logg-spørringer (#484). Skal rendre uten å kaste selv når
    // test-instansen har lite/ingen slik måledata (?? []-fallback).
    await expect(page.getByText('Bruk', { exact: true })).toBeVisible()
    await expect(page.getByText('Ytelse')).toBeVisible()
  })

  test('«Bruk»-siden (aktivitetstrend) laster og viser nøkkeltallene', async ({ page }) => {
    await page.goto('/innstillinger/bruk')

    await expect(page.getByRole('heading', { name: 'Aktivitet' })).toBeVisible()
    await expect(page.getByText('Snitt unike (per enhet) / dag')).toBeVisible()
    await expect(page.getByText('Unike (per enhet), siste fullførte uke')).toBeVisible()
    await expect(page.getByText('Snitt treff / dag')).toBeVisible()
  })

  // Petter Prøve (seedet i supabase/seed.sql som 'medlem', ikke admin) —
  // egen, cookie-fri context slik at vi ikke gjenbruker admin-sesjonen fra
  // e2e/.auth/state.json (se e2e/helpers/auth.ts).
  test.describe('uten admin-rettigheter', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test('et vanlig medlem slipper ikke inn på /innstillinger', async ({ page }) => {
      await loggInn(page, { epost: 'petter.prove@klubb.test', passord: SEED_PASSORD })

      // Siden kaller notFound() når kanAdministrere(profil?.rolle) er false
      // (middleware gater kun innlogging, ikke rolle, se lib/roller.ts §
      // Policy: Roller). Verifiserer INNHOLDET, ikke HTTP-statusen på
      // page.goto()-svaret: Next.js sin App Router har alt begynt å streame
      // (app)-layoutens skall (TopHeader m.m.) før den asynkrone
      // sideskomponenten rekker å kalle notFound(), så selve
      // navigasjons-responsen kan bære 200 selv når det som til slutt
      // rendres er 404-grensen — bekreftet i praksis under denne speccen.
      //
      // '404'-overskriften kommer fra Next.js sin INNEBYGDE not-found-side
      // (vi har ingen egen app/not-found.tsx). Blir denne raden rød etter en
      // Next-oppgradering, er det sannsynligvis fordi rammeverket endret den
      // markupen — sjekk det før du leter etter en rettighetsbug.
      await page.goto('/innstillinger')
      await expect(page.getByRole('heading', { name: '404' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Innstillinger' })).toHaveCount(0)
    })

    test('et vanlig medlem slipper ikke inn på /innstillinger/bruk', async ({ page }) => {
      await loggInn(page, { epost: 'petter.prove@klubb.test', passord: SEED_PASSORD })

      await page.goto('/innstillinger/bruk')
      await expect(page.getByRole('heading', { name: '404' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Aktivitet' })).toHaveCount(0)
    })
  })
})
