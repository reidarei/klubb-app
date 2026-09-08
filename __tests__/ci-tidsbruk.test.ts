import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  jobbMinutter,
  forsokFordeling,
  stegFordeling,
  klassifiserE2e,
  e2eKjorte,
  grupperPerUke,
  hentRuns,
  hentJobber,
  STEG_E2E,
  MARKOER_LAV_RISIKO,
  MARKOER_BUDSJETT,
} from '../.github/scripts/ci-tidsbruk.mjs'
import { forbrukMinutter } from '../.github/scripts/ci-minuttbudsjett.mjs'

// Nøytrale repo-navn i alle fixtures — disse filene speiles til det
// offentlige klubb-app-repoet, og lekkasjevakten greper etter klubbnavn.

function jobb(overstyr: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    run_id: 100,
    run_attempt: 1,
    started_at: '2026-09-01T10:00:00Z',
    completed_at: '2026-09-01T10:01:00Z',
    steps: [],
    ...overstyr,
  }
}

function steg(navn: string, startet: string | null, fullfort: string | null, conclusion = 'success') {
  return { name: navn, conclusion, started_at: startet, completed_at: fullfort }
}

describe('jobbMinutter', () => {
  it('runder opp per jobb (61 s → 2 min)', () => {
    const { minutter } = jobbMinutter([jobb({ started_at: '2026-09-01T10:00:00Z', completed_at: '2026-09-01T10:01:01Z' })])
    expect(minutter).toBe(2)
  })

  it('runder ikke opp ved eksakt 60 sekunder', () => {
    const { minutter } = jobbMinutter([jobb({ started_at: '2026-09-01T10:00:00Z', completed_at: '2026-09-01T10:01:00Z' })])
    expect(minutter).toBe(1)
  })

  it('utelater en jobb uten completed_at og teller den i utelatt', () => {
    const { minutter, utelatt } = jobbMinutter([
      jobb({ started_at: '2026-09-01T10:00:00Z', completed_at: '2026-09-01T10:02:00Z' }), // 2 min
      jobb({ id: 2, started_at: '2026-09-01T10:00:00Z', completed_at: null }), // pågående
    ])
    expect(minutter).toBe(2)
    expect(utelatt).toBe(1)
  })

  it('gir 0/0 for tom liste', () => {
    expect(jobbMinutter([])).toEqual({ minutter: 0, utelatt: 0 })
  })
})

describe('forsokFordeling — rerun-blindsonen', () => {
  it('to jobber på samme run med ulik run_attempt gir høyere jobb-basert sum enn run-varigheten alene', () => {
    const jobber = [
      jobb({ run_id: 100, run_attempt: 1, started_at: '2026-09-01T10:00:00Z', completed_at: '2026-09-01T10:05:00Z' }), // 5 min
      jobb({ id: 2, run_id: 100, run_attempt: 2, started_at: '2026-09-01T11:00:00Z', completed_at: '2026-09-01T11:05:00Z' }), // 5 min rerun
    ]
    const { forsteForsokMin, rerunMin, runsMedFlereForsok } = forsokFordeling(jobber)
    expect(forsteForsokMin).toBe(5)
    expect(rerunMin).toBe(5)
    expect(runsMedFlereForsok).toBe(1)

    // Run-basert telling (slik budsjettvakten ser det) ser kun ÉN kjørings
    // varighet — den fanger ikke at det andre forsøket kostet fullt.
    const runBasert = forbrukMinutter([{ run_started_at: '2026-09-01T11:00:00Z', updated_at: '2026-09-01T11:05:00Z' }])
    expect(forsteForsokMin + rerunMin).toBeGreaterThan(runBasert)
  })

  it('jobb uten run_attempt-felt regnes som første forsøk', () => {
    const { forsteForsokMin, rerunMin } = forsokFordeling([jobb({ run_attempt: undefined })])
    expect(forsteForsokMin).toBe(1)
    expect(rerunMin).toBe(0)
  })

  // Pågående jobber er utelatt fra BEGGE sider av rerun-brøken. Kastes tallet,
  // ser «reruns utgjør N % av totalen» mer komplett ut enn det er.
  it('summerer utelatte (pågående) jobber fra begge delkall', () => {
    const { utelatt } = forsokFordeling([
      jobb({ run_attempt: 1, completed_at: null }),
      jobb({ id: 2, run_attempt: 2, completed_at: null }),
      jobb({ id: 3, run_attempt: 1 }),
    ])
    expect(utelatt).toBe(2)
  })
})

