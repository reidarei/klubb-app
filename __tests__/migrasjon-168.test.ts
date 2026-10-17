// Statisk vakt for migrasjon 168 (#871, 2.4): SQL-funksjoner som setter inn rader setter klubb
// eksplisitt (ikke via kolonne-defaulten standard_klubb_id(), som 2.4b gjør feile-lukket).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const RAA = readFileSync(path.resolve(__dirname, '..', 'supabase/migrations/168_klubb_eksplisitt_i_funksjoner.sql'), 'utf-8').replace(/\r\n/g, '\n')
// Kommentarer fjernes slik at forklaringen i toppen ikke teller som kode.
const SQL = RAA.replace(/--[^\n]*/g, '').toLowerCase()
const F = SQL.replace(/\s+/g, ' ').trim()

// Henter ut kroppen til én funksjon: fra «create ... function <navn>(» til neste «create»/«notify».
function kropp(navn: string): string {
  const start = F.search(new RegExp(`create (or replace )?function (public[.])?${navn}[(]`))
  expect(start, `fant ikke ${navn}`).toBeGreaterThanOrEqual(0)
  const rest = F.slice(start + 10)
  const slutt = rest.search(/ (create (or replace )?function |notify pgrst)/)
  return slutt === -1 ? rest : rest.slice(0, slutt)
}

describe('migrasjon 168 — klubb eksplisitt i insert', () => {
  it('tell_aktivitet: begge inserts setter klubb_id, konfliktmålet er uendret', () => {
    const k = kropp('tell_aktivitet')
    expect(k).toContain('insert into public.aktivitet_dag (klubb_id, dag, unike, treff)')
    expect(k).toContain('insert into public.aktivitet_uke (klubb_id, uke_start, unike)')
    expect(k).toContain('on conflict (klubb_id, dag)')
    expect(k).toContain('on conflict (klubb_id, uke_start)')
    expect(k).toContain('coalesce(p_klubb_id, public.standard_klubb_id())')
  })

  it('krev_bursdagsbilde: insert setter klubb_id fra p_klubb_id', () => {
    const k = kropp('krev_bursdagsbilde')
    expect(k).toContain('insert into public.bursdagsbilde (klubb_id, profil_id,')
    expect(k).toContain('values (coalesce(p_klubb_id, public.standard_klubb_id()), p_profil_id')
    expect(k).toContain('on conflict (klubb_id, profil_id, feiringsdato)')
  })

  it('avslutt_kaaringspoll og lukk_kaaringspoll_naa: klubb_id leses fra pollen og settes i inserten', () => {
    for (const navn of ['avslutt_kaaringspoll', 'lukk_kaaringspoll_naa']) {
      const k = kropp(navn)
      expect(k, navn).toContain('select id, klubb_id, kaaring_mal_id,')
      expect(k, navn).toContain('insert into kaaring_vinnere (klubb_id, mal_id,')
      expect(k, navn).toContain('values ( v_poll.klubb_id, v_poll.kaaring_mal_id,')
    }
  })

  it('skriv_fond_bevegelser: insert setter klubb_id = aktiv_klubb()', () => {
    const k = kropp('skriv_fond_bevegelser')
    expect(k).toContain('insert into fond_bevegelse (klubb_id, profil_id, dato, belop) select public.aktiv_klubb(),')
  })
})

describe('migrasjon 168 — signaturer og grants', () => {
  it('p_klubb_id uuid default null er siste parameter på de to service_role-funksjonene', () => {
    expect(F).toContain('p_unik_dag boolean, p_unik_uke boolean, p_treff boolean, p_klubb_id uuid default null )')
    expect(F).toContain('p_tvungen boolean default false, p_klubb_id uuid default null )')
  })

  it('gamle signaturer droppes', () => {
    expect(F).toContain('drop function public.tell_aktivitet(boolean, boolean, boolean);')
    expect(F).toContain('drop function public.krev_bursdagsbilde(uuid, date, boolean);')
  })

  it('revoke/grant er gjenopprettet på de nye signaturene', () => {
    for (const sig of ['tell_aktivitet(boolean, boolean, boolean, uuid)', 'krev_bursdagsbilde(uuid, date, boolean, uuid)']) {
      expect(F).toContain(`revoke execute on function public.${sig} from public, anon, authenticated;`)
      expect(F).toContain(`grant execute on function public.${sig} to service_role;`)
    }
  })

  it('de tre uendrede funksjonene røres ikke på grants', () => {
    expect(F).not.toMatch(/grant execute on function (public\.)?(avslutt_kaaringspoll|lukk_kaaringspoll_naa|skriv_fond_bevegelser)/)
  })
})

describe('migrasjon 168 — form', () => {
  it('bruker $$ (aldri enkel $) og laster om PostgREST-skjemaet', () => {
    expect(RAA).not.toMatch(/(?<!\$)\$(?!\$)\s*(?:\n|;|\w)/)
    expect(RAA).toContain("notify pgrst, 'reload schema';")
    expect(RAA).toMatch(/do \$\$\ndeclare/)
  })

  it('klubbfilter på delete og er_admin(klubb) i fond-funksjonen er 2.3b (#907), ikke her', () => {
    const k = kropp('skriv_fond_bevegelser')
    expect(k).toContain('if not er_admin() then')
    expect(k).not.toMatch(/delete from fond_bevegelse where profil_id = v_profil_id and klubb_id/)
  })

  it('Down-SQL gjenoppretter alle fem funksjonene', () => {
    const ned = readFileSync(path.resolve(__dirname, '..', 'supabase/sjekk/168_ned.sql'), 'utf-8')
    for (const navn of ['tell_aktivitet', 'krev_bursdagsbilde', 'avslutt_kaaringspoll', 'lukk_kaaringspoll_naa', 'skriv_fond_bevegelser']) {
      expect(ned).toMatch(new RegExp(`create or replace function (public[.])?${navn}[(]`))
    }
  })
})
