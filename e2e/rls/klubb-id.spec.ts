import { test, expect } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { harRlsMiljo, loggInnKlient, TESTBRUKERE, adminKlient } from '../helpers/rls-klienter'
import { FOERSTE_KLUBB_ID } from '../helpers/klubb'

// Multi-tenant 1.2 (#865): klubb_id har default standard_klubb_id(), så inserts
// uten kolonnen havner i den første klubben — for både medlem og service_role.
//
// Klientene er utypede (SupabaseClient uten Database-generic), så
// `klubb_id` typesjekker før typene regenereres etter merge.

test.describe('klubb_id — default på insert (#865)', () => {
  test.skip(!harRlsMiljo(), 'E2E_SUPABASE_* mangler — se docs/test-instans.md')

  const merke = `e2e-klubb-id-${Date.now()}`
  const chatIder: string[] = []
  const vitalsIder: string[] = []
  let service: SupabaseClient

  test.beforeAll(() => {
    const s = adminKlient('klubb-id')
    if (!s) throw new Error('adminKlient ga null selv om harRlsMiljo() er sann')
    service = s
  })

  test.afterAll(async () => {
    if (!service) return
    if (chatIder.length) {
      const { error } = await service.from('klubb_chat').delete().in('id', chatIder)
      expect(error).toBeNull()
    }
    if (vitalsIder.length) {
      const { error } = await service.from('vitals_logg').delete().in('id', vitalsIder)
      expect(error).toBeNull()
    }
    // Sikkerhetsnett hvis en insert lyktes uten at id-en ble samlet.
    const { error } = await service.from('klubb_chat').delete().like('innhold', `${merke}%`)
    expect(error).toBeNull()
  })

  const chatRad = (suffiks: string, ekstra: Record<string, unknown> = {}) => ({
    profil_id: TESTBRUKERE.PETTER.id,
    innhold: `${merke}-${suffiks}`,
    ...ekstra,
  })

  async function ingenRaderMedMerke(suffiks: string) {
    const { data, error } = await service.from('klubb_chat').select('id').like('innhold', `${merke}-${suffiks}%`)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  }

  test('medlem: enkeltrad uten klubb_id får første klubb', async () => {
    const petter = await loggInnKlient(TESTBRUKERE.PETTER.epost)
    const { data, error } = await petter.from('klubb_chat').insert(chatRad('1')).select('id, klubb_id').single()
    expect(error).toBeNull()
    chatIder.push(data!.id)
    expect(data!.klubb_id).toBe(FOERSTE_KLUBB_ID)
  })

  test('service_role: enkeltrad uten klubb_id får første klubb', async () => {
    const { data, error } = await service
      .from('vitals_logg')
      .insert({ rute: `/${merke}`, metric: 'TTFB', verdi: 0 })
      .select('id, klubb_id')
      .single()
    expect(error).toBeNull()
    vitalsIder.push(data!.id)
    expect(data!.klubb_id).toBe(FOERSTE_KLUBB_ID)
  })

  // Tre tester under pinner en postgrest-js-felle som 2.4 (#871) må ta hensyn
  // til: i en array-insert er kolonnelisten unionen av nøklene på tvers av
  // radene, og manglende verdier sendes som null (defaultToNull). Alle rader må
  // derfor ha nøkkelen klubb_id, eller kallet må bruke { defaultToNull: false }.
  // En oppgradering som endrer standarden gjør testene røde — det er ønsket.
  //
  // Feilkoden er 42501, ikke 23502: Postgres evaluerer RLS sin `with check`
  // før not-null-constrainten, og klubbleddet `klubb_id = aktiv_klubb()` (#870)
  // er usant for null. Fram til mig. 167 var det not-null som slo til først.

  test('array uten klubb_id på noen rad: begge får første klubb', async () => {
    const petter = await loggInnKlient(TESTBRUKERE.PETTER.epost)
    const { data, error } = await petter.from('klubb_chat').insert([chatRad('3a'), chatRad('3b')]).select('id, klubb_id')
    expect(error).toBeNull()
    for (const r of data ?? []) chatIder.push(r.id)
    expect(data).toHaveLength(2)
    expect(data!.map(r => r.klubb_id)).toEqual([FOERSTE_KLUBB_ID, FOERSTE_KLUBB_ID])
  })

  test('array der bare én rad har klubb_id: 42501 og ingenting skrives', async () => {
    const petter = await loggInnKlient(TESTBRUKERE.PETTER.epost)
    const { data, error } = await petter
      .from('klubb_chat')
      .insert([chatRad('4a', { klubb_id: FOERSTE_KLUBB_ID }), chatRad('4b')])
      .select('id')
    expect(error?.code).toBe('42501')
    expect(error?.message).toMatch(/row-level security/)
    expect(data).toBeNull()
    await ingenRaderMedMerke('4')
  })

  test('array med klubb_id: undefined på én rad gir samme 42501', async () => {
    // Object.keys tar med nøkkelen mens JSON.stringify dropper verdien, så
    // kolonnelisten har klubb_id men den andre raden får null.
    const petter = await loggInnKlient(TESTBRUKERE.PETTER.epost)
    const { data, error } = await petter
      .from('klubb_chat')
      .insert([chatRad('5a', { klubb_id: FOERSTE_KLUBB_ID }), chatRad('5b', { klubb_id: undefined })])
      .select('id')
    expect(error?.code).toBe('42501')
    expect(error?.message).toMatch(/row-level security/)
    expect(data).toBeNull()
    await ingenRaderMedMerke('5')
  })

  test('defaultToNull: false lar defaulten slå inn for raden uten klubb_id', async () => {
    const petter = await loggInnKlient(TESTBRUKERE.PETTER.epost)
    const { data, error } = await petter
      .from('klubb_chat')
      .insert([chatRad('6a', { klubb_id: FOERSTE_KLUBB_ID }), chatRad('6b')], { defaultToNull: false })
      .select('id, klubb_id')
    expect(error).toBeNull()
    for (const r of data ?? []) chatIder.push(r.id)
    expect(data).toHaveLength(2)
    expect(data!.map(r => r.klubb_id)).toEqual([FOERSTE_KLUBB_ID, FOERSTE_KLUBB_ID])
  })
})
