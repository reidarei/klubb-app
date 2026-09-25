// Pinner selve ESLint-regelen hk/supabase-mutasjon-maa-sjekkes (eslint.config.mjs)
// — det tilstøtende hullet til hk/supabase-feil-maa-hentes: en Supabase-
// mutasjon der HELE resultatet forkastes (ingen .select(), ingen
// destrukturering) har ingen `data` å henge en sjekk på, så den andre
// regelen kan aldri se den. Se filhode-kommentaren i eslint.config.mjs (#760).
//
// RuleTester bruker som default globale describe/it (mocha-stil) — wiret
// eksplisitt til vitest sine, som i eslint-supabase-feil-maa-hentes.test.ts.
import { describe, it } from 'vitest'
import { RuleTester, type Rule } from 'eslint'
import tsParser from '@typescript-eslint/parser'
import { supabaseMutasjonMaaSjekkes } from '../eslint.config.mjs'

RuleTester.describe = describe
RuleTester.it = it

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    // TS-parser kreves for non-null assertion (`admin!`) i én av testene
    // under — default espree-parseren avviser `!` som en syntaksfeil.
    parser: tsParser,
  },
})

// eslint.config.mjs er ren JS (speiles til klubb-app) — `meta.type` inferes
// som `string`, ikke det strengere literal-unionen RuleTester forventer.
// Casten er trygg: verdien er faktisk 'problem'. Samme mønster som i
// eslint-supabase-feil-maa-hentes.test.ts.
ruleTester.run('supabase-mutasjon-maa-sjekkes', supabaseMutasjonMaaSjekkes as Rule.RuleModule, {
  valid: [
    // .throwOnError() — Supabase kaster selv, stillhet er umulig.
    `async function f() {
       await supabase.from('x').delete().eq('id', 1).throwOnError()
     }`,
    // error hentes ut og kan leses videre — feilen er håndtert.
    `async function f() {
       const { error } = await supabase.from('x').delete()
       if (error) throw error
     }`,
    // data OG error destrukturert — regel 1 sin sak, ikke denne.
    `async function f() {
       const { data, error } = await supabase.from('x').insert({}).select()
       if (error) throw error
       return data
     }`,
    // .select().then(...) med data/error i callback-patternet, som
    // ExpressionStatement — regel 1s domene (useChatReaksjoner.ts ~:40).
    `function f() {
       supabase.from('x').select().then(({ data, error }) => { if (error) throw error; return data })
     }`,
    // Lagret query-builder som awaites i en senere, separat setning —
    // mutasjonsverbet står på en annen setning enn feilsjekken (samme
    // mønster som lib/actions/posisjon-opprydding.ts ~:78).
    `async function f() {
       const q = admin.from('x').delete()
       const { error } = await q.eq('id', 1)
       if (error) throw error
     }`,
    // Array.from(...) er ikke en Supabase-spørring, selv om metodenavnet i
    // kjeden er «.from» — samme unntak som i supabaseFeilMaaHentes.
    `function f(x) { Array.from(x).update({}) }`,
    // Vanlig kode uten noen Supabase-kjede i det hele tatt.
    `async function f() { const x = 1; console.log(x); }`,
    // Ren select — ikke en mutasjon, skal aldri fyre uansett form.
    `async function f() { const { data, error } = await supabase.from('x').select(); if (error) throw error; return data }`,
    // Mutasjon med .then() som faktisk leser error — destrukturert.
    `function f() {
       supabase.from('x').delete().eq('id', 1).then(({ error }) => { if (error) throw error })
     }`,
    // Samme, som identifikator-parameter som leser res.error.
    `function f() {
       supabase.from('x').delete().then(res => { if (res.error) logg(res.error) })
     }`,
    // Avsluttende .catch() etter en then som leser error — catch-en endrer
    // ikke saken, then-en er feilhåndteringen.
    `function f() {
       supabase.rpc('f').then(({ error }) => { if (error) logg(error) }).catch(() => {})
     }`,
    // error lest via omdøpt binding.
    `async function f() {
       const { error: feil } = await supabase.from('x').update({}).eq('id', 1)
       if (feil) throw feil
     }`,
    // Promise.all som egen setning der hvert mutasjonselement har
    // .throwOnError() eller en then som leser error.
    `async function f() {
       await Promise.all([
         supabase.from('x').delete().eq('id', 1).throwOnError(),
         supabase.rpc('f').then(({ error }) => { if (error) throw error }),
         supabase.from('y').select(),
       ])
     }`,
    // Promise.all destrukturert — error lest på hver plass.
    `async function f() {
       const [{ error: e1 }, { error: e2 }] = await Promise.all([
         supabase.from('x').delete(),
         supabase.from('y').update({}).eq('id', 1),
       ])
       if (e1 || e2) throw e1 ?? e2
     }`,
    // Identifier-plass godtas (vi følger ikke a.error videre — falsk negativ).
    `async function f() {
       const [a, b] = await Promise.all([supabase.from('x').delete(), supabase.rpc('f')])
       return [a, b]
     }`,
    // Rest-plass binder resten.
    `async function f() {
       const [...alle] = await Promise.all([supabase.from('x').delete(), supabase.rpc('f')])
       return alle
     }`,
    // allSettled destrukturert — verdien er { status, value }, enhver binding godtas.
    `async function f() {
       const [{ status }] = await Promise.allSettled([supabase.from('x').delete()])
       return status
     }`,
    // Reassignment der error faktisk leses.
    `async function f() {
       let error
       ;({ error } = await supabase.from('x').delete().eq('id', 1))
       if (error) throw error
     }`,
    // Reassignment med data — regel 1 sin sak.
    `async function f() {
       let data, error
       ;({ data, error } = await supabase.from('x').insert({}).select())
       if (error) throw error
       return data
     }`,
    // Reassignment av ren select — ikke en mutasjon.
    `async function f() {
       let count
       ;({ count } = await supabase.from('x').select('*', { count: 'exact' }))
       return count
     }`,
  ],
  invalid: [
    // Promise.all som egen setning — hvert mutasjonselement uten sjekk flagges,
    // select-elementet og throwOnError-elementet ikke.
    {
      code: `async function f() {
        await Promise.all([
          supabase.from('x').delete().eq('id', 1),
          supabase.from('y').select(),
          supabase.rpc('f'),
          supabase.from('z').update({}).throwOnError(),
        ])
      }`,
      errors: [{ messageId: 'forkastetMutasjon', line: 3 }, { messageId: 'forkastetMutasjon', line: 5 }],
    },
    // allSettled som egen setning, med avsluttende .catch() på lista.
    {
      code: `async function f() { await Promise.allSettled([supabase.from('x').delete()]).catch(() => {}) }`,
      errors: [{ messageId: 'forkastetMutasjon' }],
    },
    // Element med .catch() alene — catch fanger aldri en Supabase-feil.
    {
      code: `async function f() { await Promise.all([supabase.rpc('f').catch(() => {})]) }`,
      errors: [{ messageId: 'forkastetMutasjon' }],
    },
    // Destrukturert Promise.all der én plass ikke leser error.
    {
      code: `async function f() {
        const [{ error: e1 }, { count }] = await Promise.all([
          supabase.from('x').delete(),
          supabase.from('y').delete({ count: 'exact' }),
        ])
        if (e1) throw e1
        return count
      }`,
      errors: [{ messageId: 'forkastetMutasjon', line: 4 }],
    },
    // Destrukturert Promise.all med for få plasser — det andre resultatet forkastes.
    {
      code: `async function f() {
        const [{ error }] = await Promise.all([supabase.from('x').delete(), supabase.rpc('f')])
        if (error) throw error
      }`,
      errors: [{ messageId: 'forkastetMutasjon' }],
    },
    // Elision — første resultat forkastes.
    {
      code: `async function f() {
        const [, { error }] = await Promise.all([supabase.from('x').delete(), supabase.rpc('f')])
        if (error) throw error
      }`,
      errors: [{ messageId: 'forkastetMutasjon' }],
    },
    // Reassignment av en ulest error.
    {
      code: `async function f() {
        let error
        ;({ error } = await supabase.from('x').delete().eq('id', 1))
      }`,
      errors: [{ messageId: 'forkastetMutasjon' }],
    },
    // Reassignment av count uten error.
    {
      code: `async function f() {
        let count
        ;({ count } = await supabase.from('x').delete({ count: 'exact' }))
        return count
      }`,
      errors: [{ messageId: 'forkastetMutasjon' }],
    },
    // Grunnform.
    {
      code: `async function f() { await supabase.from('x').delete().eq('id', 1) }`,
      errors: [{ messageId: 'forkastetMutasjon' }],
    },
    // Nøstet TS non-null assertion midt i kjeden.
    {
      code: `async function f() { await admin!.from('x').update({}).eq('id', 1) }`,
      errors: [{ messageId: 'forkastetMutasjon' }],
    },
    // Flerlinjes kjede.
    {
      code: `async function f() {
        await supabase
          .from('x')
          .delete()
          .eq('id', 1)
      }`,
      errors: [{ messageId: 'forkastetMutasjon' }],
    },
    // insert().
    {
      code: `async function f() { await supabase.from('x').insert({ a: 1 }) }`,
      errors: [{ messageId: 'forkastetMutasjon' }],
    },
    // upsert().
    {
      code: `async function f() { await supabase.from('x').upsert({ a: 1 }) }`,
      errors: [{ messageId: 'forkastetMutasjon' }],
    },
    // void-pakket forkastelse.
    {
      code: `async function f() { void supabase.from('x').delete().eq('id', 1) }`,
      errors: [{ messageId: 'forkastetMutasjon' }],
    },
    // Forkastet RPC — RPC-ene våre er tilstandsendrende.
    {
      code: `async function f() { await supabase.rpc('f') }`,
      errors: [{ messageId: 'forkastetMutasjon' }],
    },
    // Destrukturering uten verken data eller error.
    {
      code: `async function f() { const { count } = await supabase.from('x').delete({ count: 'exact' }) }`,
      errors: [{ messageId: 'forkastetMutasjon' }],
    },
    // .then(() => {}) — resultatet forkastes like fullt.
    {
      code: `function f() { supabase.from('x').delete().eq('id', 1).then(() => {}) }`,
      errors: [{ messageId: 'forkastetMutasjon' }],
    },
    // .catch() alene — Supabase-feil er ikke en rejection, så catch fanger
    // dem aldri.
    {
      code: `function f() { supabase.from('x').delete().eq('id', 1).catch(() => {}) }`,
      errors: [{ messageId: 'forkastetMutasjon' }],
    },
    // Awaitet .catch() på en RPC — samme sak.
    {
      code: `async function f() { await supabase.rpc('f').catch(err => logg(err)) }`,
      errors: [{ messageId: 'forkastetMutasjon' }],
    },
    // .then(({ error }) => {}) — nøkkelen hentes ut, men leses aldri.
    {
      code: `function f() { supabase.from('x').update({}).eq('id', 1).then(({ error }) => {}) }`,
      errors: [{ messageId: 'forkastetMutasjon' }],
    },
    // .then(res => …) uten at res.error leses.
    {
      code: `function f() { supabase.from('x').delete().then(res => console.log(res.status)) }`,
      errors: [{ messageId: 'forkastetMutasjon' }],
    },
    // Funksjonsreferanse som callback — vi ser ikke inn i den.
    {
      code: `function f() { supabase.from('x').delete().then(haandter) }`,
      errors: [{ messageId: 'forkastetMutasjon' }],
    },
    // `{ error: _error }` — slipper forbi no-unused-vars (^_), men leses aldri.
    {
      code: `async function f() { const { error: _error } = await supabase.from('x').delete().eq('id', 1) }`,
      errors: [{ messageId: 'forkastetMutasjon' }],
    },
    // `{ error }` hentet ut, aldri lest.
    {
      code: `async function f() { const { error } = await supabase.from('x').delete().eq('id', 1) }`,
      errors: [{ messageId: 'forkastetMutasjon' }],
    },
  ],
})
