// aktivKlubbId() (#868) har sin uuid i tre kopier som ikke kan importere hverandre:
// koden, standard_klubb_id() i SQL og init-admin.mjs. Denne testen holder dem like.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { aktivKlubbId } from '@/lib/klubb-kontekst'

function les(rel: string) {
  return readFileSync(path.resolve(__dirname, '..', rel), 'utf-8').replace(/\r\n/g, '\n')
}

describe('aktivKlubbId()', () => {
  const sqlUuid = /standard_klubb_id\(\) returns uuid[\s\S]*?'([0-9a-f-]{36})'::uuid/.exec(
    les('supabase/migrations/161_klubb_id.sql'),
  )?.[1]

  it('er lik uuid-en i standard_klubb_id() (161_klubb_id.sql)', () => {
    expect(sqlUuid).toBeDefined()
    expect(aktivKlubbId()).toBe(sqlUuid)
  })

  it('står også i scripts/init-admin.mjs', () => {
    expect(les('scripts/init-admin.mjs')).toContain(`'${aktivKlubbId()}'`)
  })

  it('lib/klubb-kontekst.ts er server-only', () => {
    expect(les('lib/klubb-kontekst.ts').startsWith("import 'server-only'")).toBe(true)
  })
})
