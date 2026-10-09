// Kalles som `node .github/scripts/e2e-risiko.mjs` — ingen shebang, se
// ci-minuttbudsjett.mjs for hvorfor.
//
// Risiko-gating av e2e (#663). Kjøres i pr-check.yml ETTER budsjettvakten,
// FØR `Avgjør e2e-omfang`: hopper over e2e når ingen fil i PR-en kan påvirke
// en kjørende flyt (docs, CI-skript, tester).
//
// FEILRETNINGEN ER BEVISST MOTSATT AV BUDSJETTVAKTEN:
//   - Budsjettvakten feiler LUKKET (beskytter kvote): kan ikke måle ⇒ kutt e2e.
//   - Denne feiler ÅPENT (beskytter dekning): kan ikke avgjøre fillista ⇒
//     kjør e2e. Skal aldri «rettes» til å peke samme vei.
//
// Klassifiseringen er STI-BASERT, ikke innholds-basert (#661): en ren
// kommentarendring i kodefil kjører full e2e. En «bare kommentarer»-heuristikk
// må håndtere direktiver (@ts-expect-error ER atferd), blokk-/JSX-kommentarer
// og `//` i strenger — bommer den, mister en ekte endring dekning. Bygges ikke.
// Eneste innholds-unntak er public/sw.js sin maskingenererte CACHE_VERSION-linje.
//
// Ikke en flakiness-mitigering (#659 er egen sak, se docs/ci-minuttbudsjett.md).

import { appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// ─── Trygg-listen — alt utenfor disse regnes som RISIKO ────────────────────
//
// e2e/** og playwright.config.ts er BEVISST utelatt: en knekt spec som aldri
// kjører ville ellers blitt merget uoppdaget. Ikke endre uten produkteieren.

export const TRYGGE_MAPPER = ['docs', 'Design', 'V2 UCs', '.github', '.claude', 'scripts', '__tests__']

// Ikke legg markdown-navn her — *.md dekkes av erTryggSti(), og fila er MÅ
// MATCHE mot offentlige klubb-app (ingen klubbnavn).
export const TRYGGE_FILER = ['.env.example', '.gitignore', 'lib/versjon.json']

// Kun en hel +/- linje. `$` er bevisst CR-følsomt: CRLF ⇒ ingen match ⇒
// risiko ⇒ e2e kjører, som er den trygge feilretningen.
export const CACHE_VERSION_LINJE = /^[+-]const CACHE_VERSION = '[^']*'$/

// Tar fil-objektet fra pulls/{n}/files: { filename, previous_filename, patch, status }.
export function erTryggFil(fil) {
  // Ved rename må BEGGE navn være trygge — ellers ser `lib/varsler.ts` →
  // `docs/gammel-varsler.ts` trygg ut.
  const gammel = fil.previous_filename
  if (gammel && !erTryggSti(gammel)) return false
  return erTryggStiEllerUnntak(fil)
}

// Kun stien. Mappe-prefiks matches på segmentgrense, aldri substring.
function erTryggSti(sti) {
  if (sti.endsWith('.md')) return true
  if (TRYGGE_FILER.includes(sti)) return true
  return TRYGGE_MAPPER.some(m => sti === m || sti.startsWith(m + '/'))
}

function erTryggStiEllerUnntak(fil) {
  if (fil.filename === 'public/sw.js') {
    // Trygg KUN når patchen er ett stamp-versjon-bump av CACHE_VERSION. Uten
    // patch (GitHub utelater den for store differ) kan det ikke verifiseres.
    if (!fil.patch) return false
    let plussTreff = 0
    let minusTreff = 0
    for (const linje of fil.patch.split('\n')) {
      // Ingen «+++»/«---»-guard: GitHubs `patch` har aldri filhoder, og en
      // guard ville sluppet gjennom ekte linjer som «--teller» (pinnet i test).
      if (!linje.startsWith('+') && !linje.startsWith('-')) continue
      if (!CACHE_VERSION_LINJE.test(linje)) return false
      if (linje.startsWith('+')) plussTreff++
      else minusTreff++
    }
    // Nøyaktig én ut og én inn — ellers ville ren sletting eller en tom
    // patch passert.
    return plussTreff === 1 && minusTreff === 1
  }
  return erTryggSti(fil.filename)
}

// Tom liste ⇒ e2e (fail-open, se filhodet).
export function trengerE2e(filer) {
  const risikoFiler = filer.filter(f => !erTryggFil(f)).map(f => f.filename)
  return { e2e: filer.length === 0 || risikoFiler.length > 0, risikoFiler }
}

// ─── Nettverk: hent PR-filene ────────────────────────────────────────────

