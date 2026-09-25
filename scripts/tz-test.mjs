// Kjører testsuiten i valgte tidssoner, med en egenkontroll FØR hver kjøring
// som beviser at sonen faktisk slo gjennom til Node.
//
// Bakgrunn (#754): `TZ=Europe/Oslo npm test` fra Git Bash på Windows når ikke
// fram til Node — MSYS spesialbehandler variabelnavnet TZ og dropper verdier
// som inneholder skråstrek når en native prosess spawnes. `TZ=UTC` (ingen
// skråstrek) overlever, `TZ=Pacific/Kiritimati` gjør det ikke: barnet arver
// ingen TZ i det hele tatt og faller tilbake til systemsonen. Siden
// produksjonsserveren OG utviklermaskinen begge tilfeldigvis er Europe/Oslo,
// ser en slik kjøring grønn ut uten å ha testet noe som helst — «grønn fordi
// den ikke sjekket noe»-klassen (jf. CLAUDE.md § Arbeidsmåter).
//
// Løsningen er å ALDRI la shell-en sette TZ. Dette skriptet setter TZ i
// child_process sitt env-objekt (JS-siden, ikke shell-siden) via spawnSync —
// det problemet rammer ikke. Verifisert på denne maskinen:
//   TZ=Pacific/Kiritimati node -p "process.env.TZ"    → undefined (MSYS spiser den)
//   spawnSync(node, [...], {env:{...,TZ:'Pacific/Kiritimati'}}) → 'Pacific/Kiritimati' (virker)
//
// En ugyldig IANA-sone (f.eks. et tastefeil som "Kiritimati" uten
// "Pacific/"-prefiks) kastes IKKE av Node — den resolves stille til
// "Etc/Unknown" og klokka blir UTC. Det er like stille som MSYS-bugen, bare
// med en annen synder, og egenkontrollen under fanger begge: den krever at
// BÅDE process.env.TZ OG Intl.DateTimeFormat().resolvedOptions().timeZone
// er nøyaktig den forespurte sonen.
//
// PowerShell har ikke MSYS-problemet ($env:TZ=... går rett gjennom), men
// egenkontrollen kjøres uansett skall — den er billig og fanger enhver
// framtidig variant av samme svikt.
//
// Bruk:
//   npm run test:tz                                  (Europe/Oslo + Pacific/Kiritimati)
//   npm run test:tz -- Pacific/Kiritimati
//   npm run test:tz -- Europe/Oslo Pacific/Kiritimati -- --run __tests__/dato.test.ts
//                                                      (alt etter '--' videre til vitest)
//
// Exit 0 = alle soner grønne. Exit 1 = en sone feilet, ELLER egenkontrollen
// avdekket at en sone aldri nådde Node (miljødefekt, ikke testresultat — i
// så fall kjøres ingen tester i det hele tatt for den sonen).

import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rot = join(__dirname, '..')

const STANDARD_SONER = ['Europe/Oslo', 'Pacific/Kiritimati']

const EGENKONTROLL_SKRIPT =
  'console.log(JSON.stringify({tz:process.env.TZ,resolved:Intl.DateTimeFormat().resolvedOptions().timeZone}))'

// Ren hjelper — tar rå stdout-teksten fra egenkontroll-barnet og forventet
// sone, og avgjør om sonen faktisk slo gjennom. Eksportert for
// __tests__/tz-test-vakt.test.ts. Ingen I/O her.
export function tolkEgenkontroll(raaUtdata, forventetSone) {
  let malt
  try {
    malt = JSON.parse(String(raaUtdata).trim())
  } catch {
    return {
      ok: false,
      avvik: `Egenkontroll-utdata var ikke gyldig JSON: ${JSON.stringify(raaUtdata)}`,
    }
  }
  const { tz, resolved } = malt
  if (tz !== forventetSone || resolved !== forventetSone) {
    return {
      ok: false,
      avvik:
        `Forventet TZ="${forventetSone}" og resolvedOptions().timeZone="${forventetSone}", ` +
        `målte TZ=${tz === undefined ? '(mangler)' : JSON.stringify(tz)} ` +
        `og resolved=${resolved === undefined ? '(mangler)' : JSON.stringify(resolved)}`,
    }
  }
  return { ok: true, avvik: null }
}

function kjorEgenkontroll(sone) {
  const r = spawnSync(process.execPath, ['-e', EGENKONTROLL_SKRIPT], {
    env: { ...process.env, TZ: sone },
    encoding: 'utf8',
  })
  if (r.status !== 0) {
    return {
      ok: false,
      avvik: `Egenkontroll-prosessen selv feilet (exit ${r.status}): ${r.stderr || r.stdout}`,
    }
  }
  return tolkEgenkontroll(r.stdout, sone)
}

function kjorVitestForSone(sone, vitestArgs) {
  const vitestBin = join(rot, 'node_modules', 'vitest', 'vitest.mjs')
  // stdio: 'inherit' — testutdata skal strømme rett i terminalen som normalt,
  // ikke bufres og limes inn etterpå.
  const r = spawnSync(process.execPath, [vitestBin, 'run', ...vitestArgs], {
    env: { ...process.env, TZ: sone },
    cwd: rot,
    stdio: 'inherit',
  })
  return r.status === 0
}

function parseArgv(argv) {
  const skilleIdx = argv.indexOf('--')
  const soneArgs = skilleIdx === -1 ? argv : argv.slice(0, skilleIdx)
  const vitestArgs = skilleIdx === -1 ? [] : argv.slice(skilleIdx + 1)
  const soner = soneArgs.length ? soneArgs : STANDARD_SONER
  return { soner, vitestArgs }
}

function main() {
  const { soner, vitestArgs } = parseArgv(process.argv.slice(2))
  const resultater = []

  for (const sone of soner) {
    console.log(`\n=== ${sone} — egenkontroll ===`)
    const kontroll = kjorEgenkontroll(sone)
    if (!kontroll.ok) {
      console.error(`✖ Egenkontroll feilet for sone "${sone}": ${kontroll.avvik}`)
      console.error(
        '  Dette er en miljødefekt, ikke et testresultat — sonen nådde aldri Node, ' +
          'så ingen tester er kjørt. Kjører aldri videre i systemsonen.',
      )
      process.exit(1)
    }
    console.log(`✔ Egenkontroll bestått — process.env.TZ og Intl-sone er begge "${sone}"`)

    console.log(`=== ${sone} — vitest ===`)
    const gronn = kjorVitestForSone(sone, vitestArgs)
    resultater.push({ sone, gronn })
  }

  console.log('\n=== Oppsummering ===')
  let alleGronne = true
  for (const { sone, gronn } of resultater) {
    console.log(`${sone} — ${gronn ? 'grønn' : 'RØD'}`)
    if (!gronn) alleGronne = false
  }

  process.exit(alleGronne ? 0 : 1)
}

// Ingen sideeffekt ved import — samme mønster som scripts/sync-klubb-app.mjs.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
