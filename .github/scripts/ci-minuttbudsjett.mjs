// Kalles som `node .github/scripts/ci-minuttbudsjett.mjs` — ingen shebang.
// En shebang her brøt vitest på Windows: transformasjonen hoister CJS-shims
// foran linje 1, og `#!` midt i en linje er en parse-feil. Fila er heller
// ikke kjørbar (mode 100644), så shebangen var ren dekorasjon. Merk at CI
// (Linux, LF) ikke feilet — bare Windows-checkout med CRLF.
// Budsjettvakt for GitHub Actions-minutter (#534).
//
// Kjøres i pr-check.yml FØR `npm ci` (billig — ett REST-kall, ingen npm-
// avhengigheter i det hele tatt) og avgjør om Playwright-e2e skal kjøre på
// denne PR-en. Skriver `kjor_e2e=true|false` til $GITHUB_OUTPUT og en
// forbrukstabell til $GITHUB_STEP_SUMMARY uansett utfall, slik at trenden er
// synlig på enhver PR — ikke bare når vakten faktisk kutter.
//
// BAKGRUNN: Free-plan gir 2000 min/mnd på PRIVATE repoer (klubb-app er
// offentlig og bruker ikke kvote i det hele tatt). Uten en vakt kunne en
// travel måned sperre ALL CI — lint/typecheck/build inkludert — midt i en
// arbeidsdag. Vakten ofrer e2e FØR det skjer; drift (cron-jobbene) og
// kjerneporten (lint/typecheck/test/build) røres aldri.
//
// FORBEHOLD (les før du justerer tersklene):
// - Vi måler *run*-varighet (run_started_at → updated_at), ikke summen av
//   jobb-varigheter. Det sammenfaller så lenge hver workflow har ett job —
//   alle våre har det i dag. Får en workflow flere PARALLELLE jobs, undervurderer
//   vakten det faktiske minuttforbruket (GitHub fakturerer per jobb, ikke per run).
// - Vi ser kun DETTE repoet via runs-endepunktet, men kvoten er KONTOBRED.
//   Andre private repoer på samme konto (~293 min i juli 2026 for vår del) er
//   usynlige for skriptet. Det er derfor DRIFTSRESERVE_MIN er dimensjonert til
//   å dekke dem, ikke bare dette repoets egen drift.
// - Copilot-kjøringer TELLES med i summen. De overvurderer trolig forbruket noe
//   (~27 %), men vi lar dem stå bevisst: overvurdering er den trygge retningen,
//   og vi vil ikke la to umodellerte feil (denne og fremmed-repo-forbruket)
//   kansellere hverandre stilltiende. Begge er nå eksplisitte.
// - Vi bruker KALENDERMÅNED som proxy for faktureringssyklusen. Er den ekte
//   syklusen ikke den 1. i måneden, teller vi for MYE i starten av syklusen
//   ⇒ vakten kutter for tidlig. Det er den trygge retningen å bomme i.
// - En PÅGÅENDE kjøring har updated_at ≈ nå og telles dermed som om den varer
//   helt til nå — bevisst konservativt (vi vil heller overvurdere enn undervurdere
//   forbruk som faktisk løper).

import { appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// ─── Konstanter — alt på ett sted ───────────────────────────────────────────
export const KVOTE_MIN = 2000 // Free-plan, privat repo, kontobred kvote/mnd.

export const DRIFTSRESERVE_MIN = 700
// Admins føring: drift kuttes aldri. Reserven dekker TO ting, fordi kvoten er
// KONTOBRED mens skriptet bare ser dette repoet:
//   1. Dette repoets egen drift — målt juli 2026: 184 min (påminnelse 127 +
//      klientfeil 26 + backup 25 + keepalive 4 + drill 2).
//   2. Andre private repoer på samme konto — målt juli med denne logikken:
//      ~293 min fordelt på tre repoer. De er usynlige for vakten, men spiser
//      av samme 2000. (Repo-for-repo-tallene står i docs/ci-minuttbudsjett.md.)
// 184 + ~300 + margin ⇒ 700. Nytt privat repo på kontoen, eller en ny
// schedulert workflow ⇒ vurder tallet på nytt (docs/ci-minuttbudsjett.md).

export const CI_BUDSJETT_MIN = KVOTE_MIN - DRIFTSRESERVE_MIN // 1300

export const E2E_KOST_MIN = 10
// TILLEGG over kjerneporten (lint+typecheck+vitest+build), som lå på ~3,4 min
// før e2e (målt 406 min / 120 kjøringer i juli).
//
// MÅLT PR #535 (66 e2e-tester): tillegg ~6,7 min ⇒ konstanten sto på 8.
// MÅLT PR #538 (103 tester, etter røyktesten): e2e-steget 505 s +
// Chromium-install 22 s + Supabase-vent 2 s = ~8,8 min tillegg, av en total
// jobbtid på 14,5 min. `supabase start` figurerer ikke fordi den kjører ferdig
// i bakgrunnen mens lint/tester/bygg går — overlappen fungerer som planlagt.
//
// 10 = målt 8,8 + margin for `retries: 1`, som ikke slo inn i målingen.
// Fortsatt i trygg retning: bommer vi høyt kutter vakten litt for tidlig,
// bommer vi lavt sprenger vi budsjettet vi skulle vokte.
//
// Merk at konstanten kun gjelder PR-kjøringer. Push til main kjører aldri e2e
// (se pr-check.yml § Avgjør e2e-omfang), så de koster kjerneporten alene.
// Mål på nytt hvis suiten vokser vesentlig — se docs/ci-minuttbudsjett.md
// § Etter første CI-kjøring: mål E2E_KOST_MIN på nytt.

export const VARSEL_ANDEL = 0.8 // skriv «nærmer seg taket» i step summary fra 80 % av budsjettet

export const VED_MAALEFEIL = 'kutt'
// Ett ord å snu hvis vi en dag vil feile ÅPENT (kjøre e2e) i stedet for
// LUKKET (kutte e2e) når GitHub API-kallet selv feiler. 'kutt' er valgt fordi
// konsekvensen av en feilmåling er «e2e manglet på én PR», mens motsatt
// (kjøre blindt) risikerer å sprenge budsjettet vi ikke klarte å måle.

// ─── Ren logikk (testbar uten nettverk) ─────────────────────────────────────

// Summerer minutter for en liste av kjøringer. Runder OPP per kjøring
// (61 s → 2 min) fordi GitHub selv fakturerer slik — å summere rå sekunder og
// runde til slutt ville undervurdert forbruket.
export function forbrukMinutter(runs) {
  let sum = 0
  for (const run of runs) {
    // En `queued`-kjøring har run_started_at = null. new Date(null) → NaN, og
    // NaN forplanter seg gjennom HELE summen — vakten ville da kuttet e2e med
    // «NaN» i sammendraget, av en ren datagrunn. Kjøringen har uansett ikke
    // brukt minutter ennå, så å hoppe over den er også det riktige svaret.
    if (!run.run_started_at || !run.updated_at) continue
    const start = new Date(run.run_started_at).getTime()
    const slutt = new Date(run.updated_at).getTime()
    if (!Number.isFinite(start) || !Number.isFinite(slutt)) continue
    const ms = Math.max(0, slutt - start)
    sum += Math.ceil(ms / 60_000)
  }
  return sum
}

// Skal e2e kjøre? Terskelen er forbruk + e2e-kost — ALDRI forbruk alene.
// En PR som kjører e2e og dermed dytter forbruket over budsjettet skal ikke
// ha «sett grønt lys» på et tall som allerede var for optimistisk.
export function skalKjoreE2e(forbrukMin, budsjettMin = CI_BUDSJETT_MIN, e2eKostMin = E2E_KOST_MIN) {
  return forbrukMin + e2eKostMin <= budsjettMin
}

// Midnatt UTC den 1. i måneden til `naa` ligger i. UTC brukes gjennomgående —
// GitHubs run_started_at/updated_at er UTC, og norsk sommertid ville ellers
// gitt et par timers avvik i når «måneden begynner».
export function foersteIManeden(naa = new Date()) {
  return new Date(Date.UTC(naa.getUTCFullYear(), naa.getUTCMonth(), 1, 0, 0, 0)).toISOString()
}

// ─── Nettverk: hent + summer forbruk for inneværende måned ─────────────────

// Paginerer repos/{owner}/{repo}/actions/runs, maks 10 sider (1000 kjøringer)
// — et pragmatisk tak; en måned med over 1000 kjøringer er uansett et signal
// om noe annet enn manglende paginering.
export async function hentForbrukForManeden({ repo, token, naa = new Date(), fetchImpl = fetch, maksSider = 10 }) {
  const siden = foersteIManeden(naa)
  let sum = 0
  for (let side = 1; side <= maksSider; side++) {
    const url = `https://api.github.com/repos/${repo}/actions/runs?created=${encodeURIComponent('>=' + siden)}&per_page=100&page=${side}`
    const res = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      // undici henger i ~300 s på headers-timeout by default. Ti slike kall
      // ville brent flere minutter i en vakt hvis hele poeng er å SPARE
      // minutter. Kastet abort håndteres som målefeil ⇒ VED_MAALEFEIL.
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      throw new Error(`GitHub API ga ${res.status} ${res.statusText} for ${url}`)
    }
    const data = await res.json()
    const runs = data.workflow_runs ?? []
    sum += forbrukMinutter(runs)
    if (runs.length < 100) return sum // siste side — summen er komplett
  }
  // Vi brukte opp alle sidene OG siste side var full: det finnes flere
  // kjøringer vi ikke har talt. Å returnere summen her ville feilet ÅPENT —
  // et for lavt tall som slipper e2e videre selv om budsjettet er brukt, altså
  // motsatt av VED_MAALEFEIL. Kast i stedet, så håndteres det som målefeil.
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

function tabell({ forbruk, budsjett, reserve, verdikt, ekstraRad }) {
  const rader = [
    '### CI-minuttbudsjett (#534)',
    '',
    '| Felt | Verdi |',
    '|---|---|',
    `| Forbruk hittil i måneden | ${forbruk} min |`,
    `| E2e-kost (anslått tillegg) | ${E2E_KOST_MIN} min |`,
    `| Budsjett (kvote − driftsreserve) | ${budsjett} min |`,
    `| Driftsreserve | ${reserve} min |`,
    `| Verdikt | ${verdikt} |`,
  ]
  if (ekstraRad) rader.push(`| Merknad | ${ekstraRad} |`)
  return rader.join('\n')
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY
  const token = process.env.GITHUB_TOKEN
  // github.event.repository.private kommer inn som strengen 'true'/'false' i
  // workflow-env — kun eksplisitt 'false' korttslutter. Manglende/uventet
  // verdi behandles som privat (trygg retning: da kjøres budsjettvakten).
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

  const kjorE2e = skalKjoreE2e(forbruk, CI_BUDSJETT_MIN, E2E_KOST_MIN)
  const naermerSegTaket = forbruk >= CI_BUDSJETT_MIN * VARSEL_ANDEL

  let ekstraRad = null
  if (!kjorE2e) {
    ekstraRad = `forbruk (${forbruk}) + e2e-kost (${E2E_KOST_MIN}) > budsjett (${CI_BUDSJETT_MIN})`
    console.log(`::warning::CI-minuttbudsjett kuttet e2e denne PR-en — ${ekstraRad}. Se docs/ci-minuttbudsjett.md.`)
  } else if (naermerSegTaket) {
    ekstraRad = `nærmer seg taket (over ${Math.round(VARSEL_ANDEL * 100)} % av budsjettet brukt)`
  }

  skrivOutput(kjorE2e)
  skrivSummary(tabell({
    forbruk,
    budsjett: CI_BUDSJETT_MIN,
    reserve: DRIFTSRESERVE_MIN,
    verdikt: kjorE2e ? '✅ Kjør e2e' : '❌ Kuttet e2e denne kjøringen',
    ekstraRad,
  }))
}

// Kjør kun main() når filen kjøres direkte (`node ci-minuttbudsjett.mjs`),
// ikke når funksjonene importeres av vitest.
const kjortDirekte = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (kjortDirekte) {
  main().catch(e => {
    console.error(e)
    process.exit(1)
  })
}
