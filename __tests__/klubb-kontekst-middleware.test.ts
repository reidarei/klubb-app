// Kontrakten aktivKlubbId() bygger på (#869): den dekoder access-tokenet fra getSession()
// uten å verifisere det, fordi middleware har verifisert signatur og exp på samme cookie.
// Gjelder kun så lenge ingen rute som når fram UTEN verifisert sesjon importerer
// lib/klubb-kontekst (direkte eller transitivt). Denne testen vokter det.
//
// Begge sider UTLEDES fra kildekoden, ingenting er hardkodet (#869-review, BLOCKER):
//   - Hvilke ruter middleware slipper gjennom: `config.matcher` (rutene den ikke kjører
//     for), tidlig-returen med NextResponse.next() før verifiseringen, og `erOffentlig`.
//     Alle tre leses med TypeScript-parseren fra middleware.ts.
//   - Importgrafen: TypeScript-parseren (ikke regex), så en kommentert import ikke teller
//     og import type / re-eksport / dynamisk import / require gjør det.
// Ukjent form (nytt predikat på pathname, ikke-literal matcher, uløst import) får testen
// til å feile, aldri til å hoppe over — en vakt som gjetter, er ingen vakt.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import * as ts from 'typescript'

const ROT = path.resolve(__dirname, '..')
const MAAL = 'lib/klubb-kontekst.ts'
const DYNAMISK = '<ikke-literal import>'

type Virtuelle = Record<string, string>

function finnes(rel: string, v: Virtuelle) {
  if (rel in v) return true
  const abs = path.join(ROT, rel)
  return existsSync(abs) && statSync(abs).isFile()
}
function les(rel: string, v: Virtuelle = {}) {
  return (v[rel] ?? readFileSync(path.join(ROT, rel), 'utf-8')).replace(/\r\n/g, '\n')
}

function filer(dir: string): string[] {
  const abs = path.join(ROT, dir)
  if (!existsSync(abs)) return []
  return readdirSync(abs).flatMap((n) => {
    const rel = `${dir}/${n}`
    return statSync(path.join(ROT, rel)).isDirectory()
      ? filer(rel)
      : /\.(ts|tsx)$/.test(n)
        ? [rel]
        : []
  })
}

// ─── Importgraf (TypeScript-parser) ─────────────────────────────────────────

