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
