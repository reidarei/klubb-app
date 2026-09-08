import { describe, it, expect, vi, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { erTryggFil, trengerE2e, hentPrFiler, main, TRYGGE_MAPPER, TRYGGE_FILER } from '../.github/scripts/e2e-risiko.mjs'

// Denne suiten kjører i kjerneporten — den porten som ALDRI gates av
// risiko-vakten selv (se .github/scripts/e2e-risiko.mjs). Det er bevisst:
// en feil i selve gatingen skal aldri kunne gjemme seg bak sin egen gate.

function fil(filename: string, ekstra: Partial<{ previous_filename: string; patch: string; status: string }> = {}) {
  return { filename, previous_filename: undefined, patch: undefined, status: 'modified', ...ekstra }
}

describe('trengerE2e', () => {
  it('lib/varsler.ts alene ⇒ e2e', () => {
    expect(trengerE2e([fil('lib/varsler.ts')]).e2e).toBe(true)
  })

  it('docs/oppsett.md + CLAUDE.md ⇒ ikke e2e', () => {
    expect(trengerE2e([fil('docs/oppsett.md'), fil('CLAUDE.md')]).e2e).toBe(false)
  })

  it('blandet (docs/x.md + lib/varsler.ts) ⇒ e2e', () => {
    const { e2e, risikoFiler } = trengerE2e([fil('docs/x.md'), fil('lib/varsler.ts')])
    expect(e2e).toBe(true)
    expect(risikoFiler).toEqual(['lib/varsler.ts'])
  })

  it('lib/versjon.json alene ⇒ ikke e2e', () => {
    expect(trengerE2e([fil('lib/versjon.json')]).e2e).toBe(false)
  })

  it('public/sw.js med ren CACHE_VERSION-patch ⇒ ikke e2e', () => {
    const patch = "@@ -1,3 +1,3 @@\n-const CACHE_VERSION = 'V3.5.86'\n+const CACHE_VERSION = 'V3.5.87'"
    expect(trengerE2e([fil('public/sw.js', { patch })]).e2e).toBe(false)
  })

  it('public/sw.js med en ekstra endret linje i patchen ⇒ e2e', () => {
    const patch =
      "@@ -1,4 +1,4 @@\n-const CACHE_VERSION = 'V3.5.86'\n+const CACHE_VERSION = 'V3.5.87'\n-const X = 1\n+const X = 2"
    expect(trengerE2e([fil('public/sw.js', { patch })]).e2e).toBe(true)
  })

  it('public/sw.js uten patch-felt ⇒ e2e', () => {
    expect(trengerE2e([fil('public/sw.js', { patch: undefined })]).e2e).toBe(true)
  })

  // Pinner at den fjernede +++/---guarden ikke kommer tilbake. GitHubs
  // `patch`-felt starter på @@ og inneholder aldri filhoder, så guarden
  // beskyttet ingenting — men den slapp ekte innholdslinjer som begynner med
  // ++ eller -- gjennom uten sjekk mot CACHE_VERSION_LINJE.
  it('public/sw.js med innholdslinjer som begynner på +++/--- ⇒ e2e', () => {
    const patch =
      "@@ -1,4 +1,4 @@\n-const CACHE_VERSION = 'V3.5.86'\n+const CACHE_VERSION = 'V3.5.87'\n---teller\n+++teller2"
    expect(trengerE2e([fil('public/sw.js', { patch })]).e2e).toBe(true)
  })

  // «NÅR OG KUN NÅR» i docs betyr et ekte bump: nøyaktig én linje ut, én inn.
  it('public/sw.js der CACHE_VERSION kun slettes ⇒ e2e', () => {
    const patch = "@@ -1,2 +1,1 @@\n-const CACHE_VERSION = 'V3.5.86'"
    expect(trengerE2e([fil('public/sw.js', { patch })]).e2e).toBe(true)
  })

  it('public/sw.js med patch uten +/- linjer i det hele tatt ⇒ e2e', () => {
    const patch = "@@ -1,2 +1,2 @@\n uendret linje"
    expect(trengerE2e([fil('public/sw.js', { patch })]).e2e).toBe(true)
  })

  it('public/sw.js med to CACHE_VERSION-tillegg ⇒ e2e', () => {
    const patch =
      "@@ -1,3 +1,4 @@\n-const CACHE_VERSION = 'V3.5.86'\n+const CACHE_VERSION = 'V3.5.87'\n+const CACHE_VERSION = 'V3.5.88'"
    expect(trengerE2e([fil('public/sw.js', { patch })]).e2e).toBe(true)
  })

  it('e2e/poll.spec.ts ⇒ e2e', () => {
    expect(trengerE2e([fil('e2e/poll.spec.ts')]).e2e).toBe(true)
  })

  it('playwright.config.ts ⇒ e2e', () => {
    expect(trengerE2e([fil('playwright.config.ts')]).e2e).toBe(true)
  })

  it('supabase/migrations/141_x.sql ⇒ e2e', () => {
    expect(trengerE2e([fil('supabase/migrations/141_x.sql')]).e2e).toBe(true)
  })

  it('supabase/seed.sql ⇒ e2e', () => {
    expect(trengerE2e([fil('supabase/seed.sql')]).e2e).toBe(true)
  })

  // Pinner at lib/ ikke er blankt trygt — kun *.md og de eksakte
  // TRYGGE_FILER-oppføringene under lib/ er unntatt.
  it('lib/endringslogg-data.ts ⇒ e2e', () => {
    expect(trengerE2e([fil('lib/endringslogg-data.ts')]).e2e).toBe(true)
  })

  it('.github/workflows/pr-check.yml + .github/scripts/e2e-risiko.mjs + scripts/sync-klubb-app.mjs + __tests__/x.test.ts ⇒ ikke e2e', () => {
    expect(
      trengerE2e([
        fil('.github/workflows/pr-check.yml'),
        fil('.github/scripts/e2e-risiko.mjs'),
        fil('scripts/sync-klubb-app.mjs'),
        fil('__tests__/x.test.ts'),
      ]).e2e,
    ).toBe(false)
  })

  // Rename fra app-kode til docs skal ikke skjule seg bak det nye navnet —
  // begge navn må ligge i trygg-listen.
  it('rename { filename: docs/x.md, previous_filename: lib/x.ts } ⇒ e2e', () => {
    expect(trengerE2e([fil('docs/x.md', { previous_filename: 'lib/x.ts' })]).e2e).toBe(true)
  })

  it('status: removed på lib/varsler.ts ⇒ e2e', () => {
    expect(trengerE2e([fil('lib/varsler.ts', { status: 'removed' })]).e2e).toBe(true)
  })

  // Segmentgrense: prefiks-match skal ALDRI være substring-match.
  it('segmentgrense: libx/versjon.json og docsy/a.ts ⇒ e2e', () => {
    expect(trengerE2e([fil('libx/versjon.json')]).e2e).toBe(true)
    expect(trengerE2e([fil('docsy/a.ts')]).e2e).toBe(true)
  })

  it('tom liste ⇒ e2e (defensivt — filliste ukjent skal aldri lese som trygt)', () => {
    expect(trengerE2e([]).e2e).toBe(true)
  })
})

describe('erTryggFil — enkeltfil-sjekker', () => {
  it('godtar alle TRYGGE_MAPPER-oppføringer på segmentgrense', () => {
    for (const mappe of TRYGGE_MAPPER) {
      expect(erTryggFil(fil(`${mappe}/underfil.ts`))).toBe(true)
    }
  })

  it('godtar alle TRYGGE_FILER eksakt', () => {
    for (const eksakt of TRYGGE_FILER) {
      expect(erTryggFil(fil(eksakt))).toBe(true)
    }
  })

  it('*.md er trygg uansett mappe', () => {
    expect(erTryggFil(fil('app/(app)/agenda/README.md'))).toBe(true)
  })
})

describe('hentPrFiler', () => {
  function svar(filer: unknown[]) {
    return { ok: true, status: 200, statusText: 'OK', json: async () => filer }
  }
  const somFetch = (f: (url: string, init: RequestInit) => Promise<unknown>) => f as unknown as typeof fetch

  it('paginerer til siden er ufull', async () => {
    const sider = [Array(100).fill(fil('a.ts')), Array(2).fill(fil('b.ts'))]
    let kall = 0
    const filer = await hentPrFiler({
      repo: 'a/b',
      prNummer: 1,
      token: 't',
      fetchImpl: somFetch(async () => svar(sider[kall++])),
    })
    expect(filer.length).toBe(102)
    expect(kall).toBe(2)
  })

  it('kaster ved API-feil', async () => {
    await expect(
      hentPrFiler({
        repo: 'a/b',
        prNummer: 1,
        token: 't',
        fetchImpl: somFetch(async () => ({ ok: false, status: 404, statusText: 'Not Found' })),
      }),
    ).rejects.toThrow(/404/)
  })

  it('kaster når pagineringstaket nås med full siste side', async () => {
    await expect(
      hentPrFiler({
        repo: 'a/b',
        prNummer: 1,
        token: 't',
        maksSider: 2,
        fetchImpl: somFetch(async () => svar(Array(100).fill(fil('a.ts')))),
      }),
    ).rejects.toThrow(/pagineringstaket/i)
  })

  it('setter en timeout på hvert kall', async () => {
    let signal: AbortSignal | undefined
    await hentPrFiler({
      repo: 'a/b',
      prNummer: 1,
      token: 't',
      fetchImpl: somFetch(async (_url, init) => {
        signal = init.signal ?? undefined
        return svar([])
      }),
    })
    expect(signal).toBeInstanceOf(AbortSignal)
  })
})

// main() gater seg selv ut av e2e (en PR som kun rører .github/scripts kjører
// ikke suiten), så disse testene er ENESTE kontroll på fail-open-grenene og på
// polariteten i det som skrives til GITHUB_OUTPUT. Skriver du om main(), skal
// disse følge med — en gren som feiler LUKKET her ville stille fjernet
// e2e-dekningen for hele repoet.
describe('main — fail-open-grenene', () => {
  const MILJOENOEKLER = [
    'GITHUB_REPOSITORY',
    'GITHUB_TOKEN',
    'PR_NUMMER',
    'ENDREDE_FILER',
    'GITHUB_OUTPUT',
    'GITHUB_STEP_SUMMARY',
  ]
  const opprinnelig = new Map(MILJOENOEKLER.map(k => [k, process.env[k]]))

  afterEach(() => {
    for (const [k, v] of opprinnelig) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    vi.restoreAllMocks()
  })

  const somFetch = (f: (url: string, init: RequestInit) => Promise<unknown>) => f as unknown as typeof fetch
  const svar = (filer: unknown[]) => ({ ok: true, status: 200, statusText: 'OK', json: async () => filer })

  async function kjor(miljo: Record<string, string>, fetchImpl?: typeof fetch) {
    const mappe = mkdtempSync(join(tmpdir(), 'e2e-risiko-'))
    const outFil = join(mappe, 'output.txt')
    const summaryFil = join(mappe, 'summary.md')
    writeFileSync(outFil, '')
    writeFileSync(summaryFil, '')

    // Nullstill først: GITHUB_REPOSITORY er faktisk satt når suiten kjører i
    // Actions, og ville ellers lekket inn i «mangler miljøvariabel»-testen.
    for (const k of MILJOENOEKLER) delete process.env[k]
    process.env.GITHUB_OUTPUT = outFil
    process.env.GITHUB_STEP_SUMMARY = summaryFil
    for (const [k, v] of Object.entries(miljo)) process.env[k] = v

    const advarsler: string[] = []
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      advarsler.push(args.join(' '))
    })

    await main(fetchImpl ? { fetchImpl } : {})

    return {
      output: readFileSync(outFil, 'utf8'),
      summary: readFileSync(summaryFil, 'utf8'),
      advarsler: advarsler.join(String.fromCharCode(10)),
    }
  }

  const FULLT_MILJOE = { GITHUB_REPOSITORY: 'a/b', GITHUB_TOKEN: 't', PR_NUMMER: '1' }
  const RISIKO_PAA = 'risiko=true\n'
  const RISIKO_AV = 'risiko=false\n'

  it('manglende GITHUB_TOKEN ⇒ risiko=true + ::warning::', async () => {
    const { output, advarsler } = await kjor({ GITHUB_REPOSITORY: 'a/b', PR_NUMMER: '1', ENDREDE_FILER: '1' })
    expect(output).toBe(RISIKO_PAA)
    expect(advarsler).toContain('::warning::')
  })

  it('manglende ENDREDE_FILER ⇒ risiko=true (fullstendighetsvakten er borte)', async () => {
    const { output, advarsler } = await kjor(
      { ...FULLT_MILJOE },
      somFetch(async () => svar([{ filename: 'docs/x.md' }])),
    )
    expect(output).toBe(RISIKO_PAA)
    expect(advarsler).toContain('ENDREDE_FILER')
  })

  it('tom ENDREDE_FILER ⇒ risiko=true (Number(tom streng) er 0, ikke NaN)', async () => {
    const { output } = await kjor(
      { ...FULLT_MILJOE, ENDREDE_FILER: '' },
      somFetch(async () => svar([])),
    )
    expect(output).toBe(RISIKO_PAA)
  })

  it('hentefeil ⇒ risiko=true + ::warning::', async () => {
    const { output, advarsler } = await kjor(
      { ...FULLT_MILJOE, ENDREDE_FILER: '1' },
      somFetch(async () => ({ ok: false, status: 500, statusText: 'Server Error' })),
    )
    expect(output).toBe(RISIKO_PAA)
    expect(advarsler).toContain('::warning::')
  })

  it('avvik mellom hentet og forventet antall ⇒ risiko=true + ::warning::', async () => {
    const { output, advarsler } = await kjor(
      { ...FULLT_MILJOE, ENDREDE_FILER: '7' },
      somFetch(async () => svar([{ filename: 'docs/x.md' }])),
    )
    expect(output).toBe(RISIKO_PAA)
    expect(advarsler).toContain('målefeil')
  })

  // Polariteten: dette er den ENE testen som beviser at en trygg PR faktisk
  // skriver `false`. Uten den kunne skriptet stemplet alt som risiko og
  // fortsatt vært grønt i samtlige andre tester.
  it('kun trygge filer og riktig antall ⇒ risiko=false', async () => {
    const { output, summary } = await kjor(
      { ...FULLT_MILJOE, ENDREDE_FILER: '2' },
      somFetch(async () => svar([{ filename: 'docs/x.md' }, { filename: 'lib/versjon.json' }])),
    )
    expect(output).toBe(RISIKO_AV)
    expect(summary).toContain('Lav risiko')
  })

  it('én app-fil blant trygge ⇒ risiko=true', async () => {
    const { output } = await kjor(
      { ...FULLT_MILJOE, ENDREDE_FILER: '2' },
      somFetch(async () => svar([{ filename: 'docs/x.md' }, { filename: 'lib/varsler.ts' }])),
    )
    expect(output).toBe(RISIKO_PAA)
  })
})

// Copilot-funn på PR #666: `e.message` på en kastet ikke-Error ville selv
// kastet, i nøyaktig den grenen som skal garantere fail-open.
describe('fail-open tåler at noe annet enn Error kastes', () => {
  it('kastet streng gir risiko=true, ikke et hardt krasj', async () => {
    const utfil = join(tmpdir(), `e2e-risiko-strengfeil-${Date.now()}.txt`)
    writeFileSync(utfil, '')
    const gammel = { ...process.env }
    process.env.GITHUB_REPOSITORY = 'x/y'
    process.env.GITHUB_TOKEN = 'token'
    process.env.PR_NUMMER = '1'
    process.env.ENDREDE_FILER = '1'
    process.env.GITHUB_OUTPUT = utfil
    delete process.env.GITHUB_STEP_SUMMARY
    try {
      await main({
        fetchImpl: () => {
          throw 'noe gikk galt'
        },
      })
      expect(readFileSync(utfil, 'utf8')).toContain('risiko=true')
    } finally {
      process.env = gammel
      rmSync(utfil, { force: true })
    }
  })
})
