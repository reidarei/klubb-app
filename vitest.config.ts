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
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
