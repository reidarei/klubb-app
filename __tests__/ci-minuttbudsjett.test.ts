import { describe, it, expect } from 'vitest'
import {
  jobbMinutter,
  unikeJobber,
  kjoringMinutter,
  tomCache,
  tolkCache,
  skalKjoreE2e,
  foersteIManeden,
  hentForbrukForManeden,
  MAKS_JOBB_OPPSLAG,
  CI_BUDSJETT_MIN,
  DRIFTSRESERVE_MIN,
  KVOTE_MIN,
  E2E_KOST_MIN,
} from '../.github/scripts/ci-minuttbudsjett.mjs'

// En budsjettvakt som teller feil er verre enn ingen (den gir falsk trygghet
// om at porten kjørte) — disse testene er derfor skrevet for å fange
// mutasjoner i avrunding og terskel-sammenligning, ikke bare happy path.

type Cache = { versjon: number; maaned: string; runs: Record<string, { forsok: number; min: number; tidligereMin: number }> }

const t = (hhmmss: string) => `2026-10-04T${hhmmss}Z`

function jobb(overstyr: Record<string, unknown> = {}) {
  return { id: 1, run_id: 1, name: 'sjekk', run_attempt: 1, started_at: t('10:00:00'), completed_at: t('10:01:00'), ...overstyr }
}

describe('jobbMinutter', () => {
  it('runder opp PER JOBB (2 × 61 s → 4 min, ikke 3)', () => {
    const jobber = [
      jobb({ completed_at: t('10:01:01') }),
      jobb({ id: 2, name: 'kjerne', completed_at: t('10:01:01') }),
    ]
    expect(jobbMinutter(jobber).minutter).toBe(4)
  })

  it('runder ikke opp ved eksakt 60 sekunder', () => {
    expect(jobbMinutter([jobb()]).minutter).toBe(1)
  })

  it('gir 0/0 for tom liste', () => {
    expect(jobbMinutter([])).toEqual({ minutter: 0, utelatt: 0 })
  })

  it('uten naa: pågående jobb utelates og telles i utelatt', () => {
    expect(jobbMinutter([jobb({ completed_at: null }), jobb({ id: 2 })])).toEqual({ minutter: 1, utelatt: 1 })
  })

  it('med naa: pågående jobb telles til «nå», queued (ikke startet) gir 0 uten NaN', () => {
    const naa = new Date(t('10:05:00'))
    const jobber = [jobb({ completed_at: null }), jobb({ id: 2, started_at: null, completed_at: null })]
    expect(jobbMinutter(jobber, { naa })).toEqual({ minutter: 5, utelatt: 1 })
  })

  it('hopper over uparsbare tidsstempler i stedet for å gi NaN', () => {
    expect(jobbMinutter([jobb({ started_at: 'ikke-en-dato' }), jobb({ id: 2 })]).minutter).toBe(1)
  })
})

// #851: ekte form fra en «Re-run failed jobs» på pr-check (4.10.2026): sjekk
// feilet og ble kjørt igjen, kjerne ble KOPIERT inn i forsøk 2 med ny id men
// originalens tider.
const delvisRerun = [
  jobb({ id: 11, name: 'sjekk', run_attempt: 1, started_at: t('17:52:02'), completed_at: t('18:00:09') }), // 9 min
  jobb({ id: 12, name: 'kjerne', run_attempt: 1, started_at: t('17:52:03'), completed_at: t('17:55:53') }), // 4 min
  jobb({ id: 21, name: 'sjekk', run_attempt: 2, started_at: t('18:00:36'), completed_at: t('18:08:29') }), // 8 min
  jobb({ id: 22, name: 'kjerne', run_attempt: 2, started_at: t('17:52:03'), completed_at: t('17:55:53') }), // kopi
]

