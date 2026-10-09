// Kalles som `node .github/scripts/ci-minuttbudsjett.mjs` — ingen shebang:
// vitest-transformasjonen på Windows (CRLF) hoister shims foran linje 1, og
// `#!` midt i en linje er parse-feil.
//
// Budsjettvakt for GitHub Actions-minutter (#534). Kjøres i pr-check.yml FØR
// `npm ci` (ett REST-kall, ingen avhengigheter) og avgjør om e2e kjører.
// Skriver forbrukstabell til step summary uansett utfall, så trenden synes.
//
// Free-plan gir 2000 min/mnd på private repoer (klubb-app er offentlig og
// gratis). Vakten ofrer e2e før kvoten sperrer ALL CI; drift og kjerneporten
// røres aldri.
//
// FORBEHOLD (les før du justerer tersklene) — målt sept. 2026, 1.–23.:
// - Run-varighet (run_started_at → updated_at), korrigert for reruns (#668).
//     · `updated_at` henger etter siste jobb: +43 min overtelling, beholdt
//       ukorrigert (trygg retning).
//     · Parallelle jobber i samme workflow UNDERvurderes (GitHub fakturerer
//       per jobb). pr-check.yml har nå to parallelle jobber (kjerne ‖ sjekk),
//       så feilkilden er reell — ikke målt på nytt etter splitten.
//     · Rerun telles i måneden runen ble opprettet (sjelden relevant).
//   Netto: korrigert 1735 min mot 1692 jobb-basert — ~2,5 % overtelling.
// - Kvoten er KONTOBRED, men vi ser bare dette repoet; DRIFTSRESERVE_MIN
//   dekker de andre private repoene.
// - Copilot-kjøringer telles med (~27 % overvurdering) bevisst, så to
//   umodellerte feil ikke kansellerer hverandre stille.
// - Kalendermåned som proxy for faktureringssyklus, og pågående kjøringer
//   telles til «nå» — begge overvurderer, trygg retning.

import { appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// ─── Konstanter — alt på ett sted ───────────────────────────────────────────
export const KVOTE_MIN = 2000 // Free-plan, privat repo, kontobred kvote/mnd.

export const DRIFTSRESERVE_MIN = 700
// Drift kuttes aldri. Reserven = dette repoets drift (juli 2026: 184 min) +
// andre private repoer på kontoen (~293 min, usynlige for vakten) + margin.
// Nytt privat repo eller ny schedulert workflow ⇒ vurder på nytt
// (docs/ci-minuttbudsjett.md).

export const CI_BUDSJETT_MIN = KVOTE_MIN - DRIFTSRESERVE_MIN // 1300

export const E2E_KOST_MIN = 10
// TILLEGG over kjerneporten, kun for PR-kjøringer (push til main kjører aldri
// e2e). Målt PR #538 (103 tester): ~8,8 min; 10 = det + margin for
// `retries: 1`. Høyt anslag er trygg retning. Mål på nytt hvis suiten vokser
// vesentlig (docs/ci-minuttbudsjett.md).

export const VARSEL_ANDEL = 0.8 // skriv «nærmer seg taket» i step summary fra 80 % av budsjettet

export const VED_MAALEFEIL = 'kutt'
// Feil LUKKET når målingen feiler: verste utfall er «e2e manglet på én PR»,
// mens å kjøre blindt kan sprenge budsjettet. Snu til noe annet for fail-open.

export const MAKS_FORSOK_OPPSLAG = 50
// Tak på /attempts/{n}-oppslag per kjøring (#668; sept. 2026 hadde 8), så
// vakten ikke brenner minutter på å telle minutter. Sprengt tak kaster.

// ─── Ren logikk (testbar uten nettverk) ─────────────────────────────────────

// Runder OPP per kjøring (61 s → 2 min), slik GitHub fakturerer.
export function forbrukMinutter(runs) {
  let sum = 0
  for (const run of runs) {
    // `queued` har run_started_at = null ⇒ NaN som ville forgiftet hele
    // summen. Den har uansett ikke brukt minutter ennå.
    if (!run.run_started_at || !run.updated_at) continue
    const start = new Date(run.run_started_at).getTime()
    const slutt = new Date(run.updated_at).getTime()
    if (!Number.isFinite(start) || !Number.isFinite(slutt)) continue
    const ms = Math.max(0, slutt - start)
    sum += Math.ceil(ms / 60_000)
  }
  return sum
}

// Forbruk + e2e-kost, aldri forbruk alene — e2e-kjøringen selv skal ikke
// kunne dytte forbruket over budsjettet.
export function skalKjoreE2e(forbrukMin, budsjettMin = CI_BUDSJETT_MIN, e2eKostMin = E2E_KOST_MIN) {
  return forbrukMin + e2eKostMin <= budsjettMin
}

// UTC, fordi GitHubs tidsstempler er UTC (ikke lib/dato.ts sin Oslo-dag).
export function foersteIManeden(naa = new Date()) {
  return new Date(Date.UTC(naa.getUTCFullYear(), naa.getUTCMonth(), 1, 0, 0, 0)).toISOString()
}

// Tidligere forsøk for runs med run_attempt > 1 (#668). Run-objektet viser
// kun SISTE forsøks tider, så forsøk 1..n-1 må slås opp separat.
export function tidligereForsok(runs) {
  const liste = []
  for (const run of runs) {
    const sisteForsok = run.run_attempt ?? 1
    for (let forsok = 1; forsok < sisteForsok; forsok++) {
      liste.push({ runId: run.id, forsok })
    }
  }
  return liste
}

// ─── Nettverk: hent + summer forbruk for inneværende måned ─────────────────

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

// /attempts/{n} gir et frosset run-objekt for det ene forsøket, så
// forbrukMinutter() kan gjenbrukes uendret. Sekvensielt mot et rate-limitet API.
export async function hentTidligereForsokMinutter({ repo, token, runs, fetchImpl = fetch, maksOppslag = MAKS_FORSOK_OPPSLAG }) {
  const liste = tidligereForsok(runs)
  if (liste.length > maksOppslag) {
    // Fail-closed: en ufullstendig sum ser komplett ut.
    throw new Error(
      `Flere enn ${maksOppslag} tidligere forsøk å slå opp denne måneden — taket nådd, forbruket kan ikke måles fullstendig.`,
    )
  }
  const attemptObjekter = []
  for (const { runId, forsok } of liste) {
    const url = `https://api.github.com/repos/${repo}/actions/runs/${runId}/attempts/${forsok}`
    const res = await fetchImpl(url, { headers: githubHeaders(token), signal: AbortSignal.timeout(10_000) })
    if (!res.ok) {
      throw new Error(`GitHub API ga ${res.status} ${res.statusText} for ${url}`)
    }
    const forsokObjekt = await res.json()
    // forbrukMinutter() hopper stille over manglende tider (riktig for queued),
    // men et ferdig forsøk uten dem ville blitt 0 min. Kast ⇒ VED_MAALEFEIL.
    const start = Date.parse(forsokObjekt?.run_started_at)
    const slutt = Date.parse(forsokObjekt?.updated_at)
    if (!Number.isFinite(start) || !Number.isFinite(slutt) || slutt < start) {
      throw new Error(
        `Ugyldig tidsrom for ${url}: run_started_at=${forsokObjekt?.run_started_at}, updated_at=${forsokObjekt?.updated_at}`,
      )
    }
    attemptObjekter.push(forsokObjekt)
  }
  return forbrukMinutter(attemptObjekter)
}

// Maks 10 sider (1000 kjøringer) — pragmatisk tak. `totalMin` er tallet
// vakten skal bruke; de to andre er delsummene (siste forsøk + reruns, #668).
export async function hentForbrukForManeden({
  repo,
  token,
  naa = new Date(),
  fetchImpl = fetch,
  maksSider = 10,
  maksOppslag = MAKS_FORSOK_OPPSLAG,
}) {
  const siden = foersteIManeden(naa)
  const runs = []
  for (let side = 1; side <= maksSider; side++) {
    const url = `https://api.github.com/repos/${repo}/actions/runs?created=${encodeURIComponent('>=' + siden)}&per_page=100&page=${side}`
    const res = await fetchImpl(url, {
      headers: githubHeaders(token),
      // undici venter ~300 s på headers by default. Abort ⇒ VED_MAALEFEIL.
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      throw new Error(`GitHub API ga ${res.status} ${res.statusText} for ${url}`)
    }
    const data = await res.json()
    const sideRuns = data.workflow_runs ?? []
    runs.push(...sideRuns)
    if (sideRuns.length < 100) {
      const sisteForsokMin = forbrukMinutter(runs)
      const tidligereForsokMin = await hentTidligereForsokMinutter({ repo, token, runs, fetchImpl, maksOppslag })
      const oppslag = tidligereForsok(runs).length
      return { totalMin: sisteForsokMin + tidligereForsokMin, sisteForsokMin, tidligereForsokMin, oppslag }
    }
  }
  // Siste side var full: å returnere summen her ville feilet ÅPENT med et for
  // lavt tall. Kast, så det håndteres som målefeil.
  throw new Error(
    `Flere enn ${maksSider * 100} kjøringer denne måneden — pagineringstaket nådd, forbruket kan ikke måles fullstendig.`,
  )
}

// ─── Rapportering ────────────────────────────────────────────────────────────

function skrivOutput(kjorE2e) {
  const sti = process.env.GITHUB_OUTPUT
  if (sti) appendFileSync(sti, `kjor_e2e=${kjorE2e}\n`)
}

function skrivSummary(markdown) {
  const sti = process.env.GITHUB_STEP_SUMMARY
  if (sti) appendFileSync(sti, markdown + '\n')
  else console.log(markdown) // lokal kjøring uten GITHUB_STEP_SUMMARY-fil
}

function tabell({ forbruk, budsjett, reserve, verdikt, ekstraRad, rerunMin }) {
  const rader = [
    '### CI-minuttbudsjett (#534)',
    '',
    '| Felt | Verdi |',
    '|---|---|',
    `| Forbruk hittil i måneden | ${forbruk} min |`,
  ]
  // Kun når reruns bidro — «0 min» på hver PR ville vært støy.
  if (rerunMin) rader.push(`| Herav tidligere rerun-forsøk | ${rerunMin} min |`)
  rader.push(
    `| E2e-kost (anslått tillegg) | ${E2E_KOST_MIN} min |`,
    `| Budsjett (kvote − driftsreserve) | ${budsjett} min |`,
    `| Driftsreserve | ${reserve} min |`,
    `| Verdikt | ${verdikt} |`,
  )
  if (ekstraRad) rader.push(`| Merknad | ${ekstraRad} |`)
  return rader.join('\n')
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY
  const token = process.env.GITHUB_TOKEN
  // Kun eksplisitt 'false' kortslutter; manglende/uventet verdi = privat.
  const repoPrivat = process.env.REPO_PRIVAT !== 'false'

  if (!repoPrivat) {
    // Offentlige repoer (klubb-app) bruker ikke kvote — spar API-kallet helt.
    skrivOutput(true)
    skrivSummary(tabell({ forbruk: '–', budsjett: '–', reserve: '–', verdikt: '✅ Kjør e2e', ekstraRad: 'Offentlig repo — bruker ikke Actions-kvote.' }))
    return
  }

  if (!repo || !token) {
    console.error('GITHUB_REPOSITORY eller GITHUB_TOKEN mangler — kan ikke måle forbruk.')
    process.exitCode = 1
    const kutt = VED_MAALEFEIL === 'kutt'
    skrivOutput(!kutt)
    skrivSummary(tabell({ forbruk: 'ukjent (miljøvariabler mangler)', budsjett: CI_BUDSJETT_MIN, reserve: DRIFTSRESERVE_MIN, verdikt: kutt ? '⚠️ Kuttet (måling umulig)' : '✅ Kjør e2e (fail-open)' }))
    return
  }

  let forbruk
  try {
    forbruk = await hentForbrukForManeden({ repo, token })
  } catch (e) {
    console.error(`::warning::Klarte ikke måle CI-forbruk: ${e.message}`)
    const kutt = VED_MAALEFEIL === 'kutt'
    skrivOutput(!kutt)
    skrivSummary(tabell({
      forbruk: `ukjent (${e.message})`,
      budsjett: CI_BUDSJETT_MIN,
      reserve: DRIFTSRESERVE_MIN,
      verdikt: kutt ? '⚠️ Kuttet (måling feilet)' : '✅ Kjør e2e (fail-open)',
    }))
    return
  }

  const totalMin = forbruk.totalMin
  const kjorE2e = skalKjoreE2e(totalMin, CI_BUDSJETT_MIN, E2E_KOST_MIN)
  const naermerSegTaket = totalMin >= CI_BUDSJETT_MIN * VARSEL_ANDEL

  let ekstraRad = null
  if (!kjorE2e) {
    ekstraRad = `forbruk (${totalMin}) + e2e-kost (${E2E_KOST_MIN}) > budsjett (${CI_BUDSJETT_MIN})`
    console.log(`::warning::CI-minuttbudsjett kuttet e2e denne PR-en — ${ekstraRad}. Se docs/ci-minuttbudsjett.md.`)
  } else if (naermerSegTaket) {
    ekstraRad = `nærmer seg taket (over ${Math.round(VARSEL_ANDEL * 100)} % av budsjettet brukt)`
  }

  skrivOutput(kjorE2e)
  skrivSummary(tabell({
    forbruk: totalMin,
    budsjett: CI_BUDSJETT_MIN,
    reserve: DRIFTSRESERVE_MIN,
    verdikt: kjorE2e ? '✅ Kjør e2e' : '❌ Kuttet e2e denne kjøringen',
    ekstraRad,
    rerunMin: forbruk.tidligereForsokMin,
  }))
}

// Ikke kjør main() når vitest importerer fila.
const kjortDirekte = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (kjortDirekte) {
  main().catch(e => {
    console.error(e)
    process.exit(1)
  })
}
