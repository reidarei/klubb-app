// Statisk vakt for migrasjon 163 (#868): rekkefølge, grants, bokstavelig uuid i
// speilet og de andre kontraktene arkitekturstyret bandt. Samme mønster som
// migrasjon-klubb-id.test.ts / migrasjon-klubb-grants.test.ts.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const RAA = readFileSync(path.resolve(__dirname, '../supabase/migrations/163_medlemskap.sql'), 'utf-8').replace(/\r\n/g, '\n')
// Kommentarer fjernes (en kommentar som nevner standard_klubb_id() skal ikke telle).
const SQL = RAA.replace(/--[^\n]*/g, '').toLowerCase()
const flat = (s: string) => s.replace(/\s+/g, ' ').trim()
const F = flat(SQL)
const UUID = '00000000-0000-4000-a000-000000000001'

// Funksjonshode + kropp: fra `create [or replace] function <hode>` til andre `$$`.
// `hode` er en bokstavelig delstreng (parenteser escapes).
function funksjon(hode: string): { toppen: string; kropp: string } {
  const start = SQL.search(new RegExp(`create (or replace )?function ${hode.replace(/[()]/g, '\\$&')}`))
  expect(start, `fant ikke function ${hode}`).toBeGreaterThanOrEqual(0)
  const forste = SQL.indexOf('$$', start)
  const andre = SQL.indexOf('$$', forste + 2)
  return { toppen: flat(SQL.slice(start, forste)), kropp: flat(SQL.slice(forste + 2, andre)) }
}

function posisjon(frag: string): number {
  const i = SQL.indexOf(frag)
  expect(i, `fant ikke ${frag}`).toBeGreaterThanOrEqual(0)
  return i
}

