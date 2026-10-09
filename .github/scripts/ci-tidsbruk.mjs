// Kalles som `node .github/scripts/ci-tidsbruk.mjs` — ingen shebang, se
// ci-minuttbudsjett.mjs for hvorfor.
//
// CI-tidsbruk (#664): HVOR tiden går (steg, trend, reruns).
// ci-minuttbudsjett.mjs måler totalforbruk mot kvote.
//
// KJØRES MANUELT, ALDRI FRA EN WORKFLOW — en scheduled måling ville brukt av
// kvoten den måler. Skriver derfor aldri til $GITHUB_OUTPUT/STEP_SUMMARY.
//
// FORBEHOLD (les før du tolker tallene):
// - Dette summerer PER JOBB (GitHubs faktureringsenhet). forbrukMinutter() er
//   run-basert og UKORRIGERT for reruns (korreksjonen bor i budsjettvaktens
//   hentTidligereForsokMinutter()), så § 3 legger selv til tidligere forsøk —
//   ikke § 2 sine reruns, som inkluderer siste forsøk og ville dobbelttelt.
// - `ukjent` i gating = kjøring fra før #663 uten markørsteg, aldri «kjørte».
// - «E2e kjørte» avgjøres KUN av e2eKjorte(), delt mellom § 5 og § 6 — to
//   kopier av sjekken driftet og fikk seksjonene til å motsi hverandre.
// - Gating klassifiseres per høyeste `run_attempt`. pr-check.yml har nå to
//   jobber (kjerne ‖ sjekk): reruns bare én av dem, ser klassifiseringen kun
//   den rerunnede.
// - Glidende vindu (`--dager`), ikke kalendermåned som budsjettvakten.
// - Trenger `gh` eller et token med `actions:read` — Issues-PAT-en i
//   `.env.local` duger ikke.

import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { forbrukMinutter, E2E_KOST_MIN } from './ci-minuttbudsjett.mjs'

// ─── Konstanter — strengkoblet til .github/workflows/pr-check.yml ──────────
// Endret navn der ⇒ alt havner stille i 'ukjent'. Pinnet av en test som
// leser pr-check.yml.
export const STEG_E2E = 'E2e (Playwright)'
export const MARKOER_LAV_RISIKO = 'E2e hoppet over — lav risiko'
export const MARKOER_BUDSJETT = 'E2e hoppet over — budsjettvakten kuttet'

// ─── Ren logikk (testbar uten nettverk) ─────────────────────────────────────

// Et `if:`-hoppet steg returneres fortsatt av API-et (conclusion 'skipped'),
// så eksistens ≠ kjørte. Delt mellom klassifiserE2e() og grupperPerUke().
// Ingen hviteliste på success/failure: et avbrutt steg brukte minutter og
// skal telle. Tidsstemplene avgjør — skipped-steg har ingen.
export function e2eKjorte(steg) {
  if (steg?.name !== STEG_E2E) return false
  if (steg.conclusion === 'skipped') return false
  return Boolean(steg.started_at && steg.completed_at)
}

// `Math.ceil` PER JOBB, slik GitHub fakturerer.
export function jobbMinutter(jobber) {
  let minutter = 0
  let utelatt = 0
  for (const jobb of jobber) {
    // Pågående/queued mangler tider ⇒ NaN i summen. Tell dem separat.
    if (!jobb.started_at || !jobb.completed_at) {
      utelatt++
      continue
    }
    const start = new Date(jobb.started_at).getTime()
    const slutt = new Date(jobb.completed_at).getTime()
    if (!Number.isFinite(start) || !Number.isFinite(slutt)) {
      utelatt++
      continue
    }
    minutter += Math.ceil(Math.max(0, slutt - start) / 60_000)
  }
  return { minutter, utelatt }
}

