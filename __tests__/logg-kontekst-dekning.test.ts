// Regresjonsvakt (#681): et diagnosefelt som sendes til logg-infrastrukturen
// men ikke står i whitelisten forsvinner STILLE — scrubKontekst()/scrubbet()
// dropper ukjente nøkler uten en advarsel. Det har skjedd minst tre ganger:
//
//   - #676: sw.js og ServiceWorkerRegistrering.tsx sendte åtte push-klikk-
//     diagnosefelter i flere måneder. Ingen av dem sto i whitelisten, og
//     radene i feil_logg kom inn som tomme objekter.
//   - bursdagsbilde.generering.levert (#641): bytes/mime_type/modell strippet
//     på samme vis.
//   - cron.klientfeil.mottakere.tomme (#582): antallFeil-feltet het noe
//     annet enn det whitelisten faktisk godtar (fikset i samme runde som
//     denne testen, #681).
//
// Denne testen statisk-analyserer kildekoden (TypeScript-compiler-API, ikke
// regex) og feiler bygget FØR en slik rad blir stille i produksjon. Den er
// grunnen til at klassen ikke skal kunne skje en fjerde gang.
//
// Dekningen er KALLSTEDENE (sendFeilBeacon/loggPushKlikk/logg.warn/logg.feil)
// OG lib/klient-logg.ts sin egen kropp: diagnostikk() legger felter på hver
// eneste klientfeil uten å gå via et kall, så et hull der ville vært det
// samme hullet en gang til (funnet i #681-reviewen).
//
// Et argument som ikke er et objektliteral (en variabel, en spread), eller en
// nøkkel som ikke er et literalnavn (computed key, metode, accessor), er
// AKKURAT stiene som ville omgått denne vakten — testen FEILER på slikt, den
// hopper aldri stilltiende over. Se sjekkKontekstArgument() under.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import * as ts from 'typescript'
import { KONTEKST_WHITELIST as KLIENT_WHITELIST } from '@/lib/logg-sanitering'
import { KONTEKST_WHITELIST as SERVER_WHITELIST } from '@/lib/logg'

const ROOT = path.resolve(__dirname, '..')
const SKIP_DIRS = new Set(['node_modules', '.next', '__tests__', 'e2e', '.git'])

// Unntaket gjelder ETT UTTRYKK, ikke en hel fil (#681 review): lib/logg.ts
// har én lovlig spread — `logg.warn(event, { code, ...opts?.ctx })` inne i
// logg.feil() selv (tilgangsklasse === 'warn'-grenen). Det er intern
// videreformidling av en ctx som allerede ble validert som objektliteral på
// sitt EKTE kallsted, ikke et nytt, uauditert felt.
//
// Et fil-unntak ville slått av skanningen for ALLE kall i fila — bl.a.
// `logg.warn('server.render.sesjon_utloept', { code })`, som er et helt
// vanlig kallsted. Nøkkel = filsti, verdi = kildeteksten til de spread-
// uttrykkene som er lovlige der. Alt annet i fila skannes som ellers.
const TILLATTE_SPREADS = new Map<string, Set<string>>([['lib/logg.ts', new Set(['opts?.ctx'])]])

// logg.feil(event, error, opts) — `opts` er IKKE et kontekstobjekt: kun
// `opts.ctx` går gjennom scrubbet(). De to andre nøklene er transport
// (fingerprint styrer Sentry-gruppering, sample er en payload-prøve). Vakten
// sjekket dem tidligere mot kontekst-whitelisten, noe som gikk bra bare fordi
// navnene tilfeldigvis sto der — en ny opts-nøkkel ville feilet med en
// misvisende melding om whitelisten (#681 review).
// Nøklene JSON-konvolutten til /api/logg-feil har. Bare `kontekst` scrubbes
// mot whitelisten; et diagnosefelt lagt på toppnivå ville blitt ignorert av
// ruta uten spor, så vakten feiler på ukjente nøkler her også.
const KONVOLUTT_NOEKLER = new Set(['event', 'nivaa', 'kontekst'])

