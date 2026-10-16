import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { harRlsMiljo, TESTBRUKERE, adminKlient } from '../helpers/rls-klienter'
import { FOERSTE_KLUBB_ID } from '../helpers/klubb'

// Multi-tenant 1.4 (#867): unike nøkler og dedup-indekser er per klubb. Samme
// nøkkel i klubb A (den første) og klubb B skal gå gjennom for begge; innenfor
// én klubb skal den fortsatt gi 23505 (dedup-doktrinen i CLAUDE.md § Policy: Varsler).
//
// Alt går via service_role: klubb B har ingen medlemmer før 2.1, og RLS er ikke
// tema her — nøklene er. Klientene er utypede, så klubb_id typesjekker uansett typer.

test.describe('unike nøkler per klubb (#867)', () => {
  test.skip(!harRlsMiljo(), 'E2E_SUPABASE_* mangler — se docs/test-instans.md')

  const merke = `e2e-noekler-${Date.now()}`
  const AAR = 2099
  // chat_reaksjoner.melding_id er polymorf uten FK, så en vilkårlig uuid holder.
  const reaksjonMelding = randomUUID()
  let service: SupabaseClient
  let klubbB: string

  test.beforeAll(async () => {
    const s = adminKlient('klubb-noekler')
    if (!s) throw new Error('adminKlient ga null selv om harRlsMiljo() er sann')
    service = s
    const { data, error } = await service.from('klubb').insert({ slug: merke, navn: 'E2E B' }).select('id').single()
    if (error) throw new Error(`Kunne ikke opprette klubb B: ${error.message}`)
    klubbB = data.id
  })

  test.afterAll(async () => {
    if (!service) return
    // Ryddes i rekkefølge: først radene med merke (begge klubber), så klubb B.
    const slett = async (tabell: string, kolonne: string, verdi: string, like = false) => {
      const q = service.from(tabell).delete()
      const { error } = await (like ? q.like(kolonne, verdi) : q.eq(kolonne, verdi))
      expect(error, `opprydding i ${tabell}`).toBeNull()
    }
    await slett('app_innstillinger', 'noekkel', `${merke}%`, true)
    await slett('varsel_innstillinger', 'noekkel', `${merke}%`, true)
    await slett('vedtekter', 'slug', `${merke}%`, true)
    await slett('arrangoransvar', 'arrangement_navn', `${merke}%`, true)
    await slett('varsel_logg', 'dedup_noekkel', `${merke}%`, true)
    await slett('chat_reaksjoner', 'melding_id', reaksjonMelding)
    await slett('samtale', 'klubb_id', klubbB)
    await slett('klubb_info', 'klubb_id', klubbB)
    await slett('fond_kontant', 'klubb_id', klubbB)
    if (klubbB) {
      const { error } = await service.from('klubb').delete().eq('id', klubbB)
      expect(error, 'sletting av klubb B').toBeNull()
    }
  })

  // Setter samme rad inn i begge klubber; begge skal lykkes.
  async function sammeIBegge(tabell: string, rad: Record<string, unknown>) {
    for (const klubb of [FOERSTE_KLUBB_ID, klubbB]) {
      const { error } = await service.from(tabell).insert({ ...rad, klubb_id: klubb })
      expect(error, `${tabell} i klubb ${klubb}`).toBeNull()
    }
  }

  test('app_innstillinger: samme nøkkel i to klubber', async () => {
    await sammeIBegge('app_innstillinger', { noekkel: `${merke}-app` })
  })

  test('varsel_innstillinger: samme nøkkel i to klubber', async () => {
    await sammeIBegge('varsel_innstillinger', { noekkel: `${merke}-varsel` })
  })

  test('vedtekter: samme slug i to klubber', async () => {
    await sammeIBegge('vedtekter', { slug: `${merke}-vedtekt`, tittel: 'E2E', innhold: 'E2E' })
  })

  test('arrangoransvar: samme (aar, navn, ansvarlig) i to klubber', async () => {
    await sammeIBegge('arrangoransvar', {
      aar: AAR,
      arrangement_navn: `${merke}-ansvar`,
      ansvarlig_id: TESTBRUKERE.PETTER.id,
    })
  })

  test('samtale: samme par i to klubber', async () => {
    // Klubb A gjøres opp med id så den ikke blir liggende; klubb B ryddes i afterAll.
    const par = { profil_a: TESTBRUKERE.OLA.id, profil_b: TESTBRUKERE.GUNNAR.id }
    const { data, error } = await service.from('samtale').insert({ ...par, klubb_id: FOERSTE_KLUBB_ID }).select('id').single()
    expect(error).toBeNull()
    try {
      const b = await service.from('samtale').insert({ ...par, klubb_id: klubbB })
      expect(b.error).toBeNull()
    } finally {
      const { error: slettFeil } = await service.from('samtale').delete().eq('id', data!.id)
      expect(slettFeil).toBeNull()
    }
  })

  test('varsel_logg: samme dedup_noekkel og profil i to klubber, men ikke to ganger i én', async () => {
    const rad = {
      profil_id: TESTBRUKERE.PETTER.id,
      tittel: 'E2E',
      melding: 'Seedet for #867.',
      dedup_noekkel: `${merke}-dedup`,
    }
    await sammeIBegge('varsel_logg', rad)
    // Kontrolltest: innenfor én klubb gjelder dedup-indeksen som før.
    const { error } = await service.from('varsel_logg').insert({ ...rad, klubb_id: FOERSTE_KLUBB_ID })
    expect((error as PostgrestError | null)?.code).toBe('23505')
  })

  test('chat_reaksjoner: samme reaksjon i to klubber, men ikke to ganger i én', async () => {
    const rad = { melding_id: reaksjonMelding, profil_id: TESTBRUKERE.PETTER.id, emoji: '👍' }
    await sammeIBegge('chat_reaksjoner', rad)
    const { error } = await service.from('chat_reaksjoner').insert({ ...rad, klubb_id: FOERSTE_KLUBB_ID })
    expect((error as PostgrestError | null)?.code).toBe('23505')
  })

  test('klubb_info og fond_kontant: én rad per klubb', async () => {
    const info = await service.from('klubb_info').insert({ klubb_id: klubbB })
    expect(info.error).toBeNull()
    const dobbel = await service.from('klubb_info').insert({ klubb_id: klubbB })
    expect(dobbel.error?.code).toBe('23505')

    const fond = await service.from('fond_kontant').insert({ klubb_id: klubbB })
    expect(fond.error).toBeNull()
  })
})
