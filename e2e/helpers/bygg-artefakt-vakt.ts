import fs from 'node:fs'
import path from 'node:path'

/**
 * Artefaktvakt (#659): bekrefter at den appen `webServer` faktisk serverer i
 * denne kjøringen er bygget mot TEST-instansen, ikke mot et tomt/dummy-bygg
 * eller — verre — en sky-Supabase-instans. Kalt fra e2e/global-setup.ts, ikke
 * bare fra pr-check.yml, slik at den også fanger et foreldet LOKALT bygg (en
 * utvikler som byttet Supabase-prosjekt i .env.local uten å bygge på nytt).
 *
 * Bakgrunn (#659): fra og med denne saken kjører e2e mot PRODUKSJONSBYGG
 * (`next build` + `next start`), ikke `next dev` — se playwright.config.ts.
 * NEXT_PUBLIC_*-variabler bakes inn i bundelen ved BYGGETID. Feil miljø der
 * er derfor ikke en runtime-feil som viser seg i én test; det er en STILLE
 * feil bakt inn i hele artefaktet, og en vakt som kun sjekker
 * webServer.env ville ikke sett det (se kommentaren i playwright.config.ts
 * om at de oppføringene nå er inerte for den serverte appen i CI).
 */

// Byggkatalogen next build/start skriver til/leser fra. Speiler `distDir` i
// next.config.ts (samme env-variabel, samme fallback) — ellers ser vakten på
// en annen katalog enn den den serverte appen faktisk ble bygget til.
const DIST_DIR = process.env.NEXT_DIST_DIR ?? '.next'

// Mønster for en Supabase-PROSJEKT-URL i skyen. Verifisert av database-
// arkitekten (#659) å matche prod-referansen korrekt, og ALDRI matche docs-
// strenger som «example.supabase.co» eller «project-id.supabase.co» —
// subdomenet til en ekte prosjekt-ref er alltid 20 tegn.
const SKY_SUPABASE_MOENSTER = /https:\/\/[a-z0-9]{20}\.supabase\.co/g

// Filendelser som ALDRI er den SERVERTE artefakten og derfor hoppes over:
// - binærfiler (bilder, fonter) kan uansett ikke inneholde en URL-streng.
// - .map (kildekart) inneholder `sourcesContent` — hele det ORIGINALE
//   TS-kildekoden, ordrett, ikke bare det kompilerte resultatet. Det gjør at
//   ETHVERT hardkodet server-side strengliteral (f.eks.
//   KJENT_PROD_SUPABASE_URL i lib/config.ts, som eksisterer for å hindre
//   init-admin-scriptet i å kjøre mot prod) dukker opp i kildekartet UANSETT
//   hvilken Supabase-URL bygget faktisk peker mot — verifisert lokalt (#659):
//   et bygg mot dummy-env ga 6 treff, samtlige i `.map`-filer, 0 i faktisk
//   servert kode. `next start` server ALDRI disse filene til en klient
//   (productionBrowserSourceMaps er false som default, og server-kildekart
//   er uansett kun for stack traces, ikke en del av responsen på en request)
//   — å telle dem ville gjort vakten permanent rød uansett hvor riktig bygget
//   faktisk er, nøyaktig svikten styret ville unngå for klubbdomenet.
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
      // Ulesbar fil (f.eks. binær som ikke traff endelses-filteret over) —
      // irrelevant for en ren URL-streng-vakt.
    }
  }
  return ut
}

/**
 * Kaster hvis byggartefaktet ikke er det vi forventer. Kalles fra
 * e2e/global-setup.ts, som ALLTID kjører etter at webServer allerede har
 * svart på helsesjekken (Playwrights egen rekkefølge: plugin-setup, deriblant
 * webServer, kjører FØR config.globalSetup) — så mappen finnes garantert når
 * denne kalles, forutsatt at webServer faktisk er konfigurert.
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

  // POSITIV FØRST: uten denne er vakten grønn også på et tomt/manglende bygg
  // — «ingen prod-URL funnet» er like sant når bygget er riktig som når det
  // ikke finnes i det hele tatt.
  const fantTestUrl = innhold.some(tekst => tekst.includes(testUrl))
  if (!fantTestUrl) {
    throw new Error(
      `bygg-artefakt-vakt: fant IKKE test-instansens URL (${testUrl}) i ` +
        'byggartefaktet. Appen ser ut til å være bygget mot feil (eller ingen) ' +
        'Supabase-instans — sjekk «Bygg»-steget i .github/workflows/pr-check.yml, ' +
        'eller kjør npm run build på nytt lokalt.',
    )
  }

  // NEGATIV, bevisst avgrenset til sky-Supabase-mønsteret — ALDRI klubbdomenet.
  // PROD_URL bygges fra KLUBB_DOMENE (lib/config.ts) og havner i bundelen
  // uansett hvor riktig NEXT_PUBLIC_BASE_URL er (ICS-ruta ekker BASE_URL
  // ubetinget, se e2e/sikkerhetsvakt.spec.ts) — en vakt på klubbdomenet ville
  // vært permanent rød, og en permanent rød vakt slås av innen en måned.
  //
  // Kun mulig å telle rent fordi .map er filtrert bort over — se
  // kommentaren ved HOPP_OVER_ENDELSER for hvorfor kildekart alene ville gjort
  // denne tellingen permanent > 0.
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

// Eksplisitt liste over ruter som LOVLIG kan være prerendret (statisk HTML
// generert ved byggetid). I dag kun /manifest.webmanifest — en generert,
// innholdsuavhengig fil (app/manifest.ts). Rutene under (app)/-gruppen leser
// tema- og sesjons-cookies i sine layouts og er derfor dynamiske; blir en av
// dem statisk uten at noen merker det, ville en test som forventer FERSK
// DB-state kunne lese byggetids-HTML i stedet. Se e2e/global-setup.ts.
const TILLATTE_PRERENDRET_RUTER = new Set(['/manifest.webmanifest'])

/**
 * Prerender-vakt (#659): ruter i `<distDir>/prerender-manifest.json` skal
 * være en delmengde av TILLATTE_PRERENDRET_RUTER. En ny statisk rute er ikke
 * nødvendigvis feil, men skal være et BEVISST valg — denne vakten gjør det
 * synlig i stedet for stille.
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