const LOVLIGE_FEIL_OPTS = new Set(['fingerprint', 'sample', 'ctx'])

// ─── Fil-innsamling ─────────────────────────────────────────────────────────

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

function parseFil(fil: string): ts.SourceFile {
  const kode = fs.readFileSync(fil, 'utf8')
  const scriptKind = fil.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : fil.endsWith('.js')
      ? ts.ScriptKind.JS
      : ts.ScriptKind.TS
  return ts.createSourceFile(fil, kode, ts.ScriptTarget.Latest, true, scriptKind)
}

function linjeFor(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
}

// ─── AST-hjelpere ───────────────────────────────────────────────────────────

function finnKall(sf: ts.SourceFile, predikat: (node: ts.CallExpression) => boolean): ts.CallExpression[] {
  const treff: ts.CallExpression[] = []
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && predikat(node)) treff.push(node)
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return treff
}

function erKallPaaIdentifikator(node: ts.CallExpression, navn: string): boolean {
  return ts.isIdentifier(node.expression) && node.expression.text === navn
}

function erKallPaaProperty(node: ts.CallExpression, objekt: string, metode: string): boolean {
  return (
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === objekt &&
    node.expression.name.text === metode
  )
}

function finnFunksjonsdeklarasjon(sf: ts.SourceFile, navn: string): ts.FunctionDeclaration | undefined {
  let treff: ts.FunctionDeclaration | undefined
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === navn) treff = node
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return treff
}

// ─── Tilordnings-operatorer ─────────────────────────────────────────────────
// Vakten på diagnostikk() leste opprinnelig kun `=`. Da ville `d.nyttFelt ??= …`
// — et helt naturlig valg for neste felt der — lagt på et kontekstfelt uten at
// vakten så det, altså nøyaktig den stille strippingen den finnes for (#681).
// Vi matcher derfor HELE tilordnings-spennet i TS-grammatikken: EqualsToken
// (FirstAssignment) … CaretEqualsToken (LastAssignment), med ??=/||=/&&= og de
// aritmetiske/bitvise imellom.
function erTilordning(kind: ts.SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment
}

// Formene som SETTER feltet til en verdi. De øvrige i spennet (+=, -=, |= …)
// akkumulerer på en verdi som alt ligger der, og er enten en skrivefeil eller
// en form vakten ikke kan resonnere om — begge deler skal meldes, også når
// feltnavnet står i whitelisten.
const SETTER_OPERATORER = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
])

type Brudd = { fil: string; linje: number; melding: string }

/**
 * Kjernen i vakten. `node` er argumentet whitelisten faktisk filtrerer
 * (4. argument til sendFeilBeacon, 2. til logg.warn, `opts` til logg.feil,
 * 1. til loggPushKlikk). Kravene:
 *
 *  1. Argumentet skal være et objektliteral, eller literal `undefined`
 *     (ingen kontekst sendt). En variabel eller spread kan bære HVA SOM
 *     HELST inn i loggen uten at denne vakten ser feltene — derfor FEILER
 *     vi der, vi hopper aldri over. Eneste åpning er `tillatteSpreads`, som
 *     navngir konkrete uttrykk som er validert et annet sted (se
 *     TILLATTE_SPREADS).
 *  2. Nøkkelen må være et literalnavn. En computed key (`{ [n]: 1 }`), en
 *     metode eller en getter skjuler feltnavnet for vakten like effektivt
 *     som en spread — også de FEILER, de hoppes ikke stilltiende over.
 *  3. En property navngitt `ctx` er en CONTAINER (speiler scrubbet() i
 *     lib/logg.ts, som flater `{...data, ...data.ctx}`), ikke selv et
 *     datafelt — vi rekurserer inn i verdien i stedet for å kreve at «ctx»
 *     står i whitelisten.
 *  4. Alle andre topp-nivå-nøkler må stå i `whitelist` — eller i
 *     `toppnivaaTillatt`, når toppnivået ikke ER konteksten (logg.feil sin
 *     opts). Rekursjonen inn i ctx bruker alltid whitelisten.
 */
