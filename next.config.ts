import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'
import pkg from './package.json' with { type: 'json' }
import versjon from './lib/versjon.json' with { type: 'json' }

// Versjonen stemples lokalt (npm run stamp-versjon) fordi Vercel har shallow
// git-clone, så git-count ved build gir feil tall. Fallback: pkg.version.
function appVersjon(): string {
  return versjon.versjon || `V${pkg.version}`
}

const nextConfig: NextConfig = {
  // Lar e2e bygge til egen katalog så en samtidig `npm run dev` i `.next` ikke
  // kolliderer (Next 15.5 har ikke `--dist-dir`). Opt-in, se e2e/README.md.
  // e2e/helpers/bygg-artefakt-vakt.ts MÅ bruke samme variabel og fallback (#659).
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  env: {
    BUILD_TIMESTAMP: new Date().toLocaleString('nb-NO', { timeZone: 'Europe/Oslo', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    APP_VERSION: appVersjon(),
  },
  // 52 MB = MAKS_BYTES (50 MB) i video-opplasting.ts + slack for multipart-
  // overhead. Må stå under `experimental` i Next 15.5 («Unrecognized key» ellers).
  experimental: {
    serverActions: {
      bodySizeLimit: '52mb',
    },
  },
  images: {
    // Smal imageSizes-liste etter bisect av bilde-regresjon (#215, PR #242).
    minimumCacheTTL: 60 * 60 * 24 * 31,
    formats: ['image/webp'],
    deviceSizes: [640, 828, 1200],
    imageSizes: [64, 128, 256],
    // Ikke sett `unoptimized` for e2e: da ber nettleseren selv om
    // fixtur.r2.dev, forespørselen henger, `load` fyrer aldri og `waitForURL`
    // timer ut. Med optimizer feiler serveren raskt og `load` fyrer. Skal
    // kallet bort, gjøres det med `page.route(...).abort()` i e2e (#659).
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      // Cloudflare R2 public dev URL — pub-{hash}.r2.dev
      {
        protocol: 'https',
        hostname: '*.r2.dev',
      },
      // Custom domain for R2. next.config.ts kan ikke importere fra lib/,
      // derav process.env direkte.
      {
        protocol: 'https',
        hostname: process.env.NEXT_PUBLIC_R2_CUSTOM_DOMAIN ?? 'bilder.klubb.example.com',
      },
    ],
  },
}

// Sentry kun server-side (via instrumentation.ts). Ingen sentry.client.config.ts
// med vilje: klient-feil går via /api/logg-feil + beacon (#366).
export default withSentryConfig(nextConfig, {
  silent: true,
})