function spesifikatorer(kilde: string, filnavn = 'x.tsx'): string[] {
  const sf = ts.createSourceFile(
    filnavn,
    kilde,
    ts.ScriptTarget.Latest,
    true,
    filnavn.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const ut: string[] = []
  const besok = (n: ts.Node) => {
    if (
      (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
      n.moduleSpecifier &&
      ts.isStringLiteral(n.moduleSpecifier)
    ) {
      ut.push(n.moduleSpecifier.text)
    } else if (
      ts.isImportEqualsDeclaration(n) &&
      ts.isExternalModuleReference(n.moduleReference) &&
      ts.isStringLiteral(n.moduleReference.expression)
    ) {
      ut.push(n.moduleReference.expression.text)
    } else if (ts.isImportTypeNode(n)) {
      const a = n.argument
      ut.push(
        ts.isLiteralTypeNode(a) && ts.isStringLiteral(a.literal) ? a.literal.text : DYNAMISK,
      )
    } else if (
      ts.isCallExpression(n) &&
      (n.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(n.expression) && n.expression.text === 'require'))
    ) {
      const a = n.arguments[0]
      ut.push(a && ts.isStringLiteralLike(a) ? a.text : DYNAMISK)
    }
    ts.forEachChild(n, besok)
  }
  besok(sf)
  return ut
}

// null = ekstern pakke (ikke vår kode). Kaster på en lokal import som ikke finnes.
function losImport(fra: string, spec: string, v: Virtuelle): string | null {
  if (spec === DYNAMISK) return DYNAMISK
  let base: string
  if (spec.startsWith('@/')) base = spec.slice(2)
  else if (spec.startsWith('.')) base = path.posix.join(path.posix.dirname(fra), spec)
  else return null
  for (const k of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (finnes(k, v)) return k
  }
  if (finnes(base, v)) return /\.(ts|tsx)$/.test(base) ? base : null // .json, .css o.l.
  throw new Error(`${fra}: kunne ikke løse import '${spec}'`)
}

function lagGraf(v: Virtuelle) {
  const kanter = new Map<string, string[]>()
  const importer = (fil: string): string[] => {
    if (!kanter.has(fil)) {
      kanter.set(
        fil,
        spesifikatorer(les(fil, v), fil)
          .map((s) => losImport(fil, s, v))
          .filter((x): x is string => !!x),
      )
    }
    return kanter.get(fil)!
  }
  return (start: string): Set<string> => {
    const sett = new Set<string>()
    const ko = [start]
    while (ko.length) {
      const f = ko.pop()!
      if (sett.has(f)) continue
      sett.add(f)
      if (f !== DYNAMISK) ko.push(...importer(f))
    }
    return sett
  }
}

// ─── Middleware-unntak (TypeScript-parser) ──────────────────────────────────

type Predikat = { type: 'prefiks' | 'lik'; sti: string }
type Unntak = { matcher: RegExp[]; slipperForbi: Predikat[] }

const erPathname = (n: ts.Node) =>
  ts.isPropertyAccessExpression(n) && n.name.text === 'pathname'

function tellPathname(n: ts.Node): number {
  let antall = erPathname(n) ? 1 : 0
  ts.forEachChild(n, (b) => {
    antall += tellPathname(b)
  })
  return antall
}

function utledUnntak(kilde: string): Unntak {
  const sf = ts.createSourceFile('middleware.ts', kilde, ts.ScriptTarget.Latest, true)
  const variabler = new Map<string, ts.Expression>()
  let mwKropp: ts.Block | undefined
  let matcherInit: ts.Expression | undefined

  const finn = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      variabler.set(n.name.text, n.initializer)
      if (n.name.text === 'config' && ts.isObjectLiteralExpression(n.initializer)) {
        for (const p of n.initializer.properties) {
          if (ts.isPropertyAssignment(p) && p.name.getText(sf) === 'matcher') matcherInit = p.initializer
        }
      }
    }
    if (ts.isFunctionDeclaration(n) && n.name?.text === 'middleware') mwKropp = n.body
    ts.forEachChild(n, finn)
  }
  finn(sf)
  if (!mwKropp) throw new Error('middleware.ts: fant ikke function middleware')
  if (!matcherInit) throw new Error('middleware.ts: fant ikke config.matcher')

  // matcher: én streng eller array av strenger. Objekt-matchere (has/missing) forstås ikke.
  const strenger = ts.isArrayLiteralExpression(matcherInit)
    ? [...matcherInit.elements]
    : [matcherInit]
  const matcher = strenger.map((e) => {
    if (!ts.isStringLiteralLike(e)) throw new Error('middleware.ts: matcher er ikke en streng-literal')
    if (!e.text.startsWith('/(')) throw new Error(`middleware.ts: ukjent matcher-form ${e.text}`)
    return new RegExp(`^${e.text}$`)
  })

  // Predikater på pathname i et uttrykk. Identifikatorer følges til initializeren sin.
  // Alle pathname-referanser må være forstått, ellers kastes det.
  const predikater = (uttrykk: ts.Expression, sett = new Set<string>()): Predikat[] => {
    const ut: Predikat[] = []
    let forstaatt = 0
    const besok = (n: ts.Node) => {
      if (
        ts.isCallExpression(n) &&
        ts.isPropertyAccessExpression(n.expression) &&
        n.expression.name.text === 'startsWith' &&
        erPathname(n.expression.expression) &&
        n.arguments[0] &&
        ts.isStringLiteralLike(n.arguments[0])
      ) {
        ut.push({ type: 'prefiks', sti: n.arguments[0].text })
        forstaatt++
        return
      }
      if (
        ts.isBinaryExpression(n) &&
        [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken].includes(
          n.operatorToken.kind,
        )
      ) {
        const [a, b] = erPathname(n.left) ? [n.left, n.right] : [n.right, n.left]
        if (erPathname(a) && ts.isStringLiteralLike(b)) {
          ut.push({ type: 'lik', sti: b.text })
          forstaatt++
          return
        }
      }
      if (ts.isIdentifier(n) && variabler.has(n.text) && !sett.has(n.text)) {
        sett.add(n.text)
        ut.push(...predikater(variabler.get(n.text)!, sett))
      }
      ts.forEachChild(n, besok)
    }
    besok(uttrykk)
    if (tellPathname(uttrykk) !== forstaatt) {
      throw new Error(`middleware.ts: ukjent predikat på pathname i «${uttrykk.getText(sf)}»`)
    }
    return ut
  }

  // Tidlig-retur: en if i middleware() som returnerer NextResponse.next() før verifiseringen.
  const slipperForbi: Predikat[] = []
  let tidligFunnet = false
  for (const st of mwKropp.statements) {
    if (!ts.isIfStatement(st)) continue
    const tekst = st.thenStatement.getText(sf)
    if (/return\s+NextResponse\.next\(/.test(tekst)) {
      slipperForbi.push(...predikater(st.expression))
      tidligFunnet = true
    }
  }
  if (!tidligFunnet) throw new Error('middleware.ts: fant ikke tidlig-retur med NextResponse.next()')

  // Sidene som rendres uten verifisert sesjon (erOffentlig).
  const offentlig = variabler.get('erOffentlig')
  if (!offentlig) throw new Error('middleware.ts: fant ikke erOffentlig')
  slipperForbi.push(...predikater(offentlig))

  return { matcher, slipperForbi }
}

