import { test, expect } from '@playwright/test'
import { harTestCreds } from './helpers/auth'
import { adminKlient } from './helpers/admin-klient'

// ADFERDSVAKT for den nye modellen etter #539 — ikke en regresjonsvakt for
// selve bugen. markerSamtaleLest() kalles som en løs promise under render av
// /samtaler/[id] og får IKKE revalidere /profil (Next 15 kaster under render,
// og kallet nådde uansett aldri klienten uten Full Route Cache). Denne speccen
// beviser at markeringen likevel skjer (mot ekte Postgres, ikke en mock — se
// tilsvarende begrunnelse i kaaring-varsel-retry.spec.ts) og at /profil viser
// et ferskt tall ved neste server-render, uten noen revalidering.
//
// Viktig avgrensning, verifisert i review: med revalidatePath('/profil')
// gjeninnført passerer BEGGE påstandene her. Kastet skjer etter at update-en
// er committet, og /profil er dynamisk rendret — så både lest-flagget og det
// ferske tallet stemmer selv med bugen inne. Det som faktisk fanger
// regresjonen er (1) enhetstesten «revalidatePath kalles ikke» i
// __tests__/actions-samtaler.test.ts og (2) feil_logg-vakten i
// e2e/sider-laster.spec.ts, som ser det loggede kastet.
//
// Seedet kontekst (supabase/seed.sql): samtale
// 00000000-0000-4000-9800-000000000010 mellom e2e-admin (…8000-000000000001,
// den innloggede brukeren i suiten) og Petter (…8000-000000000002). Meldingen
// …9800-000000000011 er FRA Petter, altså en innkommen melding for admin.
const SAMTALE_ID = '00000000-0000-4000-9800-000000000010'
const MELDING_ID = '00000000-0000-4000-9800-000000000011'

test.describe('markerSamtaleLest ved åpning av /samtaler/[id] (#539)', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md og docs/test-instans.md')

  // Raden er seedet med lest: true og skal kunne stå urørt mellom kjøringer
  // (se kommentaren i seed.sql) — vi setter den midlertidig til false her og
  // legger den tilbake i afterAll, uansett om testen selv feiler underveis.
  test.beforeAll(async () => {
    const supabase = adminKlient('samtale-marker-lest-beforeAll')
    if (!supabase) return
    const { error } = await supabase.from('samtale_chat').update({ lest: false }).eq('id', MELDING_ID)
    if (error) throw new Error(`Kunne ikke sette opp fixturen: ${error.message}`)
  })

  test.afterAll(async () => {
    const supabase = adminKlient('samtale-marker-lest-afterAll')
    if (!supabase) return
    const { error } = await supabase.from('samtale_chat').update({ lest: true }).eq('id', MELDING_ID)
    if (error) console.error('[samtale-marker-lest] tilbakestilling av seed-raden feilet:', error)
  })

  test('åpning av samtalen markerer meldingen lest, og /profil viser ferskt tall uten revalidering', async ({
    page,
  }) => {
    const supabase = adminKlient('samtale-marker-lest-spec')
    if (!supabase) throw new Error('E2E_SUPABASE_* mangler — se docs/test-instans.md')

    // Badge på /profil skal vise «1» før vi har lest samtalen.
    await page.goto('/profil')
    const rad = page.getByRole('link', { name: /Privatmeldinger/ })
    await expect(rad.getByText('1', { exact: true })).toBeVisible()

    // Åpne samtalen — dette trigger markerSamtaleLest(id) som løs promise
    // under render (app/(app)/samtaler/[id]/page.tsx).
    await page.goto(`/samtaler/${SAMTALE_ID}`)

    // Selve kjernepåstanden: meldingen ER markert lest i databasen, selv om
    // UI-et ikke gir noen kvittering på det (ren bieffekt). expect.poll fordi
    // oppdateringen skjer i en løs promise som ikke er ferdig når responsen
    // sendes.
    await expect
      .poll(
        async () => {
          const { data, error } = await supabase.from('samtale_chat').select('lest').eq('id', MELDING_ID).single()
          if (error) throw new Error(`Kunne ikke lese meldingsstatus: ${error.message}`)
          return data.lest
        },
        { message: 'meldingen skulle vært markert lest av markerSamtaleLest()', timeout: 10_000 },
      )
      .toBe(true)

    // /profil er dynamisk rendret, så et nytt besøk viser tallet ferskt —
    // ingen revalidatePath er involvert (den er nettopp fjernet, #539).
    await page.goto('/profil')
    await expect(rad.getByText('1', { exact: true })).toHaveCount(0)
  })
})
