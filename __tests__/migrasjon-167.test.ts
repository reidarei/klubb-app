// Statisk vakt for migrasjon 167 (#870, 2.3): RLS per klubb. Virkningen bevises i psql-steget
// «Verifiser klubb-RLS (#870)» i pr-check.yml (EXPLAIN-vakt, atferd, Down kjørbar); her pinnes
// formen, så en uforsiktig redigering ikke gjør aktiv_klubb() usikker eller Down-SQL asymmetrisk.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const les = (rel: string) => readFileSync(path.resolve(__dirname, '..', rel), 'utf-8').replace(/\r\n/g, '\n')
const RAA = les('supabase/migrations/167_rls_per_klubb.sql')
// Kommentarer fjernes slik at en kommentar som nevner f.eks. «create policy» ikke teller.
const SQL = RAA.replace(/--[^\n]*/g, '').toLowerCase()
const flat = (s: string) => s.replace(/\s+/g, ' ').trim()
const F = flat(SQL)
const NED = les('supabase/sjekk/167_ned.sql').replace(/--[^\n]*/g, '').toLowerCase()

const tell = (s: string, re: RegExp) => (s.match(re) ?? []).length

describe('migrasjon 167 — aktiv_klubb()', () => {
  it('stable security definer med tomt search_path, og kroppen leser aktivt medlemskap', () => {
    expect(F).toContain('create function public.aktiv_klubb() returns uuid language sql stable security definer set search_path = \'\'')
    expect(F).toContain('where m.klubb_id = coalesce(public.jwt_klubb_id(), public.standard_klubb_id()) and m.profil_id = auth.uid() and m.aktiv')
  })

  it('execute er kun gitt til authenticated og service_role', () => {
    expect(F).toContain('revoke execute on function public.aktiv_klubb() from public, anon;')
    expect(F).toContain('grant execute on function public.aktiv_klubb() to authenticated, service_role;')
  })

  it('har_pass_tilgang filtrerer på klubben', () => {
    expect(F).toContain('and klubb_id = public.aktiv_klubb() and status = \'godkjent\'')
  })
})

describe('migrasjon 167 — policyene', () => {
  it('151 alter policy, ingen create/drop policy (policyene beholder navnene)', () => {
    expect(tell(SQL, /^alter policy /gm)).toBe(151)
    expect(SQL).not.toMatch(/\bcreate policy\b/)
    expect(SQL).not.toMatch(/\bdrop policy\b/)
  })

  it('ingen policy er to public, og hook-policyen/globale tabeller røres ikke', () => {
    const policyDel = SQL.slice(SQL.indexOf('alter policy'), SQL.indexOf('do $$\ndeclare\n  r record'))
    expect(policyDel.length).toBeGreaterThan(1000)
    expect(policyDel).not.toMatch(/\bto public\b/)
    expect(policyDel).not.toContain('supabase_auth_admin')
    expect(policyDel).not.toMatch(/on public\."?(push_subscriptions|pass_info)"?/)
  })

  it('«Slette egne» på meldinger er med, men som alter (se regel A)', () => {
    expect(SQL).toContain('alter policy "slette egne" on public."meldinger"')
  })

  it('ingen bar aktiv_klubb()/er_admin()/auth.uid() utenfor select-pakke', () => {
    // Egenkontrollen i SQL-en tester pg_policies; denne tester teksten i filen.
    const etterAktiv = F.slice(F.indexOf('alter policy'), F.indexOf('do $$ declare r record'))
    expect(etterAktiv.length).toBeGreaterThan(1000)
    expect(tell(etterAktiv, /public\.aktiv_klubb\(\)/g)).toBe(tell(etterAktiv, /\(select public\.aktiv_klubb\(\)\)/g))
    expect(tell(etterAktiv, /public\.er_admin\(/g)).toBe(tell(etterAktiv, /\(select public\.er_admin\(/g))
    expect(tell(etterAktiv, /public\.er_generalsekretaer\(/g)).toBe(tell(etterAktiv, /\(select public\.er_generalsekretaer\(/g))
    expect(etterAktiv).not.toMatch(/(?<!select )auth\.uid\(\)/)
  })

  it('profiles.aktiv leses ikke lenger av noen policy', () => {
    expect(F.slice(F.indexOf('alter policy'), F.indexOf('do $$ declare r record'))).not.toContain('profiles.aktiv')
  })

  it('egenkontrollen sjekker 151 policyer og er med', () => {
    expect(F).toContain('if n <> 151 then')
    expect(F).toContain('er fortsatt to public')
  })
})

describe('supabase/sjekk/167_ned.sql', () => {
  it('like mange alter policy som 167, ingen create policy, og dropper aktiv_klubb() sist', () => {
    expect(tell(NED, /^alter policy /gm)).toBe(151)
    expect(NED).not.toMatch(/\bcreate policy\b/)
    expect(flat(NED).lastIndexOf('drop function if exists public.aktiv_klubb();')).toBeGreaterThan(flat(NED).lastIndexOf('alter policy'))
  })

  it('samme policyer (tabell + navn) som 167', () => {
    const nokler = (s: string) => [...s.matchAll(/^alter policy "([^"]+)" on public\."?([a-zæøå_0-9]+)"?/gmu)].map(m => `${m[2]}|${m[1]}`).sort()
    expect(nokler(NED)).toEqual(nokler(SQL))
  })

  it('gjenoppretter har_pass_tilgang uten klubbfilter', () => {
    expect(flat(NED)).toContain('create or replace function public.har_pass_tilgang(eier uuid)')
    expect(flat(NED).split('create or replace function public.har_pass_tilgang')[1].split('drop function')[0]).not.toContain('aktiv_klubb')
  })
})