// ─── Ruter fra app/ ─────────────────────────────────────────────────────────

const INNGANG = /^(page|route|default)\.tsx?$/
const METADATA = /^(manifest|robots|sitemap|icon\d*|apple-icon\d*|opengraph-image|twitter-image)\.tsx?$/
const OMSLAG = /^(layout|template|loading|error|not-found|global-error|forbidden|unauthorized)\.tsx?$/

function url(fil: string): string {
  const deler = fil.split('/').slice(1, -1) // uten 'app' og filnavnet
  return '/' + deler.filter((d) => !/^\(.*\)$/.test(d) && !d.startsWith('@')).join('/')
}

function uverifisert(u: string, unntak: Unntak): boolean {
  if (!unntak.matcher.some((m) => m.test(u))) return true
  return unntak.slipperForbi.some((p) => (p.type === 'lik' ? u === p.sti : u.startsWith(p.sti)))
}

// Filene som rendres/kjøres for en rute: inngangsfila, og for sider også omslagene
// (layout, error, …) i hver forfedremappe — app/layout.tsx rendres også for /login.
function rotfiler(fil: string, alle: Set<string>): string[] {
  const ut = [fil]
  if (!/\/(page|default)\.tsx?$/.test(fil)) return ut
  const deler = fil.split('/')
  for (let i = deler.length - 1; i >= 1; i--) {
    const mappe = deler.slice(0, i).join('/')
    for (const f of alle) {
      if (path.posix.dirname(f) === mappe && OMSLAG.test(path.posix.basename(f))) ut.push(f)
    }
  }
  return ut
}

function analyser(mwKilde: string, virtuelle: Virtuelle = {}) {
  const unntak = utledUnntak(mwKilde)
  const alle = new Set([...filer('app'), ...Object.keys(virtuelle)])
  const naar = lagGraf(virtuelle)
  const rotter = new Set<string>()
  const ruter: string[] = []
  for (const f of alle) {
    const navn = path.posix.basename(f)
    const offentligRute = METADATA.test(navn) || (INNGANG.test(navn) && uverifisert(url(f), unntak))
    if (!offentligRute) continue
    ruter.push(f)
    for (const r of rotfiler(f, alle)) rotter.add(r)
  }
  const brudd = [...rotter].filter((r) => {
    const n = naar(r)
    return n.has(MAAL) || n.has(DYNAMISK)
  })
  return { unntak, ruter, rotter: [...rotter], brudd, naar }
}

const MW = les('middleware.ts')

describe('importgrafen (TypeScript-parser)', () => {
  it('fanger import type, re-eksport, dynamisk import og require — ignorerer kommentarer og strenger', () => {
    const kilde = [
      "import type { A } from './a'",
      "export { b } from './b'",
      "export * from './c'",
      "const d = await import('./d')",
      "type E = typeof import('./e')",
      "const f = require('./f')",
      "// import { g } from './g'",
      "/* import h from './h' */",
      `const s = "import i from './i'"`,
    ].join('\n')
    expect(spesifikatorer(kilde, 'x.ts')).toEqual(['./a', './b', './c', './d', './e', './f'])
  })

  it('ikke-literal dynamisk import markeres (og teller som brudd)', () => {
    expect(spesifikatorer('const m = await import(navn)', 'x.ts')).toEqual([DYNAMISK])
  })

  it('er ikke tom: lib/auth.ts og lib/auth-cache.ts når lib/klubb-kontekst', () => {
    const { naar } = analyser(MW)
    expect(naar('lib/auth.ts').has(MAAL)).toBe(true)
    expect(naar('lib/auth-cache.ts').has(MAAL)).toBe(true)
  })
})

