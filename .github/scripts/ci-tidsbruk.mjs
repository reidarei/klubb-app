// Kalles som `node .github/scripts/ci-tidsbruk.mjs` — ingen shebang, se samme
// begrunnelse som i .github/scripts/ci-minuttbudsjett.mjs (Windows-checkout/
// vitest-transform, fila er uansett ikke kjørbar).
//
// CI-tidsbruk (#664): svarer på «hvor mye tid går til hvilket steg, hvordan
// utvikler det seg, og hvor mye av forbruket er reruns». `ci-minuttbudsjett.mjs`
// måler TOTALFORBRUK mot kvote; dette verktøyet måler HVOR tiden går.
//
// KJØRES MANUELT, ALDRI FRA EN WORKFLOW. Det er et bevisst scope-kutt fra
// issuet: en scheduled workflow som målte CI-tidsbruk ville selv brukt av
// kvoten den måler. Verktøyet skriver derfor aldri til $GITHUB_OUTPUT eller
// $GITHUB_STEP_SUMMARY — det er ikke en vakt, det er en rapport for et
// menneske som lurer.
//
// FORBEHOLD (les før du tolker tallene):
// - Jobb-basert vs. run-basert: dette verktøyet summerer PER JOBB (GitHubs
//   faktiske faktureringsenhet — ceil per jobb). `ci-minuttbudsjett.mjs`
//   summerer PER RUN (run_started_at → updated_at). De to sammenfaller når en
//   run har ett forsøk og én jobb, men rerunner gjør jobb-basert HØYERE — en
//   rerun øker run_attempt på SAMME run i stedet for å lage en ny, og
//   run-basert telling ser derfor kun siste forsøk. Se § Mot budsjettvakten
//   i rapporten og docs/ci-minuttbudsjett.md § Hvor tiden faktisk går.
// - `ukjent` i gating-seksjonen betyr «kjøring fra før #663, ingen
//   markørsteg» — IKKE «e2e kjørte». De to må aldri slås sammen: en rapport
//   som telte `ukjent` som `kjorte` ville løyet om gatingens effekt for enhver
//   kjøring eldre enn markørstegene.
// - «E2e kjørte» avgjøres av ETT delt predikat, `e2eKjorte()`: et `if:`-hoppet
//   steg returneres fortsatt av jobs-API-et (med conclusion 'skipped'), så
//   stegets EKSISTENS sier ingenting om at det kjørte. Både gating-tabellen og
//   E2e-min i trendtabellen går gjennom det predikatet — to kopier av sjekken
//   driftet fra hverandre og fikk de to seksjonene til å motsi hverandre.
// - Gating klassifiseres per `run_attempt` (høyeste forsøk vinner), ikke på
//   tvers av forsøk. Forutsetter at workflowen har ÉN jobb (`sjekk`); får den
//   flere, og bare noen av dem reruns, ser klassifiseringen kun de rerunnede.
// - Vinduet er en glidende periode (`--dager` tilbake fra nå), ikke
//   kalendermåned som budsjettvakten. De to tallene er derfor målt over ulike
//   perioder selv når de sammenlignes i § 3 — se merknaden der.
// - `gh` CLI er i praksis en forutsetning: uten `--repo`/`GITHUB_REPOSITORY`
//   og `GH_TOKEN`/`GITHUB_TOKEN` faller verktøyet tilbake til `gh repo view`
//   og `gh auth token`. PAT-en i `.env.local` er en Issues-PAT uten
//   `actions:read` og duger ikke til dette.

import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { forbrukMinutter, E2E_KOST_MIN } from './ci-minuttbudsjett.mjs'

