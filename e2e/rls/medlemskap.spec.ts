import { test, expect } from '@playwright/test'
import { harRlsMiljo, loggInnKlient, TESTBRUKERE, adminKlient } from '../helpers/rls-klienter'
import { FOERSTE_KLUBB_ID } from '../helpers/klubb'

// Medlemskap per klubb (mig. 163, #868): rolle og aktiv-status bor på
// medlemskap, profiles bærer et vernet speil. Denne fila beviser at speilet
// stemmer med seed, at er_admin()/er_generalsekretaer() leser medlemskap, at en
// ny bruker får medlemskap via handle_ny_bruker, og at oppdater_medlem_admin
// skriver begge tabeller (inkludert deaktivering under RLS).
//
// Ingen endring på de delte seed-brukerne: RPC-testene går mot en midlertidig
// bruker som slettes i afterAll, og RPC-en på Gunnar sender hans egne verdier.

const ADMIN = TESTBRUKERE.ADMIN
const PETTER = TESTBRUKERE.PETTER
const GUNNAR = TESTBRUKERE.GUNNAR

test.describe('medlemskap — speil, rollefunksjoner og admin-RPC (mig. 163, #868)', () => {
  test.skip(!harRlsMiljo(), 'E2E_SUPABASE_* mangler — se docs/test-instans.md')
  test.describe.configure({ mode: 'serial' })

  let midlertidigId: string | null = null

  test.afterAll(async () => {
    const service = adminKlient('medlemskap-opprydding')
    if (!service || !midlertidigId) return
    // Sletter auth-brukeren; profiles og medlemskap følger med via cascade.
    const { error } = await service.auth.admin.deleteUser(midlertidigId)
    if (error) console.warn(`[medlemskap-opprydding] kunne ikke slette ${midlertidigId}: ${error.message}`)
  })

  test('medlemskap.rolle er lik seedens rolle og lik profiles.rolle for alle testbrukere', async () => {
    const service = adminKlient('medlemskap-paritet')
    if (!service) throw new Error('adminKlient ga null selv om harRlsMiljo() er sann')

    for (const bruker of Object.values(TESTBRUKERE)) {
      const { data: m, error } = await service
        .from('medlemskap')
        .select('rolle')
        .eq('klubb_id', FOERSTE_KLUBB_ID)
        .eq('profil_id', bruker.id)
        .single()
      expect(error, bruker.epost).toBeNull()
      expect(m?.rolle, bruker.epost).toBe(bruker.rolle)

      const { data: p, error: pFeil } = await service.from('profiles').select('rolle').eq('id', bruker.id).single()
      expect(pFeil, bruker.epost).toBeNull()
      expect(p?.rolle, bruker.epost).toBe(m?.rolle)
    }
  })

  test('er_admin() og er_generalsekretaer() gir samme svar med og uten klubb-argument', async () => {
    for (const bruker of Object.values(TESTBRUKERE)) {
      const klient = await loggInnKlient(bruker.epost)
      const forventetAdmin = bruker.rolle === 'admin' || bruker.rolle === 'generalsekretaer'
      const forventetGs = bruker.rolle === 'generalsekretaer'

      const utenArg = await klient.rpc('er_admin')
      const medArg = await klient.rpc('er_admin', { p_klubb_id: FOERSTE_KLUBB_ID })
      expect(utenArg.error, bruker.epost).toBeNull()
      expect(medArg.error, bruker.epost).toBeNull()
      expect(utenArg.data, `${bruker.epost} er_admin()`).toBe(forventetAdmin)
      expect(medArg.data, `${bruker.epost} er_admin(klubb)`).toBe(forventetAdmin)

      const gsUtenArg = await klient.rpc('er_generalsekretaer')
      const gsMedArg = await klient.rpc('er_generalsekretaer', { p_klubb_id: FOERSTE_KLUBB_ID })
      expect(gsUtenArg.error, bruker.epost).toBeNull()
      expect(gsMedArg.error, bruker.epost).toBeNull()
      expect(gsUtenArg.data, `${bruker.epost} er_generalsekretaer()`).toBe(forventetGs)
      expect(gsMedArg.data, `${bruker.epost} er_generalsekretaer(klubb)`).toBe(forventetGs)
    }
  })

  test('ny bruker med app_metadata.klubb_id får aktivt medlemskap, og speilet står aktiv', async () => {
    const service = adminKlient('medlemskap-ny-bruker')
    if (!service) throw new Error('adminKlient ga null selv om harRlsMiljo() er sann')

    const epost = `medlemskap-${Date.now()}@klubb.test`
    const { data, error } = await service.auth.admin.createUser({
      email: epost,
      password: 'Midlertidig-passord-123',
      email_confirm: true,
      app_metadata: { klubb_id: FOERSTE_KLUBB_ID },
    })
    expect(error).toBeNull()
    midlertidigId = data.user?.id ?? null
    expect(midlertidigId).not.toBeNull()

    const { data: m, error: mFeil } = await service
      .from('medlemskap')
      .select('rolle, aktiv')
      .eq('klubb_id', FOERSTE_KLUBB_ID)
      .eq('profil_id', midlertidigId!)
      .single()
    expect(mFeil).toBeNull()
    expect(m).toEqual({ rolle: 'medlem', aktiv: true })

    // handle_ny_bruker setter profilen inn med aktiv=false; speilet løfter den
    // til true i samme transaksjon (paritet ved commit).
    const { data: p, error: pFeil } = await service.from('profiles').select('aktiv, rolle').eq('id', midlertidigId!).single()
    expect(pFeil).toBeNull()
    expect(p).toEqual({ aktiv: true, rolle: 'medlem' })
  })

  test('admin kan oppdatere og deaktivere et medlem via oppdater_medlem_admin (RLS-stien)', async () => {
    expect(midlertidigId, 'forrige test skal ha opprettet brukeren').not.toBeNull()
    const service = adminKlient('medlemskap-rpc')
    if (!service) throw new Error('adminKlient ga null selv om harRlsMiljo() er sann')

    const admin = await loggInnKlient(ADMIN.epost)
    const { data, error } = await admin.rpc('oppdater_medlem_admin', {
      p_klubb_id: FOERSTE_KLUBB_ID,
      p_profil_id: midlertidigId,
      p_navn: 'Midlertidig Medlem',
      p_visningsnavn: 'Midlertidig',
      p_telefon: null,
      p_fodselsdato: null,
      p_stikkord: null,
      p_matallergier: null,
      p_rolle: 'medlem',
      p_aktiv: false,
      p_faar_issue_varsler: true,
      p_faar_feilvarsler: false,
    })
    expect(error).toBeNull()
    expect(data).toBe(true)

    const { data: m, error: mFeil } = await service
      .from('medlemskap')
      .select('aktiv, faar_issue_varsler, rolle')
      .eq('klubb_id', FOERSTE_KLUBB_ID)
      .eq('profil_id', midlertidigId!)
      .single()
    expect(mFeil).toBeNull()
    expect(m).toEqual({ aktiv: false, faar_issue_varsler: true, rolle: 'medlem' })

    const { data: p, error: pFeil } = await service
      .from('profiles')
      .select('navn, aktiv, faar_issue_varsler')
      .eq('id', midlertidigId!)
      .single()
    expect(pFeil).toBeNull()
    expect(p).toEqual({ navn: 'Midlertidig Medlem', aktiv: false, faar_issue_varsler: true })
  })

  test('et vanlig medlem avvises av oppdater_medlem_admin (42501)', async () => {
    const petter = await loggInnKlient(PETTER.epost)
    const { error } = await petter.rpc('oppdater_medlem_admin', {
      p_klubb_id: FOERSTE_KLUBB_ID,
      p_profil_id: PETTER.id,
      p_navn: 'Petter Prøve',
      p_visningsnavn: 'Petter',
      p_telefon: null,
      p_fodselsdato: null,
      p_stikkord: null,
      p_matallergier: null,
      p_rolle: 'admin',
      p_aktiv: true,
      p_faar_issue_varsler: false,
      p_faar_feilvarsler: false,
    })
    expect(error?.code).toBe('42501')
  })

  test('oppdater_medlem_admin rører ikke rollen til sittende generalsekretær (svarer false)', async () => {
    const service = adminKlient('medlemskap-gs')
    if (!service) throw new Error('adminKlient ga null selv om harRlsMiljo() er sann')

    // Gunnars egne verdier sendes tilbake uendret — kun rollen er «ny», og den
    // skal ignoreres. Ingen endring på den delte seed-brukeren.
    const { data: p, error: pFeil } = await service
      .from('profiles')
      .select('navn, visningsnavn, telefon, fodselsdato, stikkord, matallergier')
      .eq('id', GUNNAR.id)
      .single()
    expect(pFeil).toBeNull()
    const { data: m, error: mFeil } = await service
      .from('medlemskap')
      .select('aktiv, faar_issue_varsler, faar_feilvarsler')
      .eq('klubb_id', FOERSTE_KLUBB_ID)
      .eq('profil_id', GUNNAR.id)
      .single()
    expect(mFeil).toBeNull()

    const admin = await loggInnKlient(ADMIN.epost)
    const { data, error } = await admin.rpc('oppdater_medlem_admin', {
      p_klubb_id: FOERSTE_KLUBB_ID,
      p_profil_id: GUNNAR.id,
      p_navn: p?.navn,
      p_visningsnavn: p?.visningsnavn,
      p_telefon: p?.telefon,
      p_fodselsdato: p?.fodselsdato,
      p_stikkord: p?.stikkord,
      p_matallergier: p?.matallergier,
      p_rolle: 'admin',
      p_aktiv: m?.aktiv,
      p_faar_issue_varsler: m?.faar_issue_varsler,
      p_faar_feilvarsler: m?.faar_feilvarsler,
    })
    expect(error).toBeNull()
    expect(data).toBe(false)

    const { data: etter, error: etterFeil } = await service
      .from('medlemskap')
      .select('rolle')
      .eq('klubb_id', FOERSTE_KLUBB_ID)
      .eq('profil_id', GUNNAR.id)
      .single()
    expect(etterFeil).toBeNull()
    expect(etter?.rolle).toBe('generalsekretaer')
  })
})
