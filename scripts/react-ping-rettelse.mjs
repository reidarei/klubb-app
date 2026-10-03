// Bakporterer React 19.3 sin rettelse av pingSuspendedRoot til React-builden
// Next 15 har med seg (next/dist/compiled/react-dom, 19.2-canary). Se #800.
//
// Feilen: kommer et «ping» (et løfte React ventet på er innfridd) MENS React
// rendrer, og renderen allerede er merket «suspendert med forsinkelse», ble
// pinget kastet. markRootSuspended() visket det så ut, og en transition kunne
// bli hengende for alltid: server action lagret, men skjermen ble aldri
// oppdatert. React 19.3 husker pinget i workInProgressRootPingedLanes i stedet.
//
// Kjøres som postinstall OG prebuild (idempotent), så både Vercel, CI og en
// lokal `npm run build` bygger med rettelsen. Feiler bygget hvis koden ikke
// kjennes igjen — da har Next byttet React-build, og rettelsen må vurderes på
// nytt (er den allerede med, som i Next 16, sier skriptet fra og avslutter ok).
// Skal fjernes når vi er på en Next-versjon med React ≥ 19.3.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const FIL = 'node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.production.js'

// Grenen i pingSuspendedRoot slik React 19.2 skriver den: i render-fasen
// (executionContext & 2) gjøres ingenting.
const FEIL = `      ? 0 === (executionContext & 2) && prepareFreshStack(root, 0)
      : (workInProgressRootPingedLanes |= pingedLanes),`

// Slik React 19.3 skriver den: i render-fasen huskes pinget.
const RETTET = `      ? 0 === (executionContext & 2)
        ? prepareFreshStack(root, 0)
        : (workInProgressRootPingedLanes |= pingedLanes)
      : (workInProgressRootPingedLanes |= pingedLanes),`

if (!existsSync(FIL)) {
  // Installasjon uten Next (f.eks. en delvis `npm ci` i et verktøysteg) —
  // ingenting å rette, og ingenting som bygges med feil React.
  console.log('[react-ping-rettelse] fant ikke Next sin react-dom — hopper over')
  process.exit(0)
}

const kilde = readFileSync(FIL, 'utf8')
const antallFeil = kilde.split(FEIL).length - 1
const antallRettet = kilde.split(RETTET).length - 1

if (antallFeil === 0 && antallRettet === 1) {
  console.log('[react-ping-rettelse] allerede rettet')
  process.exit(0)
}
if (antallFeil !== 1) {
  console.error(
    `[react-ping-rettelse] kjenner ikke igjen pingSuspendedRoot i ${FIL} ` +
      `(feil-mønster: ${antallFeil}, rettet-mønster: ${antallRettet}). ` +
      'Next har trolig byttet React-build — sjekk om rettelsen fortsatt trengs (#800).',
  )
  process.exit(1)
}

writeFileSync(FIL, kilde.replace(FEIL, RETTET))
console.log('[react-ping-rettelse] rettet pingSuspendedRoot (#800)')