// Skillet mellom «steget finnes» og «steget kjørte» — hele BLOCKER-en i
// review-en av #664. Predikatet er delt av gating-tabellen og trendtabellen.
describe('e2eKjorte', () => {
  it('er sant for success og failure', () => {
    expect(e2eKjorte(steg(STEG_E2E, 't1', 't2', 'success'))).toBe(true)
    expect(e2eKjorte(steg(STEG_E2E, 't1', 't2', 'failure'))).toBe(true)
  })

  it('er usant for et hoppet steg — det returneres fortsatt av jobs-API-et', () => {
    expect(e2eKjorte(steg(STEG_E2E, null, null, 'skipped'))).toBe(false)
  })

  // Copilot-funn på PR #667: en hviteliste på success/failure ville regnet et
  // AVBRUTT e2e-steg som «kjørte ikke». Det brukte Actions-minutter, og en
  // rapport som utelater det under-teller nettopp de kjøringene som kostet
  // mest. Tidsstemplene skiller hoppet fra avbrutt; conclusion gjør det ikke.
  it('er sant for et avbrutt steg som rakk å bruke tid', () => {
    expect(e2eKjorte(steg(STEG_E2E, 't1', 't2', 'cancelled'))).toBe(true)
  })

  it('er usant for et steg uten tidsstempler, uansett conclusion', () => {
    expect(e2eKjorte(steg(STEG_E2E, null, null, 'cancelled'))).toBe(false)
  })

  it('er usant for et annet steg og for undefined', () => {
    expect(e2eKjorte(steg('Lint', 't1', 't2', 'success'))).toBe(false)
    expect(e2eKjorte(undefined)).toBe(false)
  })
})

describe('stegFordeling', () => {
  it('ignorerer skippede steg (0 s) og rapporterer Ufordelt når jobbtiden overstiger stegsummen', () => {
    const jobber = [
      jobb({
        started_at: '2026-09-01T10:00:00Z',
        completed_at: '2026-09-01T10:02:00Z', // 120 s jobbtid
        steps: [
          steg('Checkout', '2026-09-01T10:00:02Z', '2026-09-01T10:00:12Z'), // 10 s
          steg('Test', '2026-09-01T10:00:12Z', '2026-09-01T10:01:52Z'), // 100 s
          steg('Hoppet over steg', null, null, 'skipped'), // ingen tidsstempler
          steg('Skippet med like tidsstempler', '2026-09-01T10:01:52Z', '2026-09-01T10:01:52Z', 'skipped'), // 0 s
        ],
      }),
    ]
    const resultat = stegFordeling(jobber)
    const navn = resultat.map(r => r.navn)
    expect(navn).not.toContain('Hoppet over steg')
    expect(navn).not.toContain('Skippet med like tidsstempler')

    const test = resultat.find(r => r.navn === 'Test')
    expect(test?.sekunder).toBe(100)

    // 120 s jobbtid - (10 + 100) s steg = 10 s ufordelt (runner-oppstart før
    // første steg m.m.)
    const ufordelt = resultat.find(r => r.navn === 'Ufordelt')
    expect(ufordelt?.sekunder).toBeCloseTo(10, 5)
  })

  it('slår sammen steg under terskelen (< 1 % og < 30 s) til Øvrige steg', () => {
    const jobber = [
      jobb({
        started_at: '2026-09-01T10:00:00Z',
        completed_at: '2026-09-01T10:00:00Z', // ingen ufordelt-differanse å bry seg om her
        steps: [
          steg('Stor', '2026-09-01T10:00:00Z', '2026-09-01T10:20:00Z'), // 1200 s
          steg('Liten', '2026-09-01T10:20:00Z', '2026-09-01T10:20:05Z'), // 5 s — under begge terskler
        ],
      }),
    ]
    const resultat = stegFordeling(jobber)
    expect(resultat.map(r => r.navn)).toContain('Øvrige steg')
    expect(resultat.map(r => r.navn)).not.toContain('Liten')
    const ovrige = resultat.find(r => r.navn === 'Øvrige steg')
    expect(ovrige?.sekunder).toBe(5)
  })

  it('gir tom liste for jobber uten steg og uten ufordelt tid', () => {
    expect(stegFordeling([jobb({ started_at: null, completed_at: null, steps: [] })])).toEqual([])
  })
})

