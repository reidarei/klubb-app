// Vakt (#700/#702): divIcon(...) uten iconSize arver Leaflets 12×12 og gir mikroskopisk treffflate.
// Statisk analyse via TS-compiler-API; ikke-objektliteral som argument feiler (fail-closed).

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import * as ts from 'typescript'

const ROOT = path.resolve(__dirname, '..')
const SKIP_DIRS = new Set(['node_modules', '.next', '__tests__', 'e2e', '.git'])

function samleFiler(dir: string, ut: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      samleFiler(full, ut)
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      ut.push(full)
    }
  }
  return ut
}

function relativ(fil: string): string {
  return path.relative(ROOT, fil).split(path.sep).join('/')
}

function parseFil(fil: string, kildeOverride?: string): ts.SourceFile {
  const kode = kildeOverride ?? fs.readFileSync(fil, 'utf8')
  const scriptKind = fil.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  return ts.createSourceFile(fil, kode, ts.ScriptTarget.Latest, true, scriptKind)
}

function linjeFor(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
}

// Fanger BÅDE `divIcon(...)` (frittstående import) og `L.divIcon(...)`/
// `noe.divIcon(...)` (property access) — PosisjonsKart.tsx bruker sistnevnte.
function finnDivIconKall(sf: ts.SourceFile): ts.CallExpression[] {
  const treff: ts.CallExpression[] = []
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const expr = node.expression
      const erDivIcon =
        (ts.isIdentifier(expr) && expr.text === 'divIcon') ||
        (ts.isPropertyAccessExpression(expr) && expr.name.text === 'divIcon')
      if (erDivIcon) treff.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return treff
}

type Brudd = { fil: string; linje: number; melding: string }

function sjekkKall(fil: string, sf: ts.SourceFile, kall: ts.CallExpression, brudd: Brudd[]): void {
  const arg = kall.arguments[0]
  if (!arg || !ts.isObjectLiteralExpression(arg)) {
    brudd.push({
      fil: relativ(fil),
      linje: linjeFor(sf, kall),
      melding:
        'divIcon(...) sitt første argument må være et objektliteral med iconSize, ellers kan ikke vakten se feltet' +
        (arg ? ` (fikk «${arg.getText(sf).replace(/\s+/g, ' ').slice(0, 40)}»)` : ' (ingen argumenter)'),
    })
    return
  }
  const harIconSize = arg.properties.some(
    p =>
      (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) &&
      ts.isIdentifier(p.name) &&
      p.name.text === 'iconSize',
  )
  if (!harIconSize) {
    brudd.push({
      fil: relativ(fil),
      linje: linjeFor(sf, arg),
      melding: 'divIcon(...) mangler iconSize — Leaflet sin default (12×12) ga #702',
    })
  }
}

function formaterBrudd(brudd: Brudd[]): string {
  return brudd.map(b => `${b.fil}:${b.linje} — ${b.melding}`).join('\n')
}

const ALLE_FILER = [
  ...samleFiler(path.join(ROOT, 'app')),
  ...samleFiler(path.join(ROOT, 'components')),
  ...samleFiler(path.join(ROOT, 'lib')),
]

describe('leaflet-divicon-iconsize (#700/#702) — statisk vakt mot manglende iconSize', () => {
  it('0 brudd i kodebasen', () => {
    const brudd: Brudd[] = []
    let antallKall = 0
    for (const fil of ALLE_FILER) {
      const sf = parseFil(fil)
      const kall = finnDivIconKall(sf)
      antallKall += kall.length
      for (const k of kall) sjekkKall(fil, sf, k, brudd)
    }
    expect(brudd, formaterBrudd(brudd)).toEqual([])
    // Selvtesten under beviser at vakten FINNER kall — dette beviser at den
    // finner dem i DEN EKTE kodebasen, ikke bare i en kildestreng på nytt.
    expect(antallKall).toBeGreaterThan(0)
  })

  it('gulv: minst 4 divIcon(...)-kallsteder i kodebasen (PosisjonsKart.tsx)', () => {
    let antallKall = 0
    for (const fil of ALLE_FILER) {
      antallKall += finnDivIconKall(parseFil(fil)).length
    }
    expect(antallKall).toBeGreaterThanOrEqual(4)
  })

  it("selvtest: L.divIcon({ html: '' }) uten iconSize gir nøyaktig 1 brudd", () => {
    const kilde = "L.divIcon({ html: '' })"
    const fil = path.join(ROOT, 'components', '__selvtest__.tsx')
    const sf = parseFil(fil, kilde)
    const brudd: Brudd[] = []
    const kall = finnDivIconKall(sf)
    expect(kall.length).toBe(1)
    for (const k of kall) sjekkKall(fil, sf, k, brudd)
    expect(brudd.length).toBe(1)
  })
})
