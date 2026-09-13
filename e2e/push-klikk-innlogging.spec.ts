import { test, expect } from '@playwright/test'
import { harTestCreds, TEST_EPOST, TEST_PASSORD } from './helpers/auth'

/**
 * #688: et push-klikk-mål skal overleve en utløpt sesjon i stedet for å
 * falle til agendaen, OG en anonym klientfeil skal nå fram til
 * /api/logg-feil uten å bli redirected til /login.
 *
 * Anonym storageState for hele fila — vi tester nettopp den UINNLOGGEDE
 * stien (middleware-unntaket og /login sin lesing av Cache Storage).
 */
test.describe('Push-klikk-mål gjennom innlogging (#688)', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md')

  test.use({ storageState: { cookies: [], origins: [] } })

  test('anonym POST til /api/logg-feil svarer 204, ikke 307-redirect', async ({ request, baseURL }) => {
    // nivaa: 'warn' — ikke 'error' — slik at feil_logg-vakten i
    // sider-laster.spec.ts (som kun teller nivaa='error') ikke slår ut på en
    // rad vi skriver bevisst i denne testen.
    const res = await request.post(`${baseURL}/api/logg-feil`, {
      maxRedirects: 0,
      data: { event: 'klient.test.e2e', nivaa: 'warn', kontekst: {} },
    })
    expect(res.status()).toBe(204)
  })

  test('push-klikk-mål på utløpt sesjon overlever innlogging, inkl. fragment', async ({ page, baseURL }) => {
    test.setTimeout(60_000)

    // /login er den eneste siden i (auth)-gruppen, og ServiceWorkerRegistrering
    // er ikke montert der — men Cache Storage er en Window-API og krever ingen
    // registrert service worker. Vi simulerer notificationclick sin skriving
    // direkte, uavhengig av om en ekte SW er installert i denne browser-
    // konteksten.
    await page.goto('/login')
    const maal = `${baseURL}/tidligere#test`
    await page.evaluate(async (url) => {
      const cache = await caches.open('pwa-nav')
      await cache.put(
        'https://pwa-nav.invalid/pending',
        new Response(JSON.stringify({ url, ts: Date.now(), klikk_id: 'e2e-klikk-1' })),
      )
    }, maal)

    // Reload: /login sin useEffect leser Cache Storage ved mount.
    await page.reload()

    await page.fill('input[type="email"]', TEST_EPOST)
    await page.fill('input[type="password"]', TEST_PASSORD)
    await page.click('button[type="submit"]')

    await page.waitForURL(/\/tidligere#test$/, { timeout: 30_000 })
  })

  test('kontroll: uten oppføring lander innlogging fortsatt på "/"', async ({ page }) => {
    test.setTimeout(60_000)

    await page.goto('/login')
    await page.fill('input[type="email"]', TEST_EPOST)
    await page.fill('input[type="password"]', TEST_PASSORD)
    await page.click('button[type="submit"]')

    await page.waitForURL('**/', { timeout: 30_000 })
  })
})
