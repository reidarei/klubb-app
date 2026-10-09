import { type Page, test } from '@playwright/test'

/**
 * Venter på at en Next.js server action er avgjort server-side (status mottatt),
 * FØR testen går videre til en UI-assertion (#800). Beviser ikke at
 * mutasjonen lyktes — se nederst.
 *
 * En UI-assertion alene holder ikke: Next resolver action-transition-en FØR
 * det nye RSC-treet er committet, så et panel som lukker seg beviser ikke at
 * mutasjonen gikk gjennom.
 *
 * Bruk: pakk inn klikket; UI-assertionen kommer etter:
 *
 *   await ventPaaServerAction(page, () => knapp.click())
 *   await expect(rad).toHaveCount(0, { timeout: 15_000 })
 *
 * Ingen egen timeout — testens timeout er grensen.
 *
 * Venter bevisst IKKE på `respons.finished()`/`respons.body()`: begge hang
 * eller feilet i CDP (17 av 82 kjøringer). Service workeren er utelukket (den
 * rører ikke POST). Årsaken er uavklart: (a) en CDP-detalj ved chunket RSC-
 * strøm, eller (b) at strømmen faktisk ikke lukkes — samme feilklasse som
 * #800. Én CI-trace (PR #802) peker mot (b). Ikke anta (a).
 *
 * Statuskoden skrives først etter at actionen (inkl. `redirect()`) er avventet
 * (action-handler.js i next), så den beviser at kallet er AVGJORT og ikke
 * kastet. Den beviser IKKE at mutasjonen lyktes (`{ ok: false }` kommer med
 * 200) eller at React har committet — det må en assertion etterpå bevise.
 */
export async function ventPaaServerAction(page: Page, utloeser: () => Promise<void>): Promise<void> {
  // Registreres FØR utløseren, ellers kan responsen passere før lytteren finnes.
  const responsPromise = page.waitForResponse(
    r => r.request().method() === 'POST' && r.request().headers()['next-action'] !== undefined,
    { timeout: 0 },
  )

  const start = Date.now()
  await utloeser()

  const respons = await responsPromise

  // 200 = normal retur, 303 = actionen kalte redirect(). Alt annet (f.eks. 500) er et reelt avvik.
  const status = respons.status()
  if (status !== 200 && status !== 303) {
    throw new Error(
      `Server action svarte ${status} i stedet for 200/303 (${respons.url()}) — selve handlingen feilet, ikke UI-oppdateringen etterpå.`,
    )
  }

  test.info().annotations.push({ type: 'server-action', description: `${Date.now() - start} ms` })
}
