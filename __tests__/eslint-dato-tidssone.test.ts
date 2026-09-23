// Pinner ESLint-regelen hk/dato-tidssone-uavhengig (eslint.config.mjs, #675)
// — tredje gang samme bug-klasse slo til (#674, PR #736, PR #741/#740), se
// CLAUDE.md § Arbeidsmåter. Speiler strukturen i
// __tests__/eslint-supabase-feil-maa-hentes.test.ts (inkl.
// RuleTester.describe/it-wiring og as Rule.RuleModule-casten — se
// begrunnelsen der, samme grunn gjelder her: eslint.config.mjs er ren JS
// og speiles til klubb-app, så meta.type inferes som string).
import { describe, it } from 'vitest'
import { RuleTester, type Rule } from 'eslint'
import { datoTidssoneUavhengig } from '../eslint.config.mjs'

RuleTester.describe = describe
RuleTester.it = it

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
})

ruleTester.run('dato-tidssone-uavhengig', datoTidssoneUavhengig as Rule.RuleModule, {
  valid: [
    // Negativ kontroll fra lib/fond-oppgjor.ts: eksplisitt 'Z'-suffiks gjør
    // dette et INSTANT, ikke en Oslo-kalenderdag — new Date(s) har ETT
    // argument (en BinaryExpression) som verken er norskDatoNaa()/norskDag()
    // eller et null-argument new Date(), så kilden matcher aldri.
    `function f(s) { return new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) }`,
    // Negativ kontroll fra lib/dato.ts/e2e/avreise-blokk.spec.ts: Date.UTC(...)
    // er ikke i DATO_PROPAGERENDE-settet, så taint-sporingen stopper der.
    `function f(y, m, d, n) { return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10) }`,
    // Negativ kontroll fra components/kart/NyTimeplanPost.tsx: new Date(start)
    // har ETT argument som IKKE er et null-argument new Date() — trygt å
    // mutere. Dette er nøyaktig grensen sjekk 3 bygger på.
    `function f(start) {
       const cursor = new Date(start)
       cursor.setDate(cursor.getDate() + 1)
     }`,
    // Negativ kontroll fra app/(app)/page.tsx: subMonths(new Date(), 6) ER
    // tainted av null-argument new Date(), men toISOString()-resultatet
    // slices/substrings/splittes ALDRI her — et rent tidsstempel (naa()-
    // mønsteret), ikke en dagstreng. Sjekk 2 krever den umiddelbare kappingen.
    `function f(subMonths) { return subMonths(new Date(), 6).toISOString() }`,
    // Lovlig bruk av konvensjon 1 — lokale gettere og date-fns kalender-
    // aritmetikk PÅ en Oslo-kalenderdag er riktig, og flagges aldri.
    `function f(norskDatoNaa) { return norskDatoNaa().getFullYear() }`,
    `function f(isBefore, norskDatoNaa, x) { return isBefore(x, norskDatoNaa()) }`,
    // ── BLOCKER fra review-en: ikke enhver kapping er et daguttrekk ─────────
    // slice(11, 19) plukker UT KLOKKESLETTET av et UTC-tidsstempel. Det er en
    // legitim instant-operasjon, og et falskt treff her på en regel som står
    // på «error» ville blitt slått av, ikke rettet.
    `function f() { return new Date().toISOString().slice(11, 19) }`,
    // split('.') stripper millisekundene — også en ren instant-operasjon.
    `function f() { return new Date().toISOString().split('.')[0] }`,
    // split('T')[1] er tids-delen, ikke dagen.
    `function f() { return new Date().toISOString().split('T')[1] }`,
    // slice uten ende-argument gir hele strengen — ingen kalenderdag plukket ut.
    `function f() { return new Date().toISOString().slice(0) }`,
    // Sjekk 4 rapporterer på KALLSTEDET, ikke i hjelperen: en hjelper uten
    // kallsted med farlig argument er ikke i seg selv gal.
    `function dagStreng(d) { return d.toISOString().slice(0, 10) }`,
    // Samme hjelper matet med et INSTANT er helt riktig bruk.
    `function dagStreng(d) { return d.toISOString().slice(0, 10) }
     function g(iso) { return dagStreng(new Date(iso)) }`,
    // En hjelper som skriver om parameteren sin før toISOString() (blindsone
    // c i filhode-kommentaren) konkluderer vi bevisst ikke på.
    `function tilIso(d, fromZonedTime) { d = fromZonedTime(d); return d.toISOString() }
     function g(norskDatoNaa, fromZonedTime) { return tilIso(norskDatoNaa(), fromZonedTime) }`,
  ],
  invalid: [
    // Sjekk 1 — lib/actions/paaminnelser.ts:188 (vinduStart) før fiksen.
    {
      code: `function f(addDays, norskDatoNaa, N) {
        const vinduStart = addDays(norskDatoNaa(), -N).toISOString()
        return vinduStart
      }`,
      errors: [{ messageId: 'isoPaaOsloDag' }],
    },
    // Sjekk 1 — app/(app)/kaaringspoll/ny/page.tsx:21 (tidligsteArrIso) før
    // fiksen. Samme form som over, men egen kilde i kodebasen — begge treff
    // stod i planens funn-tabell, og skal begge være borte etter fiksen.
    {
      code: `function f(addDays, norskDatoNaa, ARRANGEMENT_TILBAKE_DAGER) {
        const tidligsteArrIso = addDays(norskDatoNaa(), -ARRANGEMENT_TILBAKE_DAGER).toISOString()
        return tidligsteArrIso
      }`,
      errors: [{ messageId: 'isoPaaOsloDag' }],
    },
    // Sjekk 3 — app/(app)/kaaringspoll/ny/OpprettSkjema.tsx:60 (defaultFrist)
    // før fiksen. toISOString() her flagges IKKE (ingen slice etterpå) —
    // kun setDate()-muteringen, som er selve bug-klassen.
    {
      code: `function defaultFrist(formaterDato) {
        const d = new Date()
        d.setDate(d.getDate() + 7)
        const iso = d.toISOString()
        return formaterDato(iso, 'yyyy-MM-dd') + 'T20:00'
      }`,
      errors: [{ messageId: 'naaMutertLokalt' }],
    },
    // Sjekk 3 — app/(app)/poll/ny/LagPollSkjema.tsx:58, byte-identisk bug i
    // den andre poll-opprettelsesflyten (samme kopi-limt kode, to steder —
    // se planens funn-liste). Variabelnavn justert for å unngå at RuleTester
    // avviser et duplikat test-case, ellers identisk logikk.
    {
      code: `function lagDefaultFrist(formaterDato) {
        const dato = new Date()
        dato.setDate(dato.getDate() + 7)
        const iso = dato.toISOString()
        return formaterDato(iso, 'yyyy-MM-dd') + 'T20:00'
      }`,
      errors: [{ messageId: 'naaMutertLokalt' }],
    },
    // Variabel-indireksjonen (#740-formen, se e2e/kart-timeplan.spec.ts) —
    // sjekk 2 må følge new Date() gjennom en enkeltdefinisjons-variabel, ikke
    // bare det direkte kallet.
    {
      code: `function f() {
        const d = new Date()
        return d.toISOString().slice(0, 10)
      }`,
      errors: [{ messageId: 'utcDagstreng' }],
    },
    // De to andre daguttrekk-formene sjekk 2 fortsatt MÅ fange etter at
    // BLOCKER-fiksen strammet inn på argumentene — beviset på at innstram-
    // mingen ikke gjorde regelen tannløs.
    {
      code: `function f() { return new Date().toISOString().substring(0, 10) }`,
      errors: [{ messageId: 'utcDagstreng' }],
    },
    {
      code: `function f() { return new Date().toISOString().split('T')[0] }`,
      errors: [{ messageId: 'utcDagstreng' }],
    },
    // slice(0, 7) er måneden og slice(0, 4) er året — samme UTC-kalenderfelt,
    // like tidssone-følsomme som dagen.
    {
      code: `function f() { return new Date().toISOString().slice(0, 7) }`,
      errors: [{ messageId: 'utcDagstreng' }],
    },

    // ── MAJOR fra review-en: SELVE #674-formen, pinnet ──────────────────────
    // lib/actions/paaminnelser.ts på main, byte for byte: dagStreng() tar en
    // Date-parameter og kapper toISOString() — og mates med en Oslo-kalender-
    // dag. Kallet og feilen står i hver sin funksjon, så sjekk 1–3 så
    // ingenting. Dette er mønsteret hele det arkitektoniske grepet ble
    // skrevet for; kommer det tilbake, skal lint stoppe det.
    {
      code: `function kjorPaaminnelser(addDays, norskDatoNaa, PAAMINNELSE_DAGER) {
        const idag = norskDatoNaa()
        return dagStreng(addDays(idag, PAAMINNELSE_DAGER.LANG))
      }
      function dagStreng(dato) {
        return dato.toISOString().slice(0, 10)
      }`,
      errors: [{ messageId: 'hjelperTaintet' }],
    },
    // Hjelperen definert NEDENFOR kallstedet, og uten kapping — en ren
    // toISOString() på en Oslo-kalenderdag er like galt. Pinner at pass 2
    // kjører etter hele fila, ikke i leserekkefølge.
    {
      code: `function f(norskDatoNaa) {
        return tilIso(norskDatoNaa())
      }
      function tilIso(d) { return d.toISOString() }`,
      errors: [{ messageId: 'hjelperTaintet' }],
    },
    // Arrow-hjelper bundet til en const — samme form, annen syntaks.
    {
      code: `const dagStreng = d => d.toISOString().slice(0, 10)
      function f(norskDag, iso) { return dagStreng(norskDag(iso)) }`,
      errors: [{ messageId: 'hjelperTaintet' }],
    },
    // Muteringen (sjekk 3) gjennom samme ett hopp: new Date() sendt inn i en
    // hjelper som flytter den med setDate() i prosessens tidssone.
    {
      code: `function f() {
        const d = new Date()
        flyttEnUke(d)
        return d
      }
      function flyttEnUke(dato) { dato.setDate(dato.getDate() + 7) }`,
      errors: [{ messageId: 'hjelperTaintet' }],
    },
    // Hjelperen tar farlig argument i ANDRE posisjon — pinner at posisjonen
    // faktisk spores, ikke bare «noen av argumentene er en kalenderdag».
    {
      code: `function f(norskDatoNaa, prefiks) {
        return merk(prefiks, norskDatoNaa())
      }
      function merk(tekst, dato) { return tekst + dato.toISOString() }`,
      errors: [{ messageId: 'hjelperTaintet' }],
    },
  ],
})
