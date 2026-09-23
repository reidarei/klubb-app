// Pinner filtrene og aggregeringen bak den daglige feil-alarmen.
// Ruten hadde ingen testfil i det hele tatt: reviewer mutasjonstestet #496 og
// fant at .neq('nivaa','warn') kunne fjernes uten at én eneste test ble rød.
// Filtrene ER alarmens oppførsel — terskelen er 0, så hver rad som slipper
// gjennom sender push + e-post til alle med faar_feilvarsler. (#498-review,
// feltnavnet oppdatert da innspill-/feilvarsler ble delt i to, se migrasjon 123.)

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import {
  tellAlarmverdigeFeil,
  hentToppEventRader,
  lagToppEventTekst,
} from '@/lib/feil-alarm'
import { ALARM_IGNORERTE_EVENTS, TOPP_EVENT_HENT_GRENSE } from '@/lib/konstanter'

const SIDEN = '2026-07-26T05:00:00.000Z'

// Chainable mock som logger hvert kall som [metode, ...argumenter], slik at
// testene kan slå opp «ble .not() kalt, og med hva».
function lagKlient(resultat: unknown = { data: [], error: null, count: 0 }) {
  const kall: [string, ...unknown[]][] = []
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'neq', 'not', 'gte', 'order', 'limit']) {
    chain[m] = vi.fn((...args: unknown[]) => {
      kall.push([m, ...args])
      return chain
    })
  }
  chain.then = (resolve: (v: unknown) => void) => Promise.resolve(resultat).then(resolve)

  const from = vi.fn(() => chain)
  const klient = { from } as unknown as SupabaseClient<Database>

  const argFor = (metode: string) => kall.find(k => k[0] === metode)?.slice(1)
  return { klient, from, kall, argFor }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe.each([
  ['tellAlarmverdigeFeil', tellAlarmverdigeFeil],
  ['hentToppEventRader', hentToppEventRader],
])('%s – felles alarmfiltre', (_navn, spørring) => {
  it('utelater warn-rader (#496 krav — var upinnet)', async () => {
    const { klient, argFor } = lagKlient()

    await spørring(klient, SIDEN)

    expect(argFor('neq')).toEqual(['nivaa', 'warn'])
  })

  it('utelater ALARM_IGNORERTE_EVENTS fra tellingen', async () => {
    const { klient, argFor } = lagKlient()

    await spørring(klient, SIDEN)

    expect(argFor('not')).toEqual([
      'event',
      'in',
      `(${ALARM_IGNORERTE_EVENTS.join(',')})`,
    ])
  })

  it('ai.datoforslag.feilet er blant de ignorerte — transient Anthropic-feil', async () => {
    // Selve funnet i #498-review MAJOR 3: én 429/529 fra Anthropic i døgnet
    // var nok til å varsle alle, fordi terskelen er 0.
    const { klient, argFor } = lagKlient()

    await spørring(klient, SIDEN)

    const filter = String(argFor('not')?.[2])
    expect(filter).toContain('ai.datoforslag.feilet')
    expect(filter).toContain('varsel.push.feilet')
    expect(filter).toContain('varsel.logg.insert.feilet')
  })

  it('avgrenser til vinduet den fikk oppgitt', async () => {
    const { klient, argFor } = lagKlient()

    await spørring(klient, SIDEN)

    expect(argFor('gte')).toEqual(['opprettet', SIDEN])
  })

  it('spør mot feil_logg', async () => {
    const { klient, from } = lagKlient()

    await spørring(klient, SIDEN)

    expect(from).toHaveBeenCalledWith('feil_logg')
  })
})

describe('tellAlarmverdigeFeil – teller uten å hente rader', () => {
  it('bruker count: exact + head: true', async () => {
    const { klient, argFor } = lagKlient({ data: null, error: null, count: 7 })

    const { count } = await tellAlarmverdigeFeil(klient, SIDEN)

    expect(argFor('select')).toEqual(['*', { count: 'exact', head: true }])
    expect(count).toBe(7)
  })
})

describe('hentToppEventRader – uttrekket til topp-3-listen', () => {
  it('sorterer nyeste først før limit — ellers er utvalget vilkårlig', async () => {
    // Under en storm kutter .limit() ved TOPP_EVENT_HENT_GRENSE. Uten .order()
    // bestemmer Postgres hvilke rader som kommer med, og topp-3-listen i
    // alarmen kan peke på feil event. (#498-review MINOR 5)
    const { klient, argFor } = lagKlient()

    await hentToppEventRader(klient, SIDEN)

    expect(argFor('order')).toEqual(['opprettet', { ascending: false }])
  })

  it('henter kun event-kolonnen, capet til TOPP_EVENT_HENT_GRENSE', async () => {
    const { klient, argFor } = lagKlient()

    await hentToppEventRader(klient, SIDEN)

    expect(argFor('select')).toEqual(['event'])
    expect(argFor('limit')).toEqual([TOPP_EVENT_HENT_GRENSE])
  })
})

describe('lagToppEventTekst', () => {
  it('gir tom streng når det ikke er noen rader', () => {
    expect(lagToppEventTekst([])).toBe('')
  })

  it('teller per event og sorterer synkende', () => {
    const tekst = lagToppEventTekst([
      { event: 'a.feilet' },
      { event: 'b.feilet' },
      { event: 'a.feilet' },
      { event: 'a.feilet' },
      { event: 'b.feilet' },
      { event: 'c.feilet' },
    ])

    expect(tekst).toBe('\n\nTopp 3:\na.feilet: 3\nb.feilet: 2\nc.feilet: 1')
  })

  it('viser maks 3 events selv om det finnes flere', () => {
    const tekst = lagToppEventTekst(
      ['a', 'b', 'c', 'd', 'e'].map(event => ({ event })),
    )

    // «Topp 3:»-overskriften teller ikke med — bare linjene på «event: n»-form.
    const eventLinjer = tekst.split('\n').filter(l => /^\S+: \d+$/.test(l))
    expect(eventLinjer).toEqual(['a: 1', 'b: 1', 'c: 1'])
  })

  it('takler ett enkelt event', () => {
    expect(lagToppEventTekst([{ event: 'kun.en' }])).toBe('\n\nTopp 3:\nkun.en: 1')
  })
})
