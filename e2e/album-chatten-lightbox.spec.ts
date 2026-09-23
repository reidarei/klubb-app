import { expect, test } from '@playwright/test'
import { harTestCreds } from './helpers/auth'

// AlbumLightbox på /album/chatten (#623) — bytter ut BildeLightbox (én src,
// ingen navigasjon) med den sveipbare/pil-navigerbare AlbumLightbox, lastet
// via next/dynamic({ ssr: false }). Verifiserer:
// 1. Klikk på en miniatyr åpner overlayet.
// 2. Klikk på FØRSTE miniatyr (indeks 0) åpner også — mest sannsynlige bug
//    var `lightbox &&`-sjekk mot `lightbox !== null` (0 er falsy).
// 3. Pilnavigasjon (og dermed samme neste()/forrige() som touch-sveip bruker)
//    bytter faktisk bilde — telleren (n / m) endres.
// 4. Escape lukker overlayet.
//
// Testen krever minst to bilder i klubb-chatten på test-instansen for at
// navigasjon skal kunne verifiseres — se test.skip under.

test.describe('Album — Fra chatten — lightbox (#623)', () => {
  test.skip(
    !harTestCreds(),
    'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md og docs/test-instans.md',
  )

  test('åpner ved klikk på første miniatyr, navigerer med piltaster/knapper, lukkes med Escape', async ({
    page,
  }) => {
    await page.goto('/album/chatten')
    // Ventetilstand FØR count(): uten den kan count() rekke å bli 0 fordi siden
    // ikke er ferdig, og test.skip under ville gjort testen umulig å feile.
    await expect(page.getByRole('heading', { name: 'Fra chatten' })).toBeVisible()

    const miniatyrer = page.locator('main button:has(img)')
    const antall = await miniatyrer.count()
    test.skip(
      antall < 2,
      `Fant kun ${antall} bilde(r) i klubbchatten på test-instansen — trenger minst 2 for å bevise navigasjon (#623). Se rapport.`,
    )

    const dialog = page.getByRole('dialog', { name: 'Bilde i full skjerm' })

    // 1 + 2: klikk på FØRSTE miniatyr (indeks 0 — den mest sannsynlige
    // falsy-fellen) åpner overlayet.
    await miniatyrer.first().click()
    await expect(dialog).toBeVisible()

    const teller = dialog.getByText(/^\d+ \/ \d+$/)
    await expect(teller).toBeVisible()
    const forTekst = await teller.textContent()

    // 3a: pilknapp bytter bilde.
    await dialog.getByRole('button', { name: 'Neste bilde' }).click()
    await expect(teller).not.toHaveText(forTekst ?? '')

    // 3b: piltast (ArrowLeft) bytter tilbake — samme neste()/forrige() som
    // sveipe-handleren i AlbumLightbox kaller.
    await page.keyboard.press('ArrowLeft')
    await expect(teller).toHaveText(forTekst ?? '')

    // 4: Escape lukker.
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })
})

// Chat-konsolideringen (#625): components/chat/Chat.tsx byttet ut den
// enkle, navigasjonsløse BildeLightbox med samme AlbumLightbox som resten av
// appen (dynamisk importert), for at pinch-zoom skal virke overalt. Med kun
// ETT bilde sendt inn skal telleren og pil-knappene fortsatt være skjult
// (bilder.length > 1-gatingen i AlbumLightbox) — denne testen beviser at
// konsolideringen ikke lekket navigasjons-UI inn i chatten.
test.describe('Chat — bilde-lightbox er nå AlbumLightbox (#625)', () => {
  test.skip(
    !harTestCreds(),
    'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md og docs/test-instans.md',
  )

  test('klikk på et chat-bilde åpner AlbumLightbox uten teller, Escape lukker', async ({ page }) => {
    await page.goto('/chat')
    // Ventetilstand FØR count(): rekker ikke chat-feeden å rendre, er count 0 og
    // testen skipper seg selv — den kunne da aldri feile. Med denne betyr et
    // skip «ingen bilder i testdataene», ikke «rakk ikke å laste».
    await expect(page.getByPlaceholder('Skriv en melding…')).toBeVisible()

    const bildeKnapp = page.getByRole('button', { name: 'Vis bilde i full skjerm' })
    const antall = await bildeKnapp.count()
    test.skip(
      antall < 1,
      'Fant ingen bilder i klubb-chatten på test-instansen — trenger minst ett for å teste lightboxen (#625).',
    )

    const dialog = page.getByRole('dialog', { name: 'Bilde i full skjerm' })
    await bildeKnapp.first().click()
    await expect(dialog).toBeVisible()

    // Ett bilde sendt inn til AlbumLightbox -> ingen teller, ingen piler.
    await expect(dialog.getByText(/^\d+ \/ \d+$/)).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Neste bilde' })).toHaveCount(0)

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })
})
