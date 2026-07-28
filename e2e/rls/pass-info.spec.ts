import { test, expect } from '@playwright/test'
import { harRlsMiljo, loggInnKlient, TESTBRUKERE, adminKlient } from '../helpers/rls-klienter'

// pass_info (mig. 056) inneholder passnummer og utløpsdato — høyest
// konsekvens av alt vi verifiserer i #533. Migrasjon 056 skilte dataene ut
// fra profiles NETTOPP for at RLS her kan være strengere enn «alle aktive
// kan lese profiler»-policyen. Reidars avklaring: admin har INGEN generell
// lesetilgang til andres pass — kun en godkjent, ikke-utløpt forespørsel
// (har_pass_tilgang()) åpner raden, uansett rolle.
//
// Se e2e/README.md § RLS-tester for hvorfor `select` blokkert av RLS gir
// `data: [], error: null` — IKKE en feil. Vi verifiserer derfor RADEN, ikke
// bare fraværet av en exception.

const OLA = TESTBRUKERE.OLA
const PETTER = TESTBRUKERE.PETTER
const ADMIN = TESTBRUKERE.ADMIN

// Ubrukt prefiks (høyeste i bruk før #533 er 9700, se supabase/seed.sql).
const FORESPORSEL_ID = '00000000-0000-4000-9900-000000000001'
// Seedet fremtidig tur (supabase/seed.sql) — FK-krav på arrangement_id, ikke
// noe innhold i selve testen avhenger av at det er DENNE turen.
const TUR_ARRANGEMENT_ID = '00000000-0000-4000-9000-000000000002'

test.describe('pass_info — passnummer skal aldri lekke uten godkjent, gyldig tilgang (#533)', () => {
  test.skip(!harRlsMiljo(), 'E2E_SUPABASE_* mangler — se docs/test-instans.md')

  test.beforeAll(async () => {
    // Nøkkelvakten (assertNoklerErUlike) kjøres nå inne i anonKlient() — se
    // helpers/rls-klienter.ts. Den lå her, men da beskyttet den bare denne
    // fila, ikke en kjøring filtrert til en av de andre RLS-specene.
    const service = adminKlient('pass-info-fixtures')
    if (!service) throw new Error('adminKlient ga null selv om harRlsMiljo() er sann')

    // Slett-så-insert på faste id-er (ikke upsert): et rent utgangspunkt selv
    // om en tidligere kjøring krasjet halvveis, og `retries: 1`
    // (playwright.config.ts) faller da ikke på en duplikatnøkkel-feil ved
    // insert.
    await service.from('pass_tilgang_forespørsel').delete().eq('id', FORESPORSEL_ID)
    await service.from('pass_info').delete().eq('profil_id', OLA.id)

    const { error } = await service.from('pass_info').insert({
      profil_id: OLA.id,
      nummer: 'TEST12345678',
      utloper: '2030-01-01',
    })
    if (error) throw new Error(`Kunne ikke seede pass_info for Ola: ${error.message}`)
  })

  test.afterAll(async () => {
    const service = adminKlient('pass-info-cleanup')
    if (!service) return
    await service.from('pass_tilgang_forespørsel').delete().eq('id', FORESPORSEL_ID)
    await service.from('pass_info').delete().eq('profil_id', OLA.id)
  })

  // Ett gjenbrukt forespørsel-fixture som muteres mellom hver test i stedet
  // for én rad per scenario — pass_tilgang_forespørsel har ingen unique
  // constraint som ville krevd det, og det holder testfila kort. `null`
  // sletter raden (dekker «ingen forespørsel finnes ennå»-scenarioet).
  async function settForesporsel(felter: Record<string, unknown> | null) {
    const service = adminKlient('pass-info-settForesporsel')
    if (!service) throw new Error('adminKlient ga null')
    if (felter === null) {
      const { error } = await service.from('pass_tilgang_forespørsel').delete().eq('id', FORESPORSEL_ID)
      if (error) throw new Error(`Kunne ikke slette forespørsel: ${error.message}`)
      return
    }
    const { error } = await service.from('pass_tilgang_forespørsel').upsert(
      {
        id: FORESPORSEL_ID,
        soker_id: PETTER.id,
        eier_id: OLA.id,
        arrangement_id: TUR_ARRANGEMENT_ID,
        ...felter,
      },
      { onConflict: 'id' },
    )
    if (error) throw new Error(`Kunne ikke sette forespørsel-tilstand ${JSON.stringify(felter)}: ${error.message}`)
  }

  test('Petter uten noen forespørsel ser ikke Olas pass_info', async () => {
    await settForesporsel(null)
    const petter = await loggInnKlient(PETTER.epost)
    const { data, error } = await petter.from('pass_info').select('*').eq('profil_id', OLA.id)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  test('Petter med godkjent, gyldig forespørsel LESER Olas pass_info (positiv kontroll)', async () => {
    await settForesporsel({
      status: 'godkjent',
      gyldig_til: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    })
    const petter = await loggInnKlient(PETTER.epost)
    const { data, error } = await petter.from('pass_info').select('nummer').eq('profil_id', OLA.id)
    expect(error).toBeNull()
    // Positiv kontroll: uten denne kunne HELE fila vært grønn fordi
    // Petter-klienten av en eller annen grunn ikke virker (feil nøkkel,
    // feil bruker, nettverksfeil som gir tom liste).
    expect(data).toHaveLength(1)
    expect(data?.[0].nummer).toBe('TEST12345678')
  })

  test('Petter med godkjent, men UTGÅTT forespørsel ser ikke Olas pass_info (24t-vinduet stenger)', async () => {
    await settForesporsel({
      status: 'godkjent',
      gyldig_til: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    })
    const petter = await loggInnKlient(PETTER.epost)
    const { data, error } = await petter.from('pass_info').select('*').eq('profil_id', OLA.id)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  test('Petter med forespørsel som fortsatt VENTER ser ikke Olas pass_info, selv med fremtidig gyldig_til', async () => {
    await settForesporsel({
      status: 'venter',
      gyldig_til: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    })
    const petter = await loggInnKlient(PETTER.epost)
    const { data, error } = await petter.from('pass_info').select('*').eq('profil_id', OLA.id)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  test('Ola leser sin egen pass_info uansett', async () => {
    await settForesporsel(null)
    const ola = await loggInnKlient(OLA.epost)
    const { data, error } = await ola.from('pass_info').select('*').eq('profil_id', OLA.id)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  test('Admin uten godkjent forespørsel ser IKKE Olas pass_info — ingen generell admin-unntak (#533)', async () => {
    await settForesporsel(null)
    const admin = await loggInnKlient(ADMIN.epost)
    const { data, error } = await admin.from('pass_info').select('*').eq('profil_id', OLA.id)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})
