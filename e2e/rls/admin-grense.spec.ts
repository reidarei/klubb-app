import { test, expect } from '@playwright/test'
import { harRlsMiljo, loggInnKlient, TESTBRUKERE, adminKlient } from '../helpers/rls-klienter'

// er_admin()-gatede skriveoperasjoner (#533, punkt 5 i issuet): et vanlig
// medlem skal ikke kunne slette andres arrangementer, redigere vedtekter
// eller styre kåringer. Generalsekretær-delen beviser at er_admin() (mig.
// 097) dekker BEGGE admin-rollene i praksis, ikke bare rollestrengen
// 'admin' — regresjonsvakten mot at en fremtidig hardkodet
// `rolle = 'admin'`-policy sniker seg inn (se CLAUDE.md § Policy: Roller).

const ADMIN = TESTBRUKERE.ADMIN
const PETTER = TESTBRUKERE.PETTER
const GUNNAR = TESTBRUKERE.GUNNAR

// Ubrukt prefiks (høyeste i bruk før #533 er 9700, se supabase/seed.sql).
// Det er `9900`-prefikset — ikke datoen — som holder fixturene unna andre
// spec-ers tellinger: e2e/tidligere.spec.ts filtrerer med SEED_HREF_RE
// (/-4000-9[1-4]00-/) og ser derfor aldri disse radene. Datoen er valgt langt
// tilbake av en annen grunn: den holder dem utenfor AGENDA_VINDU_MND, så de
// ikke dukker opp i forsidens agenda- eller «Tidligere»-seksjon under en
// manuell titt på test-instansen.
const ARR_A_ID = '00000000-0000-4000-9900-000000000030'
const ARR_B_ID = '00000000-0000-4000-9900-000000000031'

// kaaring_vinnere.unique(mal_id, aar) — år langt i fremtiden garanterer at
// ingen ekte kåring noensinne kolliderer med testfixturen.
const AAR_PETTER_FORSOK = 2099
const AAR_GUNNAR_SUKSESS = 2098