type SjekkOpts = {
  /** Lovlige nøkler på toppnivå når toppnivået ikke selv er konteksten. */
  toppnivaaTillatt?: Set<string>
  /** Kildeteksten til spread-uttrykk som er lovlige i denne filen. */
  tillatteSpreads?: Set<string>
}

function sjekkKontekstArgument(
  fil: string,
  sf: ts.SourceFile,
  node: ts.Expression | undefined,
  whitelist: Set<string>,
  whitelistNavn: 'klient' | 'server',
  brudd: Brudd[],
  opts: SjekkOpts = {},
): void {
  if (!node) return // Ingen kontekst sendt i det hele tatt — ingenting å sjekke.
  if (node.kind === ts.SyntaxKind.UndefinedKeyword) return
  if (ts.isIdentifier(node) && node.text === 'undefined') return

  if (!ts.isObjectLiteralExpression(node)) {
    brudd.push({
      fil: relativ(fil),
      linje: linjeFor(sf, node),
      melding:
        `send et objektliteral, ellers kan ikke vakten se feltene ` +
        `(fikk «${node.getText(sf).replace(/\s+/g, ' ').slice(0, 60)}», ${whitelistNavn}-whitelisten)`,
    })
    return
  }

  const lovligeToppnivaa = opts.toppnivaaTillatt ?? whitelist

  for (const prop of node.properties) {
    if (ts.isSpreadAssignment(prop)) {
      const tekst = prop.expression.getText(sf).replace(/\s+/g, '')
      if (opts.tillatteSpreads?.has(tekst)) continue
      brudd.push({
        fil: relativ(fil),
        linje: linjeFor(sf, prop),
        melding: `send et objektliteral, ellers kan ikke vakten se feltene (spread «...${tekst}», ${whitelistNavn}-whitelisten)`,
      })
      continue
    }
    if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop)) {
      // Metode eller get/set-accessor: nøkkelen finnes, men formen er ikke et
      // datafelt vi kan resonnere om. Feiler heller enn å hoppe over.
      brudd.push({
        fil: relativ(fil),
        linje: linjeFor(sf, prop),
        melding: `nøkkelen må være et vanlig felt, ikke metode/accessor (${whitelistNavn}-whitelisten)`,
      })
      continue
    }

    const navnNode = prop.name
    const navn = ts.isIdentifier(navnNode)
      ? navnNode.text
      : ts.isStringLiteral(navnNode)
        ? navnNode.text
        : null
    if (!navn) {
      // Computed key: feltnavnet finnes først ved kjøring, så verken denne
      // vakten eller en leser kan se hva som havner i loggen.
      brudd.push({
        fil: relativ(fil),
        linje: linjeFor(sf, prop),
        melding: `nøkkelen må være et literalnavn, ellers kan ikke vakten se feltet (fikk «${navnNode.getText(sf).replace(/\s+/g, ' ').slice(0, 40)}», ${whitelistNavn}-whitelisten)`,
      })
      continue
    }

    if (navn === 'ctx') {
      if (ts.isShorthandPropertyAssignment(prop)) {
        // `{ ctx }` — verdien er en variabel, ikke et literal. Samme
        // blindsone som en variabel på toppnivå: feiler.
        brudd.push({
          fil: relativ(fil),
          linje: linjeFor(sf, prop),
          melding: `send et objektliteral, ellers kan ikke vakten se feltene (ctx som variabel, ${whitelistNavn}-whitelisten)`,
        })
        continue
      }
      // Rekursjonen dropper toppnivaaTillatt: innholdet i ctx ER konteksten.
      sjekkKontekstArgument(fil, sf, prop.initializer, whitelist, whitelistNavn, brudd, {
        tillatteSpreads: opts.tillatteSpreads,
      })
      continue
    }

    if (!lovligeToppnivaa.has(navn)) {
      brudd.push({
        fil: relativ(fil),
        linje: linjeFor(sf, prop),
        melding:
          opts.toppnivaaTillatt
            ? `«${navn}» er ikke en lovlig opts-nøkkel (${[...opts.toppnivaaTillatt].join('/')})`
            : `feltet «${navn}» står ikke i ${whitelistNavn}-whitelisten`,
      })
    }
  }
}

