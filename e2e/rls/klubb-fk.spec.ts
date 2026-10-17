import { test, expect } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { harRlsMiljo, TESTBRUKERE, adminKlient } from '../helpers/rls-klienter'
import { FOERSTE_KLUBB_ID } from '../helpers/klubb'

// Multi-tenant 2.1b (#895): sammensatte fremmednøkler. En barnerad i klubb B som
// peker på en forelder i klubb A skal avvises av databasen (23503), og en
// profilkolonne krever medlemskap i radens klubb. Alt via service_role: det er
// FK-ene som er tema, ikke RLS. Klientene er utypede, så klubb_id typesjekker
// uansett typer.
//
// Mekanikken i migrasjonen (set null med kolonneliste, omnummerering,
// profilsletting) bevises i psql-steget «Verifiser sammensatte fremmednøkler»
// i pr-check.yml; denne spec-en vokter det en klubb-bruker kan treffe via API-et.

test.describe('sammensatte fremmednøkler (#895)', () => {
  test.skip(!harRlsMiljo(), 'E2E_SUPABASE_* mangler — se docs/test-instans.md')

  const merke = `e2e-fk-${Date.now()}`
  const PETTER = TESTBRUKERE.PETTER.id
  let service: SupabaseClient
  let klubbB: string

  test.beforeAll(async () => {
    const s = adminKlient('klubb-fk')
    if (!s) throw new Error('adminKlient ga null selv om harRlsMiljo() er sann')
    service = s
    const { data, error } = await service.from('klubb').insert({ slug: merke, navn: 'E2E FK' }).select('id').single()
    if (error) throw new Error(`Kunne ikke opprette klubb B: ${error.message}`)
    klubbB = data.id
    const medlemskap = await service.from('medlemskap').insert({ klubb_id: klubbB, profil_id: PETTER })
    if (medlemskap.error) throw new Error(`Kunne ikke gi Petter medlemskap i klubb B: ${medlemskap.error.message}`)
  })

  test.afterAll(async () => {
    if (!service) return
    // Barneradene i B (kontrollradene) først, så medlemskapet, så klubben.
    for (const tabell of ['klubb_chat', 'arrangement_chat']) {
      const { error } = await service.from(tabell).delete().eq('klubb_id', klubbB)
      expect(error, `opprydding i ${tabell}`).toBeNull()
    }
    if (klubbB) {
      const m = await service.from('medlemskap').delete().eq('klubb_id', klubbB)
      expect(m.error, 'sletting av medlemskap i klubb B').toBeNull()
      const k = await service.from('klubb').delete().eq('id', klubbB)
      expect(k.error, 'sletting av klubb B').toBeNull()
    }
  })

  // Én id fra klubb A for forelderen.
  async function enFraA(tabell: string, kolonner = 'id'): Promise<Record<string, string>> {
    const { data, error } = await service.from(tabell).select(kolonner).eq('klubb_id', FOERSTE_KLUBB_ID).limit(1)
    expect(error, `lese ${tabell}`).toBeNull()
    if (!data || data.length === 0) throw new Error(`Fant ingen ${tabell}-rad i klubb A — seeden er endret?`)
    return data[0] as unknown as Record<string, string>
  }

  // Forelder → hvordan et minimalt barn i klubb B ser ut. Petter har medlemskap i B, så
  // profil-FK-en er ikke grunnen til avvisningen: det er forelderen i feil klubb.
  const FORELDRE: {
    forelder: string
    barn: string
    bygg: () => Promise<Record<string, unknown>>
    fk: RegExp
  }[] = [
    {
      forelder: 'arrangementer',
      barn: 'arrangement_chat',
      bygg: async () => ({ arrangement_id: (await enFraA('arrangementer')).id, profil_id: PETTER, innhold: 'x' }),
      fk: /arrangement_chat_arrangement_id_fkey/,
    },
    {
      forelder: 'poll',
      barn: 'poll_chat',
      bygg: async () => ({ poll_id: (await enFraA('poll')).id, profil_id: PETTER, innhold: 'x' }),
      fk: /poll_chat_poll_id_fkey/,
    },
    {
      forelder: 'album_bilde',
      barn: 'album_bilde_chat',
      bygg: async () => ({ album_bilde_id: (await enFraA('album_bilde')).id, profil_id: PETTER, innhold: 'x' }),
      fk: /album_bilde_chat_album_bilde_id_fkey/,
    },
    {
      forelder: 'meldinger',
      barn: 'melding_chat',
      bygg: async () => ({ melding_id: (await enFraA('meldinger')).id, profil_id: PETTER, innhold: 'x' }),
      fk: /melding_chat_melding_id_fkey/,
    },
    {
      forelder: 'kaaringmaler',
      barn: 'poll',
      bygg: async () => ({
        spoersmaal: 'E2E?',
        svarfrist: new Date(Date.now() + 86_400_000).toISOString(),
        opprettet_av: PETTER,
        kaaring_mal_id: (await enFraA('kaaringmaler')).id,
      }),
      fk: /poll_kaaring_mal_id_fkey/,
    },
    {
      forelder: 'album',
      barn: 'album_bilde',
      bygg: async () => ({ album_id: (await enFraA('album')).id, bilde_url: 'https://e2e.test/x.jpg', lastet_opp_av: PETTER }),
      fk: /album_bilde_album_id_fkey/,
    },
    {
      forelder: 'samtale',
      barn: 'samtale_chat',
      bygg: async () => ({ samtale_id: (await enFraA('samtale')).id, profil_id: PETTER, innhold: 'x' }),
      fk: /samtale_chat_samtale_id_fkey/,
    },
    {
      // Både valg_id og poll_id peker på klubb A her, så begge FK-ene kan avvise raden.
      forelder: 'poll_valg',
      barn: 'poll_stemme',
      bygg: async () => {
        const v = await enFraA('poll_valg', 'id, poll_id')
        return { valg_id: v.id, poll_id: v.poll_id, profil_id: PETTER }
      },
      fk: /poll_stemme_(valg_id|poll_id)_fkey/,
    },
    {
      forelder: 'vedtekter',
      barn: 'vedtekter_versjoner',
      bygg: async () => ({
        vedtekt_id: (await enFraA('vedtekter')).id,
        innhold: 'x',
        vedtaksdato: '2099-01-01',
        endringsnotat: 'E2E',
      }),
      fk: /vedtekter_versjoner_vedtekt_id_fkey/,
    },
  ]

  for (const { forelder, barn, bygg, fk } of FORELDRE) {
    test(`${barn} i klubb B kan ikke peke på ${forelder} i klubb A`, async () => {
      const rad = await bygg()
      const { error } = await service.from(barn).insert({ ...rad, klubb_id: klubbB })
      expect(error?.code, `${barn}: forventet foreign_key_violation, fikk ${error?.message}`).toBe('23503')
      expect(error?.message).toMatch(fk)
    })
  }

  test('profilkolonne krever medlemskap i radens klubb', async () => {
    // Ola har medlemskap i klubb A, men ikke i B.
    const { error } = await service
      .from('klubb_chat')
      .insert({ klubb_id: klubbB, profil_id: TESTBRUKERE.OLA.id, innhold: 'x' })
    expect(error?.code).toBe('23503')
    expect(error?.message).toMatch(/klubb_chat_profil_id_medlemskap_fkey/)
  })

  test('kontroll: samme slags rader går gjennom når forelder og medlem hører til klubben', async () => {
    // Medlem i B, uten forelder-FK: skal lykkes.
    const chat = await service.from('klubb_chat').insert({ klubb_id: klubbB, profil_id: PETTER, innhold: 'x' })
    expect(chat.error).toBeNull()

    // Forelder i samme klubb: arrangement_chat i A mot et arrangement i A.
    const arr = (await enFraA('arrangementer')).id
    const ok = await service
      .from('arrangement_chat')
      .insert({ klubb_id: FOERSTE_KLUBB_ID, arrangement_id: arr, profil_id: PETTER, innhold: merke })
      .select('id')
      .single()
    expect(ok.error).toBeNull()
    const { error } = await service.from('arrangement_chat').delete().eq('id', ok.data!.id)
    expect(error, 'opprydding av kontrollraden i klubb A').toBeNull()
  })
})
