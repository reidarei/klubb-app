import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Pinner artefaktvakten i e2e/helpers/bygg-artefakt-vakt.ts (#659).
 *
 * Hele verdien i vakten ligger i to egenskaper som er STILLE å svekke:
 *   1. den POSITIVE sjekken (finnes test-instansens URL?) kommer FØRST — uten
 *      den er vakten grønn på et tomt bygg, fordi «ingen sky-URL funnet» er
 *      like sant da som når bygget er riktig.
 *   2. unntaket er nøyaktig `.map` og ikke mer — kildekart bærer hele den
 *      originale kilden og ville gjort vakten permanent rød, men et hvilket
 *      som helst bredere unntak ville blindet den for ekte forurensning.
 * Neste mann som får vakten rød «fikser» den ellers ved å myke opp regexen
 * eller flytte den negative sjekken først, og ingenting blir rødt.
 */

const TEST_URL = 'http://192.168.10.10:54321'
// 20 tegn i subdomenet — formen til en ekte Supabase-prosjektref.
const SKY_URL = 'https://abcdefghijklmnopqrst.supabase.co'

let temp: string

// DIST_DIR leses på modullast i vakten, så hver test må laste modulen på nytt
// etter at env-variabelen peker på denne testens temp-katalog. Absolutt sti
// vinner i vaktens path.resolve(__dirname, '..', '..', DIST_DIR).
async function lastVakt() {
  process.env.NEXT_DIST_DIR = temp
  vi.resetModules()
  return await import('../e2e/helpers/bygg-artefakt-vakt')
}

function skriv(relativSti: string, innhold: string) {
  const full = path.join(temp, relativSti)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, innhold, 'utf8')
}

beforeEach(() => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-artefaktvakt-'))
})

afterEach(() => {
  delete process.env.NEXT_DIST_DIR
  fs.rmSync(temp, { recursive: true, force: true })
})

describe('verifiserByggArtefakt', () => {
  it('kaster på tom byggkatalog', async () => {
    const { verifiserByggArtefakt } = await lastVakt()
    expect(() => verifiserByggArtefakt(TEST_URL)).toThrow(/fant ingen filer/)
  })

  it('kaster når test-instansens URL mangler i artefaktet', async () => {
    skriv('server/app.js', 'const a = "https://annen-instans.example/rest/v1"')
    const { verifiserByggArtefakt } = await lastVakt()
    expect(() => verifiserByggArtefakt(TEST_URL)).toThrow(/fant IKKE test-instansens URL/)
  })

  it('kaster når en sky-Supabase-URL ligger i en servert .js', async () => {
    skriv('server/app.js', `const url = "${TEST_URL}"`)
    skriv('static/chunk.js', `const feil = "${SKY_URL}"`)
    const { verifiserByggArtefakt } = await lastVakt()
    expect(() => verifiserByggArtefakt(TEST_URL)).toThrow(/sky-Supabase-mønsteret/)
  })

  it('passerer når samme sky-URL KUN ligger i et kildekart (.map)', async () => {
    skriv('server/app.js', `const url = "${TEST_URL}"`)
    // Samme streng som i testen over — eneste forskjell er filendelsen.
    skriv('static/chunk.js.map', `{"sourcesContent":["const kjentProd = '${SKY_URL}'"]}`)
    const { verifiserByggArtefakt } = await lastVakt()
    expect(() => verifiserByggArtefakt(TEST_URL)).not.toThrow()
  })

  it('melder MANGLENDE test-URL, ikke sky-treff, når begge feilene finnes samtidig', async () => {
    // Pinner rekkefølgen: den positive sjekken må komme først. Byttes de om,
    // rapporterer vakten sky-treffet og et tomt/feil bygg uten sky-URL blir grønt.
    skriv('server/app.js', `const feil = "${SKY_URL}"`)
    const { verifiserByggArtefakt } = await lastVakt()
    expect(() => verifiserByggArtefakt(TEST_URL)).toThrow(/fant IKKE test-instansens URL/)
  })

  it('reagerer ikke på docs-aktige Supabase-strenger (subdomene ≠ 20 tegn)', async () => {
    skriv('server/app.js', `const url = "${TEST_URL}"; const doc = "https://example.supabase.co"`)
    skriv('static/chunk.js', 'const doc2 = "https://project-id.supabase.co"')
    const { verifiserByggArtefakt } = await lastVakt()
    expect(() => verifiserByggArtefakt(TEST_URL)).not.toThrow()
  })
})