// maksSider = 30 fordi GitHub capper på 100 per side og 3000 filer totalt.
export async function hentPrFiler({ repo, prNummer, token, fetchImpl = fetch, maksSider = 30 }) {
  const filer = []
  for (let side = 1; side <= maksSider; side++) {
    const url = `https://api.github.com/repos/${repo}/pulls/${prNummer}/files?per_page=100&page=${side}`
    const res = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      throw new Error(`GitHub API ga ${res.status} ${res.statusText} for ${url}`)
    }
    const side_data = await res.json()
    filer.push(...side_data)
    if (side_data.length < 100) return filer // siste side — lista er komplett
  }
  throw new Error(`Flere enn ${maksSider * 100} filer i PR-en — pagineringstaket nådd, fillisten kan ikke hentes fullstendig.`)
}

// ─── Rapportering ────────────────────────────────────────────────────────

// Alt kan kastes i JS — `e.message` på en kastet streng ville selv kastet
// inne i fail-open-grenen.
function feilTekst(e) {
  if (e instanceof Error && e.message) return e.message
  if (typeof e === 'string' && e) return e
  try {
    return JSON.stringify(e) ?? String(e)
  } catch {
    return String(e)
  }
}

function skrivOutput(risiko) {
  const sti = process.env.GITHUB_OUTPUT
  if (sti) appendFileSync(sti, `risiko=${risiko}\n`)
}

function skrivSummary(markdown) {
  const sti = process.env.GITHUB_STEP_SUMMARY
  if (sti) appendFileSync(sti, markdown + '\n')
  else console.log(markdown) // lokal kjøring uten GITHUB_STEP_SUMMARY-fil
}

function tabell({ antallFiler, risikoFiler, verdikt, ekstraRad }) {
  const rader = [
    '### Risiko-gating av e2e (#663)',
    '',
    '| Felt | Verdi |',
    '|---|---|',
    `| Endrede filer | ${antallFiler} |`,
    `| Filer som kan påvirke en flyt | ${risikoFiler.length ? risikoFiler.join(', ') : 'ingen'} |`,
    `| Verdikt | ${verdikt} |`,
  ]
  if (ekstraRad) rader.push(`| Merknad | ${ekstraRad} |`)
  return rader.join('\n')
}

// Eksportert for test: en PR som kun rører denne fila gates ut av e2e av
// vakten selv, så vitest er eneste kontroll på fail-open-grenene.
export async function main({ fetchImpl } = {}) {
  const repo = process.env.GITHUB_REPOSITORY
  const token = process.env.GITHUB_TOKEN
  const prNummer = process.env.PR_NUMMER
  // Tom streng = «ikke målt»; Number('') er 0 og ville passert isFinite.
  const raaAntall = process.env.ENDREDE_FILER
  const forventetAntall = raaAntall === undefined || raaAntall === '' ? NaN : Number(raaAntall)

  if (!repo || !token || !prNummer) {
    console.error('::warning::GITHUB_REPOSITORY, GITHUB_TOKEN eller PR_NUMMER mangler — kan ikke måle risiko, kjører e2e (fail-open).')
    skrivOutput(true)
    skrivSummary(tabell({ antallFiler: 'ukjent', risikoFiler: [], verdikt: '✅ Kjør e2e (miljøvariabler mangler)' }))
    return
  }

  // Uten måltallet faller fullstendighetssjekken under bort stille — fail-open.
  if (!Number.isFinite(forventetAntall)) {
    console.error('::warning::ENDREDE_FILER mangler eller er ikke et tall — kan ikke verifisere at fillista er fullstendig, kjører e2e (fail-open).')
    skrivOutput(true)
    skrivSummary(tabell({ antallFiler: 'ukjent', risikoFiler: [], verdikt: '✅ Kjør e2e (ENDREDE_FILER mangler)' }))
    return
  }

  let filer
  try {
    filer = await hentPrFiler({ repo, prNummer, token, ...(fetchImpl ? { fetchImpl } : {}) })
  } catch (e) {
    const melding = feilTekst(e)
    console.error(`::warning::Klarte ikke hente PR-filer: ${melding} — kjører e2e (fail-open).`)
    skrivOutput(true)
    skrivSummary(tabell({ antallFiler: 'ukjent', risikoFiler: [], verdikt: '✅ Kjør e2e (henting feilet)', ekstraRad: melding }))
    return
  }

  // Må stemme med PR-ens changed_files — avvik betyr ufullstendig liste.
  if (filer.length !== forventetAntall) {
    const melding = `Hentet ${filer.length} filer, PR-en oppgir ${forventetAntall} — målefeil, kjører e2e (fail-open).`
    console.error(`::warning::${melding}`)
    skrivOutput(true)
    skrivSummary(tabell({ antallFiler: `${filer.length} (forventet ${forventetAntall})`, risikoFiler: [], verdikt: '✅ Kjør e2e (avvik i filantall)' }))
    return
  }

  const { e2e, risikoFiler } = trengerE2e(filer)

  skrivOutput(e2e)
  skrivSummary(tabell({
    antallFiler: filer.length,
    risikoFiler,
    verdikt: e2e ? '✅ Kjør e2e' : '⏭️ Lav risiko — e2e hoppes over',
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
