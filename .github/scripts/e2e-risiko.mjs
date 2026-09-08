// Kalles som `node .github/scripts/e2e-risiko.mjs` — ingen shebang, se
// samme begrunnelse som i .github/scripts/ci-minuttbudsjett.mjs (Windows-
// checkout/vitest-transform, fila er uansett ikke kjørbar).
//
// Risiko-gating av e2e (#663).
//
// Kjøres i pr-check.yml ETTER budsjettvakten, FØR `Avgjør e2e-omfang`. Henter
// filene i PR-en fra GitHub API-et og avgjør om NOEN av dem kan påvirke en
// kjørende flyt i appen. Kan de ikke det (ren dokumentasjon, interne
// CI-skript, tester) er full e2e-dekning ren spilltid — se #663 for tallene.
//
// FEILRETNINGEN ER MOTSATT AV BUDSJETTVAKTEN, OG DET ER BEVISST:
//   - Budsjettvakten feiler LUKKET: kan den ikke måle forbruket, KUTTES e2e.
//     Konsekvensen av en feilmåling der er «for mye kjørt», og det ville
//     spist av kvoten vakten skal beskytte.
//   - Denne vakten feiler ÅPENT: kan den ikke avgjøre hvilke filer PR-en
//     rører (API-feil, tom filliste, avvik i antall), KJØRES e2e. Å kutte på
//     en filliste vi ikke stoler på ville kunne slippe en reell atferds-
//     endring gjennom udekket — nøyaktig det #663 IKKE skal gjøre. De to
//     vaktene beskytter ulike ting (kvote vs. dekning) og skal derfor aldri
//     "rettes" til å peke samme vei.
//
// AVGRENSNING: KLASSIFISERINGEN ER STI-BASERT, IKKE INNHOLDS-BASERT (#661).
// En PR som KUN endrer en kodekommentar i en kodefil (f.eks. en presisering i
// lib/varsler.ts) regnes som RISIKO og kjører full e2e, selv om ingen atferd
// kan ha endret seg. Det er et bevisst scope-kutt, ikke en forglemmelse.
// Å avgjøre «dette er bare kommentarer» krever en heuristikk over patch-
// teksten som må håndtere eslint-disable-direktiver, @ts-expect-error /
// @ts-ignore (som ER atferd — de slår av typesjekk), blokk-kommentarer over
// flere linjer, JSX-kommentarer og strenger som inneholder to skråstreker
// (URL-er). Bommer en slik heuristikk ÉN vei, forsvinner dekningen på en ekte
// atferdsendring — den dyre feilen hele vakten finnes for å unngå. Gevinsten
// er en håndfull PR-er i måneden. Prisen er en skjør heuristikk på nettopp
// den stien der en feil ikke oppdages. Vi bygger den ikke.
// `public/sw.js` er det ENESTE innholds-baserte unntaket, og er bevisst
// ekstremt smalt: én eksakt linjeform som er maskingenerert av
// `npm run stamp-versjon` — ikke en tolkning av vilkårlig kildekode.
//
// Vakten er IKKE en flakiness-mitigering — se docs/ci-minuttbudsjett.md for
// hvorfor (#659 er en separat sak). En PR som rører app-kode kjører alltid
// full suite, uansett hvor rød e2e har vært i det siste.

import { appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// ─── Trygg-listen — alt utenfor disse regnes som RISIKO ────────────────────
//
// e2e/** og playwright.config.ts er BEVISST utelatt fra denne lista (ikke en
// forglemmelse). En endring i selve suiten kan gjøre den ugyldig på måter en
// filnavn-sjekk ikke fanger — en knekt spec som aldri kjører ville blitt
// merget uoppdaget. Rør aldri denne beslutningen uten å ta den til Reidar.

export const TRYGGE_MAPPER = ['docs', 'Design', 'V2 UCs', '.github', '.claude', 'scripts', '__tests__']

// Kun filer som IKKE allerede dekkes av *.md-regelen i erTryggSti(). Lista
// inneholdt tidligere fem markdown-navn som aldri kunne treffes — og tre av
// dem bar klubb-identitet inn i en fil som er MÅ MATCHE mot det offentlige
// klubb-app-repoet (se CLAUDE.md § Policy: Synk til klubb-app).
export const TRYGGE_FILER = ['.env.example', '.gitignore', 'lib/versjon.json']

// Matcher KUN en hel +/- linje som setter CACHE_VERSION til en literal streng
// — ikke en substreng midt i en annen linje. Se erTryggStiEllerUnntak().
// `$`-ankeret er bevisst CR-følsomt: kommer patchen med CRLF, blir \r med i
// linja og matchen feiler ⇒ fila regnes som risiko ⇒ e2e kjører. Feil vei er
// her den trygge veien, så vi normaliserer ikke bort \r.
export const CACHE_VERSION_LINJE = /^[+-]const CACHE_VERSION = '[^']*'$/

// Er denne ene fila trygg? Tar hele fil-objektet fra GitHub sitt
// pulls/{n}/files-endepunkt: { filename, previous_filename, patch, status }.
export function erTryggFil(fil) {
  // Rename fra app-kode til noe trygt (eller omvendt) skal ALDRI skjule seg
  // bak det nye navnet alene — begge navn må ligge i trygg-listen. Uten
  // dette kunne `lib/varsler.ts` → `docs/gammel-varsler.ts` (samme innhold)
  // sett trygg ut fordi kun det nye filnavnet ble sjekket.
  const gammel = fil.previous_filename
  if (gammel && !erTryggSti(gammel)) return false
  return erTryggStiEllerUnntak(fil)
}

// Stien alene, uten patch-innhold: matcher TRYGGE_MAPPER (prefiks på
// segmentgrense, aldri substring — «libx/versjon.json» skal IKKE matche
// mappen «lib») eller TRYGGE_FILER (eksakt), eller er en *.md-fil overalt.
function erTryggSti(sti) {
  if (sti.endsWith('.md')) return true
  if (TRYGGE_FILER.includes(sti)) return true
  return TRYGGE_MAPPER.some(m => sti === m || sti.startsWith(m + '/'))
}

// Fullstendig avgjørelse for én fil, inkludert public/sw.js-spesialregelen.
// Delt ut fra erTryggFil() for lesbarhet — se punktene i filhode-planen:
//   1. filename ELLER previous_filename utenfor trygg-listen ⇒ ikke trygg
//   2. *.md overalt ⇒ trygg (dekket av erTryggSti)
//   3. public/sw.js ⇒ trygg KUN hvis hele patchen er ETT CACHE_VERSION-bump
//   4. alt annet ⇒ ikke trygg
function erTryggStiEllerUnntak(fil) {
  if (fil.filename === 'public/sw.js') {
    // public/sw.js er IKKE i TRYGGE_FILER over med vilje — den er trygg kun
    // i det aller vanligste tilfellet (stamp-versjon sitt CACHE_VERSION-bump),
    // ikke ethvert innhold i fila. Mangler patch (GitHub returnerer ikke
    // patch for veldig store differ) kan vi ikke verifisere det ⇒ ikke trygg.
    if (!fil.patch) return false
    let plussTreff = 0
    let minusTreff = 0
    for (const linje of fil.patch.split('\n')) {
      // Merk: ingen guard mot «+++»/«---» her. GitHubs `patch`-felt starter på
      // «@@» og inneholder ALDRI filhodene fra en unified diff, så en slik
      // guard beskyttet ingenting — men den slapp ekte innholdslinjer som
      // begynner med «++» eller «--» (f.eks. en dekrementert teller) gjennom
      // som «ren CACHE_VERSION-endring». Se testen som pinner nettopp det.
      if (!linje.startsWith('+') && !linje.startsWith('-')) continue
      if (!CACHE_VERSION_LINJE.test(linje)) return false
      if (linje.startsWith('+')) plussTreff++
      else minusTreff++
    }
    // Nøyaktig én linje ut og én inn — altså et ekte bump. Uten denne sjekken
    // passerte også en patch som KUN sletter CACHE_VERSION-linja, og en patch
    // helt uten +/- linjer i det hele tatt, som «trygg» (tom løkke ⇒ true).
    return plussTreff === 1 && minusTreff === 1
  }
  return erTryggSti(fil.filename)
}