describe('klassifiserE2e', () => {
  const prRun = { event: 'pull_request' }
  const pushRun = { event: 'push' }

  it('push-run ⇒ hendelse, uansett steg', () => {
    expect(klassifiserE2e(pushRun, [jobb({ steps: [steg(STEG_E2E, 't', 't')] })])).toBe('hendelse')
  })

  it('markørsteg lav_risiko, success ⇒ lav_risiko', () => {
    const jobber = [jobb({ steps: [steg(MARKOER_LAV_RISIKO, 't1', 't2')] })]
    expect(klassifiserE2e(prRun, jobber)).toBe('lav_risiko')
  })

  it('markørsteg lav_risiko som finnes men er skipped ⇒ IKKE lav_risiko', () => {
    const jobber = [jobb({ steps: [steg(MARKOER_LAV_RISIKO, null, null, 'skipped')] })]
    expect(klassifiserE2e(prRun, jobber)).toBe('ukjent')
  })

  it('markørsteg budsjett, success ⇒ budsjett', () => {
    const jobber = [jobb({ steps: [steg(MARKOER_BUDSJETT, 't1', 't2')] })]
    expect(klassifiserE2e(prRun, jobber)).toBe('budsjett')
  })

  it('E2e (Playwright) success ⇒ kjorte', () => {
    const jobber = [jobb({ steps: [steg(STEG_E2E, 't1', 't2', 'success')] })]
    expect(klassifiserE2e(prRun, jobber)).toBe('kjorte')
  })

  it('E2e (Playwright) failure ⇒ kjorte (kjørte og var rød, men kjørte)', () => {
    const jobber = [jobb({ steps: [steg(STEG_E2E, 't1', 't2', 'failure')] })]
    expect(klassifiserE2e(prRun, jobber)).toBe('kjorte')
  })

  it('run uten markørsteg og uten e2e-steg ⇒ ukjent (kjøring fra før #663)', () => {
    const jobber = [jobb({ steps: [steg('Lint', 't1', 't2')] })]
    expect(klassifiserE2e(prRun, jobber)).toBe('ukjent')
  })

  it('E2e-steget finnes, men er skipped ⇒ IKKE kjorte', () => {
    const jobber = [jobb({ steps: [steg(STEG_E2E, null, null, 'skipped')] })]
    expect(klassifiserE2e(prRun, jobber)).toBe('ukjent')
  })

  // Klassifisering per run_attempt: rerun-effekten er hele grunnen til at
  // verktøyet finnes, og skal ikke overdøves av forsøket før.
  it('forsøk 1 budsjettkuttet, forsøk 2 kjørte e2e ⇒ kjorte (høyeste forsøk vinner)', () => {
    const jobber = [
      jobb({ run_attempt: 1, steps: [steg(MARKOER_BUDSJETT, 't1', 't2'), steg(STEG_E2E, null, null, 'skipped')] }),
      jobb({ id: 2, run_attempt: 2, steps: [steg(STEG_E2E, 't1', 't2', 'success')] }),
    ]
    expect(klassifiserE2e(prRun, jobber)).toBe('kjorte')
  })

  it('forsøk 1 kjørte e2e, forsøk 2 ble budsjettkuttet ⇒ budsjett', () => {
    const jobber = [
      jobb({ run_attempt: 1, steps: [steg(STEG_E2E, 't1', 't2', 'success')] }),
      jobb({ id: 2, run_attempt: 2, steps: [steg(MARKOER_BUDSJETT, 't1', 't2'), steg(STEG_E2E, null, null, 'skipped')] }),
    ]
    expect(klassifiserE2e(prRun, jobber)).toBe('budsjett')
  })
})

describe('grupperPerUke', () => {
  it('grupperer per ISO-uke og teller kun pull_request i antallPrKjoringer', () => {
    const poster = [
      {
        run: { event: 'pull_request', created_at: '2026-09-01T10:00:00Z' }, // tirsdag, uke 36
        jobber: [jobb({ started_at: '2026-09-01T10:00:00Z', completed_at: '2026-09-01T10:03:00Z' })], // 3 min
      },
      {
        run: { event: 'push', created_at: '2026-09-02T10:00:00Z' }, // onsdag, samme uke
        jobber: [jobb({ started_at: '2026-09-02T10:00:00Z', completed_at: '2026-09-02T10:02:00Z' })], // 2 min
      },
    ]
    const uker = grupperPerUke(poster)
    expect(uker.size).toBe(1)
    const [[noekkel, gruppe]] = [...uker.entries()]
    expect(noekkel).toBe('2026-W36')
    expect(gruppe.jobbMin).toBe(5)
    expect(gruppe.antallPrKjoringer).toBe(1)
  })

  // Selve BLOCKER-en: en gatet PR har e2e-steget i jobben med conclusion
  // 'skipped'. Telles den jobben i e2eMin, blir kolonnen ≈ Jobb-min for hver
  // PR-uke, og trendtabellen motsier gating-tabellen i samme rapport.
  it('teller ikke jobben i e2eMin når e2e-steget ble hoppet over', () => {
    const poster = [
      {
        run: { event: 'pull_request', created_at: '2026-09-01T10:00:00Z' },
        jobber: [
          jobb({
            started_at: '2026-09-01T10:00:00Z',
            completed_at: '2026-09-01T10:05:00Z', // 5 min, gatet PR
            steps: [steg('Lint', '2026-09-01T10:01:00Z', '2026-09-01T10:02:00Z'), steg(STEG_E2E, null, null, 'skipped')],
          }),
        ],
      },
      {
        run: { event: 'pull_request', created_at: '2026-09-02T10:00:00Z' },
        jobber: [
          jobb({
            id: 2,
            started_at: '2026-09-02T10:00:00Z',
            completed_at: '2026-09-02T10:10:00Z', // 10 min, e2e kjørte
            steps: [steg(STEG_E2E, '2026-09-02T10:04:00Z', '2026-09-02T10:09:00Z', 'success')],
          }),
        ],
      },
    ]
    const gruppe = grupperPerUke(poster).get('2026-W36')
    expect(gruppe?.jobbMin).toBe(15)
    expect(gruppe?.e2eMin).toBe(10) // kun jobben der e2e faktisk kjørte
  })
})

