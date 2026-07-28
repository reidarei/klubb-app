// Pinner selve ESLint-regelen hk/supabase-feil-maa-hentes (eslint.config.mjs)
// — en regel som håndheves strengt (nå 'error', se CLAUDE.md § Policy:
// Databasespørringer) bør selv være testet, ikke bare "virke i praksis".
//
// RuleTester bruker som default globale describe/it (mocha-stil) — vi wirer
// den eksplisitt til vitest sine, siden testene her ikke kjører med
// `globals: true` i vitest.config.ts.
import { describe, it } from 'vitest'
import { RuleTester, type Rule } from 'eslint'
import { supabaseFeilMaaHentes } from '../eslint.config.mjs'

RuleTester.describe = describe
RuleTester.it = it

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
})

// eslint.config.mjs er ren JS (speiles til klubb-app, se kommentaren der) —
// `meta.type` inferes derfor som `string`, ikke det strengere literal-unionen
// RuleTester forventer. Casten er trygg: verdien er faktisk 'problem'.
ruleTester.run('supabase-feil-maa-hentes', supabaseFeilMaaHentes as Rule.RuleModule, {
  valid: [
    // error hentes ut OG leses — den vanlige, korrekte formen. Merk at det
    // ikke holder å destrukturere den; se den tilsvarende invalid-casen.
    `async function f() {
       const { data, error } = await supabase.from('x').select()
       if (error) throw error
       return data
     }`,
    // Omdøpt binding (`error: feil`) som leses — samme sak.
    `async function f() {
       const { data, error: feil } = await supabase.from('x').select()
       if (feil) throw feil
       return data
     }`,
    // Kun error destrukturert — data brukes ikke, ikke vår sak.
    `async function f() { const { error } = await supabase.from('x').update({}); }`,
    // Auth-kall er bevisst utenfor scope.
    `async function f() { const { data: { user } } = await supabase.auth.getUser(); }`,
    // Vanlig kode uten noen Supabase-kjede i det hele tatt — skal aldri fyre.
    `async function f() { const x = 1; console.log(x); }`,
    // Skjema 1 (lagret svar), men error faktisk lest ut via x.error.
    `async function f() {
       const x = await supabase.from('x').select()
       if (x.error) throw x.error
       return x.data
     }`,
    // Lagret svar der feilen er håndtert, og data destrukturert ut etterpå.
    // Var en false positive før: eneste utvei per policyen var en
    // eslint-disable med begrunnelsen «bevisst fail-open» — altså en usann
    // påstand i akkurat det revisjonssporet regelen skal beskytte.
    `async function f() {
       const res = await supabase.from('x').select()
       if (res.error) throw res.error
       const { data } = res
       return data
     }`,
    // .throwOnError() er Supabase sitt eget fail-closed-idiom — feilen kastes,
    // så `data` kan ikke bære en skjult feil. Skal ikke flagges.
    `async function f() {
       const { data } = await supabase.from('x').select().throwOnError()
       return data
     }`,
    // Array.from(...) er ikke en Supabase-spørring, selv om metodenavnet i
    // kjeden er `.from`. Mønsteret finnes i lib/queries/agenda.ts.
    `function f(kart) {
       const rader = Array.from(kart.values())
       return rader.data
     }`,
    // Løkke-vakt: gjensidig selvrefererende deklarasjoner fikk identifikator-
    // oppslaget til å sykle for alltid (ESLint returnerte aldri). tsc avviser
    // slik TDZ-kode, men språkserveren kjører regelen på hver tastetrykk-
    // tilstand — der var utfallet en hengt editor uten feilmelding. Pinnet
    // her fordi en regresjon gir hengende testkjøring, ikke en rød test.
    `async function f() { const a = b; const b = a; const { data } = await a }`,
    // Skjema 3 (Promise.all), begge feil hentet ut og lest.
    `async function f() {
       const [{ data: a, error: aFeil }, { data: b, error: bFeil }] = await Promise.all([
         supabase.from('a').select(),
         supabase.from('b').select(),
       ])
       if (aFeil || bFeil) throw (aFeil ?? bFeil)
       return [a, b]
     }`,
    // Skjema 6 (lagret query-builder), error hentet ut ved selve await-et.
    `async function f() {
       let q = supabase.from('x').select()
       const { data, error } = await q
       if (error) throw error
       return data
     }`,
    // Skjema 7 (.then), error med i callback-patternet og lest.
    `function f() {
       supabase.from('x').select().then(({ data, error }) => { if (error) throw error; return data })
     }`,
    // Skjema 5 (reassignment) der error-bindingen leses etterpå.
    `async function f() {
       let data, error
       ;({ data, error } = await supabase.from('x').select())
       if (error) throw error
       return data
     }`,
  ],
  invalid: [
    // Grunnform — data uten error.
    {
      code: `async function f() { const { data } = await supabase.from('x').select(); }`,
      errors: [{ messageId: 'manglerError' }],
    },
    // Gjeret som var åpent: `error` står i destruktureringen, men bindingen
    // leses aldri. Verken denne regelen eller no-unused-vars fyrte, så hele
    // feilklassen fra #492/#495/#503/#504 kunne gjeninnføres uskadd — og
    // regelens egen feilmelding ledet koderen rett hit.
    {
      code: `async function f() {
        const { data, error } = await supabase.from('x').select()
        return data ?? []
      }`,
      errors: [{ messageId: 'manglerError' }],
    },
    // Samme, med omdøpt binding.
    {
      code: `async function f() {
        const { data, error: feil } = await supabase.from('x').select()
        return data ?? []
      }`,
      errors: [{ messageId: 'manglerError' }],
    },
    // Reassignment der error-bindingen aldri leses — samme hull, annen form.
    {
      code: `async function f() {
        let data, error
        ;({ data, error } = await supabase.from('x').select())
        return data
      }`,
      errors: [{ messageId: 'manglerError' }],
    },
    // Destrukturering fra et lagret svar der `.error` ALDRI leses — unntaket
    // for `const { data } = res` skal kun gjelde når feilen faktisk håndteres.
    {
      code: `async function f() {
        const res = await supabase.from('x').select()
        const { data } = res
        return data
      }`,
      errors: [{ messageId: 'manglerError' }],
    },
    // Skjema 1: lagret svar uten destrukturering, data brukt uten at error leses.
    {
      code: `async function f() {
        const x = await supabase.from('x').select()
        return x.data
      }`,
      errors: [{ messageId: 'manglerError' }],
    },
    // Skjema 2: umiddelbar property-aksess.
    {
      code: `async function f() { return (await supabase.from('x').select()).data }`,
      errors: [{ messageId: 'manglerError' }],
    },
    // Skjema 3: Promise.all-destrukturering, én av to mangler error.
    {
      code: `async function f() {
        const [{ data: a, error: aFeil }, { data: b }] = await Promise.all([
          supabase.from('a').select(),
          supabase.from('b').select(),
        ])
        if (aFeil) throw aFeil
        return [a, b]
      }`,
      errors: [{ messageId: 'manglerError' }],
    },
    // Skjema 4: ternær med await utenfor.
    {
      code: `async function f(x) {
        const { data } = await (x ? supabase.from('a').select() : supabase.from('b').select())
      }`,
      errors: [{ messageId: 'manglerError' }],
    },
    // Skjema 4 (omvendt retning): ternær med await inni hver gren.
    {
      code: `async function f(x) {
        const { data } = x ? await supabase.from('a').select() : { data: [] }
      }`,
      errors: [{ messageId: 'manglerError' }],
    },
    // Skjema 5: reassignment.
    {
      code: `async function f() {
        let data
        ;({ data } = await supabase.from('x').select())
      }`,
      errors: [{ messageId: 'manglerError' }],
    },
    // Skjema 6: lagret query-builder, error ikke hentet ved await.
    {
      code: `async function f() {
        let q = supabase.from('x').select()
        const { data } = await q
      }`,
      errors: [{ messageId: 'manglerError' }],
    },
    // Skjema 7: .then() uten error i callback.
    {
      code: `function f() {
        supabase.from('x').select().then(({ data }) => {})
      }`,
      errors: [{ messageId: 'manglerError' }],
    },
    // Skjema 8: literal-nøkkel-destrukturering.
    {
      code: `async function f() { const { ['data']: d } = await supabase.from('x').select(); }`,
      errors: [{ messageId: 'manglerError' }],
    },
    // .rpc() skal fanges på samme måte som .from().
    {
      code: `async function f() { const { data } = await supabase.rpc('f'); }`,
      errors: [{ messageId: 'manglerError' }],
    },
    // Kjent, dokumentert blindsone: supabase.storage.from(...) matcher samme
    // .from(...)-sjekk som en PostgREST-spørring, siden regelen kun ser på
    // metodenavnet i kjeden — se kommentaren i eslint.config.mjs. Pinnes
    // bevisst her: endres dette (f.eks. en presis .storage-sjekk), skal
    // testen oppdateres i samme håndgrep, ikke drifte stille.
    {
      code: `async function f() { const { data } = await supabase.storage.from('bucket').upload('x', y); }`,
      errors: [{ messageId: 'manglerError' }],
    },
  ],
})
