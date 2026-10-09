import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

// ---------------------------------------------------------------------------
// Egendefinert regel: supabase-feil-maa-hentes
// ---------------------------------------------------------------------------
// Inline, ikke egen fil: eslint.config.mjs speiles til klubb-app, men
// scripts/ gjør det ikke (#557) — en import ville gitt rød lint der (#523).
// Policyen: se CLAUDE.md § Policy: Databasespørringer.
//
// Sporer BRUK, ikke syntaksform: for hver Supabase-spørring spørres «ble
// error faktisk LEST?». Kun hentet ut er ikke nok — ellers slipper
// `const { data, error } = await …; return data` gjennom.
//
// Gjenkjente skjemaer:
//   1. const x = await supabase.from(...)  — brukt via x.data uten x.error
//   2. (await supabase.from(...)).data
//   3. const [{ data: a }, …] = await Promise.all([...])  (plass-korrelert)
//   4. ternær, med await rundt hele eller inni hver gren
//   5. ({ data } = await supabase.from(...))  (reassignment)
//   6. let q = supabase.from(...); const { data } = await q
//   7. supabase.from(...).then(({ data }) => ...)
//   8. const { ['data']: d } = await ...
//
// Godtas: `const { data } = res` når res.error leses et annet sted, og
// `.throwOnError()` i kjeden.
//
// Kjente unøyaktigheter (pinnet i RuleTester-en):
//   - `.from` matches på metodenavn: `supabase.storage.from()` gir FALSE
//     POSITIVE (ufarlig i dag; skriv en presis sjekk hvis formen dukker opp).
//     `Array.from(...)` er unntatt eksplisitt.
//   - Identifikator-sporing (1, 6) krever én definisjon, ellers gir den opp
//     stille (false negative).
//   - Kun array-literal i Promise.all korreleres, ikke dynamiske lister.
//   - Auth-kall er utenfor: kun `.from()`/`.rpc()` sjekkes.
const supabaseFeilMaaHentes = {
  meta: {
    type: 'problem',
    docs: { description: 'Krev at error hentes ut fra Supabase-spørringer' },
    schema: [],
    messages: {
      manglerError:
        'Hent ut «error» fra denne Supabase-spørringen. Uten den er «ingen rader» umulig å skille fra «spørringen feilet» — se CLAUDE.md § Policy: Databasespørringer. Er fail-open bevisst her, skriv en eslint-disable-next-line med begrunnelse.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode

    function finnVariabel(scope, navn) {
      let s = scope
      while (s) {
        const v = s.variables.find(v => v.name === navn)
        if (v) return v
        s = s.upper
      }
      return null
    }

    // True hvis kjeden inneholder .from(...)/.rpc(...). Løser opp ternær
    // (skjema 4) og enkle lokale identifikatorer (skjema 6).
    // `besokt` er løkke-vakt: `const a = b; const b = a` hengte editoren
    // (språkserveren kjører regelen også på kode tsc ville avvist).
    function erSupabaseSpoerring(node, besokt = new Set()) {
      let n = node
      while (n) {
        if (besokt.has(n)) return false
        besokt.add(n)
        if (n.type === 'CallExpression') {
          const p = n.callee?.property
          // Fail-closed allerede: å flagge den ville tvunget fram en
          // eslint-disable med en uriktig «bevisst fail-open»-begrunnelse.
          if (p?.type === 'Identifier' && p.name === 'throwOnError') return false
          if (p?.type === 'Identifier' && (p.name === 'from' || p.name === 'rpc')) {
            // Array.from(...) (finnes i lib/queries/agenda.ts) ga false positive.
            const obj = n.callee.object
            if (p.name === 'from' && obj?.type === 'Identifier' && obj.name === 'Array') return false
            return true
          }
          n = n.callee
        } else if (n.type === 'MemberExpression') {
          n = n.object
        } else if (n.type === 'AwaitExpression') {
          n = n.argument
        } else if (n.type === 'ConditionalExpression') {
          // Begge grener; samme besokt-sett så vakten holder i rekursjonen.
          return (
            erSupabaseSpoerring(n.consequent, besokt) || erSupabaseSpoerring(n.alternate, besokt)
          )
        } else if (n.type === 'Identifier') {
          const variable = finnVariabel(sourceCode.getScope(n), n.name)
          if (!variable || variable.defs.length !== 1) return false
          const def = variable.defs[0]
          if (def.type !== 'Variable' || !def.node.init) return false
          n = def.node.init
        } else {
          return false
        }
      }
      return false
    }

    // Nøkkelnavn i destrukturering, inkl. `{ ['data']: x }` (skjema 8).
    // null for dynamiske nøkler.
    function noekkelNavn(property) {
      if (property.computed) {
        return property.key?.type === 'Literal' && typeof property.key.value === 'string'
          ? property.key.value
          : null
      }
      return property.key?.type === 'Identifier' ? property.key.name : null
    }

    // Samme for `x.data` / `x['data']`.
    function medlemNavn(member) {
      if (member.computed) {
        return member.property?.type === 'Literal' && typeof member.property.value === 'string'
          ? member.property.value
          : null
      }
      return member.property?.type === 'Identifier' ? member.property.name : null
    }

    // Bindingen fra `{ error }`, `{ error: feil }` eller `{ error: feil = null }`;
    // null for nøstede mønstre.
    function bindingFor(property) {
      let v = property.value
      if (v?.type === 'AssignmentPattern') v = v.left
      return v?.type === 'Identifier' ? v : null
    }

    // `deklarasjonsnode` er deklarator eller .then-callback; reassignment har
    // ingen og faller tilbake til scope-oppslag på navn.
    function finnBinding(identifikatorNode, deklarasjonsnode) {
      if (deklarasjonsnode) {
        const v = sourceCode
          .getDeclaredVariables(deklarasjonsnode)
          .find(v => v.identifiers.includes(identifikatorNode))
        if (v) return v
      }
      return finnVariabel(sourceCode.getScope(identifikatorNode), identifikatorNode.name)
    }

    // True hvis `error`-bindingen faktisk LESES (feilklassen fra #492/#495/
    // #503/#504 — no-unused-vars fanger ikke `error` som bare hentes ut).
    function errorBindingLeses(property, deklarasjonsnode) {
      const binding = bindingFor(property)
      // Uklare former: vær mild — en lint-gate skal feile mot false negative.
      if (!binding) return true
      const variabel = finnBinding(binding, deklarasjonsnode)
      if (!variabel) return true
      return variabel.references.some(ref => ref.isRead())
    }

    // Flagg et ObjectPattern med `data` der `error` ikke både hentes ut og leses.
    function sjekkPattern(pattern, deklarasjonsnode) {
      if (pattern.type !== 'ObjectPattern') return
      let harData = false
      let errorProperty = null
      for (const p of pattern.properties) {
        if (p.type !== 'Property') continue // RestElement o.l.
        const navn = noekkelNavn(p)
        if (navn === 'data') harData = true
        if (navn === 'error') errorProperty = p
      }
      // `const { error } = await …` alene er gyldig.
      if (!harData) return
      if (errorProperty && errorBindingLeses(errorProperty, deklarasjonsnode)) return
      context.report({ node: pattern, messageId: 'manglerError' })
    }

    // True hvis `.error` leses fra en lagret svar-variabel (`const { data } = res`).
    function errorLestPaaKilde(identifikatorNode) {
      const variabel = finnVariabel(
        sourceCode.getScope(identifikatorNode),
        identifikatorNode.name,
      )
      if (!variabel) return false
      return variabel.references.some(ref => {
        if (ref.init) return false
        const parent = ref.identifier.parent
        return (
          parent?.type === 'MemberExpression' &&
          parent.object === ref.identifier &&
          medlemNavn(parent) === 'error'
        )
      })
    }

    // Flagg en lagret variabel brukt via `.data` uten at `.error` leses
    // (skjema 1, og Identifier-plasser i skjema 3).
    function sjekkIdentifikatorBruk(deklarasjonsnode, identifikatorNode) {
      const variabler = sourceCode.getDeclaredVariables(deklarasjonsnode)
      const variabel = variabler.find(v => v.identifiers.includes(identifikatorNode))
      if (!variabel) return
      let harData = false
      let harError = false
      for (const ref of variabel.references) {
        if (ref.init) continue // selve tilordningen, ikke en bruk
        const parent = ref.identifier.parent
        if (parent?.type === 'MemberExpression' && parent.object === ref.identifier) {
          const navn = medlemNavn(parent)
          if (navn === 'data') harData = true
          if (navn === 'error') harError = true
        }
      }
      if (harData && !harError) {
        context.report({ node: identifikatorNode, messageId: 'manglerError' })
      }
    }

    // Kun på identifikatoren `Promise` (lokal skygging sjekkes ikke).
    function erPromiseAll(node) {
      return (
        node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        !node.callee.computed &&
        node.callee.object.type === 'Identifier' &&
        node.callee.object.name === 'Promise' &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'all'
      )
    }

    function pakkUt(node) {
      return node.type === 'AwaitExpression' ? node.argument : node
    }

    return {
      VariableDeclarator(node) {
        if (!node.init) return

        // Skjema 3: plassene korreleres 1:1 med array-literal-elementene.
        const pakketUt = pakkUt(node.init)
        if (
          erPromiseAll(pakketUt) &&
          node.id.type === 'ArrayPattern' &&
          pakketUt.arguments[0]?.type === 'ArrayExpression'
        ) {
          const elementer = pakketUt.arguments[0].elements
          node.id.elements.forEach((patternEl, i) => {
            if (!patternEl) return // elision, f.eks. `[, b]`
            const exprEl = elementer[i]
            if (!exprEl || !erSupabaseSpoerring(exprEl)) return
            if (patternEl.type === 'ObjectPattern') sjekkPattern(patternEl, node)
            else if (patternEl.type === 'Identifier') sjekkIdentifikatorBruk(node, patternEl)
          })
          return
        }

        if (!erSupabaseSpoerring(node.init)) return

        if (node.id.type === 'ObjectPattern') {
          // `const { data } = res` der res.error er håndtert. Skjema 6
          // (`await q`) faller ikke hit — der kan error kun komme herfra.
          if (node.init.type === 'Identifier' && errorLestPaaKilde(node.init)) return
          sjekkPattern(node.id, node)
        } else if (node.id.type === 'Identifier') {
          // Skjema 1: lagret svar uten destrukturering.
          sjekkIdentifikatorBruk(node, node.id)
        }
      },

      // Skjema 2: error kan aldri leses fra samme uttrykk — flagges direkte.
      MemberExpression(node) {
        if (node.object.type !== 'AwaitExpression') return
        if (!erSupabaseSpoerring(node.object.argument)) return
        if (medlemNavn(node) === 'data') {
          context.report({ node, messageId: 'manglerError' })
        }
      },

      // Skjema 5: reassignment — `({ data } = await supabase…)`.
      AssignmentExpression(node) {
        if (node.left.type !== 'ObjectPattern') return
        if (node.right.type !== 'AwaitExpression') return
        if (!erSupabaseSpoerring(node.right.argument)) return
        sjekkPattern(node.left, null)
      },

      // Skjema 7: `.then(({ data }) => …)` — kjeden foran .then er spørringen.
      CallExpression(node) {
        if (node.callee.type !== 'MemberExpression') return
        if (node.callee.computed) return
        if (node.callee.property.name !== 'then') return
        if (!erSupabaseSpoerring(node.callee.object)) return
        const callback = node.arguments[0]
        if (!callback) return
        if (callback.type !== 'FunctionExpression' && callback.type !== 'ArrowFunctionExpression') return
        const param = callback.params[0]
        // getDeclaredVariables på callbacken gir parameterbindingene.
        if (param?.type === 'ObjectPattern') sjekkPattern(param, callback)
      },
    }
  },
}


// ---------------------------------------------------------------------------
// Egendefinert regel: dato-tidssone-uavhengig (#675)
// ---------------------------------------------------------------------------
// Inline av samme grunn som regelen over. Bakgrunn og de to Date-betydningene
// (Oslo-kalenderdag som lokal Date vs. instant): se CLAUDE.md § Policy:
// Tidshåndtering.
//
// Én felles taint-hjelper (finnKilde) med lokal propagering: én-definisjons-
// variabler, new Date(<tainted>) og første argument til DATO_PROPAGERENDE.
//
//   Sjekk 1 — toISOString() på norskDatoNaa()/norskDag() (kun callee-navn).
//   Sjekk 2 — null-argument new Date().toISOString() kappet til KALENDERDAG
//     (slice/substring(0, N≤10), split('T')[0]). Argumentene sjekkes:
//     .slice(11, 19) og .split('.') er legitime instant-operasjoner, og et
//     falskt treff på en «error»-regel blir slått av, ikke rettet.
//   Sjekk 3 — null-argument new Date() mutert med set*. new Date(x) MED
//     argument er aldri kilde (`cursor = new Date(start)` er trygt).
//   Sjekk 4 — ÉN-hopps taint gjennom en lokal hjelpers parameter (#674-formen:
//     dagStreng(addDays(norskDatoNaa(), n))). Pass 1 noterer hvilke parametere
//     en funksjon behandler som instant; Program:exit sjekker kallstedene, så
//     også hjelpere definert under kallstedet fanges. Rapporteres på KALLSTEDET.
//
// Blindsoner:
//   a) Mer enn ett hopp (A → B → toISOString()).
//   b) Hjelpere importert fra en annen fil (ingen typeinfo).
//   c) Parametere som skrives om i kroppen (d = …) — bevisst.
//   d) Destrukturerte og rest-parametere — ingen stabil posisjon.
//   e) Andre kilder enn de tre kjente (Date fra objekt, annen fil).
// Svaret på et treff er «bruk lib/dato.ts», ikke «ikke skriv toISOString()».
const datoTidssoneUavhengig = {
  meta: {
    type: 'problem',
    docs: { description: 'Forby tidssone-avhengige Date-mønstre (#675)' },
    schema: [],
    messages: {
      isoPaaOsloDag:
        'norskDatoNaa()/norskDag() gir en Date på LOKAL midnatt for en norsk kalenderdag. toISOString() på den gir UTC-instantet for lokal midnatt — riktig kun når prosessen står i UTC. Bruk osloDagPluss() eller osloDagStartIso() fra lib/dato.ts. Se CLAUDE.md § Policy: Tidshåndtering.',
      utcDagstreng:
        'new Date().toISOString() gir UTC-datoen, ikke den norske. Bruk iDagOslo() fra lib/dato.ts.',
      naaMutertLokalt:
        'Å bygge en kalenderdag ved å mutere new Date() regner i prosessens tidssone. Bruk osloDagPluss(n) fra lib/dato.ts (+ datetimeLocalTilIso() hvis du trenger et tidspunkt).',
      hjelperTaintet:
        'Hjelperen du kaller behandler dette argumentet som et INSTANT (toISOString() eller lokal mutering i kroppen), men du sender inn en norsk kalenderdag eller new Date(). Dette er #674-formen: dagStreng(addDays(norskDatoNaa(), n)). Ikke skriv en lokal dato-hjelper — bruk osloDagPluss()/osloDagStartIso() fra lib/dato.ts. Se CLAUDE.md § Policy: Tidshåndtering.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode

    function finnVariabel(scope, navn) {
      let s = scope
      while (s) {
        const v = s.variables.find(v => v.name === navn)
        if (v) return v
        s = s.upper
      }
      return null
    }

    // date-fns-funksjoner der resultatet er tainted nøyaktig som 1. argument.
    const DATO_PROPAGERENDE = new Set([
      'addDays', 'subDays', 'startOfDay', 'endOfDay', 'addMonths', 'subMonths',
    ])

    // Følger `node` bakover og returnerer første ikke-null svar fra `kildeAv`
    // (sjekk 4 trenger å vite HVILKEN kilde). Null-argument new Date() er
    // alltid kilde, aldri wrapper. `besokt`: løkke-vakt, se regelen over.
    function finnKilde(node, kildeAv, besokt = new Set()) {
      let n = node
      while (n) {
        if (besokt.has(n)) return null
        besokt.add(n)
        const treff = kildeAv(n)
        if (treff) return treff
        if (n.type === 'Identifier') {
          const variable = finnVariabel(sourceCode.getScope(n), n.name)
          if (!variable || variable.defs.length !== 1) return null
          const def = variable.defs[0]
          if (def.type !== 'Variable' || !def.node.init) return null
          n = def.node.init
        } else if (
          n.type === 'NewExpression' &&
          n.callee.type === 'Identifier' &&
          n.callee.name === 'Date' &&
          n.arguments.length === 1
        ) {
          n = n.arguments[0]
        } else if (
          n.type === 'CallExpression' &&
          n.callee.type === 'Identifier' &&
          DATO_PROPAGERENDE.has(n.callee.name) &&
          n.arguments.length > 0
        ) {
          n = n.arguments[0]
        } else {
          return null
        }
      }
      return null
    }

    // Ja/nei-form for sjekk 1–3.
    function erTaintet(node, erKilde) {
      return finnKilde(node, n => (erKilde(n) ? true : null)) === true
    }

    function erOsloKalenderdagKilde(node) {
      return (
        node.type === 'CallExpression' &&
        node.callee.type === 'Identifier' &&
        (node.callee.name === 'norskDatoNaa' || node.callee.name === 'norskDag')
      )
    }

    function erNullArgNewDateKilde(node) {
      return (
        node.type === 'NewExpression' &&
        node.callee.type === 'Identifier' &&
        node.callee.name === 'Date' &&
        node.arguments.length === 0
      )
    }

    // Sjekk 2: følges toISOString() umiddelbart av et daguttrekk? N kan være
    // 1–10: år og måned er like tidssone-følsomme som dagen.
    const DAG_KAPPE_METODER = new Set(['slice', 'substring', 'split'])

    function erTallLiteral(node, godtar) {
      return !!node && node.type === 'Literal' && typeof node.value === 'number' && godtar(node.value)
    }

    function erDagKapping(metode, kall) {
      const args = kall.arguments
      if (metode === 'slice' || metode === 'substring') {
        return (
          args.length === 2 &&
          erTallLiteral(args[0], v => v === 0) &&
          erTallLiteral(args[1], v => v >= 1 && v <= 10)
        )
      }
      // Kun split('T')[0] — [1] er klokkeslettet.
      if (args.length < 1 || args[0].type !== 'Literal' || args[0].value !== 'T') return false
      const indeks = kall.parent
      return (
        !!indeks &&
        indeks.type === 'MemberExpression' &&
        indeks.object === kall &&
        indeks.computed &&
        erTallLiteral(indeks.property, v => v === 0)
      )
    }

    function harDagKappingEtterpaa(toISOStringKallNode) {
      const parent = toISOStringKallNode.parent
      if (!parent || parent.type !== 'MemberExpression') return false
      if (parent.object !== toISOStringKallNode || parent.computed) return false
      if (parent.property.type !== 'Identifier' || !DAG_KAPPE_METODER.has(parent.property.name)) return false
      const kall = parent.parent
      if (!kall || kall.type !== 'CallExpression' || kall.callee !== parent) return false
      return erDagKapping(parent.property.name, kall)
    }

    const MUTASJONS_METODER = new Set(['setHours', 'setDate', 'setMonth', 'setFullYear', 'setMinutes'])

    // ── Sjekk 4 ──────────────────────────────────────────────────────────────
    // paramBruk: funksjonsnode → parameterposisjoner kroppen behandler som instant.
    const paramBruk = new Map()
    const kallsteder = []

    // En identifikator som refererer en parameter → { fn, posisjon }.
    function parameterKilde(n) {
      if (n.type !== 'Identifier') return null
      const variable = finnVariabel(sourceCode.getScope(n), n.name)
      if (!variable || variable.defs.length !== 1) return null
      const def = variable.defs[0]
      if (def.type !== 'Parameter') return null
      // Blindsone c
      if (variable.references.some(r => r.isWrite())) return null
      // indexOf gir -1 for destrukturerte og rest-parametere (blindsone d).
      const posisjon = def.node.params.indexOf(def.name)
      if (posisjon < 0) return null
      return { fn: def.node, posisjon }
    }

    function noterParamBruk(objektNode, slag) {
      const treff = finnKilde(objektNode, parameterKilde)
      if (!treff) return
      let bruk = paramBruk.get(treff.fn)
      if (!bruk) {
        bruk = { iso: new Set(), isoDag: new Set(), mutert: new Set() }
        paramBruk.set(treff.fn, bruk)
      }
      bruk[slag].add(treff.posisjon)
    }

    // Callee → funksjonsnode for LOKALE hjelpere. Importer faller ut (blindsone b).
    function lokalFunksjon(kall) {
      const variable = finnVariabel(sourceCode.getScope(kall), kall.callee.name)
      if (!variable || variable.defs.length !== 1) return null
      const def = variable.defs[0]
      if (def.type === 'FunctionName') return def.node
      if (
        def.type === 'Variable' &&
        def.node.init &&
        (def.node.init.type === 'ArrowFunctionExpression' || def.node.init.type === 'FunctionExpression')
      ) {
        return def.node.init
      }
      return null
    }

    return {
      CallExpression(node) {
        // Potensielle hjelper-kallsteder, til pass 2.
        if (node.callee.type === 'Identifier') {
          kallsteder.push(node)
          return
        }
        if (node.callee.type !== 'MemberExpression' || node.callee.computed) return
        if (node.callee.property.type !== 'Identifier') return
        const metode = node.callee.property.name

        if (metode === 'toISOString') {
          const dagKapping = harDagKappingEtterpaa(node)
          // Pass 1 for sjekk 4 — noteres uansett: hjelperen er bare gal for
          // feil argument.
          noterParamBruk(node.callee.object, 'iso')
          if (dagKapping) noterParamBruk(node.callee.object, 'isoDag')
          if (erTaintet(node.callee.object, erOsloKalenderdagKilde)) {
            context.report({ node, messageId: 'isoPaaOsloDag' })
            return
          }
          if (dagKapping && erTaintet(node.callee.object, erNullArgNewDateKilde)) {
            context.report({ node, messageId: 'utcDagstreng' })
          }
          return
        }

        if (MUTASJONS_METODER.has(metode)) {
          noterParamBruk(node.callee.object, 'mutert')
          if (erTaintet(node.callee.object, erNullArgNewDateKilde)) {
            context.report({ node, messageId: 'naaMutertLokalt' })
          }
        }
      },

      // Pass 2 for sjekk 4 — først nå kjenner vi alle funksjonene i fila.
      'Program:exit'() {
        for (const kall of kallsteder) {
          const fn = lokalFunksjon(kall)
          if (!fn) continue
          const bruk = paramBruk.get(fn)
          if (!bruk) continue
          for (let i = 0; i < kall.arguments.length; i++) {
            const arg = kall.arguments[i]
            // Spread forskyver posisjonene etter seg.
            if (arg.type === 'SpreadElement') break
            const farlig =
              (bruk.iso.has(i) && erTaintet(arg, erOsloKalenderdagKilde)) ||
              ((bruk.isoDag.has(i) || bruk.mutert.has(i)) && erTaintet(arg, erNullArgNewDateKilde))
            if (farlig) {
              context.report({ node: kall, messageId: 'hjelperTaintet' })
              break
            }
          }
        }
      },
    }
  },
}

// ---------------------------------------------------------------------------
// Egendefinert regel: supabase-mutasjon-maa-sjekkes (#760)
// ---------------------------------------------------------------------------
// Det tilstøtende hullet til regelen over, som sporer KONSUMERT data: en ren
// mutasjon der hele resultatet forkastes har ingen data å henge seg på.
// Egen regel fordi de sporer ulike ting. Inline av samme grunn. Policyen: se
// CLAUDE.md § Policy: Databasespørringer.
//
// Mutasjonskjede = `.from(...)` + insert/update/upsert/delete, eller `.rpc(...)`
// (RPC-ene våre er tilstandsendrende). Fire former:
//   1. Forkastet kjede som egen setning. Ender den i `.then(cb)`, godtas den
//      kun hvis cb leser error.
//   2. Destrukturering der `error` ikke LESES (`{ count }`, ubrukt `{ error }`,
//      `{ error: _error }` som no-unused-vars slipper forbi).
//   3. Promise.all/allSettled med array-literal: forkastet ⇒ hvert element
//      vurderes alene; destrukturert ⇒ plass-korrelert som skjema 3 over.
//      Identifier-plass godtas (falsk negativ), manglende plass/elision er
//      forkastet, allSettled godtar enhver bundet plass ({ status, value }).
//   4. Reassignment `({ error } = await …)` — samme krav som 2.
// Har mønsteret en `data`-nøkkel, er saken regel 1 sin (ingen dobbeltrapport).
//
// Kjeden analyseres BEVISST uten identifikator-oppslag (motsatt av regelen
// over): en lagret query-builder awaitet i en senere setning
// (`const q = admin.from('x').delete(); … await q.eq(...)`, se
// lib/actions/posisjon-opprydding.ts) ville ellers gitt falskt treff.
//
// Godtas: `.throwOnError()` i kjeden, `error` som faktisk leses (destrukturering
// eller .then-callback), og `eslint-disable-next-line` med begrunnelse.
// Avsluttende `.catch()`/`.finally()` skrelles av og endrer ingenting —
// Supabase-feil ligger i resultatet, aldri som rejection.
//
// Blindsoner (falske negativer, bevisst — en «error»-regel som gjetter blir slått av):
//   - `const res = await …delete()` — om res.error sjekkes avgjøres i et
//     annet scope (`return res`, `haandter(res)`).
//   - Kjede sendt som argument til en hjelper (ingen kallgraf på tvers).
//   - `Promise.all(liste)` med dynamisk liste.
//   - Nøstet `{ error: { message } }` godtas uten lesesjekk.
//   - `.from` matches på metodenavn, med samme `Array.from`-unntak som over.
const MUTASJON_VERB = new Set(['insert', 'update', 'upsert', 'delete'])

const supabaseMutasjonMaaSjekkes = {
  meta: {
    type: 'problem',
    docs: { description: 'Krev at en forkastet Supabase-mutasjon sjekkes eller bevisst unntas (#760)' },
    schema: [],
    messages: {
      forkastetMutasjon:
        'Denne Supabase-mutasjonen forkaster hele resultatet uten å lese «error». Feiler den stille, er tilstandsendringen tapt uten spor — se CLAUDE.md § Policy: Databasespørringer. Les error (if (error) throw error), la kjeden kaste med .throwOnError(), eller skriv en eslint-disable-next-line med begrunnelse hvis stillheten er bevisst.',
    },
  },
  create(context) {
    // Går kjeden bakover og noterer ingrediensene. Ingen identifikator-
    // oppslag, se regelhodet.
    function analyserKjede(node) {
      let n = node
      let harFra = false
      let harVerb = false
      let harRpc = false
      let harThrowOnError = false
      while (n) {
        if (n.type === 'CallExpression') {
          const p = n.callee?.property
          if (p?.type === 'Identifier') {
            if (p.name === 'throwOnError') {
              harThrowOnError = true
            } else if (p.name === 'from') {
              const obj = n.callee.object
              if (!(obj?.type === 'Identifier' && obj.name === 'Array')) harFra = true
            } else if (p.name === 'rpc') {
              harRpc = true
            } else if (MUTASJON_VERB.has(p.name)) {
              harVerb = true
            }
          }
          n = n.callee
        } else if (n.type === 'MemberExpression') {
          n = n.object
        } else if (n.type === 'TSNonNullExpression') {
          n = n.expression
        } else {
          break
        }
      }
      return { harFra, harVerb, harRpc, harThrowOnError }
    }

    function erMutasjonskjede({ harFra, harVerb, harRpc }) {
      return (harFra && harVerb) || harRpc
    }

    // Pakk av await/void/«!» på ytterste nivå. «!» midt i kjeden tas av
    // analyserKjede.
    function pakkYtreNivaa(node) {
      let n = node
      while (true) {
        if (n.type === 'AwaitExpression') {
          n = n.argument
        } else if (n.type === 'UnaryExpression' && n.operator === 'void') {
          n = n.argument
        } else if (n.type === 'TSNonNullExpression') {
          n = n.expression
        } else {
          break
        }
      }
      return n
    }

    // Duplisert fra regelen over med vilje: ingen delt modul (speiles til klubb-app).
    function noekkelNavn(property) {
      if (property.computed) {
        return property.key?.type === 'Literal' && typeof property.key.value === 'string'
          ? property.key.value
          : null
      }
      return property.key?.type === 'Identifier' ? property.key.name : null
    }

    function kallNavn(node) {
      if (node?.type !== 'CallExpression') return null
      const c = node.callee
      if (c.type !== 'MemberExpression' || c.computed || c.property.type !== 'Identifier') return null
      return c.property.name
    }

    // Ble `error` faktisk LEST? Nøkkelen alene holder ikke (`{ error: _error }`).
    function errorLestIPattern(pattern, deklarasjonsnode) {
      for (const p of pattern.properties) {
        if (p.type !== 'Property' || noekkelNavn(p) !== 'error') continue
        let v = p.value
        if (v?.type === 'AssignmentPattern') v = v.left
        // Nøstet: vær mild (false negative er trygg retning).
        if (v?.type !== 'Identifier') return true
        const variabel = finnBinding(v, deklarasjonsnode)
        if (!variabel) return true
        return variabel.references.some(ref => ref.isRead())
      }
      return false
    }

    // Uten deklarasjonsnode (reassignment): via scope-kjeden.
    function finnBinding(identifikator, deklarasjonsnode) {
      if (deklarasjonsnode) {
        const v = context.sourceCode
          .getDeclaredVariables(deklarasjonsnode)
          .find(x => x.identifiers.includes(identifikator))
        if (v) return v
      }
      for (let sc = context.sourceCode.getScope(identifikator); sc; sc = sc.upper) {
        const v = sc.set.get(identifikator.name)
        if (v) return v
      }
      return null
    }

    // Godtatt hvis mønsteret har data (regel 1 sin sak) eller leser error.
    function patternHaandtererFeil(pattern, deklarasjonsnode) {
      if (pattern.properties.some(p => p.type === 'Property' && noekkelNavn(p) === 'data')) return true
      return errorLestIPattern(pattern, deklarasjonsnode)
    }

    // Godtatt: `({ error }) => …` (lest) eller `res => … res.error`. En
    // funksjonsreferanse vi ikke ser inn i regnes som forkastet.
    function thenLeserError(thenKall) {
      const cb = thenKall.arguments[0]
      if (!cb || (cb.type !== 'ArrowFunctionExpression' && cb.type !== 'FunctionExpression')) return false
      const param = cb.params[0]
      if (!param) return false
      if (param.type === 'ObjectPattern') {
        if (param.properties.some(p => p.type === 'Property' && noekkelNavn(p) === 'data')) return true
        return errorLestIPattern(param, cb)
      }
      if (param.type !== 'Identifier') return false
      const variabel = context.sourceCode.getDeclaredVariables(cb).find(x => x.identifiers.includes(param))
      if (!variabel) return false
      return variabel.references.some(ref => {
        const parent = ref.identifier.parent
        if (parent?.type !== 'MemberExpression' || parent.object !== ref.identifier) return false
        const navn = parent.computed
          ? (parent.property.type === 'Literal' ? parent.property.value : null)
          : parent.property.name
        return navn === 'error'
      })
    }

    // Felles for form 1 og Promise.all-elementene.
    function forkastetMutasjonUtenSjekk(uttrykk) {
      let expr = pakkYtreNivaa(uttrykk)
      if (expr.type !== 'CallExpression') return false
      while (kallNavn(expr) === 'catch' || kallNavn(expr) === 'finally') {
        expr = expr.callee.object
      }
      const kjede = analyserKjede(expr)
      if (kjede.harThrowOnError) return false
      // Ikke-mutasjoner (.select().then(…)) er regel 1s domene.
      if (!erMutasjonskjede(kjede)) return false
      if (kallNavn(expr) === 'then' && thenLeserError(expr)) return false
      return true
    }

    // Promise.all/allSettled med array-literal → { settled, elementer }.
    function promiseAllListe(node) {
      if (node?.type !== 'CallExpression') return null
      const c = node.callee
      if (c.type !== 'MemberExpression' || c.computed) return null
      if (c.object.type !== 'Identifier' || c.object.name !== 'Promise') return null
      if (c.property.type !== 'Identifier') return null
      if (c.property.name !== 'all' && c.property.name !== 'allSettled') return null
      const liste = node.arguments[0]
      if (liste?.type !== 'ArrayExpression') return null
      return { settled: c.property.name === 'allSettled', elementer: liste.elements }
    }

    return {
      // Form 1 (og 3 når Promise.all forkastes).
      ExpressionStatement(node) {
        let ytre = pakkYtreNivaa(node.expression)
        while (kallNavn(ytre) === 'catch' || kallNavn(ytre) === 'finally') {
          ytre = ytre.callee.object
        }
        const alle = promiseAllListe(ytre)
        if (alle) {
          for (const el of alle.elementer) {
            if (el && el.type !== 'SpreadElement' && forkastetMutasjonUtenSjekk(el)) {
              context.report({ node: el, messageId: 'forkastetMutasjon' })
            }
          }
          return
        }
        if (forkastetMutasjonUtenSjekk(node.expression)) {
          context.report({ node, messageId: 'forkastetMutasjon' })
        }
      },

      VariableDeclarator(node) {
        if (!node.init) return
        const init = pakkYtreNivaa(node.init)

        // Form 3, destrukturert.
        const alle = node.id.type === 'ArrayPattern' ? promiseAllListe(init) : null
        if (alle) {
          // Plassene fra og med et RestElement er bundet (til resten-lista).
          const rest = node.id.elements.findIndex(p => p?.type === 'RestElement')
          alle.elementer.forEach((el, i) => {
            if (!el || el.type === 'SpreadElement') return
            if (!forkastetMutasjonUtenSjekk(el)) return
            if (rest !== -1 && i >= rest) return
            let plass = node.id.elements[i]
            if (plass?.type === 'AssignmentPattern') plass = plass.left
            if (!plass) {
              context.report({ node: el, messageId: 'forkastetMutasjon' })
              return
            }
            if (alle.settled) return
            // Identifier: `a.error` følges ikke (falsk negativ).
            if (plass.type !== 'ObjectPattern') return
            if (patternHaandtererFeil(plass, node)) return
            context.report({ node: el, messageId: 'forkastetMutasjon' })
          })
          return
        }

        // Form 2
        if (node.id.type !== 'ObjectPattern') return
        if (init.type !== 'CallExpression') return
        const kjede = analyserKjede(init)
        if (kjede.harThrowOnError) return
        if (!erMutasjonskjede(kjede)) return
        if (patternHaandtererFeil(node.id, node)) return
        context.report({ node, messageId: 'forkastetMutasjon' })
      },

      // Form 4
      AssignmentExpression(node) {
        if (node.operator !== '=' || node.left.type !== 'ObjectPattern') return
        const hoeyre = pakkYtreNivaa(node.right)
        if (hoeyre.type !== 'CallExpression') return
        const kjede = analyserKjede(hoeyre)
        if (kjede.harThrowOnError) return
        if (!erMutasjonskjede(kjede)) return
        if (patternHaandtererFeil(node.left, null)) return
        context.report({ node, messageId: 'forkastetMutasjon' })
      },
    }
  },
}

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'out/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'lib/supabase/database.types.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals'),
  {
    plugins: {
      hk: {
        rules: {
          'supabase-feil-maa-hentes': supabaseFeilMaaHentes,
          'dato-tidssone-uavhengig': datoTidssoneUavhengig,
          'supabase-mutasjon-maa-sjekkes': supabaseMutasjonMaaSjekkes,
        },
      },
    },
    rules: {
      // De tre hk-reglene står på «error» med 0 kjente treff: et nytt treff
      // skal blokkere, ikke bare varsle.
      'hk/supabase-feil-maa-hentes': 'error',
      'hk/dato-tidssone-uavhengig': 'error',
      'hk/supabase-mutasjon-maa-sjekkes': 'error',
      // eslint-config-next slår ikke på denne (#566).
      // args: 'none' — ubrukte argumenter er legitime i mock-signaturer.
      // varsIgnorePattern '^_' — etablert måte å si «med vilje».
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
    },
  },
]

export default config

export { supabaseFeilMaaHentes, datoTidssoneUavhengig, supabaseMutasjonMaaSjekkes }
