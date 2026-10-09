// Seed-ID-ene e2e-hjelperne peker på må finnes i supabase/seed.sql (#851).
// Uten denne vakten gir en endret seed en e2e som tester notFound()-grenen
// eller feil rolle, i stedet for å feile tydelig.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ARRANGEMENT, MELDING, POLL, MEDLEM, ALBUM, SAMTALE, VARSEL } from '../e2e/helpers/ruter'
import { TESTBRUKERE } from '../e2e/helpers/rls-klienter'

const SEED = readFileSync(path.resolve(__dirname, '../supabase/seed.sql'), 'utf-8')
  .replace(/\r\n/g, '\n')
  .replace(/--[^\n]*/g, '')

describe('e2e/helpers/ruter.ts ↔ seed.sql', () => {
  it.each(Object.entries({ ARRANGEMENT, MELDING, POLL, MEDLEM, ALBUM, SAMTALE, VARSEL }))(
    '%s finnes i seed.sql',
    (_navn, id) => {
      expect(SEED).toContain(`'${id}'`)
    },
  )
})

describe('TESTBRUKERE (e2e/helpers/rls-klienter.ts) ↔ seed.sql', () => {
  it.each(Object.entries(TESTBRUKERE))('%s: id, e-post og rolle', (_navn, bruker) => {
    // auth.users-raden: id, så 'authenticated', 'authenticated', så e-posten.
    const epost = SEED.match(
      new RegExp(`'${bruker.id}',\\s*'authenticated',\\s*'authenticated',\\s*'([^']+)'`),
    )?.[1]
    expect(epost).toBe(bruker.epost)

    // Profil-oppdateringen som setter rollen for denne id-en.
    const rolle = SEED.split(';')
      .find(s => /update\s+public\.profiles\s+set/i.test(s) && s.includes(`where id = '${bruker.id}'`))
      ?.match(/rolle\s*=\s*'(\w+)'/)?.[1]
    expect(rolle).toBe(bruker.rolle)
  })
})
