import { test, expect } from '@playwright/test'
import { harTestCreds } from './helpers/auth'
import { adminKlient } from './helpers/admin-klient'
import { iDagOslo } from '../lib/dato'

// Bursdagsbilde på det store bursdagskortet (#641). Seeder Ola Testesens
// fødselsdato + profilbilde til å treffe "i dag" (samme rigg som
// bursdag-stort-kort.spec.ts) OG en 'ferdig' bursdagsbilde-rad for dagens
// feiringsdato — ingen ekte modellkall, kun en rå DB-seed. Dette er eneste
// automatiske verifikasjon mulig uten et ekte Vertex-kall (se PR-teksten).
//
// adminKlient() returnerer en UNTYPED SupabaseClient (ikke
// SupabaseClient<Database>), så bursdagsbilde-tabellen — som ikke er i
// lib/supabase/database.types.ts ennå — kan seedes uten `as any`-cast her.
//
// Kjøres kun mot test-instansen (harTestCreds/E2E_SUPABASE_*) — aldri prod.

const OLA_ID = '00000000-0000-4000-8000-000000000003'
const OLA_MEDLEMSSIDE = `/klubbinfo/medlemmer/${OLA_ID}`
// Same-origin sti — serveres uten remotePatterns-oppføring og slipper
// uendret gjennom bildeSrc() (se Policy: Bildevisning), samme knep som
// bursdag-stort-kort.spec.ts.
const BILDE_URL = '/icon-512.png'

test.describe('Bursdagsbilde på det store kortet (#641)', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md og docs/test-instans.md')

  let harOriginal = false
  let originalFodselsdato: string | null = null
  let originalBildeUrl: string | null = null

  test.beforeAll(async () => {
    const supabase = adminKlient('bursdagsbilde-kort')
    if (!supabase) throw new Error('E2E_SUPABASE_* mangler')

    const { data, error } = await supabase
      .from('profiles')
      .select('fodselsdato, bilde_url')
      .eq('id', OLA_ID)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new Error('Fant ikke seed-profilen Ola Testesen')
    originalFodselsdato = data.fodselsdato
    originalBildeUrl = data.bilde_url
    harOriginal = true

    const iDag = iDagOslo()

    // Behold fødselsåret (1990) fra seeden — kun MM-dd styrer «i dag».
    // Sett også bilde_url slik at den 28px-avataren ved siden av navnet
    // (som bruker bursdag.bildeUrl, det EKTE profilbildet) faktisk rendrer
    // et <img> og ikke bare initial-fallback.
    const { error: settFeil } = await supabase
      .from('profiles')
      .update({ fodselsdato: `1990-${iDag.slice(5)}`, bilde_url: BILDE_URL })
      .eq('id', OLA_ID)
    if (settFeil) throw settFeil

    const { error: bildeFeil } = await supabase
      .from('bursdagsbilde')
      .upsert(
        { profil_id: OLA_ID, feiringsdato: iDag, status: 'ferdig', bilde_url: BILDE_URL, forsok: 1 },
        { onConflict: 'profil_id,feiringsdato' },
      )
    if (bildeFeil) throw bildeFeil
  })

  test.afterAll(async () => {
    // Ingen avlest original ⇒ ingenting ble mutert heller — se samme
    // resonnement i bursdag-stort-kort.spec.ts sin afterAll.
    if (!harOriginal) return

    const supabase = adminKlient('bursdagsbilde-kort')
    if (!supabase) throw new Error('E2E_SUPABASE_* mangler ved restore — test-instansen er nå skitten')

    const { error } = await supabase
      .from('profiles')
      .update({ fodselsdato: originalFodselsdato, bilde_url: originalBildeUrl })
      .eq('id', OLA_ID)
    if (error) {
      throw new Error(`Restore av seed-profilen feilet — test-instansen er nå skitten: ${error.message}`)
    }

    const { error: sletteFeil } = await supabase
      .from('bursdagsbilde')
      .delete()
      .eq('profil_id', OLA_ID)
      .eq('feiringsdato', iDagOslo())
    if (sletteFeil) {
      throw new Error(`Sletting av seedet bursdagsbilde feilet — test-instansen er nå skitten: ${sletteFeil.message}`)
    }
  })

  test('hero viser det genererte bildet, KI-merket og en liten ekte avatar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const bursdagLenke = page.locator(`main a[href="${OLA_MEDLEMSSIDE}"]`).first()
    await expect(bursdagLenke).toBeVisible()
    await expect(bursdagLenke.getByText('LAGET AV KI')).toBeVisible()

    // To <img>: hero-bildet (next/image, det genererte bursdagsbildet) og
    // den 28px-avataren ved siden av navnet (Avatar-komponenten, satt til
    // det EKTE profilbildet siden bilde_url er seedet over).
    await expect(bursdagLenke.locator('img')).toHaveCount(2)
  })
})
