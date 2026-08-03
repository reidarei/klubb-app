import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

// ---------------------------------------------------------------------------
// Egendefinert regel: supabase-feil-maa-hentes
// ---------------------------------------------------------------------------
// Regelen ligger inline her, ikke i en egen fil under scripts/ eller
// eslint-rules/. Grunnen er konkret: eslint.config.mjs speiles til klubb-app,
// mens scripts/ kun speiles for de få filene som står i SCAN_SCRIPTS i
// scripts/sync-klubb-app.mjs (#557) — en regelfil ville ikke vært blant dem, og
// importen hadde gitt rød lint i klubb-app. Samme felle som Sentry-configene
// falt i (#523).
//
// Arkitektur: regelen sporer BRUK, ikke syntaksform. I stedet for å lete
// etter «destrukturering med data uten error» ett skjema om gangen, spør den
// for enhver Supabase-spørring: «ble .error faktisk lest et sted?» — uansett
// hvordan resultatet endte opp i et navn. Det lukker en hel klasse blindsoner
// i ett grep i stedet for å jage former én etter én slik pulje A/B måtte
// rydde i etterkant.
//
// «Lest», ikke «hentet ut»: det holder ikke at nøkkelen `error` står i
// destruktureringen — bindingen må faktisk refereres. Uten det kravet slapp
// `const { data, error } = await …; return data` gjennom både denne regelen
// og no-unused-vars, og hele feilklassen kunne gjeninnføres uten at noe
// blokkerte. Destruktureringsstien og identifikator-stien stiller nå samme
// krav; før var kun sistnevnte streng.
//
// Gjenkjente skjemaer (alle deler samme to hjelpere: erSupabaseSpoerring for
// «er dette faktisk et Supabase-kall», og sjekkPattern/sjekkIdentifikatorbruk
// for «ble data brukt uten at error ble hentet»):
//   1. const x = await supabase.from(...)              (lagret, ikke destrukturert)
//      — senere brukt via x.data uten at x.error noensinne leses
//   2. const rader = (await supabase.from(...)).data     (umiddelbar aksess)
//   3. const [{ data: a }, { data: b }] = await Promise.all([...])
//      — korrelerer array-pattern-plasser med tilsvarende array-literal-elementer
//   4. const { data } = await (x ? qA : qB)               (ternær — og omvendt:
//      const { data } = x ? await qA : { data: [] }, se kaaringspoll-tiebreak)
//   5. let data; ({ data } = await supabase.from(...))    (reassignment)
//   6. let q = supabase.from(...); const { data } = await q  (lagret query-builder)
//   7. supabase.from(...).select().then(({ data }) => ...)   (uten await)
//   8. const { ['data']: d } = await ...                    (literal nøkkel)
//
// Aksepterte former som IKKE flagges (fail-closed på annen måte):
//   - `const { data } = res` der `res.error` er håndtert et annet sted —
//     vanlig refaktorering, ikke en svelget feil.
//   - `.throwOnError()` i kjeden — Supabase kaster da selv, så `data` kan
//     ikke bære en skjult feil.
//
// Kjente unøyaktigheter i `.from`-matchen (den ser kun på metodenavnet i
// kjeden, ikke på hva objektet foran faktisk er):
//   - `supabase.storage.from('bucket')` matcher som om det var en PostgREST-
//     spørring. Det er en FALSE POSITIVE, ikke en trygg retning å feile i —
//     ufarlig i dag (ingen storage-kall i kodebasen bruker `.data` uten
//     `.error`), men skriv en presis sjekk (indekssjekk mot `.storage`-leddet)
//     hvis den formen dukker opp. Pinnet i RuleTester-en.
//   - `Array.from(...)` traff samme sjekk og ble flagget når resultatet hadde
//     et `.data`-felt (mønsteret finnes i lib/queries/agenda.ts). Unntas
//     eksplisitt på objektnavnet `Array`. Også pinnet i RuleTester-en.
//   - Identifikator-sporing (skjema 1 og 6) krever at variabelen har akkurat
//     én definisjon (`variable.defs.length === 1`). Reassignments av samme
//     navn er OK (dekket), men gjenbruk av navnet i en annen scope/skygge vi
//     ikke klarer å skille fra, gir opp stille (false negative, ikke false
//     positive — trygg retning å feile i for en lint-regel).
//   - Kun array-literal som direkte argument til Promise.all(...) korreleres
//     (skjema 3). `Promise.all(dynamiskListe)` kan vi ikke statisk analysere.
//
// Auth-kall (`supabase.auth.getUser()`) er bevisst utenfor: de destrukturerer
// `data: { user }` og etterfølges nesten alltid av en null-sjekk som håndterer
// feilen implisitt. Regelen ser kun etter `.from()` og `.rpc()` i kjeden.
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

    // Finn variabelen `navn` er bundet til, sett fra scopet til `node`.
    function finnVariabel(scope, navn) {
      let s = scope
      while (s) {
        const v = s.variables.find(v => v.name === navn)
        if (v) return v
        s = s.upper
      }
      return null
    }

    // True hvis kjeden inneholder .from(...) eller .rpc(...) — altså en
    // PostgREST-spørring, ikke et auth- eller storage-kall. Følger kjeden
    // gjennom CallExpression/MemberExpression/AwaitExpression som før, men
    // løser i tillegg opp ConditionalExpression (skjema 4, begge retninger)
    // og enkle lokale identifikatorer (skjema 6 — lagret query-builder).
    //
    // `besokt` er en løkke-vakt: identifikator-oppslaget under følger
    // `def.node.init`, og gjensidig selvrefererende deklarasjoner
    // (`const a = b; const b = a`) fikk den til å sykle for alltid. tsc
    // avviser slik TDZ-kode så den kan aldri merges — men språkserveren
    // kjører regelen på hver tastetrykk-tilstand, og der var utfallet en
    // hengt editor uten feilmelding.
    function erSupabaseSpoerring(node, besokt = new Set()) {
      let n = node
      while (n) {
        if (besokt.has(n)) return false
        besokt.add(n)
        if (n.type === 'CallExpression') {
          const p = n.callee?.property
          // .throwOnError() er Supabase sitt eget fail-closed-idiom: feil
          // kastes i stedet for å returneres, så `data` kan aldri bære en
          // skjult feil. Å flagge den formen ville tvunget fram en
          // eslint-disable med begrunnelsen «bevisst fail-open» — altså en
          // løgn i akkurat det revisjonssporet regelen finnes for å beskytte.
          if (p?.type === 'Identifier' && p.name === 'throwOnError') return false
          if (p?.type === 'Identifier' && (p.name === 'from' || p.name === 'rpc')) {
            // Array.from(...) er ikke en Supabase-spørring. Uten dette
            // unntaket ble `const r = Array.from(x); return r.data` flagget
            // (mønsteret finnes i lib/queries/agenda.ts) — en false positive,
            // altså feil i den utrygge retningen for en lint-gate.
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
          // Ternær kan ha await på hele uttrykket ELLER på hver gren for seg
          // (se kaaringspoll/[id]/tiebreak/page.tsx) — sjekk begge grener.
          // Samme besokt-sett videre, så vakten holder på tvers av rekursjonen.
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

    // Navnet på en (evt. destrukturert) nøkkel — dekker både vanlig
    // `{ data }`/`{ data: x }` og literal-nøkkel-formen `{ ['data']: x }`
    // (skjema 8). Returnerer null for dynamiske nøkler vi ikke kan avgjøre.
    function noekkelNavn(property) {
      if (property.computed) {
        return property.key?.type === 'Literal' && typeof property.key.value === 'string'
          ? property.key.value
          : null
      }
      return property.key?.type === 'Identifier' ? property.key.name : null
    }

    // Samme idé for et MemberExpression-tilgangsledd (`x.data` / `x['data']`).
    function medlemNavn(member) {
      if (member.computed) {
        return member.property?.type === 'Literal' && typeof member.property.value === 'string'
          ? member.property.value
          : null
      }
      return member.property?.type === 'Identifier' ? member.property.name : null
    }

    // Den lokale bindingen en destrukturerings-property skaper. Dekker
    // `{ error }`, `{ error: feil }` og `{ error: feil = null }`. Returnerer
    // null for former vi ikke kan spore (nested pattern o.l.).
    function bindingFor(property) {
      let v = property.value
      if (v?.type === 'AssignmentPattern') v = v.left
      return v?.type === 'Identifier' ? v : null
    }

    // Slå opp scope-variabelen for en binding. `deklarasjonsnode` er noden
    // som deklarerer den (VariableDeclarator eller funksjon for .then-params);
    // reassignment-formen `({ data, error } = await …)` deklarerer ingenting,
    // og faller tilbake til vanlig scope-oppslag på navn.
    function finnBinding(identifikatorNode, deklarasjonsnode) {
      if (deklarasjonsnode) {
        const v = sourceCode
          .getDeclaredVariables(deklarasjonsnode)
          .find(v => v.identifiers.includes(identifikatorNode))
        if (v) return v
      }
      return finnVariabel(sourceCode.getScope(identifikatorNode), identifikatorNode.name)
    }

    // True hvis `error`-bindingen fra destruktureringen faktisk LESES et sted.
    // Uten denne sjekken passerte `const { data, error } = await … ; return data`
    // både denne regelen og no-unused-vars — hele feilklassen fra #492/#495/
    // #503/#504 kunne gjeninnføres uten at noe blokkerte, og regelens egen
    // feilmelding («Hent ut «error» …») ledet koderen rett til den formen.
    // Merk asymmetrien den lukker: identifikator-stien under har alltid krevd
    // at `.error` leses; destruktureringsstien krevde bare at nøkkelen fantes.
    function errorBindingLeses(property, deklarasjonsnode) {
      const binding = bindingFor(property)
      // Former vi ikke kan spore (nested destrukturering, ukjent scope) — vær
      // mild heller enn å flagge kode som kan være helt korrekt. En lint-gate
      // skal feile i retning false negative, ikke false positive.
      if (!binding) return true
      const variabel = finnBinding(binding, deklarasjonsnode)
      if (!variabel) return true
      return variabel.references.some(ref => ref.isRead())
    }

    // Flagg et ObjectPattern (destrukturering) som har `data` uten at `error`
    // både hentes ut OG leses. Brukt for både direkte destrukturering,
    // Promise.all-elementer, .then-callbacker og reassignment.
    function sjekkPattern(pattern, deklarasjonsnode) {
      if (pattern.type !== 'ObjectPattern') return
      let harData = false
      let errorProperty = null
      for (const p of pattern.properties) {
        if (p.type !== 'Property') continue // RestElement o.l. — irrelevant
        const navn = noekkelNavn(p)
        if (navn === 'data') harData = true
        if (navn === 'error') errorProperty = p
      }
      // Kun relevant når data faktisk brukes — `const { error } = await …`
      // alene er en fullt gyldig skrivning vi ikke skal mase om.
      if (!harData) return
      if (errorProperty && errorBindingLeses(errorProperty, deklarasjonsnode)) return
      context.report({ node: pattern, messageId: 'manglerError' })
    }

    // True hvis `.error` leses fra en lagret svar-variabel. Brukes både av
    // sjekkIdentifikatorBruk og av ObjectPattern-stien når init er en ren
    // identifikator (`const { data } = res`).
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

    // Flagg en lagret (ikke-destrukturert) variabel som brukes via `.data`
    // uten at `.error` noensinne leses fra samme variabel (skjema 1 og 6-i-
    // array). `deklarasjonsnode` sendes til getDeclaredVariables — kan være
    // en VariableDeclarator (dekker både enkle og array-pattern-tilfeller).
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

    // `Promise.all([...])` — kun gjenkjent som sådan når det faktisk kalles
    // på identifikatoren `Promise` (ingen lokal skygging sjekkes; teoretisk
    // hull, praktisk ufarlig).
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

    // `await x` → `x`, ellers uendret. Brukt til å se forbi et eventuelt
    // AwaitExpression rundt Promise.all(...)-kallet.
    function pakkUt(node) {
      return node.type === 'AwaitExpression' ? node.argument : node
    }

    return {
      VariableDeclarator(node) {
        if (!node.init) return

        // Skjema 3: Promise.all-destrukturering. Korrelerer array-pattern-
        // plassene 1:1 med array-literal-elementene — kun mulig når begge er
        // statisk synlige (ikke en dynamisk bygget liste).
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
          // `const { data } = res`, der `res` er et lagret svar hvis `.error`
          // allerede er håndtert — en naturlig refaktorering, ikke en svelget
          // feil. Merk avgrensningen: `const { data } = await q` (skjema 6)
          // faller IKKE hit, fordi init da er et AwaitExpression og `q` er en
          // query-builder — der kan error kun komme fra destruktureringen.
          if (node.init.type === 'Identifier' && errorLestPaaKilde(node.init)) return
          sjekkPattern(node.id, node)
        } else if (node.id.type === 'Identifier') {
          // Skjema 1: lagret svar uten destrukturering.
          sjekkIdentifikatorBruk(node, node.id)
        }
      },

      // Skjema 2: umiddelbar property-aksess — `(await supabase…).data`.
      // Error kan aldri hentes ut fra samme uttrykk her (det krever et nytt
      // nettverkskall), så dette flagges uten videre brukssjekk.
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
        // Ingen deklarasjonsnode — bindingene kommer fra en `let` lenger opp,
        // så errorBindingLeses faller tilbake til scope-oppslag.
        sjekkPattern(node.left, null)
      },

      // Skjema 7: `.then(({ data }) => …)` i stedet for await. Kjeden foran
      // .then er selve spørringen (ikke await-et — .then brukes nettopp i
      // stedet for await), så vi sjekker node.callee.object direkte.
      CallExpression(node) {
        if (node.callee.type !== 'MemberExpression') return
        if (node.callee.computed) return
        if (node.callee.property.name !== 'then') return
        if (!erSupabaseSpoerring(node.callee.object)) return
        const callback = node.arguments[0]
        if (!callback) return
        if (callback.type !== 'FunctionExpression' && callback.type !== 'ArrowFunctionExpression') return
        const param = callback.params[0]
        // Deklarasjonsnoden er selve callbacken — getDeclaredVariables på en
        // funksjon returnerer parameterbindingene.
        if (param?.type === 'ObjectPattern') sjekkPattern(param, callback)
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
    plugins: { hk: { rules: { 'supabase-feil-maa-hentes': supabaseFeilMaaHentes } } },
    rules: {
      // Gjeret er lukket (pulje C): 0 kjente forekomster gjenstår, og
      // regelen dekker nå bruk (ikke bare destruktureringssyntaks) — se
      // kommentaren over for hvilke skjemaer som er dekket. Står på «error»:
      // en ny svelget feil skal blokkere build, ikke bare varsle.
      'hk/supabase-feil-maa-hentes': 'error',
    },
  },
]

export default config

export { supabaseFeilMaaHentes }
