import fs from 'node:fs'
import path from 'node:path'

/**
 * Artefaktvakt (#659): bekrefter at appen `webServer` serverer er bygget mot
 * TEST-instansen, ikke et tomt bygg eller en sky-Supabase. Kalt fra
 * e2e/global-setup.ts, så den også fanger et foreldet LOKALT bygg.
 *
 * e2e kjører mot produksjonsbygg, der NEXT_PUBLIC_* bakes inn ved byggetid:
 * feil miljø er en stille feil i hele artefaktet, usynlig for en vakt som kun
 * sjekker webServer.env.
 */

// Må speile `distDir` i next.config.ts, ellers ser vakten på feil katalog.
const DIST_DIR = process.env.NEXT_DIST_DIR ?? '.next'

// En ekte prosjekt-ref er alltid 20 tegn, så docs-strenger som
// «example.supabase.co» matcher aldri.
const SKY_SUPABASE_MOENSTER = /https:\/\/[a-z0-9]{20}\.supabase\.co/g

// Hoppes over fordi de aldri er servert kode:
// - binærfiler kan ikke inneholde en URL-streng.
// - .map har `sourcesContent` med ordrett TS-kilde, så hardkodede literaler
//   (f.eks. KJENT_PROD_SUPABASE_URL i lib/config.ts) ville gjort vakten
//   permanent rød uansett bygg. `next start` serverer dem aldri til klient.
const HOPP_OVER_ENDELSER = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.avif',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.map',
])

function lesAlleFilerSomTekst(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  const ut: string[] = []
  for (const oppf of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, oppf.name)
    if (oppf.isDirectory()) {
      ut.push(...lesAlleFilerSomTekst(full))
      continue
    }
    if (!oppf.isFile() || HOPP_OVER_ENDELSER.has(path.extname(oppf.name).toLowerCase())) continue
    try {
      ut.push(fs.readFileSync(full, 'utf8'))
    } catch {
      // Ulesbar fil — irrelevant for en URL-streng-vakt.
    }
  }
  return ut
}

/**
 * Kaster hvis byggartefaktet ikke er det vi forventer. Playwright starter
 * webServer FØR globalSetup, så bygget finnes når denne kalles.
 */
export function verifiserByggArtefakt(testUrl: string) {
  const distSti = path.resolve(__dirname, '..', '..', DIST_DIR)
  const innhold = [
    ...lesAlleFilerSomTekst(path.join(distSti, 'server')),
    ...lesAlleFilerSomTekst(path.join(distSti, 'static')),
  ]

  if (innhold.length === 0) {
    throw new Error(
      `bygg-artefakt-vakt: fant ingen filer under ${distSti}/server eller ` +
        `${distSti}/static — bygget mangler, eller webServer pekte mot feil ` +
        'katalog (sjekk NEXT_DIST_DIR/distDir).',
    )
  }

  // Positiv sjekk først: «ingen sky-URL funnet» er også sant for et tomt bygg.
  const fantTestUrl = innhold.some(tekst => tekst.includes(testUrl))
  if (!fantTestUrl) {
    throw new Error(
      `bygg-artefakt-vakt: fant IKKE test-instansens URL (${testUrl}) i ` +
        'byggartefaktet. Appen ser ut til å være bygget mot feil (eller ingen) ' +
        'Supabase-instans — sjekk «Bygg»-steget i .github/workflows/pr-check.yml, ' +
        'eller kjør npm run build på nytt lokalt.',
    )
  }

  // Negativ sjekk, bevisst kun sky-Supabase — ALDRI klubbdomenet: det havner
  // i bundelen uansett (via KLUBB_DOMENE i lib/config.ts), og en permanent
  // rød vakt blir slått av.
  const skyTreff = innhold.reduce(
    (sum, tekst) => sum + (tekst.match(SKY_SUPABASE_MOENSTER)?.length ?? 0),
    0,
  )
  if (skyTreff > 0) {
    throw new Error(
      `bygg-artefakt-vakt: fant ${skyTreff} treff på sky-Supabase-mønsteret ` +
        `(${SKY_SUPABASE_MOENSTER}) i byggartefaktet — bygget kan være ` +
        'forurenset med en annen Supabase-prosjekt-URL enn test-instansen. ' +
        'Se e2e/README.md § Sikkerhetsmodellen.',
    )
  }
}

// Ruter som lovlig kan være prerendret. (app)/-rutene er dynamiske fordi
// layouten leser cookies; blir en statisk uten at noen merker det, kan en test
// som forventer fersk DB-state lese byggetids-HTML.
const TILLATTE_PRERENDRET_RUTER = new Set(['/manifest.webmanifest'])

/**
 * Prerender-vakt (#659): prerendrede ruter må stå i TILLATTE_PRERENDRET_RUTER,
 * så en ny statisk rute er et bevisst valg, ikke stille.
 */
export function verifiserPrerenderManifest() {
  const distSti = path.resolve(__dirname, '..', '..', DIST_DIR)
  const manifestSti = path.join(distSti, 'prerender-manifest.json')

  if (!fs.existsSync(manifestSti)) {
    throw new Error(`prerender-vakt: fant ikke ${manifestSti} — mangler bygget?`)
  }

  const manifest = JSON.parse(fs.readFileSync(manifestSti, 'utf8')) as {
    routes?: Record<string, unknown>
    dynamicRoutes?: Record<string, unknown>
  }

  const prerendrede = [
    ...Object.keys(manifest.routes ?? {}),
    ...Object.keys(manifest.dynamicRoutes ?? {}),
  ]

  const uventet = prerendrede.filter(rute => !TILLATTE_PRERENDRET_RUTER.has(rute))
  if (uventet.length > 0) {
    throw new Error(
      `prerender-vakt: ${uventet.join(', ')} er prerendret (statisk), men ` +
        `står ikke i TILLATTE_PRERENDRET_RUTER (e2e/helpers/bygg-artefakt-vakt.ts). ` +
        'Er dette et bevisst valg — legg ruten til i lista. Er det utilsiktet ' +
        '(f.eks. en cookie-lesing som ble fjernet fra en layout), er siden nå ' +
        'statisk uten at noen tiltenkte det — en test som forventer fersk ' +
        'DB-state kan lese byggetids-HTML.',
    )
  }
}