describe('aktivKlubbId() mot middleware', () => {
  it('unntakene utledes fra middleware.ts og dekker dagens offentlige ruter', () => {
    const { unntak, ruter } = analyser(MW)
    // Sanity, ikke kilden: lista over er utledet. Feiler denne, har utledningen sviktet.
    for (const u of ['/api/cron/x', '/api/github/x', '/api/ping', '/api/logg-feil', '/login', '/oppdater-passord']) {
      expect(uverifisert(u, unntak), u).toBe(true)
    }
    for (const u of ['/', '/chat', '/api/admin/opprett-medlem']) {
      expect(uverifisert(u, unntak), u).toBe(false)
    }
    expect(ruter.some((f) => f.startsWith('app/api/cron/'))).toBe(true)
    expect(ruter).toContain('app/(auth)/login/page.tsx')
  })

  it('ingen rute som når fram uten verifisert sesjon, når lib/klubb-kontekst', () => {
    const { rotter, brudd } = analyser(MW)
    expect(rotter).toContain('app/layout.tsx') // omslagene er med
    expect(brudd).toEqual([])
  })

  // Beviset på at vakten faktisk kan bli rød — begge halvdeler, mot ekte middleware.ts
  // med én endring om gangen.
  describe('selvtest: vakten blir rød', () => {
    const fixture: Virtuelle = {
      'app/api/ny-hook/route.ts': "import { ensureAdmin } from '@/lib/auth'\nexport const GET = ensureAdmin\n",
    }

    it('uendret middleware: fixture-ruta er beskyttet, ingen brudd', () => {
      expect(analyser(MW, fixture).brudd).toEqual([])
    })

    it('ruta lagt i matcherens negative lookahead → brudd', () => {
      const mw = MW.replace('api/logg-feil|', 'api/logg-feil|api/ny-hook|')
      expect(mw).not.toBe(MW)
      expect(analyser(mw, fixture).brudd).toEqual(['app/api/ny-hook/route.ts'])
    })

    it('ruta lagt i tidlig-returen → brudd', () => {
      const mw = MW.replace(
        "request.nextUrl.pathname === '/api/ping' ||",
        "request.nextUrl.pathname === '/api/ping' ||\n      request.nextUrl.pathname.startsWith('/api/ny-hook') ||",
      )
      expect(mw).not.toBe(MW)
      expect(analyser(mw, fixture).brudd).toEqual(['app/api/ny-hook/route.ts'])
    })

    it('ruta lagt i erOffentlig → brudd', () => {
      const mw = MW.replace(
        'const erOffentlig = erPaaLogin || erPaaOppdaterPassord',
        "const erOffentlig = erPaaLogin || erPaaOppdaterPassord || request.nextUrl.pathname === '/api/ny-hook'",
      )
      expect(mw).not.toBe(MW)
      expect(analyser(mw, fixture).brudd).toEqual(['app/api/ny-hook/route.ts'])
    })

    it('transitiv import fra et omslag (layout) til en offentlig side → brudd', () => {
      const v: Virtuelle = {
        'app/(auth)/layout.tsx': "import { getProfil } from '@/lib/auth-cache'\nexport default getProfil\n",
      }
      expect(analyser(MW, v).brudd).toEqual(['app/(auth)/layout.tsx'])
    })

    it('kommentert import → ikke brudd', () => {
      const v: Virtuelle = {
        'app/api/ping/route.ts': "// import '@/lib/klubb-kontekst'\nexport const GET = 1\n",
      }
      expect(analyser(MW, v).brudd).toEqual([])
    })

    it('ukjent predikat på pathname → kaster i stedet for å gjette', () => {
      const mw = MW.replace(
        "request.nextUrl.pathname === '/api/ping' ||",
        "/^\\/api\\/ny/.test(request.nextUrl.pathname) ||",
      )
      expect(() => utledUnntak(mw)).toThrow(/ukjent predikat/)
    })
  })
})