describe('hentRuns — paginering', () => {
  const somFetch = (f: (url: string, init: RequestInit) => Promise<unknown>) => f as unknown as typeof fetch
  const svar = (runs: unknown[]) => ({ ok: true, status: 200, statusText: 'OK', json: async () => ({ workflow_runs: runs }) })
  const enRun = { id: 1, event: 'pull_request', name: 'PR-sjekk', created_at: '2026-09-01T00:00:00Z' }

  it('kaster ved pagineringstak når siste side er full', async () => {
    await expect(
      hentRuns({
        repo: 'eier/repo',
        token: 't',
        siden: '2026-08-01T00:00:00Z',
        maksSider: 2,
        fetchImpl: somFetch(async () => svar(Array(100).fill(enRun))),
      }),
    ).rejects.toThrow(/pagineringstaket/i)
  })

  it('stopper på første ikke-fulle side', async () => {
    const sider = [Array(100).fill(enRun), Array(3).fill(enRun)]
    let kall = 0
    const runs = await hentRuns({
      repo: 'eier/repo',
      token: 't',
      siden: '2026-08-01T00:00:00Z',
      fetchImpl: somFetch(async () => svar(sider[kall++])),
    })
    expect(runs.length).toBe(103)
    expect(kall).toBe(2)
  })

  it('403 gir en melding om at tokenet trolig mangler actions:read', async () => {
    await expect(
      hentRuns({
        repo: 'eier/repo',
        token: 't',
        siden: '2026-08-01T00:00:00Z',
        fetchImpl: somFetch(async () => ({ ok: false, status: 403, statusText: 'Forbidden' })),
      }),
    ).rejects.toThrow(/actions:read/)
  })
})

describe('hentJobber — filter=all', () => {
  const somFetch = (f: (url: string, init: RequestInit) => Promise<unknown>) => f as unknown as typeof fetch
  const svar = (jobber: unknown[]) => ({ ok: true, status: 200, statusText: 'OK', json: async () => ({ jobs: jobber }) })

  it('sender filter=all i URL-en', async () => {
    let sendtUrl = ''
    await hentJobber({
      repo: 'eier/repo',
      runId: 42,
      token: 't',
      fetchImpl: somFetch(async url => {
        sendtUrl = url
        return svar([])
      }),
    })
    expect(sendtUrl).toContain('filter=all')
    expect(sendtUrl).toContain('/actions/runs/42/jobs')
  })

  it('kaster ved pagineringstak', async () => {
    await expect(
      hentJobber({
        repo: 'eier/repo',
        runId: 1,
        token: 't',
        maksSider: 1,
        fetchImpl: somFetch(async () => svar(Array(100).fill(jobb()))),
      }),
    ).rejects.toThrow(/pagineringstaket/i)
  })
})

// Kobling til workflowen: endrer noen et av stegnavnene i pr-check.yml uten å
// oppdatere konstantene her, ryker klassifiseringen stille — alt havner i
// 'ukjent' uten at noen merker det. Denne testen er eneste vakt mot det.
describe('kobling til .github/workflows/pr-check.yml', () => {
  it('alle tre navnene finnes som STEGDEKLARASJON (- name:), ikke bare som tekst i fila', () => {
    const workflow = readFileSync(join(process.cwd(), '.github/workflows/pr-check.yml'), 'utf8')
    // Assertér mot deklarasjonene, ikke mot fri tekst: `toContain(STEG_E2E)`
    // ble oppfylt av KOMMENTAREN i workflowen som siterer navnet, så en
    // omdøping av selve steget lot testen stå grønn mens klassifiseringen
    // stille falt til 'ukjent' for hver eneste kjøring.
    const stegnavn = [...workflow.matchAll(/^\s*- name:\s*(.+?)\s*$/gm)].map(m => m[1].replace(/^['"]|['"]$/g, ''))
    for (const navn of [STEG_E2E, MARKOER_LAV_RISIKO, MARKOER_BUDSJETT]) {
      expect(stegnavn).toContain(navn)
    }
  })
})