describe('migrasjon 163: medlemskap', () => {
  it('første setning er set local lock_timeout = 3s', () => {
    expect(flat(SQL.split(';')[0])).toBe("set local lock_timeout = '3s'")
  })

  it('forhåndssjekkene står før create table', () => {
    expect(posisjon('antall_gs')).toBeLessThan(posisjon('create table public.medlemskap'))
    expect(posisjon('inaktiv admin/generalsekretær')).toBeLessThan(posisjon('create table public.medlemskap'))
  })

  it('tabellen har navngitt profil-FK, PK (klubb_id, profil_id) og GS-indeks', () => {
    expect(F).toContain('constraint medlemskap_profil_id_fkey references public.profiles(id) on delete cascade')
    expect(F).toContain('primary key (klubb_id, profil_id)')
    expect(F).toContain("create unique index medlemskap_unik_generalsekretaer on public.medlemskap (klubb_id) where rolle = 'generalsekretaer'")
    expect(SQL).not.toMatch(/drop index[^;]*profiles_unik_generalsekretaer/)
  })

  it('revoke all fra anon og authenticated står før første grant, og anon får ingenting', () => {
    expect(F).toContain('revoke all on public.medlemskap from anon, authenticated')
    expect(F.indexOf('revoke all on public.medlemskap')).toBeLessThan(F.indexOf('grant select on public.medlemskap'))
    expect(F).not.toMatch(/grant [^;]* on public\.medlemskap to [^;]*\banon\b/)
  })

  it('authenticated har kun kolonne-grant på update, aldri tabellnivå', () => {
    expect(F).toContain('grant update (rolle, aktiv, faar_issue_varsler, faar_feilvarsler, bursdagsgratulasjon_aktiv, oppdatert) on public.medlemskap to authenticated')
    expect(F).not.toMatch(/grant (select, )?(insert, )?update [^(][^;]* on public\.medlemskap to authenticated/)
    expect(F).not.toMatch(/grant [^;]*(insert|delete)[^;]* on public\.medlemskap to authenticated/)
  })

  it('backfillen står før første create trigger', () => {
    expect(posisjon('insert into public.medlemskap')).toBeLessThan(posisjon('create trigger'))
  })

  it('speil-, paritets-, vern- og avviksfunksjonen bruker bokstavelig uuid, aldri standard_klubb_id()', () => {
    for (const hode of [
      'public.medlemskap_speil_til_profiles()',
      'public.medlemskap_speil_avvik()',
      'public.medlemskap_speil_paritet()',
      'public.beskytt_profil_kolonner()',
    ]) {
      const { kropp } = funksjon(hode)
      expect(kropp, hode).toContain(UUID)
      expect(kropp, hode).not.toContain('standard_klubb_id')
    }
  })

  it('vernet er verken stable eller immutable, og har ikke auth.uid()/er_admin-hullet', () => {
    const { toppen, kropp } = funksjon('public.beskytt_profil_kolonner()')
    expect(toppen).not.toMatch(/\b(stable|immutable)\b/)
    expect(kropp).not.toContain('auth.uid()')
    expect(kropp).not.toContain('er_admin')
    expect(kropp).toContain('medlemskap.speil.vern')
  })

  it('speil og paritet er security definer og ikke stable', () => {
    for (const hode of ['public.medlemskap_speil_til_profiles()', 'public.medlemskap_speil_paritet()']) {
      const { toppen } = funksjon(hode)
      expect(toppen, hode).toContain('security definer')
      expect(toppen, hode).not.toMatch(/\b(stable|immutable)\b/)
    }
  })

  it('paritet kontrollerer både gammel og ny profil når et medlemskap flyttes mellom profiler', () => {
    // Review av #868: coalesce(new.profil_id, old.profil_id) så bare den nye.
    const { kropp } = funksjon('public.medlemskap_speil_paritet()')
    expect(kropp).toContain('old.profil_id is distinct from new.profil_id')
    expect(kropp).toContain('array[old.profil_id, new.profil_id]')
    expect(kropp).toContain('foreach v_profil_id in array')
    expect(kropp).not.toContain('coalesce(new.profil_id, old.profil_id)')
  })

  it('speilet nullstiller den gamle profilen når profil_id endres', () => {
    const { kropp } = funksjon('public.medlemskap_speil_til_profiles()')
    expect(kropp).toContain('new.profil_id <> old.profil_id')
    expect(kropp).toContain('where id = old.profil_id')
  })

  it('begge paritets-triggerne er deferrable initially deferred; den på profiles lytter på de fem kolonnene', () => {
    expect(F).toMatch(/create constraint trigger medlemskap_speil_paritet_profiles after insert or update of rolle, aktiv, faar_issue_varsler, faar_feilvarsler, bursdagsgratulasjon_aktiv on public\.profiles deferrable initially deferred for each row/)
    expect(F).toMatch(/create constraint trigger medlemskap_speil_paritet after insert or update or delete on public\.medlemskap deferrable initially deferred for each row/)
  })

  it('er_admin() bruker standard_klubb_id() og aktiv, uten å delegere til er_admin(uuid)', () => {
    const { kropp } = funksjon('public.er_admin()')
    expect(kropp).toContain('standard_klubb_id()')
    expect(kropp).toContain('aktiv')
    expect(kropp).not.toContain('er_admin(')
  })

  it('er_admin(p_klubb_id uuid) har ingen default-argument og krever aktiv', () => {
    const { toppen, kropp } = funksjon('public.er_admin(p_klubb_id uuid)')
    expect(toppen).not.toContain('default')
    expect(kropp).toContain('aktiv')
    expect(F).toContain('revoke execute on function public.er_admin(uuid) from public, anon')
  })

  it('update-policyen opprettes etter at er_admin(uuid) finnes', () => {
    expect(posisjon('create function public.er_admin(p_klubb_id uuid)')).toBeLessThan(
      posisjon('create policy "admin i klubben oppdaterer medlemskap"'),
    )
  })

  it('er_generalsekretaer er security definer og krever aktiv, i begge overlaster', () => {
    for (const hode of ['public.er_generalsekretaer()', 'public.er_generalsekretaer(p_klubb_id uuid)']) {
      const { toppen, kropp } = funksjon(hode)
      expect(toppen, hode).toContain('security definer')
      expect(kropp, hode).toContain('aktiv')
    }
  })

  it('handle_ny_bruker leser klubb_id fra app_metadata med standardklubben som fallback', () => {
    const { kropp } = funksjon('handle_ny_bruker()')
    expect(kropp).toContain("coalesce((new.raw_app_meta_data->>'klubb_id')::uuid, public.standard_klubb_id())")
  })

  it('oppdater_medlem_admin er security invoker med search_path og revoke fra public, anon', () => {
    const { toppen } = funksjon('public.oppdater_medlem_admin(')
    expect(toppen).toContain('security invoker')
    expect(toppen).toContain('set search_path = public')
    expect(F).toMatch(/revoke all on function public\.oppdater_medlem_admin\([^)]*\) from public, anon/)
  })

  it('medlemskap_speil_avvik er kun for service_role', () => {
    expect(F).toContain('revoke all on function public.medlemskap_speil_avvik() from public, anon, authenticated')
    expect(F).toContain('grant execute on function public.medlemskap_speil_avvik() to service_role')
  })
})
