import { describe, it, expect } from 'vitest'
import {
  forbrukMinutter,
  skalKjoreE2e,
  foersteIManeden,
  hentForbrukForManeden,
  tidligereForsok,
  hentTidligereForsokMinutter,
  MAKS_FORSOK_OPPSLAG,
  CI_BUDSJETT_MIN,
  DRIFTSRESERVE_MIN,
  KVOTE_MIN,
  E2E_KOST_MIN,
} from '../.github/scripts/ci-minuttbudsjett.mjs'

// En budsjettvakt som teller feil er verre enn ingen (den gir falsk trygghet
// om at porten kjørte) — disse testene er derfor skrevet for å fange
// mutasjoner i avrunding og terskel-sammenligning, ikke bare happy path.

describe('forbrukMinutter', () => {
  it('runder opp per kjøring (61 s → 2 min)', () => {
    const runs = [{ run_started_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:01:01Z' }]
    expect(forbrukMinutter(runs)).toBe(2)
  })

  it('runder ikke opp ved eksakt 60 sekunder', () => {
    const runs = [{ run_started_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:01:00Z' }]
    expect(forbrukMinutter(runs)).toBe(1)
  })

  it('gir 0 for tom liste', () => {
    expect(forbrukMinutter([])).toBe(0)
  })

  it('summerer flere kjøringer riktig når én krysser midnatt UTC', () => {
    const runs = [
      { run_started_at: '2026-07-01T23:58:00Z', updated_at: '2026-07-02T00:02:00Z' }, // 4 min, krysser midnatt
      { run_started_at: '2026-07-02T00:00:00Z', updated_at: '2026-07-02T00:03:00Z' }, // 3 min
    ]
    expect(forbrukMinutter(runs)).toBe(7)
  })

  it('teller en pågående kjøring (updated_at ≈ nå) som om den varer til nå', () => {
    const start = new Date(Date.now() - 5 * 60_000).toISOString()
    const naa = new Date().toISOString()
    expect(forbrukMinutter([{ run_started_at: start, updated_at: naa }])).toBeGreaterThanOrEqual(5)
  })

  // En `queued`-kjøring har run_started_at = null. Uten vakten i
  // forbrukMinutter ble hele summen NaN, og vakten kuttet e2e med «NaN» i
  // sammendraget av en ren datagrunn.
  it('lar ikke en queued kjøring uten run_started_at forgifte summen', () => {
    const runs = [
      { run_started_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:03:00Z' }, // 3 min
      { run_started_at: null, updated_at: '2026-07-01T00:05:00Z' }, // queued — ikke startet
    ]
    expect(forbrukMinutter(runs)).toBe(3)
  })

  it('hopper over kjøringer med uparsbare tidsstempler i stedet for å gi NaN', () => {
    const runs = [
      { run_started_at: 'ikke-en-dato', updated_at: '2026-07-01T00:05:00Z' },
      { run_started_at: '2026-07-01T00:00:00Z', updated_at: undefined },
      { run_started_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:02:00Z' }, // 2 min
    ]
    expect(forbrukMinutter(runs)).toBe(2)
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

// #668: budsjettvakten så tidligere kun SISTE forsøk per kjøring, fordi
// run_started_at/updated_at settes til siste forsøks tidspunkt ved rerun.
// tidligereForsok() er den rene delen — lister hvilke (runId, forsøk)-par som
// mangler fra run-objektet og må hentes separat via attempts-endepunktet.
describe('tidligereForsok', () => {
  it('run_attempt 3 gir to tidligere forsøk (1 og 2)', () => {
    const runs = [{ id: 42, run_attempt: 3 }]
    expect(tidligereForsok(runs)).toEqual([
      { runId: 42, forsok: 1 },
      { runId: 42, forsok: 2 },
    ])
  })

  it('run_attempt 1, eller feltet mangler, gir ingen tidligere forsøk', () => {
    expect(tidligereForsok([{ id: 1, run_attempt: 1 }, { id: 2 }])).toEqual([])
  })

  it('blandet liste — kun kjøringer med run_attempt > 1 bidrar, i rekkefølge', () => {
    const runs = [
      { id: 1, run_attempt: 1 },
      { id: 2, run_attempt: 2 },
      { id: 3 },
      { id: 4, run_attempt: 4 },
    ]
    expect(tidligereForsok(runs)).toEqual([
      { runId: 2, forsok: 1 },
      { runId: 4, forsok: 1 },
      { runId: 4, forsok: 2 },
      { runId: 4, forsok: 3 },
    ])
  })
})

describe('hentTidligereForsokMinutter', () => {
  const somFetch = (f: (url: string, init: RequestInit) => Promise<unknown>) =>
    f as unknown as typeof fetch
  const attemptSvar = (startet: string, fullfort: string) => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({ run_started_at: startet, updated_at: fullfort }),
  })

  it('summerer ceil per forsøk via attempts-endepunktet', async () => {
    const runs = [{ id: 42, run_attempt: 2 }]
    const kalte: string[] = []
    const minutter = await hentTidligereForsokMinutter({
      repo: 'a/b',
      token: 't',
      runs,
      fetchImpl: somFetch(async url => {
        kalte.push(url)
        return attemptSvar('2026-09-01T00:00:00Z', '2026-09-01T00:12:00Z') // 12 min
      }),
    })
    expect(minutter).toBe(12)
    expect(kalte).toEqual(['https://api.github.com/repos/a/b/actions/runs/42/attempts/1'])
  })

  it('gir 0 min og gjør ingen kall når ingen kjøring har reruns', async () => {
    let kall = 0
    const minutter = await hentTidligereForsokMinutter({
      repo: 'a/b',
      token: 't',
      runs: [{ id: 1, run_attempt: 1 }],
      fetchImpl: somFetch(async () => {
        kall++
        return attemptSvar('2026-09-01T00:00:00Z', '2026-09-01T00:01:00Z')
      }),
    })
    expect(minutter).toBe(0)
    expect(kall).toBe(0)
  })

  // Fail-closed, samme begrunnelse som pagineringstaket i
  // hentForbrukForManeden(): et ukjent antall utelatte forsøk skal aldri
  // returnere et tall som SER komplett ut.
  it('kaster i stedet for å utelate forsøk når MAKS_FORSOK_OPPSLAG overskrides', async () => {
    const runs = [{ id: 1, run_attempt: MAKS_FORSOK_OPPSLAG + 2 }] // MAKS_FORSOK_OPPSLAG + 1 tidligere forsøk
    await expect(
      hentTidligereForsokMinutter({
        repo: 'a/b',
        token: 't',
        runs,
        fetchImpl: somFetch(async () => {
          throw new Error('skal aldri kalles — taket skal stoppe oss først')
        }),
      }),
    ).rejects.toThrow(/taket nådd/i)
  })

  it('kaster ved et ikke-ok svar fra attempts-endepunktet', async () => {
    const runs = [{ id: 1, run_attempt: 2 }]
    await expect(
      hentTidligereForsokMinutter({
        repo: 'a/b',
        token: 't',
        runs,
        fetchImpl: somFetch(async () => ({ ok: false, status: 404, statusText: 'Not Found' })),
      }),
    ).rejects.toThrow(/404/)
  })

  // HTTP 200 med ubrukelige tider må feile LUKKET som !res.ok — ellers ble
  // forsøket 0 min i summen, en stille undervurdering (#668-review).
  it.each([
    ['tomme felt', { run_started_at: null, updated_at: '' }],
    ['manglende felt', {}],
    ['ugyldig dato', { run_started_at: 'tull', updated_at: '2026-09-01T00:05:00Z' }],
    ['updated_at før run_started_at', { run_started_at: '2026-09-01T00:05:00Z', updated_at: '2026-09-01T00:00:00Z' }],
  ])('kaster ved 200 med %s', async (_navn, body) => {
    await expect(
      hentTidligereForsokMinutter({
        repo: 'a/b',
        token: 't',
        runs: [{ id: 1, run_attempt: 2 }],
        fetchImpl: somFetch(async () => ({ ok: true, status: 200, statusText: 'OK', json: async () => body })),
      }),
    ).rejects.toThrow(/Ugyldig tidsrom/)
  })

  it('setter en timeout på attempts-kallet — samme vakt som resten av skriptet', async () => {
    const runs = [{ id: 1, run_attempt: 2 }]
    let signal: AbortSignal | undefined
    await hentTidligereForsokMinutter({
      repo: 'a/b',
      token: 't',
      runs,
      fetchImpl: somFetch(async (_url, init) => {
        signal = init.signal ?? undefined
        return attemptSvar('2026-09-01T00:00:00Z', '2026-09-01T00:01:00Z')
      }),
    })
    expect(signal).toBeInstanceOf(AbortSignal)
  })
})

describe('hentForbrukForManeden', () => {
  // Stubbene implementerer bare de fire feltene skriptet faktisk leser (ok,
  // status, statusText, json) — derfor casten til typeof fetch. Å bygge et
  // fullt Response-objekt ville skjult hvor lite av APIet vi er avhengige av.
  function svar(runs: unknown[]) {
    return { ok: true, status: 200, statusText: 'OK', json: async () => ({ workflow_runs: runs }) }
  }
  const somFetch = (f: (url: string, init: RequestInit) => Promise<unknown>) =>
    f as unknown as typeof fetch
  const enMinutt = { run_started_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:01:00Z' }

  it('stopper på første ikke-fulle side og summerer alle sidene (ingen reruns i fixture)', async () => {
    const sider = [Array(100).fill(enMinutt), Array(30).fill(enMinutt)]
    let kall = 0
    const forbruk = await hentForbrukForManeden({
      repo: 'a/b',
      token: 't',
      fetchImpl: somFetch(async () => svar(sider[kall++])),
    })
    expect(forbruk).toEqual({ totalMin: 130, sisteForsokMin: 130, tidligereForsokMin: 0, oppslag: 0 })
    expect(kall).toBe(2)
  })

  // #668: fixturen har ingen run_attempt > 1 — kallteller er den harde vakten
  // mot at rerun-korreksjonen koster noe når den ikke trengs.
  it('gjør null ekstra fetch-kall mot attempts-endepunktet når ingen kjøring har reruns', async () => {
    let kall = 0
    const urler: string[] = []
    await hentForbrukForManeden({
      repo: 'a/b',
      token: 't',
      fetchImpl: somFetch(async url => {
        kall++
        urler.push(url)
        return svar([{ ...enMinutt, id: 1, run_attempt: 1 }])
      }),
    })
    expect(kall).toBe(1)
    expect(urler.some(u => u.includes('/attempts/'))).toBe(false)
  })

  // Regresjonstest (#668): en kjøring med ETT rerun skal telle BEGGE forsøk.
  // Siste forsøk (slik run-basert telling så det FØR #668) er 10 min; det
  // tapte første forsøket, hentet via attempts-endepunktet, er 12 min.
  it('regresjonstest: run_attempt 2, siste forsøk 10 min, attempt 1 12 min ⇒ totalMin 22', async () => {
    const forbruk = await hentForbrukForManeden({
      repo: 'a/b',
      token: 't',
      fetchImpl: somFetch(async url => {
        if (url.includes('/attempts/1')) {
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({ run_started_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:12:00Z' }), // 12 min
          }
        }
        return svar([
          { id: 900, run_attempt: 2, run_started_at: '2026-09-01T01:00:00Z', updated_at: '2026-09-01T01:10:00Z' }, // 10 min
        ])
      }),
    })
    expect(forbruk).toEqual({ totalMin: 22, sisteForsokMin: 10, tidligereForsokMin: 12, oppslag: 1 })
  })

  // Feiler LUKKET, ikke åpent: traff vi taket med full siste side har vi bare
  // sett de nyeste kjøringene, og et for lavt tall ville sluppet e2e videre
  // selv om budsjettet var brukt opp — motsatt av VED_MAALEFEIL = 'kutt'.
  it('kaster i stedet for å returnere et for lavt tall når pagineringstaket nås', async () => {
    await expect(
      hentForbrukForManeden({
        repo: 'a/b',
        token: 't',
        maksSider: 3,
        fetchImpl: somFetch(async () => svar(Array(100).fill(enMinutt))),
      }),
    ).rejects.toThrow(/pagineringstaket/i)
  })

  it('kaster ved API-feil så VED_MAALEFEIL får bestemme', async () => {
    await expect(
      hentForbrukForManeden({
        repo: 'a/b',
        token: 't',
        fetchImpl: somFetch(async () => ({ ok: false, status: 403, statusText: 'Forbidden' })),
      }),
    ).rejects.toThrow(/403/)
  })

  it('setter en timeout på hvert kall — vakten skal ikke brenne minuttene den vokter', async () => {
    let signal: AbortSignal | undefined
    await hentForbrukForManeden({
      repo: 'a/b',
      token: 't',
      fetchImpl: somFetch(async (_url, init) => {
        signal = init.signal ?? undefined
        return svar([])
      }),
    })
    expect(signal).toBeInstanceOf(AbortSignal)
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
