// Øker patch-nummeret i lib/versjon.json med 1. Kjøres lokalt før push.
// Filen er committed, så Vercel leser bare resultatet uten git-avhengighet.
// Format: V{major}.{minor}.{patch} der major+minor kommer fra package.json
// og patch er det inkrementelle bygg-nummeret. F.eks. V3.0.42.
// Speiler også versjonen inn i public/sw.js sin CACHE_VERSION-konstant
// slik at hver deploy automatisk invaliderer service worker-cachen.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rot = join(__dirname, '..')

const pkg = JSON.parse(readFileSync(join(rot, 'package.json'), 'utf8'))
const fil = join(rot, 'lib', 'versjon.json')
const forrige = JSON.parse(readFileSync(fil, 'utf8'))

const neste = (forrige.nummer ?? 0) + 1
const [major, minor] = pkg.version.split('.')
const versjon = `V${major}.${minor}.${neste}`

writeFileSync(fil, JSON.stringify({ nummer: neste, versjon }, null, 2) + '\n')

// Oppdater CACHE_VERSION i public/sw.js. Regex matcher hele linjen for å
// være robust mot whitespace-endringer.
const swPath = join(rot, 'public', 'sw.js')
const swInnhold = readFileSync(swPath, 'utf8')
const swOppdatert = swInnhold.replace(
  /^const CACHE_VERSION = '[^']*'$/m,
  `const CACHE_VERSION = '${versjon}'`,
)
if (swOppdatert === swInnhold) {
  console.warn('⚠ Fant ikke CACHE_VERSION i public/sw.js — sjekk at konstanten finnes')
} else {
  writeFileSync(swPath, swOppdatert)
}

console.log(`→ ${versjon}`)