describe('unikeJobber', () => {
  it('fjerner kopien fra «Re-run failed jobs», beholder den ekte reruns', () => {
    expect(unikeJobber(delvisRerun).map((j: { id: number }) => j.id)).toEqual([11, 12, 21])
  })

  it('rører ikke like tider i et annet run', () => {
    const jobber = [jobb({ run_id: 1 }), jobb({ id: 2, run_id: 2, run_attempt: 2 })]
    expect(unikeJobber(jobber)).toHaveLength(2)
  })

  it('rører ikke to jobber med like tider i SAMME forsøk', () => {
    expect(unikeJobber([jobb(), jobb({ id: 2, name: 'kjerne' })])).toHaveLength(2)
  })
})

describe('kjoringMinutter', () => {
  it('delvis rerun: 9 + 4 + 8 = 21 min, kopien telles ikke; 13 av dem er tidligere forsøk', () => {
    expect(kjoringMinutter({ run_attempt: 2 }, delvisRerun)).toEqual({ min: 21, tidligereMin: 13 })
  })

  it('to parallelle jobber faktureres hver for seg — mer enn run-varigheten', () => {
    const jobber = [
      jobb({ name: 'sjekk', completed_at: t('10:08:00') }), // 8
      jobb({ id: 2, name: 'kjerne', completed_at: t('10:03:30') }), // 4
    ]
    expect(kjoringMinutter({ run_attempt: 1 }, jobber)).toEqual({ min: 12, tidligereMin: 0 })
  })
})

describe('tolkCache', () => {
  const naa = new Date(t('12:00:00'))

  it('leser en gyldig cache for inneværende måned', () => {
    const cache = { ...tomCache(naa), runs: { 5: { forsok: 1, min: 3, tidligereMin: 0 } } }
    expect(tolkCache(JSON.stringify(cache), naa).runs).toEqual({ 5: { forsok: 1, min: 3, tidligereMin: 0 } })
  })

  it('forrige måneds cache, feil versjon eller søppel ⇒ tom (aldri kast)', () => {
    const forrige = { ...tomCache(new Date('2026-09-30T12:00:00Z')), runs: { 5: { forsok: 1, min: 3, tidligereMin: 0 } } }
    expect(tolkCache(JSON.stringify(forrige), naa).runs).toEqual({})
    expect(tolkCache(JSON.stringify({ ...forrige, maaned: '2026-10', versjon: 99 }), naa).runs).toEqual({})
    expect(tolkCache('{ikke json', naa).runs).toEqual({})
  })

  it('dropper ugyldige poster enkeltvis', () => {
    const cache = {
      ...tomCache(naa),
      runs: {
        1: { forsok: 1, min: -2, tidligereMin: 0 },
        2: { forsok: 1, min: 'x', tidligereMin: 0 },
        3: { forsok: 1, min: 2, tidligereMin: 3 },
        4: { forsok: 2, min: 5, tidligereMin: 2 },
      },
    }
    expect(Object.keys(tolkCache(JSON.stringify(cache), naa).runs)).toEqual(['4'])
  })
})

describe('skalKjoreE2e', () => {
  it('kjører når forbruk + e2e-kost akkurat treffer budsjettet', () => {
    expect(skalKjoreE2e(CI_BUDSJETT_MIN - E2E_KOST_MIN, CI_BUDSJETT_MIN, E2E_KOST_MIN)).toBe(true)
  })

  it('kutter når forbruk + e2e-kost overskrider budsjettet med 1 minutt', () => {
    expect(skalKjoreE2e(CI_BUDSJETT_MIN - E2E_KOST_MIN + 1, CI_BUDSJETT_MIN, E2E_KOST_MIN)).toBe(false)
  })

  it('terskelen slår inn på forbruk + kost — ikke forbruk alene', () => {
    // forbruk alene er akkurat på budsjettet (ville vært "innenfor" om
    // e2e-kost ikke ble lagt til), men med kosten lagt til går den over.
    expect(skalKjoreE2e(CI_BUDSJETT_MIN, CI_BUDSJETT_MIN, E2E_KOST_MIN)).toBe(false)
  })
})

