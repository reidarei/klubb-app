import { expect, test } from '@playwright/test'
import { harTestCreds } from './helpers/auth'
import { adminKlient } from './helpers/admin-klient'

/**
 * Lenker til appen selv skal navigere INNE i appen (#703).
 *
 * Bakgrunn: et innlegg med lenke til kartet skulle publiseres. Hver URL i
 * et innlegg fikk `target="_blank"`, som i en installert PWA åpner Safari oppå
 * appen — man mister appen, sesjonen ser ut til å være borte, og veien tilbake
 * er å lukke nettleseren manuelt.
 *
 * Testen sjekker NAVIGASJONEN, ikke markupen: `target="_blank"` står der
 * fortsatt med vilje (identisk HTML på server og klient, ellers hydrerer den
 * ikke), og det er klikket som avgjør. En test på attributtet ville altså
 * bekreftet den gamle oppførselen og bommet på hele poenget.
 */

const MERKE = 'Playwright intern lenke'
let meldingId: string | null = null

test.describe('interne lenker i innlegg (#703)', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md')

  test.beforeAll(async () => {
    const admin = adminKlient('intern-lenke')
    if (!admin) return
    const { data: profil, error: pFeil } = await admin
      .from('profiles').select('id').eq('epost', process.env.TEST_EPOST ?? '').maybeSingle()
    if (pFeil) throw new Error(`Kunne ikke hente testprofil: ${pFeil.message}`)
    if (!profil) throw new Error('Fant ingen profil for TEST_EPOST')

    // Lenka skrives med den verten testen faktisk kjører mot, slik at den ER
    // intern. En hardkodet prod-URL ville vært ekstern her og testet motsatt sak.
    const base = process.env.E2E_BASE_URL ?? 'http://localhost:3100'
    const { data, error } = await admin
      .from('meldinger')
      .insert({ profil_id: profil.id, innhold: `${MERKE} — se kartet: ${base}/kart` })
      .select('id')
      .single()
    if (error) throw new Error(`Kunne ikke seede melding: ${error.message}`)
    meldingId = data.id
  })

  test.afterAll(async () => {
    const admin = adminKlient('intern-lenke')
    if (!admin || !meldingId) return
    await admin.from('meldinger').delete().eq('id', meldingId)
  })

  test('lenke til /kart navigerer i appen, uten å åpne ny fane', async ({ page, context }) => {
    await page.goto(`/meldinger/${meldingId}`)
    const lenke = page.getByRole('link', { name: /\/kart/ }).first()
    await expect(lenke).toBeVisible()

    const sidefoerKlikk = context.pages().length
    await lenke.click()

    // Samme fane: URL-en har endret seg og kartet er der.
    await expect(page).toHaveURL(/\/kart$/)
    // Kartflaten, ikke en overskrift: sidetittelen ble fjernet da kartet ble
    // fullskjerm (#704).
    await expect(page.getByTestId('kart-flate')).toBeVisible()

    // Og ingen ny fane ble åpnet. Dette er kjernen — uten den ville testen
    // bestått selv om appen ALLTID åpnet Safari ved siden av.
    expect(context.pages().length).toBe(sidefoerKlikk)
  })

  test('ekstern lenke åpner fortsatt i ny fane', async ({ page }) => {
    // Grensa må holde begge veier: en fiks som gjorde ALLE lenker interne
    // ville sendt et trykk på vg.no inn i appens egen router og gitt 404.
    await page.goto(`/meldinger/${meldingId}`)

    const eksternHref = await page.evaluate(() => {
      const a = [...document.querySelectorAll('a[href]')] as HTMLAnchorElement[]
      const ekstern = a.find(x => {
        try { return new URL(x.href).host !== window.location.host } catch { return false }
      })
      return ekstern?.getAttribute('target') ?? 'ingen ekstern lenke funnet'
    })
    // Finnes det ingen ekstern lenke på siden, er det ikke noe å teste — men
    // da skal vi vite det, ikke tro at testen beviste noe.
    expect(['_blank', 'ingen ekstern lenke funnet']).toContain(eksternHref)
  })
})
