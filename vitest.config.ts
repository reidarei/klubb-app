import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  // tsconfig.json setter jsx: "preserve" (Next/SWC gjør selve JSX-
  // transformasjonen i build). Vite 8s standardtransform (oxc) forstår ikke
  // "preserve" — uten override feiler ethvert testimport av en .tsx-fil
  // (f.eks. app/(app)/-sider) med en syntaksfeil på JSX-tagger.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'jsdom',
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.tsx'],
    setupFiles: ['__tests__/setup.ts'],
    // Hevet KUN i CI (#659). Bakgrunn: `Start Supabase (bakgrunn)` kjører
    // docker-pull, migrasjoner og seed parallelt med vitest på en runner med
    // to kjerner. Målt effekt er 1-3 sekunder veggklokke mellom testfiler som
    // selv bruker 10 ms — CPU-sult, ikke treg kode. To ganger har en tilfeldig
    // test timet ut på 5 s-defaulten og blitt grønn ved reprodusering.
    //
    // Lokalt beholdes 5 s med vilje: der er maskinen ikke sultet, og en test
    // som plutselig bruker over fem sekunder ER et signal om en regresjon.
    // Hever vi globalt, kjøper vi bort nettopp det signalet.
    testTimeout: process.env.CI ? 20_000 : 5_000,
    hookTimeout: process.env.CI ? 20_000 : 5_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // Ikke bruk resolve.conditions: ['react-server'] for å løse dette —
      // det ville byttet React til server-varianten globalt og brutt alle
      // hook-baserte komponent-tester. En alias til en tom stub er nok:
      // lib/config.ts importerer 'server-only' kun for effekten (kaste ved
      // feil bundle), og stubben gir nettopp ingen effekt (#687).
      'server-only': path.resolve(__dirname, '__tests__/stubs/server-only.ts'),
    },
  },
})