// ─── Konstanter — strengkoblet til .github/workflows/pr-check.yml ──────────
// Endrer noen et av disse tre stegnavnene der uten å oppdatere her, ryker
// klassifiseringen STILLE (alt havner i 'ukjent') — pinnet av en test som
// leser pr-check.yml og asserterer at navnene finnes bokstavelig.
export const STEG_E2E = 'E2e (Playwright)'
export const MARKOER_LAV_RISIKO = 'E2e hoppet over — lav risiko'
export const MARKOER_BUDSJETT = 'E2e hoppet over — budsjettvakten kuttet'

// ─── Ren logikk (testbar uten nettverk) ─────────────────────────────────────

// Sant KUN når e2e-steget faktisk KJØRTE. Et `if:`-hoppet steg returneres
// fortsatt av jobs-API-et med `conclusion: 'skipped'`, så «steget finnes i
// jobben» er ikke det samme som «e2e kjørte». Predikatet er bevisst DELT
// mellom klassifiserE2e() og grupperPerUke(): da trendtabellen hadde sin egen
// eksistens-sjekk ble E2e-min ≈ Jobb-min for hver PR-uke uansett gating, og
// § 6 motsa § 5 i samme rapport.
//
// Skillet er «ble steget HOPPET OVER» kontra «rakk det å kjøre» — ikke en
// hviteliste av konklusjoner. Et avbrutt steg (`cancelled`, timeout) brukte
// Actions-minutter og skal telle; en hviteliste på success/failure ville
// under-rapportert nettopp de kjøringene som kostet mest. Tidsstemplene er
// den ærlige kilden: skipped-steg har ingen.
export function e2eKjorte(steg) {
  if (steg?.name !== STEG_E2E) return false
  if (steg.conclusion === 'skipped') return false
  return Boolean(steg.started_at && steg.completed_at)
}