// `rerunMin` = run_attempt ≥ 2 (usynlig i «gh run list»).
// `tidligereForsokMin` = alle forsøk unntatt SISTE per run — det run-basert
// telling ikke ser. Bare den kan legges oppå run-basert (#668).
// `sisteForsokPerRun` er fasit når den finnes; ellers høyeste blant jobbene.
export function forsokFordeling(jobber, sisteForsokPerRun = new Map()) {
  const forsteForsokJobber = jobber.filter(j => (j.run_attempt ?? 1) <= 1)
  const rerunJobber = jobber.filter(j => (j.run_attempt ?? 1) > 1)
  const { minutter: forsteForsokMin, utelatt: forsteForsokUtelatt } = jobbMinutter(forsteForsokJobber)
  const { minutter: rerunMin, utelatt: rerunUtelatt } = jobbMinutter(rerunJobber)
  const runsMedFlereForsok = new Set(rerunJobber.map(j => j.run_id)).size

  const sisteForsok = new Map(sisteForsokPerRun)
  for (const j of jobber) {
    const forsok = j.run_attempt ?? 1
    if (!sisteForsokPerRun.has(j.run_id)) sisteForsok.set(j.run_id, Math.max(sisteForsok.get(j.run_id) ?? 1, forsok))
  }
  const tidligereJobber = jobber.filter(j => (j.run_attempt ?? 1) < (sisteForsok.get(j.run_id) ?? 1))
  const { minutter: tidligereForsokMin } = jobbMinutter(tidligereJobber)

  // `utelatt` fra begge sider av brøken, så rapporten kan si hva den ikke så.
  return { forsteForsokMin, rerunMin, tidligereForsokMin, runsMedFlereForsok, utelatt: forsteForsokUtelatt + rerunUtelatt }
}

// Steg under BÅDE 1 % og 30 s slås sammen til «Øvrige steg» (støy).
const OEVRIGE_ANDEL_TERSKEL = 0.01
const OEVRIGE_SEKUNDER_TERSKEL = 30

// «Ufordelt» = jobbvarighet minus stegene (runner-oppstart o.l.) — skal
// synes, ikke forsvinne inn i det største steget.
export function stegFordeling(jobber) {
  const agg = new Map()
  let stegSekunderTotalt = 0
  let jobbSekunderTotalt = 0

  for (const jobb of jobber) {
    if (jobb.started_at && jobb.completed_at) {
      const start = new Date(jobb.started_at).getTime()
      const slutt = new Date(jobb.completed_at).getTime()
      if (Number.isFinite(start) && Number.isFinite(slutt)) {
        jobbSekunderTotalt += Math.max(0, (slutt - start) / 1000)
      }
    }
    for (const steg of jobb.steps ?? []) {
      // Skippede steg mangler tider eller har 0 s — ingen «0»-rader.
      if (!steg.started_at || !steg.completed_at) continue
      const start = new Date(steg.started_at).getTime()
      const slutt = new Date(steg.completed_at).getTime()
      if (!Number.isFinite(start) || !Number.isFinite(slutt)) continue
      const sekunder = Math.max(0, (slutt - start) / 1000)
      if (sekunder === 0) continue
      stegSekunderTotalt += sekunder
      const rad = agg.get(steg.name) ?? { navn: steg.name, sekunder: 0, antall: 0 }
      rad.sekunder += sekunder
      rad.antall += 1
      agg.set(steg.name, rad)
    }
  }

  const ufordelt = Math.max(0, jobbSekunderTotalt - stegSekunderTotalt)
  const totalMedUfordelt = stegSekunderTotalt + ufordelt

  const store = []
  let ovrigeSekunder = 0
  let ovrigeAntall = 0
  for (const rad of [...agg.values()]) {
    const andel = totalMedUfordelt > 0 ? rad.sekunder / totalMedUfordelt : 0
    if (andel < OEVRIGE_ANDEL_TERSKEL && rad.sekunder < OEVRIGE_SEKUNDER_TERSKEL) {
      ovrigeSekunder += rad.sekunder
      ovrigeAntall += rad.antall
    } else {
      store.push(rad)
    }
  }
  if (ovrigeAntall > 0) store.push({ navn: 'Øvrige steg', sekunder: ovrigeSekunder, antall: ovrigeAntall })
  if (ufordelt > 0) store.push({ navn: 'Ufordelt', sekunder: ufordelt, antall: 0 })

  return store.sort((a, b) => b.sekunder - a.sekunder)
}

