// Statisk vakt for migrasjon 161 slik den ble skrevet. Den løpende skjemavakten er
// skjemavakt-klubb.test.ts.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { FOERSTE_KLUBB_ID } from '../e2e/helpers/klubb'
import { KLUBB_ID_UNNTAK } from './helpers/klubb-tabeller'
import { byggSkjema, lesMigrasjoner } from './helpers/migrasjon-skjema'

const RAA = readFileSync(path.resolve(__dirname, '../supabase/migrations/161_klubb_id.sql'), 'utf-8').replace(/\r\n/g, '\n')
const SQL = RAA.replace(/--[^\n]*/g, '').toLowerCase()
const setninger = SQL.split(';').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean)
const alter = setninger.filter(s => s.startsWith('alter table '))
const ALTER_RE = /^alter table public\.(\S+) add column klubb_id uuid not null default public\.standard_klubb_id\(\) references public\.klubb\(id\) on update cascade on delete restrict$/
const tilfoeydeTabeller = alter.map(s => ALTER_RE.exec(s)?.[1]).filter((x): x is string => !!x)

// Skjemaet slik det så ut etter 161 (ikke senere migrasjoner).
const skjema161 = byggSkjema(lesMigrasjoner(161)).tabeller
const klubbeide161 = [...skjema161.keys()].filter(t => !KLUBB_ID_UNNTAK.some(u => u.tabell === t))

const FORVENTEDE_INDEKSER = [
  ['arrangementer', 'start_tidspunkt'],
  ['meldinger', 'sist_aktivitet desc'],
  ['klubb_chat', 'opprettet desc, id desc'],
  ['album', 'opprettet desc'],
  ['poll', 'svarfrist'],
  ['feil_logg', 'opprettet desc'],
  ['vitals_logg', 'opprettet desc'],
  ['kaaring_vinnere', 'aar'],
  ['arrangoransvar', 'aar'],
  ['kart_markering', 'utloper'],
] as const

describe('migrasjon 161: klubb_id', () => {
  it('hver alter table følger malen eksakt', () => {
    expect(alter).toHaveLength(tilfoeydeTabeller.length)
  })

  it('kolonnen legges til på nøyaktig de klubbeide tabellene', () => {
    expect(new Set(tilfoeydeTabeller).size).toBe(tilfoeydeTabeller.length)
    expect([...tilfoeydeTabeller].sort()).toEqual([...klubbeide161].sort())
  })

  it('unntakene har ikke klubb_id, og finnes', () => {
    for (const u of KLUBB_ID_UNNTAK) {
      expect(tilfoeydeTabeller, u.tabell).not.toContain(u.tabell)
      expect([...skjema161.keys()], u.tabell).toContain(u.tabell)
    }
  })

  it('lock_timeout er første setning', () => {
    expect(setninger[0]).toBe("set local lock_timeout = '3s'")
  })

  it('standard_klubb_id er stable, uten security definer, og uuid-en står kun der', () => {
    const f = setninger.find(s => s.startsWith('create function public.standard_klubb_id'))!
    expect(f).toBeDefined()
    expect(f).toContain(' stable ')
    expect(f).toContain("set search_path = ''")
    expect(f).not.toContain('security definer')
    expect(f).toContain(FOERSTE_KLUBB_ID)
    expect(SQL.split(FOERSTE_KLUBB_ID)).toHaveLength(2)
  })

  it('revoke før grant, ingen grant til anon', () => {
    const revoke = setninger.findIndex(s => s === 'revoke execute on function public.standard_klubb_id() from public, anon')
    const grant = setninger.findIndex(s => s === 'grant execute on function public.standard_klubb_id() to authenticated, service_role')
    expect(revoke).toBeGreaterThanOrEqual(0)
    expect(grant).toBeGreaterThan(revoke)
    expect(setninger.filter(s => s.startsWith('grant') && /\banon\b/.test(s))).toEqual([])
  })

  it('nøyaktig de 10 rot-indeksene finnes', () => {
    const faktisk = setninger.filter(s => s.startsWith('create index')).sort()
    const forventet = FORVENTEDE_INDEKSER.map(([t, kol]) => {
      const navn = kol.split(',')[0].replace(' desc', '')
      return `create index ${t}_klubb_id_${navn}_idx on public.${t} (klubb_id, ${kol})`
    }).sort()
    expect(faktisk).toEqual(forventet)
  })

  it('endrer ingen nøkler eller kolonner', () => {
    expect(SQL).not.toMatch(/\bdrop /)
    expect(SQL).not.toContain('primary key')
    expect(SQL).not.toContain(' unique')
    expect(SQL).not.toContain('alter column')
  })

  it('unntakslista i psql-steget i pr-check.yml er lik klassifiseringen', () => {
    const yml = readFileSync(path.resolve(__dirname, '../.github/workflows/pr-check.yml'), 'utf-8').replace(/\r\n/g, '\n')
    const m = /unntak constant text\[\] := array\[([^\]]+)\]/.exec(yml)
    expect(m, 'fant ikke unntakslista i pr-check.yml').not.toBeNull()
    const iYml = [...m![1].matchAll(/'([^']+)'/g)].map(x => x[1])
    expect(iYml).toEqual(KLUBB_ID_UNNTAK.map(u => u.tabell))
  })
})
