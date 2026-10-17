// Statisk vakt for migrasjon 164 (#868 PR B): varsel_preferanser, posisjon_deling og
// posisjon_punkt hører til medlemskapet. Samme mønster som migrasjon-medlemskap.test.ts.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const RAA = readFileSync(path.resolve(__dirname, '../supabase/migrations/164_medlemskap_data.sql'), 'utf-8').replace(/\r\n/g, '\n')
// Kommentarer fjernes slik at en kommentar som nevner f.eks. «create index» ikke teller.
const SQL = RAA.replace(/--[^\n]*/g, '').toLowerCase()
const flat = (s: string) => s.replace(/\s+/g, ' ').trim()
const setninger = SQL.split(';').map(flat).filter(Boolean)
const F = flat(SQL)

const TABELLER = ['varsel_preferanser', 'posisjon_deling', 'posisjon_punkt'] as const
const MED_PK_BYTTE = ['varsel_preferanser', 'posisjon_deling'] as const

describe('migrasjon 164: medlemskapets data', () => {
  it('første setning er set local lock_timeout = 3s', () => {
    expect(setninger[0]).toBe("set local lock_timeout = '3s'")
  })

  it('forhåndssjekken står før første alter table og dekker alle tre tabeller', () => {
    const forst = SQL.indexOf('alter table')
    for (const t of TABELLER) {
      expect(SQL.indexOf(`from public.${t} t`), t).toBeGreaterThanOrEqual(0)
      expect(SQL.indexOf(`from public.${t} t`), t).toBeLessThan(forst)
    }
  })

  it('klubb_id legges til som egen setning etter 161-malen', () => {
    for (const t of TABELLER) {
      expect(setninger, t).toContain(
        `alter table public.${t} add column klubb_id uuid not null default public.standard_klubb_id() references public.klubb(id) on update cascade on delete restrict`,
      )
    }
  })

  it('primærnøkkelen byttes til (klubb_id, profil_id) i separate setninger, drop før add', () => {
    for (const t of MED_PK_BYTTE) {
      const drop = setninger.indexOf(`alter table public.${t} drop constraint ${t}_pkey`)
      const add = setninger.indexOf(`alter table public.${t} add constraint ${t}_pkey primary key (klubb_id, profil_id)`)
      expect(drop, t).toBeGreaterThanOrEqual(0)
      expect(add, t).toBeGreaterThan(drop)
    }
    // posisjon_punkt beholder PK id.
    expect(F).not.toContain('alter table public.posisjon_punkt drop constraint')
    expect(F).not.toMatch(/(drop|add) [^;]*if exists/)
  })

  it('sammensatt FK mot medlemskap med cascade på alle tre', () => {
    for (const t of TABELLER) {
      expect(setninger, t).toContain(
        `alter table public.${t} add constraint ${t}_medlemskap_fkey foreign key (klubb_id, profil_id) references public.medlemskap (klubb_id, profil_id) on update cascade on delete cascade`,
      )
    }
  })

  it('triggeren flyttes fra profiles til medlemskap, og funksjonen bruker nøkkelen som konfliktmål', () => {
    expect(setninger).toContain('drop trigger ved_ny_profil_varsel_preferanser on public.profiles')
    expect(F).toMatch(/create trigger ved_nytt_medlemskap_varsel_preferanser after insert on public\.medlemskap for each row execute function public\.opprett_varsel_preferanser\(\)/)
    const start = SQL.search(/create or replace function public\.opprett_varsel_preferanser\(\)/)
    expect(start).toBeGreaterThanOrEqual(0)
    const fra = SQL.indexOf('$$', start)
    const til = SQL.indexOf('$$', fra + 2)
    expect(flat(SQL.slice(start, fra))).toContain('security definer set search_path = public')
    const kropp = flat(SQL.slice(fra + 2, til))
    expect(kropp).toContain('insert into public.varsel_preferanser (klubb_id, profil_id) values (new.klubb_id, new.profil_id)')
    expect(kropp).toContain('on conflict (klubb_id, profil_id) do nothing')
    expect(SQL.indexOf('drop trigger')).toBeLessThan(SQL.indexOf('create trigger'))
  })

  it('backfillen er idempotent og leser fra medlemskap', () => {
    expect(F).toContain('insert into public.varsel_preferanser (klubb_id, profil_id) select klubb_id, profil_id from public.medlemskap on conflict (klubb_id, profil_id) do nothing')
  })

  it('ingen ny indeks, policy eller grant (policyene er 2.3)', () => {
    expect(SQL).not.toContain('create index')
    expect(SQL).not.toContain('create unique index')
    expect(SQL).not.toContain('create policy')
    expect(SQL).not.toMatch(/\bgrant\b/)
    expect(SQL).not.toMatch(/drop [^;]*\bcascade\b/)
  })
})
