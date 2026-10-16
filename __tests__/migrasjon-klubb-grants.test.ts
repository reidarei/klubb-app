// Grant-kontrakten for public.klubb (#864): authenticated skal KUN ha select.
// Migrasjon 108 lar authenticated arve Supabase-defaulten GRANT ALL på nye
// tabeller, så uten `revoke all` FØR granten beholder rollen insert/update/
// delete — og RLS-testen alene kan ikke skille «grant mangler» fra «policy
// mangler». Denne vakten leser migrasjonsfila direkte.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const SQL = readFileSync(path.resolve(__dirname, '../supabase/migrations/160_klubb.sql'), 'utf-8')
  .replace(/\r\n/g, '\n')
  .replace(/--[^\n]*/g, '')
  .toLowerCase()

// Alle grant/revoke-setninger på public.klubb, i rekkefølge.
const setninger = SQL.split(';')
  .map(s => s.replace(/\s+/g, ' ').trim())
  .filter(s => /^(grant|revoke) .* on (table )?public\.klubb (to|from) /.test(s))

describe('migrasjon 160: grants på public.klubb', () => {
  it('revoker alt fra authenticated før noen grant til authenticated', () => {
    const revoke = setninger.findIndex(s => /^revoke all( privileges)? on (table )?public\.klubb from .*\bauthenticated\b/.test(s))
    const forsteGrant = setninger.findIndex(s => s.startsWith('grant') && /\bto .*\bauthenticated\b/.test(s))
    expect(revoke).toBeGreaterThanOrEqual(0)
    expect(forsteGrant).toBeGreaterThan(revoke)
  })

  it('authenticated får kun select', () => {
    const grants = setninger.filter(s => s.startsWith('grant') && /\bto .*\bauthenticated\b/.test(s))
    expect(grants).toEqual(['grant select on public.klubb to authenticated'])
  })

  it('anon får ingenting', () => {
    expect(setninger.filter(s => s.startsWith('grant') && /\banon\b/.test(s))).toEqual([])
  })
})