function formaterBrudd(brudd: Brudd[]): string {
  return brudd.map((b) => `${b.fil}:${b.linje} — ${b.melding}`).join('\n')
}

// ─── Datainnsamling (kjøres én gang, delt mellom testene) ──────────────────

const ALLE_FILER = [...samleFiler(path.join(ROOT, 'app')), ...samleFiler(path.join(ROOT, 'components')), ...samleFiler(path.join(ROOT, 'lib'))]

describe('logg-kontekst-dekning (#681) — statisk vakt mot stille strippede felter', () => {
  it('sendFeilBeacon(...): alle nøkler i 4. argument står i klient-whitelisten', () => {
    const brudd: Brudd[] = []
    for (const fil of ALLE_FILER) {
      const sf = parseFil(fil)
      const kall = finnKall(sf, (n) => erKallPaaIdentifikator(n, 'sendFeilBeacon'))
      for (const k of kall) {
        sjekkKontekstArgument(fil, sf, k.arguments[3], KLIENT_WHITELIST, 'klient', brudd)
      }
    }
    expect(brudd, formaterBrudd(brudd)).toEqual([])
  })

  it('sw.js: loggPushKlikk(...)-kall bruker klient-whitelisten, og fetch(\'/api/logg-feil\') finnes kun der', () => {
    const swFil = path.join(ROOT, 'public', 'sw.js')
    const sf = parseFil(swFil)
    const brudd: Brudd[] = []

    const kall = finnKall(sf, (n) => erKallPaaIdentifikator(n, 'loggPushKlikk'))
    expect(kall.length, 'fant ingen loggPushKlikk(...)-kall i sw.js — har funksjonen blitt omdøpt?').toBeGreaterThan(0)
    for (const k of kall) {
      sjekkKontekstArgument(swFil, sf, k.arguments[0], KLIENT_WHITELIST, 'klient', brudd)
    }
    expect(brudd, formaterBrudd(brudd)).toEqual([])

    // Nøyaktig ÉN fetch('/api/logg-feil')-forekomst i hele fila — uten dette
    // kan en ny, uanalysert loggevei legges rett ved siden av vakten.
    const fetchKall = finnKall(sf, (n) => {
      if (!erKallPaaIdentifikator(n, 'fetch')) return false
      const forsteArg = n.arguments[0]
      return !!forsteArg && ts.isStringLiteral(forsteArg) && forsteArg.text === '/api/logg-feil'
    })
    expect(fetchKall.length, `forventet nøyaktig 1 fetch('/api/logg-feil')-kall i sw.js, fant ${fetchKall.length}`).toBe(1)

    // Og den ene forekomsten skal ligge INNI loggPushKlikk — ikke ved siden av.
    let enclosing: ts.Node | undefined = fetchKall[0]
    let funnetLoggPushKlikk = false
    while (enclosing) {
      if (ts.isFunctionDeclaration(enclosing) && enclosing.name?.text === 'loggPushKlikk') {
        funnetLoggPushKlikk = true
        break
      }
      enclosing = enclosing.parent
    }
    expect(funnetLoggPushKlikk, `fetch('/api/logg-feil') ved sw.js:${linjeFor(sf, fetchKall[0])} ligger ikke inni loggPushKlikk()`).toBe(true)
  })

  // ── BLOCKER fra #681-reviewen ────────────────────────────────────────────
  // Testen over ser bare KALL til sendFeilBeacon. Konteksten som faktisk når
  // basen bygges også INNE i lib/klient-logg.ts: diagnostikk() legger felter
  // på hver eneste klientfeil (`d.appversjon = …`), og de spres inn i
  // objektliteralet i sendFeilBeacon-definisjonen. Ingen av de to formene er
  // et kall, så vakten var blind for dem — et nytt diagnosefelt ville blitt
  // strippet like stille som #676-feltene. Derfor leses fila særskilt her.
  it('lib/klient-logg.ts: diagnostikk() og beacon-konvolutten sender kun whitelistede felter', () => {
    const fil = path.join(ROOT, 'lib', 'klient-logg.ts')
    const sf = parseFil(fil)
    const brudd: Brudd[] = []

    // ── 1. diagnostikk(): feltene som legges på HVER klientfeil ────────────
    const diag = finnFunksjonsdeklarasjon(sf, 'diagnostikk')
    expect(diag, 'fant ingen function diagnostikk() i lib/klient-logg.ts — omdøpt?').toBeTruthy()

    const diagFelter: string[] = []
    function besoekDiagnostikk(node: ts.Node) {
      // `d.appversjon = …` / `d['appversjon'] = …`. Vi krever ikke at objektet
      // heter `d`: enhver tilordning på et objekt inne i diagnostikk() ender
      // potensielt i konteksten, og å feile på en uventet én er riktig vei.
      // Alle tilordnings-operatorer leses, ikke bare `=` — se erTilordning().
      if (ts.isBinaryExpression(node) && erTilordning(node.operatorToken.kind)) {
        const v = node.left
        let navn: string | null = null
        if (ts.isPropertyAccessExpression(v) && ts.isIdentifier(v.expression)) {
          navn = ts.isIdentifier(v.name) ? v.name.text : null
          if (!navn)
            brudd.push({ fil: relativ(fil), linje: linjeFor(sf, v), melding: 'nøkkelen må være et literalnavn (klient-whitelisten)' })
        } else if (ts.isElementAccessExpression(v) && ts.isIdentifier(v.expression)) {
          const arg = v.argumentExpression
          if (ts.isStringLiteral(arg)) navn = arg.text
          else
            brudd.push({
              fil: relativ(fil),
              linje: linjeFor(sf, v),
              melding: `nøkkelen må være et literalnavn, ellers kan ikke vakten se feltet (fikk «${arg.getText(sf)}», klient-whitelisten)`,
            })
        }
        if (navn) {
          // Navnet går gjennom whitelist-sjekken under uansett operator.
          diagFelter.push(navn)
          if (!SETTER_OPERATORER.has(node.operatorToken.kind)) {
            brudd.push({
              fil: relativ(fil),
              linje: linjeFor(sf, node),
              melding: `diagnosefeltet «${navn}» skrives med «${node.operatorToken.getText(sf)}» — vakten forstår kun tilordning (=, ??=, ||=, &&=); skriv feltet med en av dem (klient-whitelisten)`,
            })
          }
        }
      }
      // Et objektliteral inne i diagnostikk() (retur, Object.assign) er samme
      // sak — sjekkes med de vanlige reglene.
      if (ts.isObjectLiteralExpression(node)) {
        sjekkKontekstArgument(fil, sf, node, KLIENT_WHITELIST, 'klient', brudd)
      }
      ts.forEachChild(node, besoekDiagnostikk)
    }
    besoekDiagnostikk(diag!.body!)

    expect(diagFelter.length, 'fant ingen felter satt i diagnostikk() — er formen endret slik at vakten ikke lenger ser dem?').toBeGreaterThan(0)
    for (const navn of diagFelter) {
      if (!KLIENT_WHITELIST.has(navn)) {
        brudd.push({ fil: relativ(fil), linje: 0, melding: `diagnostikk()-feltet «${navn}» står ikke i klient-whitelisten` })
      }
    }

    // ── 2. sendFeilBeacon(): konvolutten som faktisk sendes ───────────────
    const beacon = finnFunksjonsdeklarasjon(sf, 'sendFeilBeacon')
    expect(beacon, 'fant ingen function sendFeilBeacon() i lib/klient-logg.ts — omdøpt?').toBeTruthy()

    // Finn objektliteralet med en `kontekst`-property: det er nøyaktig det
    // scrubKontekst() på serveren filtrerer.
    const konvolutter: ts.ObjectLiteralExpression[] = []
    function besoekBeacon(node: ts.Node) {
      if (ts.isObjectLiteralExpression(node)) {
        const harKontekst = node.properties.some(
          (pr) => ts.isPropertyAssignment(pr) && ts.isIdentifier(pr.name) && pr.name.text === 'kontekst',
        )
        if (harKontekst) konvolutter.push(node)
      }
      ts.forEachChild(node, besoekBeacon)
    }
    besoekBeacon(beacon!.body!)
    expect(konvolutter.length, `forventet nøyaktig 1 konvolutt med «kontekst» i sendFeilBeacon, fant ${konvolutter.length}`).toBe(1)

    for (const pr of konvolutter[0].properties) {
      const navn = ts.isPropertyAssignment(pr) || ts.isShorthandPropertyAssignment(pr)
        ? ts.isIdentifier(pr.name)
          ? pr.name.text
          : ts.isStringLiteral(pr.name)
            ? pr.name.text
            : null
        : null
      if (!navn || !KONVOLUTT_NOEKLER.has(navn)) {
        brudd.push({
          fil: relativ(fil),
          linje: linjeFor(sf, pr),
          melding: `konvolutten tar kun ${[...KONVOLUTT_NOEKLER].join('/')} — et diagnosefelt hører hjemme i kontekst-objektet (klient-whitelisten)`,
        })
        continue
      }
      if (navn === 'kontekst' && ts.isPropertyAssignment(pr)) {
        // De to lovlige spreadene er selv dekket: `diagnostikk()` av del 1
        // over, `ekstra` av sendFeilBeacon-kall-testen. Alle ANDRE spreads
        // (og alle computed keys) feiler som ellers.
        sjekkKontekstArgument(fil, sf, pr.initializer, KLIENT_WHITELIST, 'klient', brudd, {
          tillatteSpreads: new Set(['diagnostikk()', 'ekstra']),
        })
      }
    }

    expect(brudd, formaterBrudd(brudd)).toEqual([])
  })

  it('logg.warn(...) / logg.feil(...): alle nøkler (inkl. nøstet under ctx) står i server-whitelisten', () => {
    const brudd: Brudd[] = []
    for (const fil of ALLE_FILER) {
      const sf = parseFil(fil)
      // Ingen fil er unntatt — kun de navngitte spread-uttrykkene er det.
      const tillatteSpreads = TILLATTE_SPREADS.get(relativ(fil))

      const warnKall = finnKall(sf, (n) => erKallPaaProperty(n, 'logg', 'warn'))
      for (const k of warnKall) {
        sjekkKontekstArgument(fil, sf, k.arguments[1], SERVER_WHITELIST, 'server', brudd, { tillatteSpreads })
      }

      const feilKall = finnKall(sf, (n) => erKallPaaProperty(n, 'logg', 'feil'))
      for (const k of feilKall) {
        // Toppnivået her er opts, ikke konteksten: kun opts.ctx scrubbes.
        sjekkKontekstArgument(fil, sf, k.arguments[2], SERVER_WHITELIST, 'server', brudd, {
          toppnivaaTillatt: LOVLIGE_FEIL_OPTS,
          tillatteSpreads,
        })
      }
    }
    expect(brudd, formaterBrudd(brudd)).toEqual([])
  })
})