describe('konstantene henger sammen', () => {
  it('driftsreserven dekker både egen drift og andre private repoer på kontoen', () => {
    // 184 (dette repoets drift, målt juli 2026) + ~293 (andre private repoer
    // på samme konto, samme måned) = 477. Reserven må ligge over det med
    // margin, ellers kan drift-cronene bli sperret — og drift kuttes aldri.
    expect(DRIFTSRESERVE_MIN).toBeGreaterThanOrEqual(477)
    expect(CI_BUDSJETT_MIN).toBe(KVOTE_MIN - DRIFTSRESERVE_MIN)
  })
})

describe('hentForbrukForManeden', () => {
  // Stubbene implementerer bare de fire feltene skriptet faktisk leser (ok,
  // status, statusText, json) — derfor casten til typeof fetch.
  const somFetch = (f: (url: string, init: RequestInit) => Promise<unknown>) => f as unknown as typeof fetch
  const ok = (body: unknown) => ({ ok: true, status: 200, statusText: 'OK', json: async () => body })
  const naa = new Date(t('20:00:00'))
  const run = (id: number, overstyr: Record<string, unknown> = {}) => ({ id, status: 'completed', run_attempt: 1, ...overstyr })
  // Standard: ett run = én jobb på `id` minutter.
  const jobbPaa = (id: number) => [jobb({ run_id: id, completed_at: `2026-10-04T10:${String(id % 60).padStart(2, '0')}:00Z` })]

  function api(runSider: unknown[][], jobberFor: (id: number) => unknown[] = jobbPaa) {
    const kall: string[] = []
    let side = 0
    const fetchImpl = somFetch(async url => {
      kall.push(url)
      const m = /\/runs\/(\d+)\/jobs/.exec(url)
      if (m) return ok({ jobs: jobberFor(Number(m[1])) })
      return ok({ workflow_runs: runSider[side++] ?? [] })
    })
    return { fetchImpl, jobbKall: () => kall.filter(u => u.includes('/jobs')).length }
  }

  it('summerer jobbene for alle kjøringer over flere sider', async () => {
    const sider = [Array.from({ length: 100 }, (_, i) => run(1000 + i)), [run(2)]]
    const { fetchImpl, jobbKall } = api(sider, () => [jobb()])
    const forbruk = await hentForbrukForManeden({ repo: 'a/b', token: 't', naa, fetchImpl })
    expect(forbruk).toMatchObject({ totalMin: 101, oppslag: 101, fraCache: 0 })
    expect(jobbKall()).toBe(101)
  })

  it('bruker cachen for ferdige kjøringer og gjør null jobb-kall for dem', async () => {
    const cache: Cache = { ...tomCache(naa), runs: { 7: { forsok: 1, min: 9, tidligereMin: 0 } } }
    const { fetchImpl, jobbKall } = api([[run(7), run(3)]])
    const forbruk = await hentForbrukForManeden({ repo: 'a/b', token: 't', naa, fetchImpl, cache })
    expect(forbruk).toMatchObject({ totalMin: 9 + 3, oppslag: 1, fraCache: 1 })
    expect(jobbKall()).toBe(1)
    expect(cache.runs[3]).toEqual({ forsok: 1, min: 3, tidligereMin: 0 })
  })

  it('henter på nytt når run_attempt har økt (rerun), og cacher ikke en pågående kjøring', async () => {
    const cache: Cache = { ...tomCache(naa), runs: { 7: { forsok: 1, min: 9, tidligereMin: 0 } } }
    const { fetchImpl, jobbKall } = api([[run(7, { run_attempt: 2 }), run(8, { status: 'in_progress' })]])
    await hentForbrukForManeden({ repo: 'a/b', token: 't', naa, fetchImpl, cache })
    expect(jobbKall()).toBe(2)
    expect(cache.runs[7].forsok).toBe(2)
    expect(cache.runs[8]).toBeUndefined()
  })

  it('fjerner cache-poster for kjøringer som ikke lenger er i lista', async () => {
    const cache: Cache = { ...tomCache(naa), runs: { 7: { forsok: 1, min: 9, tidligereMin: 0 }, 99: { forsok: 1, min: 4, tidligereMin: 0 } } }
    const { fetchImpl } = api([[run(7)]])
    await hentForbrukForManeden({ repo: 'a/b', token: 't', naa, fetchImpl, cache })
    expect(Object.keys(cache.runs)).toEqual(['7'])
  })

  it('delvis rerun teller kopien én gang (#851)', async () => {
    const { fetchImpl } = api([[run(1, { run_attempt: 2 })]], () => delvisRerun)
    const forbruk = await hentForbrukForManeden({ repo: 'a/b', token: 't', naa, fetchImpl })
    expect(forbruk).toMatchObject({ totalMin: 21, tidligereForsokMin: 13 })
  })

  // Feiler LUKKET: en sum uten de resterende kjøringene ser komplett ut. Det
  // som rakk å hentes, skal likevel være cachet, så neste kjøring kommer videre.
  it('kaster over maksOppslag, men har cachet det som ble hentet', async () => {
    const cache = tomCache(naa)
    const { fetchImpl, jobbKall } = api([[run(1), run(2), run(3)]])
    await expect(hentForbrukForManeden({ repo: 'a/b', token: 't', naa, fetchImpl, cache, maksOppslag: 2 })).rejects.toThrow(/taket/)
    expect(jobbKall()).toBe(2)
    expect(Object.keys(cache.runs)).toHaveLength(2)
  })

  it('standardtaket ligger under GITHUB_TOKEN-grensen på 1000 kall/time', () => {
    expect(MAKS_JOBB_OPPSLAG).toBeLessThan(1000)
  })

  it('kaster i stedet for å returnere et for lavt tall når pagineringstaket nås', async () => {
    const full = Array.from({ length: 100 }, (_, i) => run(i + 1))
    const { fetchImpl } = api([full, full, full])
    await expect(hentForbrukForManeden({ repo: 'a/b', token: 't', naa, fetchImpl, maksSider: 3 })).rejects.toThrow(/pagineringstaket/i)
  })

  it('kaster ved API-feil — også på jobb-kallet — så VED_MAALEFEIL får bestemme', async () => {
    const forbudt = somFetch(async () => ({ ok: false, status: 403, statusText: 'Forbidden' }))
    await expect(hentForbrukForManeden({ repo: 'a/b', token: 't', naa, fetchImpl: forbudt })).rejects.toThrow(/403/)
    const jobbFeil = somFetch(async url =>
      url.includes('/jobs') ? { ok: false, status: 500, statusText: 'Feil' } : ok({ workflow_runs: [run(1)] }),
    )
    await expect(hentForbrukForManeden({ repo: 'a/b', token: 't', naa, fetchImpl: jobbFeil })).rejects.toThrow(/500/)
  })

  it('setter en timeout på hvert kall — vakten skal ikke brenne minuttene den vokter', async () => {
    const signaler: unknown[] = []
    const fetchImpl = somFetch(async (url, init) => {
      signaler.push(init.signal)
      return url.includes('/jobs') ? ok({ jobs: [] }) : ok({ workflow_runs: [run(1)] })
    })
    await hentForbrukForManeden({ repo: 'a/b', token: 't', naa, fetchImpl })
    expect(signaler).toHaveLength(2)
    for (const s of signaler) expect(s).toBeInstanceOf(AbortSignal)
  })
})

describe('foersteIManeden', () => {
  it('gir midnatt UTC den 1. i inneværende måned', () => {
    expect(foersteIManeden(new Date('2026-07-28T13:45:00Z'))).toBe('2026-07-01T00:00:00.000Z')
  })

  it('går riktig over årsskiftet', () => {
    expect(foersteIManeden(new Date('2027-01-05T00:00:00Z'))).toBe('2027-01-01T00:00:00.000Z')
  })
})
