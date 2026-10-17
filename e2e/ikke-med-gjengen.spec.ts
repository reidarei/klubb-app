import { test, expect } from '@playwright/test'
import { adminKlient } from './helpers/admin-klient'
import { loggInn } from './helpers/auth'
import { harRlsMiljo } from './helpers/rls-klienter'
import { FOERSTE_KLUBB_ID } from './helpers/klubb'
import { forventTreffbar } from './helpers/treffmaal'

// Multi-tenant 2.3 (#870): en innlogget bruker uten aktivt medlemskap får en egen side i stedet
// for faner og innhold — og ingen redirect-løkke (/login sender innloggede til /).
// Temp-bruker i stedet for en seedet: deaktivering på en delt seed-bruker ville gjort
// andre spec-er rød hvis oppryddingen ryker.

test.describe('ikke medlem i en klubb (#870)', () => {
  test.skip(!harRlsMiljo(), 'E2E_SUPABASE_* mangler — se docs/test-instans.md')
  test.use({ storageState: { cookies: [], origins: [] } })

  const epost = `ikke-medlem-${Date.now()}@klubb.test`
  const passord = 'Midlertidig-passord-123'
  let brukerId: string | null = null

  test.afterAll(async () => {
    const service = adminKlient('ikke-med-gjengen-opprydding')
    if (!service || !brukerId) return
    // profiles og medlemskap følger med via cascade.
    const { error } = await service.auth.admin.deleteUser(brukerId)
    if (error) console.warn(`[ikke-med-gjengen-opprydding] kunne ikke slette ${brukerId}: ${error.message}`)
  })

  test('deaktivert medlem får teksten og en utlogging som virker', async ({ page }) => {
    const service = adminKlient('ikke-med-gjengen')
    if (!service) throw new Error('adminKlient ga null selv om harRlsMiljo() er sann')

    const ny = await service.auth.admin.createUser({
      email: epost,
      password: passord,
      email_confirm: true,
      app_metadata: { klubb_id: FOERSTE_KLUBB_ID },
    })
    expect(ny.error).toBeNull()
    brukerId = ny.data.user?.id ?? null
    expect(brukerId).not.toBeNull()

    // Medlemskapet er sannheten; speilet fører aktiv videre til profiles.
    const av = await service.from('medlemskap').update({ aktiv: false }).eq('klubb_id', FOERSTE_KLUBB_ID).eq('profil_id', brukerId!)
    expect(av.error).toBeNull()

    await loggInn(page, { epost, passord })

    await expect(page.getByText('Du er ikke medlem i en klubb.')).toBeVisible()
    // Ingen faner og ingen header: ingenting å navigere til.
    await expect(page.getByRole('link', { name: 'Agenda' })).toHaveCount(0)

    await forventTreffbar(page, { kontekst: 'ikke medlem i en klubb', omraade: 'main' })

    await page.getByRole('button', { name: 'Logg ut' }).click()
    await page.waitForURL('**/login', { timeout: 30_000 })
  })
})
