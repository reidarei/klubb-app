// Verifiserer at versjonen som ligger i lib/versjon.json faktisk er ute i prod.
//
// Bakgrunn: en merget PR er ikke det samme som en deployet PR. 2026-08-09 tok
// Vercel aldri imot push-eventet for en merge til main — GitHub sendte det
// (vår egen webhook fikk 200 OK i samme sekund), men det ble aldri opprettet
// noen produksjons-deploy, og prod ble stående på forrige versjon i timevis
// uten at noe var rødt noe sted. Dette skriptet lukker den blindsonen: det
// spør prod hvilken versjon den faktisk serverer, i stedet for å stole på at
// merge ⇒ deploy.
//
// Leser /sw.js fordi den er offentlig (ingen auth-redirect) og fordi
// stamp-versjon.mjs speiler versjonen inn i CACHE_VERSION der ved hver deploy.
//
// Bruk:
//   npm run verifiser-deploy                       (leser .env.local hvis den finnes)
//   node scripts/verifiser-deploy.mjs https://min-klubb.no
//   PROD_URL=https://min-klubb.no npm run verifiser-deploy
//
// Exit 0 = versjonen er ute. Exit 1 = timeout eller feil versjon.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rot = join(__dirname, '..')

// Argument vinner over env, slik at skriptet kan pekes mot en annen instans
// uten å røre .env.local.
const base = (
  process.argv[2] ||
  process.env.PROD_URL ||
  process.env.NEXT_PUBLIC_BASE_URL ||
  ''
).replace(/\/+$/, '')

// En Vercel-deploy av dette prosjektet tar typisk 2–4 min; 10 min gir god
// margin uten at en ekte feil blir stående og henge i en agentisk kjøring.
const TIMEOUT_MS = 10 * 60 * 1000
const INTERVALL_MS = 20 * 1000
const REQUEST_TIMEOUT_MS = 15 * 1000

async function lesProdVersjon() {
  // Eget timeout per request: uten det kan en hengende TCP-/DNS-forbindelse
  // stå fast inne i await fetch() for alltid, og totalfristen under blir
  // aldri evaluert — nettopp den stillheten dette skriptet skal fjerne.
  const avbryt = new AbortController()
  const vakt = setTimeout(() => avbryt.abort(), REQUEST_TIMEOUT_MS)
  try {
    // cache-buster: både Vercel edge og eventuelle mellomledd kan ellers svare
    // med forrige sw.js lenge etter at deployen er ferdig.
    const res = await fetch(`${base}/sw.js?_=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' },
      signal: avbryt.signal,
    })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    const tekst = await res.text()
    const treff = tekst.match(/CACHE_VERSION\s*=\s*'([^']+)'/)
    if (!treff) throw new Error('fant ikke CACHE_VERSION i /sw.js')
    return treff[1]
  } finally {
    clearTimeout(vakt)
  }
}

// Setter process.exitCode og returnerer i stedet for å kalle process.exit():
// process.exit() med en åpen keep-alive-socket trigger en libuv-assertion på
// Windows (`UV_HANDLE_CLOSING`) som gir exit 127 i stedet for statuskoden vår.
async function main() {
  if (!base) {
    console.error(
      'Mangler base-URL. Sett NEXT_PUBLIC_BASE_URL (f.eks. i .env.local) eller PROD_URL, ' +
        'eller oppgi URL som første argument.',
    )
    process.exitCode = 1
    return
  }

  const forventet = JSON.parse(readFileSync(join(rot, 'lib', 'versjon.json'), 'utf8')).versjon

  console.log(`Venter på at ${forventet} skal være ute på ${base} …`)

  const frist = Date.now() + TIMEOUT_MS
  let sist = ''

  while (Date.now() < frist) {
    let naa
    try {
      naa = await lesProdVersjon()
    } catch (err) {
      // Nettverksglipp eller en deploy midt i byttet skal ikke felle sjekken —
      // bare prøve igjen til fristen. Vi logger så en vedvarende feil er synlig.
      console.log(`  … kunne ikke lese versjon: ${err instanceof Error ? err.message : err}`)
      await new Promise(r => setTimeout(r, INTERVALL_MS))
      continue
    }

    if (naa === forventet) {
      console.log(`✔ ${forventet} er ute i prod.`)
      return
    }

    if (naa !== sist) {
      console.log(`  … prod svarer ${naa}, venter på ${forventet}`)
      sist = naa
    }
    await new Promise(r => setTimeout(r, INTERVALL_MS))
  }

  console.error(
    `\n🚨 ${forventet} er IKKE ute etter ${TIMEOUT_MS / 60000} min — prod svarer fortsatt ${sist || 'ukjent'}.\n` +
      'Merge ⇒ deploy holder ikke. Sjekk Vercel-dashbordet (Deployments, filtrer på main):\n' +
      '  • ingen deploy for merge-commiten  → Vercel tok aldri imot pushet, trigg på nytt\n' +
      '  • deploy med Error/Canceled        → bygget feilet, les bygg-loggen',
  )
  process.exitCode = 1
}

await main()
