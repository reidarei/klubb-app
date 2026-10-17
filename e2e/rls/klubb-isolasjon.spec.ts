import { test, expect } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { harRlsMiljo, loggInnKlient, TESTBRUKERE, adminKlient } from '../helpers/rls-klienter'
import { FOERSTE_KLUBB_ID } from '../helpers/klubb'

// Multi-tenant 2.3 (#870): RLS per klubb. Petter har medlemskap i BÅDE klubb A og klubb B, men
// tokenet hans (hookens valg: eldste aktive medlemskap) peker på A. Han skal bare se og skrive
// i A; admin i A skal ikke kunne røre B. Mekanikken (EXPLAIN-vakt, forfalsket claim,
// deaktivering uten nytt token, Down-SQL) bevises i psql-steget «Verifiser klubb-RLS (#870)»
// i pr-check.yml; denne spec-en vokter det en klubb-bruker kan treffe via API-et.

test.describe('klubb-isolasjon via RLS (#870)', () => {
  test.skip(!harRlsMiljo(), 'E2E_SUPABASE_* mangler — se docs/test-instans.md')

  const merke = `e2e-rls-${Date.now()}`
  const PETTER = TESTBRUKERE.PETTER
  let service: SupabaseClient
  let klubbB: string

  test.beforeAll(async () => {
    const s = adminKlient('klubb-isolasjon')
    if (!s) throw new Error('adminKlient ga null selv om harRlsMiljo() er sann')
    service = s
    const k = await service.from('klubb').insert({ slug: merke, navn: 'E2E RLS' }).select('id').single()
    if (k.error) throw new Error(`Kunne ikke opprette klubb B: ${k.error.message}`)
    klubbB = k.data.id
    const m = await service.from('medlemskap').insert({ klubb_id: klubbB, profil_id: PETTER.id })
    if (m.error) throw new Error(`Kunne ikke gi Petter medlemskap i klubb B: ${m.error.message}`)
    const chat = await service.from('klubb_chat').insert({ klubb_id: klubbB, profil_id: PETTER.id, innhold: 'Hei fra B' })
    if (chat.error) throw new Error(`Kunne ikke opprette chatmelding i klubb B: ${chat.error.message}`)
    const arr = await service.from('arrangementer').insert({
      klubb_id: klubbB,
      type: 'moete',
      tittel: 'Møte i klubb B',
      start_tidspunkt: new Date(Date.now() + 10 * 86_400_000).toISOString(),
      opprettet_av: PETTER.id,
    })
    if (arr.error) throw new Error(`Kunne ikke opprette arrangement i klubb B: ${arr.error.message}`)
  })

  test.afterAll(async () => {
    if (!service || !klubbB) return
    // Barneradene først, så varselvalgene triggeren ga (mig. 164), så medlemskapet, så klubben.
    for (const tabell of ['arrangementer', 'klubb_chat', 'varsel_preferanser', 'medlemskap']) {
      const { error } = await service.from(tabell).delete().eq('klubb_id', klubbB)
      expect(error, `opprydding i ${tabell}`).toBeNull()
    }
    const k = await service.from('klubb').delete().eq('id', klubbB)
    expect(k.error, 'sletting av klubb B').toBeNull()
  })

  test('Petter (medlem i A og B, token A) ser bare A', async () => {
    const petter = await loggInnKlient(PETTER.epost)

    const klubber = await petter.from('klubb').select('id')
    expect(klubber.error).toBeNull()
    expect(klubber.data).toEqual([{ id: FOERSTE_KLUBB_ID }])

    for (const tabell of ['arrangementer', 'klubb_chat', 'medlemskap']) {
      const { data, error } = await petter.from(tabell).select('klubb_id').neq('klubb_id', FOERSTE_KLUBB_ID)
      expect(error, tabell).toBeNull()
      expect(data, `${tabell} skulle ikke vist rader fra klubb B`).toEqual([])
    }
    // Og A er ikke tomt, så ovenstående ikke er grønt av feil grunn.
    const a = await petter.from('arrangementer').select('id').eq('klubb_id', FOERSTE_KLUBB_ID).limit(1)
    expect(a.error).toBeNull()
    expect(a.data).toHaveLength(1)
  })

  test('Petter kan ikke sette inn rader i klubb B mens tokenet peker på A (42501)', async () => {
    const petter = await loggInnKlient(PETTER.epost)
    const { error } = await petter.from('klubb_chat').insert({ klubb_id: klubbB, profil_id: PETTER.id, innhold: 'Skal avvises' })
    expect(error?.code).toBe('42501')

    const { data, error: lesFeil } = await service.from('klubb_chat').select('innhold').eq('klubb_id', klubbB)
    expect(lesFeil).toBeNull()
    expect(data).toEqual([{ innhold: 'Hei fra B' }])
  })

  test('admin i A får 0 rader ved endring av klubb B, og raden er uendret', async () => {
    const admin = await loggInnKlient(TESTBRUKERE.ADMIN.epost)
    const upd = await admin.from('arrangementer').update({ tittel: 'Kapret' }).eq('klubb_id', klubbB).select('id')
    expect(upd.error).toBeNull()
    expect(upd.data).toEqual([])
    const del = await admin.from('klubb_chat').delete().eq('klubb_id', klubbB).select('id')
    expect(del.error).toBeNull()
    expect(del.data).toEqual([])

    const arr = await service.from('arrangementer').select('tittel').eq('klubb_id', klubbB)
    expect(arr.error).toBeNull()
    expect(arr.data).toEqual([{ tittel: 'Møte i klubb B' }])
    const chat = await service.from('klubb_chat').select('id').eq('klubb_id', klubbB)
    expect(chat.error).toBeNull()
    expect(chat.data).toHaveLength(1)
  })
})
