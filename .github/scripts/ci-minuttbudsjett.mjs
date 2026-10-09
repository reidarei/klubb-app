// Kalles som `node .github/scripts/ci-minuttbudsjett.mjs` — ingen shebang:
// vitest-transformasjonen på Windows (CRLF) hoister shims foran linje 1, og
// `#!` midt i en linje er parse-feil.
//
// Budsjettvakt for GitHub Actions-minutter (#534). Kjøres i pr-check.yml FØR
// `npm ci` (ingen avhengigheter) og avgjør om e2e kjører. Skriver
// forbrukstabell til step summary uansett utfall, så trenden synes.
//
// Free-plan gir 2000 min/mnd på private repoer (klubb-app er offentlig og
// gratis). Vakten ofrer e2e før kvoten sperrer ALL CI; drift og kjerneporten
// røres aldri.
//
// FORBEHOLD (les før du justerer tersklene):
// - Teller PER JOBB, `Math.ceil` per jobb — GitHubs faktureringsenhet (#851).
//   Run-varighet undertalte 24 % etter at pr-check.yml fikk to parallelle
//   jobber (okt. 2026, 1.–9.: 1119 mot 1466 min).
// - `jobs?filter=all` gir alle forsøk i ett kall, så reruns er med uten egne
//   oppslag. Ved «Re-run failed jobs» kopieres de urørte jobbene inn i det nye
//   forsøket med samme tider; unikeJobber() fjerner kopiene (fakturert én gang).
// - Ett jobb-kall per kjøring ⇒ ferdige kjøringer caches mellom kjøringer
//   (actions/cache i pr-check.yml), ellers ~750 kall ved månedsslutt mot
//   GITHUB_TOKEN-grensen på 1000/time. Cachen er kun en optimalisering:
//   tapt eller ugyldig cache ⇒ alt hentes på nytt.
// - Kvoten er KONTOBRED, men vi ser bare dette repoet; DRIFTSRESERVE_MIN
//   dekker de andre private repoene.
// - Copilot-kjøringer telles med (~27 % overvurdering) bevisst, så to
//   umodellerte feil ikke kansellerer hverandre stille.
// - Kalendermåned som proxy for faktureringssyklus, rerun telles i måneden
//   runen ble opprettet, og pågående jobber telles til «nå» — overvurderer
//   eller er uvesentlig, trygg retning.

import { appendFileSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
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

export const MAKS_JOBB_OPPSLAG = 300
// Tak på jobb-kall per kjøring av vakten (#851), godt under GITHUB_TOKEN sine
// 1000/time. Med varm cache er det typisk noen titalls. Sprengt tak: det som
// rakk å hentes, caches, og vakten kaster (⇒ VED_MAALEFEIL) — neste kjøring
// fortsetter der denne slapp.

export const SAMTIDIGE_OPPSLAG = 5 // GitHub fraråder mange samtidige kall (sekundær rate limit)

const CACHE_VERSJON = 1

// ─── Ren logikk (testbar uten nettverk) ─────────────────────────────────────

// En jobb i forsøk n > 1 med samme navn og tider som en jobb i et tidligere
// forsøk er en KOPI GitHub lager ved «Re-run failed jobs» (ny id og
// created_at, men started_at/completed_at fra originalen). Fakturert én gang
// — telles én gang (#851).
export function unikeJobber(jobber) {
  return jobber.filter(
    j =>
      !jobber.some(
        tidligere =>
          tidligere.run_id === j.run_id &&
          (tidligere.run_attempt ?? 1) < (j.run_attempt ?? 1) &&
          tidligere.name === j.name &&
          tidligere.started_at === j.started_at &&
          tidligere.completed_at === j.completed_at,
      ),
  )
}

// `Math.ceil` PER JOBB, slik GitHub fakturerer. Uten `naa` utelates
// pågående/queued jobber (talt i `utelatt`); med `naa` telles en startet,
// ikke ferdig jobb til «nå» (vakten). Queued har ikke brukt noe uansett.
export function jobbMinutter(jobber, { naa } = {}) {
  let minutter = 0
  let utelatt = 0
  for (const jobb of jobber) {
    const start = jobb.started_at ? new Date(jobb.started_at).getTime() : NaN
    const slutt = jobb.completed_at
      ? new Date(jobb.completed_at).getTime()
      : naa && jobb.started_at
        ? naa.getTime()
        : NaN
    // Manglende/uparsbare tider ⇒ NaN som ville forgiftet hele summen.
    if (!Number.isFinite(start) || !Number.isFinite(slutt)) {
      utelatt++
      continue
    }
    minutter += Math.ceil(Math.max(0, slutt - start) / 60_000)
  }
  return { minutter, utelatt }
}

// Fakturerte minutter for ÉN kjøring, alle forsøk. `tidligereMin` = forsøk før
// run.run_attempt, det run-objektet selv aldri viser (#668) — kun til rapport.
export function kjoringMinutter(run, jobber, naa = new Date()) {
  const unike = unikeJobber(jobber)
  const sisteForsok = run.run_attempt ?? 1
  const { minutter: min } = jobbMinutter(unike, { naa })
  const { minutter: tidligereMin } = jobbMinutter(
    unike.filter(j => (j.run_attempt ?? 1) < sisteForsok),
    { naa },
  )
  return { min, tidligereMin }
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

// ─── Cache over ferdige kjøringer (#851) ─────────────────────────────────────
// { versjon, maaned: 'YYYY-MM', runs: { [id]: { forsok, min, tidligereMin } } }.
// Kun `completed`-kjøringer lagres. En rerun gir ny run_attempt og bommer
// dermed på cachen av seg selv.

export function tomCache(naa = new Date()) {
  return { versjon: CACHE_VERSJON, maaned: foersteIManeden(naa).slice(0, 7), runs: {} }
}

// Alt som ikke er en gyldig cache for DENNE måneden ⇒ tom, og ugyldige poster
// droppes enkeltvis. Kaster aldri: en ødelagt cache koster bare flere oppslag.
export function tolkCache(tekst, naa = new Date()) {
  const cache = tomCache(naa)
  let data
  try {
    data = JSON.parse(tekst)
  } catch {
    return cache
  }
  if (!data || data.versjon !== CACHE_VERSJON || data.maaned !== cache.maaned || !data.runs || typeof data.runs !== 'object') {
    return cache
  }
  for (const [id, post] of Object.entries(data.runs)) {
    const gyldig =
      post &&
      Number.isInteger(post.forsok) && post.forsok >= 1 &&
      Number.isInteger(post.min) && post.min >= 0 &&
      Number.isInteger(post.tidligereMin) && post.tidligereMin >= 0 && post.tidligereMin <= post.min
    if (gyldig) cache.runs[id] = { forsok: post.forsok, min: post.min, tidligereMin: post.tidligereMin }
  }
  return cache
}

function lesCacheFil(sti, naa) {
  if (!sti) return tomCache(naa)
  try {
    return tolkCache(readFileSync(sti, 'utf8'), naa)
  } catch {
    return tomCache(naa) // ingen fil: første kjøring eller cache-bom
  }
}

function skrivCacheFil(sti, cache) {
  if (!sti) return
  try {
    mkdirSync(dirname(sti), { recursive: true })
    writeFileSync(sti, JSON.stringify(cache))
  } catch (e) {
    // Optimalisering, ikke måling — en skrivefeil skal ikke kutte e2e.
    console.error(`::warning::Klarte ikke skrive minuttcachen: ${e.message}`)
  }
}

// ─── Nettverk ────────────────────────────────────────────────────────────

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

export function feilForRespons(res, url, kontekst) {
  if (res.status === 403 || res.status === 404) {
    return new Error(
      `GitHub API ga ${res.status} ${res.statusText} for ${kontekst} — tokenet mangler trolig «actions:read»-rettigheten, eller rate limit er nådd.`,
    )
  }
  return new Error(`GitHub API ga ${res.status} ${res.statusText} for ${url}`)
}

// Kaster ved pagineringstak: en ufullstendig sum ser komplett ut.
export async function hentRuns({ repo, token, siden, fetchImpl = fetch, maksSider = 10 }) {
  const kjoringer = []
  for (let side = 1; side <= maksSider; side++) {
    const url = `https://api.github.com/repos/${repo}/actions/runs?created=${encodeURIComponent('>=' + siden)}&per_page=100&page=${side}`
    // undici venter ~300 s på headers by default. Abort ⇒ VED_MAALEFEIL.
    const res = await fetchImpl(url, { headers: githubHeaders(token), signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw feilForRespons(res, url, 'kjøringer')
    const data = await res.json()
    const runs = data.workflow_runs ?? []
    kjoringer.push(...runs)
    if (runs.length < 100) return kjoringer
  }
  throw new Error(`Flere enn ${maksSider * 100} kjøringer i perioden — pagineringstaket nådd, forbruket kan ikke måles fullstendig.`)
}

// `filter=all` gir jobber fra ALLE forsøk i ett kall, hver med run_attempt
// (verifisert) — ingen /attempts/{n}-iterasjon nødvendig.
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

// `cache` muteres: ferdige kjøringer legges inn etter hvert som de hentes, så
// også en kjøring som kaster (tak, API-feil) har varmet cachen for neste.
export async function hentForbrukForManeden({
  repo,
  token,
  naa = new Date(),
  fetchImpl = fetch,
  maksSider = 10,
  maksOppslag = MAKS_JOBB_OPPSLAG,
  cache = tomCache(naa),
}) {
  const runs = await hentRuns({ repo, token, siden: foersteIManeden(naa), fetchImpl, maksSider })

  // Kjøringer som ikke lenger er i lista (slettet, eller forrige måned) ut,
  // så cachen aldri vokser utover én måned.
  const iLista = new Set(runs.map(r => String(r.id)))
  for (const id of Object.keys(cache.runs)) if (!iLista.has(id)) delete cache.runs[id]

  let totalMin = 0
  let tidligereForsokMin = 0
  let fraCache = 0
  const maaHentes = []
  for (const run of runs) {
    const post = cache.runs[run.id]
    if (run.status === 'completed' && post && post.forsok === (run.run_attempt ?? 1)) {
      totalMin += post.min
      tidligereForsokMin += post.tidligereMin
      fraCache++
    } else {
      maaHentes.push(run)
    }
  }

  const denneOmgang = maaHentes.slice(0, maksOppslag)
  for (let i = 0; i < denneOmgang.length; i += SAMTIDIGE_OPPSLAG) {
    const batch = denneOmgang.slice(i, i + SAMTIDIGE_OPPSLAG)
    const resultater = await Promise.all(batch.map(run => hentJobber({ repo, runId: run.id, token, fetchImpl })))
    batch.forEach((run, idx) => {
      const { min, tidligereMin } = kjoringMinutter(run, resultater[idx], naa)
      totalMin += min
      tidligereForsokMin += tidligereMin
      if (run.status === 'completed') cache.runs[run.id] = { forsok: run.run_attempt ?? 1, min, tidligereMin }
    })
  }

  if (maaHentes.length > maksOppslag) {
    // Fail-closed: en sum uten de resterende kjøringene ser komplett ut.
    throw new Error(
      `${maaHentes.length} kjøringer uten cache, taket er ${maksOppslag} jobb-oppslag — ${maksOppslag} hentet og cachet, resten tas ved neste kjøring.`,
    )
  }

  return { totalMin, tidligereForsokMin, oppslag: denneOmgang.length, fraCache }
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

function tabell({ forbruk, budsjett, reserve, verdikt, ekstraRad, rerunMin, oppslag }) {
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
  if (oppslag) rader.push(`| Kjøringer (jobb-oppslag / fra cache) | ${oppslag.oppslag} / ${oppslag.fraCache} |`)
  if (ekstraRad) rader.push(`| Merknad | ${ekstraRad} |`)
  return rader.join('\n')
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY
  const token = process.env.GITHUB_TOKEN
  // Kun eksplisitt 'false' kortslutter; manglende/uventet verdi = privat.
  const repoPrivat = process.env.REPO_PRIVAT !== 'false'
  // Settes av pr-check.yml (actions/cache). Uten den: ingen cache, alt hentes.
  const cacheSti = process.env.CI_MINUTT_CACHE

  if (!repoPrivat) {
    // Offentlige repoer (klubb-app) bruker ikke kvote — spar API-kallene helt.
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

  const naa = new Date()
  const cache = lesCacheFil(cacheSti, naa)
  let forbruk
  try {
    forbruk = await hentForbrukForManeden({ repo, token, naa, cache })
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
  } finally {
    // Også ved feil: det som rakk å hentes, skal ikke hentes igjen.
    skrivCacheFil(cacheSti, cache)
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
    oppslag: forbruk,
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