// Avgjør om e2e trengs for en liste av filer. TOM LISTE ⇒ true — defensivt,
// se filhode-kommentaren om feilretning. Én eneste ikke-trygg fil er nok til
// å kreve full dekning.
export function trengerE2e(filer) {
  const risikoFiler = filer.filter(f => !erTryggFil(f)).map(f => f.filename)
  return { e2e: filer.length === 0 || risikoFiler.length > 0, risikoFiler }
}

// ─── Nettverk: hent PR-filene ────────────────────────────────────────────

// Paginerer GET /repos/{repo}/pulls/{n}/files. GitHub caps per_page på 100
// og totalt 3000 filer over 30 sider — maksSider er derfor 30 by default,
// ikke et vilkårlig tall.
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

// Alt kan kastes i JS, ikke bare Error. Denne vakten leser feiltekst i sine
// fail-open-grener, og en `e.message` på en kastet streng ville kastet der.
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

// Eksportert for test. De fire fail-open-grenene under er sikkerhetskritiske,
// og en PR som kun rører denne fila gates ut av e2e av vakten selv — vitest er
// derfor eneste kontroll på dem. `fetchImpl` injiseres kun av testene.
export async function main({ fetchImpl } = {}) {
  const repo = process.env.GITHUB_REPOSITORY
  const token = process.env.GITHUB_TOKEN
  const prNummer = process.env.PR_NUMMER
  // Tom streng og manglende variabel behandles likt: begge er «ikke målt».
  // Number('') er 0 og hadde sluppet gjennom en ren Number.isFinite-sjekk.
  const raaAntall = process.env.ENDREDE_FILER
  const forventetAntall = raaAntall === undefined || raaAntall === '' ? NaN : Number(raaAntall)

  if (!repo || !token || !prNummer) {
    console.error('::warning::GITHUB_REPOSITORY, GITHUB_TOKEN eller PR_NUMMER mangler — kan ikke måle risiko, kjører e2e (fail-open).')
    skrivOutput(true)
    skrivSummary(tabell({ antallFiler: 'ukjent', risikoFiler: [], verdikt: '✅ Kjør e2e (miljøvariabler mangler)' }))
    return
  }

  // Fullstendighetssjekken lenger nede er selve grunnen til at vi tør stole på
  // en trygg-vurdering. Mangler måltallet, er den vakten borte — og en vakt som
  // slår seg selv av i stillhet er verre enn ingen vakt. Fail-open i stedet.
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
    // `e.message` på en ikke-Error (en kastet streng, et objekt) ville selv
    // kastet HER — i den ene grenen som skal garantere fail-open. Resultatet
    // ble et hardt feilet steg i stedet for `risiko=true`. Jobben blir riktig
    // nok rød, så dekning går ikke tapt stille, men vakten skal svare på
    // kontrakten sin, ikke rakne i den.
    const melding = feilTekst(e)
    console.error(`::warning::Klarte ikke hente PR-filer: ${melding} — kjører e2e (fail-open).`)
    skrivOutput(true)
    skrivSummary(tabell({ antallFiler: 'ukjent', risikoFiler: [], verdikt: '✅ Kjør e2e (henting feilet)', ekstraRad: melding }))
    return
  }

  // Antallet API-et faktisk ga oss MÅ stemme med PR-metadataens changed_files.
  // Et avvik betyr fillista er ufullstendig (paginering brutt, delvis svar) —
  // en falsk trygg-vurdering på en ufullstendig liste er nøyaktig risikoen
  // denne vakten finnes for å unngå.
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

// Kjør kun main() når filen kjøres direkte (`node e2e-risiko.mjs`), ikke når
// funksjonene importeres av vitest.
const kjortDirekte = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (kjortDirekte) {
  main().catch(e => {
    console.error(e)
    process.exit(1)
  })
}