// `jobber` = alle jobber for runen, på tvers av forsøk (se hentJobber()).
// 'ukjent' slås aldri sammen med 'kjorte' (se filhodet).
export function klassifiserE2e(run, jobber) {
  if (run.event !== 'pull_request') return 'hendelse'

  // Høyeste run_attempt vinner: forsøk 1 budsjettkuttet + forsøk 2 kjørte =
  // «kjorte». Se filhodet om forbeholdet med flere jobber.
  const sisteForsok = Math.max(1, ...jobber.map(j => j.run_attempt ?? 1))
  const alleSteg = jobber.filter(j => (j.run_attempt ?? 1) === sisteForsok).flatMap(j => j.steps ?? [])

  const lavRisiko = alleSteg.find(s => s.name === MARKOER_LAV_RISIKO)
  if (lavRisiko?.conclusion === 'success') return 'lav_risiko'

  const budsjett = alleSteg.find(s => s.name === MARKOER_BUDSJETT)
  if (budsjett?.conclusion === 'success') return 'budsjett'

  if (alleSteg.some(e2eKjorte)) return 'kjorte'

  return 'ukjent'
}

// ISO 8601-ukenøkkel («2026-W36»), UTC fordi GitHubs tidsstempler er UTC.
function isoUkeNoekkel(dato) {
  const d = new Date(Date.UTC(dato.getUTCFullYear(), dato.getUTCMonth(), dato.getUTCDate()))
  const dagNr = d.getUTCDay() || 7 // søndag = 0 i getUTCDay() → 7, mandag = 1
  d.setUTCDate(d.getUTCDate() + 4 - dagNr) // torsdag i samme ISO-uke
  const aarsstart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const ukeNr = Math.ceil(((d - aarsstart) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(ukeNr).padStart(2, '0')}`
}

// e2eMin = hele jobben som kjørte e2e, ikke steget isolert, så Chromium-
// install og Supabase-oppstart telles med (som E2E_KOST_MIN).
export function grupperPerUke(poster) {
  const uker = new Map()
  for (const { run, jobber } of poster) {
    const tidspunkt = run.created_at ?? run.run_started_at
    if (!tidspunkt) continue
    const dato = new Date(tidspunkt)
    if (!Number.isFinite(dato.getTime())) continue
    const noekkel = isoUkeNoekkel(dato)
    const gruppe = uker.get(noekkel) ?? { jobbMin: 0, e2eMin: 0, antallPrKjoringer: 0 }

    gruppe.jobbMin += jobbMinutter(jobber).minutter

    // e2eKjorte(), ikke «steget finnes» — ellers E2e-min ≈ Jobb-min.
    const e2eJobber = jobber.filter(j => (j.steps ?? []).some(e2eKjorte))
    gruppe.e2eMin += jobbMinutter(e2eJobber).minutter

    if (run.event === 'pull_request') gruppe.antallPrKjoringer++

    uker.set(noekkel, gruppe)
  }
  return uker
}

// ─── Nettverk ────────────────────────────────────────────────────────────

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function feilForRespons(res, url, kontekst) {
  if (res.status === 403 || res.status === 404) {
    return new Error(
      `GitHub API ga ${res.status} ${res.statusText} for ${kontekst} — tokenet mangler trolig «actions:read»-rettigheten.`,
    )
  }
  return new Error(`GitHub API ga ${res.status} ${res.statusText} for ${url}`)
}

// ALLE workflows (for § 1 per-workflow). Kaster ved pagineringstak: en
// ufullstendig sum ser komplett ut.
export async function hentRuns({ repo, token, siden, fetchImpl = fetch, maksSider = 10 }) {
  const kjoringer = []
  for (let side = 1; side <= maksSider; side++) {
    const url = `https://api.github.com/repos/${repo}/actions/runs?created=${encodeURIComponent('>=' + siden)}&per_page=100&page=${side}`
    const res = await fetchImpl(url, { headers: githubHeaders(token), signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw feilForRespons(res, url, 'kjøringer')
    const data = await res.json()
    const runs = data.workflow_runs ?? []
    kjoringer.push(...runs)
    if (runs.length < 100) return kjoringer
  }
  throw new Error(`Flere enn ${maksSider * 100} kjøringer i vinduet — pagineringstaket nådd, forbruket kan ikke måles fullstendig.`)
}

// `filter=all` gir jobber fra ALLE forsøk i ett kall, hver med run_attempt
// (verifisert) — ingen /attempts/{n}/jobs-iterasjon nødvendig.
export async function hentJobber({ repo, runId, token, fetchImpl = fetch, maksSider = 5 }) {
  const jobber = []
  for (let side = 1; side <= maksSider; side++) {
    const url = `https://api.github.com/repos/${repo}/actions/runs/${runId}/jobs?filter=all&per_page=100&page=${side}`
    const res = await fetchImpl(url, { headers: githubHeaders(token), signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw feilForRespons(res, url, `jobber (run ${runId})`)
    const data = await res.json()
    const sideJobber = data.jobs ?? []
    jobber.push(...sideJobber)
    if (sideJobber.length < 100) return jobber
  }
  throw new Error(`Flere enn ${maksSider * 100} jobber for kjøring ${runId} — pagineringstaket nådd.`)
}

// ─── Aggregering + rapport ───────────────────────────────────────────────

// Skilt fra byggRapport() så --json kan skrive dataen direkte. Fremdrift går
// til stderr, så stdout forblir ren JSON.
export async function kjorRapport({ dager, repo, token, workflowNavn, fetchImpl = fetch, naa = new Date() }) {
  const siden = new Date(naa.getTime() - dager * 24 * 60 * 60 * 1000).toISOString()

  process.stderr.write(`Henter kjøringer for ${repo} siden ${siden} (${dager} dager)...\n`)
  const runs = await hentRuns({ repo, token, siden, fetchImpl })
  process.stderr.write(`Fant ${runs.length} kjøringer. Henter jobber (batchet 5 om gangen)...\n`)

  const jobberPerRun = new Map()
  for (let i = 0; i < runs.length; i += 5) {
    const batch = runs.slice(i, i + 5)
    const resultater = await Promise.all(batch.map(run => hentJobber({ repo, runId: run.id, token, fetchImpl })))
    batch.forEach((run, idx) => jobberPerRun.set(run.id, resultater[idx]))
    process.stderr.write(`  ${Math.min(i + 5, runs.length)}/${runs.length}\n`)
  }

  const poster = runs.map(run => ({ run, jobber: jobberPerRun.get(run.id) ?? [] }))
  const alleJobber = poster.flatMap(p => p.jobber)

  const { minutter: totalMin, utelatt } = jobbMinutter(alleJobber)

  const perWorkflowMap = new Map()
  for (const { run, jobber } of poster) {
    const navn = run.name ?? '(uten navn)'
    perWorkflowMap.set(navn, (perWorkflowMap.get(navn) ?? 0) + jobbMinutter(jobber).minutter)
  }
  const perWorkflow = [...perWorkflowMap.entries()].map(([navn, min]) => ({ navn, min })).sort((a, b) => b.min - a.min)

  const forsok = forsokFordeling(alleJobber, new Map(runs.map(run => [run.id, run.run_attempt ?? 1])))

  // Samme funksjon budsjettvakten bruker — ikke en kopi.
  const runBasertMin = forbrukMinutter(runs)

  const workflowPoster = poster.filter(p => p.run.name === workflowNavn)
  const workflowJobber = workflowPoster.flatMap(p => p.jobber)
  const steg = stegFordeling(workflowJobber)

  const gating = { kjorte: 0, lav_risiko: 0, budsjett: 0, hendelse: 0, ukjent: 0 }
  for (const { run, jobber } of workflowPoster) gating[klassifiserE2e(run, jobber)]++

  const ukerMap = grupperPerUke(poster)
  const ukeTrend = [...ukerMap.entries()].map(([uke, v]) => ({ uke, ...v })).sort((a, b) => a.uke.localeCompare(b.uke))

  return {
    dager,
    repo,
    workflowNavn,
    vindu: { fra: siden, til: naa.toISOString() },
    antallKjoringer: runs.length,
    jobb: { totalMin, utelatt, perWorkflow },
    forsok,
    budsjett: { runBasertMin, differanseMin: totalMin - runBasertMin },
    steg,
    gating,
    ukeTrend,
  }
}

// Markdown for terminalen, ikke for step summary.
export function byggRapport(data) {
  const { dager, repo, workflowNavn, vindu, antallKjoringer, jobb, forsok, budsjett, steg, gating, ukeTrend } = data
  const linjer = []

  linjer.push(`# CI-tidsbruk (#664) — ${repo}`)
  linjer.push('')
  linjer.push(`Vindu: siste ${dager} dager (${vindu.fra} → ${vindu.til}), ${antallKjoringer} kjøringer, alle workflows.`)
  linjer.push('')

  linjer.push('## 1. Forbruk i vinduet')
  linjer.push('')
  linjer.push(`Jobb-basert total: **${jobb.totalMin} min** (${jobb.utelatt} pågående/ufullførte jobber utelatt).`)
  linjer.push('')
  linjer.push('| Workflow | Minutter |')
  linjer.push('|---|---|')
  for (const { navn, min } of jobb.perWorkflow) linjer.push(`| ${navn} | ${min} |`)
  linjer.push('')

  linjer.push('## 2. Reruns')
  linjer.push('')
  const rerunTotal = forsok.forsteForsokMin + forsok.rerunMin
  const rerunAndel = rerunTotal > 0 ? Math.round((forsok.rerunMin / rerunTotal) * 100) : 0
  linjer.push(
    `Første forsøk: ${forsok.forsteForsokMin} min. Reruns (\`run_attempt ≥ 2\`): **${forsok.rerunMin} min** (${rerunAndel} % av totalen), fordelt på ${forsok.runsMedFlereForsok} kjøringer med flere forsøk.`,
  )
  if (forsok.utelatt > 0) {
    linjer.push(
      `${forsok.utelatt} pågående/ufullførte jobber er utelatt fra BEGGE sider av brøken — prosenten over er regnet av det som er ferdig, ikke av alt.`,
    )
  }
  linjer.push('')

  linjer.push('## 3. Mot budsjettvakten')
  linjer.push('')
  linjer.push(
    `Jobb-basert (dette verktøyet): ${jobb.totalMin} min. Run-basert (\`forbrukMinutter()\`, UKORRIGERT — kun siste forsøk per kjøring, slik budsjettvakten så det FØR #668): ${budsjett.runBasertMin} min. Differanse: **${budsjett.differanseMin} min**.`,
  )
  // tidligereForsokMin, ikke rerunMin — se forsokFordeling().
  const korrigertRunBasert = budsjett.runBasertMin + forsok.tidligereForsokMin
  linjer.push(
    `Korrigert for reruns (tidligere forsøk, dvs. alle unntatt siste per kjøring — ingen nye kall): ${budsjett.runBasertMin} + ${forsok.tidligereForsokMin} = **${korrigertRunBasert} min**, mot ${jobb.totalMin} min jobb-basert.`,
  )
  linjer.push(
    'Differansen har to komponenter med MOTSATT fortegn (#668): reruns gjør ukorrigert run-basert for LAV (kun siste forsøk telles), mens `updated_at` som gjerne henger etter siste jobbs `completed_at` gjør run-basert for HØY. Nettoeffekten kan derfor gå begge veier avhengig av måneden. Merk også at vinduene ikke er identiske: dette verktøyet måler siste `--dager`, budsjettvakten kalendermåned. Se docs/ci-minuttbudsjett.md § Hvor tiden faktisk går for målte tall.',
  )
  linjer.push('')

  linjer.push(`## 4. Steg-fordeling — ${workflowNavn}`)
  linjer.push('')
  const stegTotal = steg.reduce((s, r) => s + r.sekunder, 0)
  // «Snitt/forekomst», ikke «/kjøring»: rad.antall teller stegforekomster på
  // tvers av jobber, og pr-check.yml har flere jobber per run.
  linjer.push('| Steg | Sekunder | Snitt/forekomst | Andel |')
  linjer.push('|---|---|---|---|')
  for (const rad of steg) {
    const snitt = rad.antall > 0 ? (rad.sekunder / rad.antall).toFixed(1) : '–'
    const andel = stegTotal > 0 ? `${Math.round((rad.sekunder / stegTotal) * 100)} %` : '–'
    linjer.push(`| ${rad.navn} | ${Math.round(rad.sekunder)} | ${snitt} | ${andel} |`)
  }
  linjer.push('')

  linjer.push('## 5. Gating (#663)')
  linjer.push('')
  linjer.push('| Utfall | Antall |')
  linjer.push('|---|---|')
  linjer.push(`| Kjørte | ${gating.kjorte} |`)
  linjer.push(`| Lav risiko (hoppet over) | ${gating.lav_risiko} |`)
  linjer.push(`| Budsjett (hoppet over) | ${gating.budsjett} |`)
  linjer.push(`| Hendelse (ikke pull_request) | ${gating.hendelse} |`)
  linjer.push(`| Ukjent (før #663 — ingen markørsteg, IKKE «e2e kjørte») | ${gating.ukjent} |`)
  linjer.push('')
  linjer.push(`Estimert spart tid: ${gating.lav_risiko} × ${E2E_KOST_MIN} min (E2E_KOST_MIN) = **${gating.lav_risiko * E2E_KOST_MIN} min**.`)
  linjer.push('')

  linjer.push('## 6. Trend — per ISO-uke')
  linjer.push('')
  linjer.push('| Uke | Jobb-min | E2e-min | PR-kjøringer |')
  linjer.push('|---|---|---|---|')
  for (const { uke, jobbMin, e2eMin, antallPrKjoringer } of ukeTrend) {
    linjer.push(`| ${uke} | ${jobbMin} | ${e2eMin} | ${antallPrKjoringer} |`)
  }

  return linjer.join('\n')
}

// ─── CLI ─────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {}
  for (const del of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(del)
    if (!m) continue
    args[m[1]] = m[2] === undefined ? true : m[2]
  }
  return args
}

function repoFraGh() {
  try {
    return execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], {
      encoding: 'utf8',
    }).trim() || undefined
  } catch {
    return undefined
  }
}

function tokenFraGh() {
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim() || undefined
  } catch {
    return undefined
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  // Krev streng: `--dager` uten `=N` gir true, og Number(true) er 1.
  const dager = args.dager !== undefined ? Number(typeof args.dager === 'string' ? args.dager : NaN) : 30
  if (!Number.isFinite(dager) || dager <= 0) {
    console.error(`--dager må skrives som --dager=N med et positivt tall, fikk «${args.dager}».`)
    process.exitCode = 1
    return
  }

  const workflowNavn = typeof args.workflow === 'string' ? args.workflow : 'PR-sjekk'
  const somJson = args.json === true

  // Aldri hardkod repo-navnet — fila speiles til offentlige klubb-app.
  const repo = (typeof args.repo === 'string' && args.repo) || process.env.GITHUB_REPOSITORY || repoFraGh()
  if (!repo) {
    console.error('Fant ikke repo — oppgi --repo=eier/navn, sett GITHUB_REPOSITORY, eller logg inn med «gh auth login».')
    process.exitCode = 1
    return
  }

  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || tokenFraGh()
  if (!token) {
    console.error('Fant ikke token — sett GH_TOKEN/GITHUB_TOKEN, eller logg inn med «gh auth login».')
    process.exitCode = 1
    return
  }

  let data
  try {
    data = await kjorRapport({ dager, repo, token, workflowNavn })
  } catch (e) {
    console.error(`Klarte ikke hente CI-tidsbruk: ${e.message}`)
    process.exitCode = 1
    return
  }

  console.log(somJson ? JSON.stringify(data, null, 2) : byggRapport(data))
}

// Ikke kjør main() når vitest importerer fila.
const kjortDirekte = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (kjortDirekte) {
  main().catch(e => {
    console.error(e)
    process.exit(1)
  })
}