test.describe('er_admin()-gatede operasjoner — medlem stoppes, begge admin-roller slipper gjennom (#533)', () => {
  test.skip(!harRlsMiljo(), 'E2E_SUPABASE_* mangler — se docs/test-instans.md')

  // Vedtektenes innhold før testene. Snapshottes fordi «Petter kan ikke
  // oppdatere vedtekter» ETTERLATER teksten kapret hvis policyen faktisk har
  // et hull — og da faller senere specs (og en manuell titt på /vedtekter) på
  // et symptom langt fra årsaken.
  let vedtekterFoer: string | null = null

  test.beforeAll(async () => {
    const service = adminKlient('admin-grense-fixtures')
    if (!service) throw new Error('adminKlient ga null selv om harRlsMiljo() er sann')

    // Rollene i TESTBRUKERE er en påstand om seed-dataene, ikke en sannhet —
    // står Gunnar med feil rolle, ville «generalsekretæren KAN …»-testene under
    // stille bevist noe helt annet enn at er_admin() dekker begge admin-rollene.
    for (const bruker of [ADMIN, GUNNAR, PETTER]) {
      const { data, error } = await service.from('profiles').select('rolle').eq('id', bruker.id).single()
      if (error) throw new Error(`Kunne ikke lese rollen til ${bruker.epost}: ${error.message}`)
      if (data.rolle !== bruker.rolle) {
        throw new Error(
          `${bruker.epost} har rolle «${data.rolle}» i test-instansen, men TESTBRUKERE sier «${bruker.rolle}» ` +
            `— seed.sql og e2e/helpers/rls-klienter.ts er ute av synk.`,
        )
      }
    }

    const { data: vedtekter, error: vedtekterFeil } = await service
      .from('vedtekter')
      .select('innhold')
      .eq('slug', 'vedtekter')
      .single()
    if (vedtekterFeil) throw new Error(`Kunne ikke snapshotte vedtektene: ${vedtekterFeil.message}`)
    vedtekterFoer = vedtekter.innhold

    await service.from('arrangementer').delete().in('id', [ARR_A_ID, ARR_B_ID])
    const { error } = await service.from('arrangementer').insert([
      {
        id: ARR_A_ID,
        type: 'moete',
        tittel: 'RLS-testfixture A (#533)',
        start_tidspunkt: new Date(Date.now() - 900 * 24 * 60 * 60 * 1000).toISOString(),
        opprettet_av: ADMIN.id,
      },
      {
        id: ARR_B_ID,
        type: 'moete',
        tittel: 'RLS-testfixture B (#533)',
        start_tidspunkt: new Date(Date.now() - 900 * 24 * 60 * 60 * 1000).toISOString(),
        opprettet_av: ADMIN.id,
      },
    ])
    if (error) throw new Error(`Kunne ikke seede arrangementer: ${error.message}`)
  })

  // Logger feil i stedet for taus fail-open: en cleanup som ikke gikk gjennom
  // etterlater fixtures for neste kjøring, og vi vil vite hvorfor. Kaster ikke
  // — det ville maskert den ekte testfeilen som gjorde ryddingen nødvendig.
  test.afterAll(async () => {
    const service = adminKlient('admin-grense-cleanup')
    if (!service) return
    const { error: arrFeil } = await service.from('arrangementer').delete().in('id', [ARR_A_ID, ARR_B_ID])
    if (arrFeil) console.warn(`[admin-grense-cleanup] kunne ikke slette testarrangementer: ${arrFeil.message}`)
    const { error: kaaringFeil } = await service
      .from('kaaring_vinnere')
      .delete()
      .in('aar', [AAR_PETTER_FORSOK, AAR_GUNNAR_SUKSESS])
    if (kaaringFeil) console.warn(`[admin-grense-cleanup] kunne ikke slette testkåringer: ${kaaringFeil.message}`)

    // Ubetinget tilbakeskriving — no-op når vedtekt-testen var grønn.
    if (vedtekterFoer !== null) {
      const { error } = await service.from('vedtekter').update({ innhold: vedtekterFoer }).eq('slug', 'vedtekter')
      if (error) console.warn(`[admin-grense-cleanup] kunne ikke gjenopprette vedtektene: ${error.message}`)
    }
  })

  test('Petter kan ikke slette arrangement A (eid av admin)', async () => {
    const petter = await loggInnKlient(PETTER.epost)
    // Uten `.select()` er `data` null uansett om raden ble slettet eller ikke —
    // det er service_role-oppslaget under som beviser at den fortsatt finnes.
    const { error } = await petter.from('arrangementer').delete().eq('id', ARR_A_ID)
    expect(error).toBeNull()

    const service = adminKlient('admin-grense-verify-delete')
    if (!service) throw new Error('adminKlient ga null')
    const { data: fortsattDer, error: verifyFeil } = await service.from('arrangementer').select('id').eq('id', ARR_A_ID)
    expect(verifyFeil).toBeNull()
    expect(fortsattDer, 'arrangement A skulle IKKE vært slettet').toHaveLength(1)
  })

  test('Petter kan ikke oppdatere vedtekter', async () => {
    const service = adminKlient('admin-grense-verify-vedtekter')
    if (!service) throw new Error('adminKlient ga null')
    const { data: forFeil, error: forFeilFeil } = await service
      .from('vedtekter')
      .select('innhold')
      .eq('slug', 'vedtekter')
      .single()
    expect(forFeilFeil).toBeNull()

    const petter = await loggInnKlient(PETTER.epost)
    // Som over: `data` er null uten `.select()`, så beviset er re-lesningen med
    // service_role under.
    const { error } = await petter
      .from('vedtekter')
      .update({ innhold: 'Kapret av Petter' })
      .eq('slug', 'vedtekter')
    expect(error).toBeNull()

    const { data: etterFeil, error: etterFeilFeil } = await service
      .from('vedtekter')
      .select('innhold')
      .eq('slug', 'vedtekter')
      .single()
    expect(etterFeilFeil).toBeNull()
    expect(etterFeil?.innhold).toEqual(forFeil?.innhold)
  })

  test('Petter kan ikke sette en kåringvinner', async () => {
    const service = adminKlient('admin-grense-malid')
    if (!service) throw new Error('adminKlient ga null')
    const { data: mal, error: malFeil } = await service
      .from('kaaringmaler')
      .select('id')
      .eq('navn', 'Årets herre')
      .single()
    if (malFeil || !mal) throw new Error(`Fant ikke kåringsmalen «Årets herre»: ${malFeil?.message}`)

    const petter = await loggInnKlient(PETTER.epost)
    const { error } = await petter.from('kaaring_vinnere').insert({
      mal_id: mal.id,
      aar: AAR_PETTER_FORSOK,
      begrunnelse: 'Skal blokkeres av RLS with check (er_admin()).',
      opprettet_av: PETTER.id,
    })
    // Insert blokkert av RLS with check gir en FEIL, ikke stille 0 rader.
    expect(error?.code).toBe('42501')

    const { data, error: verifyFeil } = await service.from('kaaring_vinnere').select('id').eq('aar', AAR_PETTER_FORSOK)
    expect(verifyFeil).toBeNull()
    expect(data, 'ingen kåringvinner for teståret skulle ha blitt satt inn').toEqual([])
  })

  test('Generalsekretæren KAN slette arrangement B — er_admin() dekker begge admin-rollene, ikke bare "admin"', async () => {
    const gunnar = await loggInnKlient(GUNNAR.epost)
    const { error } = await gunnar.from('arrangementer').delete().eq('id', ARR_B_ID)
    expect(error).toBeNull()

    const service = adminKlient('admin-grense-verify-gs-delete')
    if (!service) throw new Error('adminKlient ga null')
    const { data, error: verifyFeil } = await service.from('arrangementer').select('id').eq('id', ARR_B_ID)
    expect(verifyFeil).toBeNull()
    expect(data, 'arrangement B skulle vært slettet av generalsekretæren').toEqual([])
  })

  test('Generalsekretæren KAN sette en kåringvinner', async () => {
    const service = adminKlient('admin-grense-malid-gs')
    if (!service) throw new Error('adminKlient ga null')
    const { data: mal, error: malFeil } = await service
      .from('kaaringmaler')
      .select('id')
      .eq('navn', 'Årets herre')
      .single()
    if (malFeil || !mal) throw new Error(`Fant ikke kåringsmalen «Årets herre»: ${malFeil?.message}`)

    const gunnar = await loggInnKlient(GUNNAR.epost)
    const { error } = await gunnar.from('kaaring_vinnere').insert({
      mal_id: mal.id,
      aar: AAR_GUNNAR_SUKSESS,
      begrunnelse: 'RLS-testfixture — ryddes i afterAll (#533).',
      opprettet_av: GUNNAR.id,
    })
    expect(error).toBeNull()

    const { data, error: verifyFeil } = await service.from('kaaring_vinnere').select('id').eq('aar', AAR_GUNNAR_SUKSESS)
    expect(verifyFeil).toBeNull()
    expect(data).toHaveLength(1)
  })
})
