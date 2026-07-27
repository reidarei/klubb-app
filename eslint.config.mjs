import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

// ---------------------------------------------------------------------------
// Egendefinert regel: supabase-feil-maa-hentes
// ---------------------------------------------------------------------------
// Regelen ligger inline her, ikke i en egen fil under scripts/ eller
// eslint-rules/. Grunnen er konkret: eslint.config.mjs speiles til klubb-app,
// mens scripts/ ikke gjør det — en import til en fil utenfor synk-scope hadde
// gitt rød lint i klubb-app. Samme felle som Sentry-configene falt i (#523).
//
// Hva den fanger:
//   const { data } = await supabase.from('x').select()      ← error svelges
// Hva den tillater:
//   const { data, error } = await supabase.from('x').select()
//
// Bakgrunn: fire separate bugs (#492, #495, #503, #504) var alle samme feil —
// `data` blir null/tom ved feil, og «ingenting her» er da umulig å skille fra
// «vi vet ikke». Konsekvensen har vært tapte varsler og sider som ser tomme ut.
// Å rette dem én etter én holdt ikke; dette gjeret gjør nummer 91 umulig.
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
        'Hent ut «error» fra denne Supabase-spørringen. Uten den er «ingen rader» umulig å skille fra «spørringen feilet» — se CLAUDE.md § Policy: Varsler. Er fail-open bevisst her, skriv en eslint-disable-next-line med begrunnelse.',
    },
  },
  create(context) {
    // True hvis kjeden inneholder .from(...) eller .rpc(...) — altså en
    // PostgREST-spørring, ikke et auth- eller storage-kall.
    function erSupabaseSpoerring(node) {
      let n = node
      while (n) {
        if (n.type === 'CallExpression') {
          const p = n.callee?.property
          if (p?.type === 'Identifier' && (p.name === 'from' || p.name === 'rpc')) return true
          n = n.callee
        } else if (n.type === 'MemberExpression') {
          n = n.object
        } else if (n.type === 'AwaitExpression') {
          n = n.argument
        } else {
          return false
        }
      }
      return false
    }

    return {
      VariableDeclarator(node) {
        if (node.id?.type !== 'ObjectPattern') return
        if (node.init?.type !== 'AwaitExpression') return
        if (!erSupabaseSpoerring(node.init.argument)) return

        const harData = node.id.properties.some(
          p => p.type === 'Property' && p.key?.name === 'data',
        )
        const harError = node.id.properties.some(
          p => p.type === 'Property' && p.key?.name === 'error',
        )
        // Kun relevant når data faktisk brukes — `const { error } = await …`
        // alene er en fullt gyldig skrivning vi ikke skal mase om.
        if (harData && !harError) {
          context.report({ node: node.id, messageId: 'manglerError' })
        }
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
      // Står på «warn» inntil de eksisterende forekomstene er ryddet. Skrus til
      // «error» i siste pulje — da er gjeret lukket og build feiler på nummer 91.
      'hk/supabase-feil-maa-hentes': 'warn',
    },
  },
]

export default config