// Summerer minutter for en liste av JOBBER (ikke runs) — GitHubs faktiske
// faktureringsenhet. `Math.ceil` PER JOBB, samme prinsipp som
// forbrukMinutter() i ci-minuttbudsjett.mjs, men på jobb-nivå: to jobber på
// samme run (f.eks. et rerun-forsøk) telles begge, mens run-basert telling
// kun ser det siste forsøket.
export function jobbMinutter(jobber) {
  let minutter = 0
  let utelatt = 0
  for (const jobb of jobber) {
    // Pågående/queued jobber mangler started_at/completed_at. De har ikke
    // brukt et endelig antall minutter ennå — hopp over og tell dem separat
    // i stedet for å la dem forgifte summen med NaN (samme fella som
    // forbrukMinutter() i ci-minuttbudsjett.mjs vokter mot).
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

// Splitter jobber i «første forsøk» (run_attempt ≤ 1, eller mangler feltet)
// og «reruns» (run_attempt ≥ 2). Reruns er usynlige i standardvisningen
// («gh run list» viser én rad per run uansett antall forsøk) — dette er
// selve blindsonen issuet ber om å lukke.
export function forsokFordeling(jobber) {
  const forsteForsokJobber = jobber.filter(j => (j.run_attempt ?? 1) <= 1)
  const rerunJobber = jobber.filter(j => (j.run_attempt ?? 1) > 1)
  const { minutter: forsteForsokMin, utelatt: forsteForsokUtelatt } = jobbMinutter(forsteForsokJobber)
  const { minutter: rerunMin, utelatt: rerunUtelatt } = jobbMinutter(rerunJobber)
  const runsMedFlereForsok = new Set(rerunJobber.map(j => j.run_id)).size
  // `utelatt` fra BEGGE delkallene, ikke kastet: pågående jobber er utelatt
  // fra begge sider av rerun-brøken, og en prosent som ikke sier hvor mye den
  // ikke så, ser mer komplett ut enn den er.
  return { forsteForsokMin, rerunMin, runsMedFlereForsok, utelatt: forsteForsokUtelatt + rerunUtelatt }
}

// Terskel for å slå steg sammen til «Øvrige steg»: et steg som verken utgjør
// 1 % av totalen ELLER 30 sekunder er støy i en rapport ment å vise hvor
// tiden faktisk går — «Installer avhengigheter» på 3 sekunder drukner ellers
// tabellen uten å bidra med informasjon.
const OEVRIGE_ANDEL_TERSKEL = 0.01
const OEVRIGE_SEKUNDER_TERSKEL = 30

// Aggregerer steg-varighet på tvers av jobber, gruppert på stegnavn.
// «Ufordelt» er jobbens egen varighet minus summen av stegene — jobbens
// started_at ligger typisk et par sekunder før det første steget starter
// (runner-oppstart, checkout av selve jobben), og den differansen skal være
// synlig, ikke forsvinne stille inn i det største steget.
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
      // Skippede steg mangler tidsstempler (eller har started_at ===
      // completed_at) — 0 sekunder bidrar ingenting til fordelingen og skal
      // ikke stå i tabellen som en rad med «0».
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

// Klassifiserer én kjørings forhold til risiko-gatingen (#663). `jobber` er
// ALLE jobber for DENNE runen (på tvers av forsøk — filter=all-kallet gir
// oss det i ett svar, se hentJobber()).
//
// 'ukjent' er en EGEN kategori, aldri slått sammen med 'kjorte': en kjøring
// fra før #663 har ingen markørsteg og intet e2e-steg, og skal aldri leses
// som «e2e kjørte» av en rapport som forsøker å måle gatingens effekt.
export function klassifiserE2e(run, jobber) {
  if (run.event !== 'pull_request') return 'hendelse'

  // Klassifiser PER FORSØK — høyeste run_attempt vinner. En run der forsøk 1
  // ble budsjettkuttet og forsøk 2 faktisk kjørte e2e skal telles som
  // «kjorte»; blander vi forsøkene, forsvinner nettopp rerun-effekten dette
  // verktøyet finnes for å vise. Trygt så lenge workflowen har én jobb (se
  // forbeholdet i filhodet).
  const sisteForsok = Math.max(1, ...jobber.map(j => j.run_attempt ?? 1))
  const alleSteg = jobber.filter(j => (j.run_attempt ?? 1) === sisteForsok).flatMap(j => j.steps ?? [])

  const lavRisiko = alleSteg.find(s => s.name === MARKOER_LAV_RISIKO)
  if (lavRisiko?.conclusion === 'success') return 'lav_risiko'

  const budsjett = alleSteg.find(s => s.name === MARKOER_BUDSJETT)
  if (budsjett?.conclusion === 'success') return 'budsjett'

  if (alleSteg.some(e2eKjorte)) return 'kjorte'

  return 'ukjent'
}

// ISO 8601-ukenøkkel («2026-W36») for et gitt tidspunkt, UTC-basert (samme
// begrunnelse som foersteIManeden() i ci-minuttbudsjett.mjs — GitHubs
// tidsstempler er UTC).
function isoUkeNoekkel(dato) {
  const d = new Date(Date.UTC(dato.getUTCFullYear(), dato.getUTCMonth(), dato.getUTCDate()))
  const dagNr = d.getUTCDay() || 7 // søndag = 0 i getUTCDay() → 7, mandag = 1
  d.setUTCDate(d.getUTCDate() + 4 - dagNr) // torsdag i samme ISO-uke
  const aarsstart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const ukeNr = Math.ceil(((d - aarsstart) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(ukeNr).padStart(2, '0')}`
}

// Grupperer en liste av { run, jobber }-poster per ISO-uke (basert på
// run.created_at). e2eMin er varigheten til jobbene som INNEHOLDER
// e2e-steget — hele jobben, ikke steget isolert, slik at Chromium-install og
// Supabase-oppstart telles med (samme logikk som E2E_KOST_MIN måler).
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

    // e2eKjorte(), ikke «steget finnes»: en gatet PR har steget i jobben med
    // conclusion 'skipped', og skulle den telt, ville E2e-min vært lik
    // Jobb-min for hver PR-uke — kolonnen som skal vise at gatingen virker.
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

// Paginerer repos/{repo}/actions/runs?created=>=siden — ALLE workflows i
// repoet, ikke bare pr-check.yml, slik at § Forbruk i vinduet kan vise
// per-workflow-fordeling. Kaster ved pagineringstak (fail-closed, samme
// begrunnelse som hentForbrukForManeden() i ci-minuttbudsjett.mjs) — en
// ufullstendig sum som SER komplett ut er verre enn en feilmelding.
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

// Henter jobber for ÉN run. `filter=all` gir jobber fra ALLE forsøk i ett
// kall, hver med sitt eget run_attempt-felt — verifisert mot GitHubs API, og
// derfor ingen grunn til å iterere /attempts/{n}/jobs separat.
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

// Bygger hele datagrunnlaget: henter runs i vinduet, henter jobber for hver
// (batchet 5 om gangen med fremdrift til STDERR), og aggregerer i alle
// formene rapporten trenger. Eksportert separat fra byggRapport() slik at
// --json kan skrive den strukturerte dataen direkte, uten å gå via markdown.
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

  const forsok = forsokFordeling(alleJobber)

  // Samme funksjon budsjettvakten bruker — ikke en kopi. Se filhode-forbeholdet
  // om at vinduet her er glidende, ikke kalendermåned.
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

// Formaterer datagrunnlaget fra kjorRapport() som lesbar markdown — ment for
// terminalen, ikke som en $GITHUB_STEP_SUMMARY (se filhode: dette er ikke en
// vakt).
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
    `Jobb-basert (dette verktøyet): ${jobb.totalMin} min. Run-basert (\`forbrukMinutter()\`, slik budsjettvakten ser det): ${budsjett.runBasertMin} min. Differanse: **${budsjett.differanseMin} min**.`,
  )
  linjer.push(
    'Differansen er i hovedsak reruns — budsjettvakten teller siste forsøk per RUN, mens jobb-basert teller hvert forsøk (§ 2). Merk at vinduene ikke er identiske: dette verktøyet måler siste `--dager`, budsjettvakten kalendermåned.',
  )
  linjer.push('')

  linjer.push(`## 4. Steg-fordeling — ${workflowNavn}`)
  linjer.push('')
  const stegTotal = steg.reduce((s, r) => s + r.sekunder, 0)
  // «Snitt/forekomst», ikke «Snitt/kjøring»: rad.antall teller stegFOREKOMSTER
  // på tvers av jobber. Sammenfaller så lenge workflowen har én jobb per run,
  // men slutter å stemme i det noen legger til en matrix.
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

  // `--dager` uten `=N` gir parseArgs boolean true, og Number(true) er 1 —
  // altså en «gyldig» kjøring på ett døgn i stedet for en feilmelding.
  // Derfor kreves en STRENG her, ikke bare et endelig tall.
  const dager = args.dager !== undefined ? Number(typeof args.dager === 'string' ? args.dager : NaN) : 30
  if (!Number.isFinite(dager) || dager <= 0) {
    console.error(`--dager må skrives som --dager=N med et positivt tall, fikk «${args.dager}».`)
    process.exitCode = 1
    return
  }

  const workflowNavn = typeof args.workflow === 'string' ? args.workflow : 'PR-sjekk'
  const somJson = args.json === true

  // Aldri hardkod repo-navnet — disse filene speiles til det offentlige
  // klubb-app-repoet, og lekkasjevakten greper etter klubbnavn.
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

  // --json på stdout skal forbli rent — all fremdrift går til stderr
  // (se kjorRapport()).
  console.log(somJson ? JSON.stringify(data, null, 2) : byggRapport(data))
}

// Kjør kun main() når filen kjøres direkte (`node ci-tidsbruk.mjs`), ikke når
// funksjonene importeres av vitest.
const kjortDirekte = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (kjortDirekte) {
  main().catch(e => {
    console.error(e)
    process.exit(1)
  })
}
