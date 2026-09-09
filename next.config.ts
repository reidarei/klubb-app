import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'
import pkg from './package.json' with { type: 'json' }
import versjon from './lib/versjon.json' with { type: 'json' }

// App-versjon leses fra lib/versjon.json, som genereres lokalt av
// scripts/stamp-versjon.mjs (npm run stamp-versjon) før push. Dette
// sikrer at versjonen er korrekt på Vercel, hvor shallow git-clone
// gjør at direkte git-count ved build ikke fungerer.
// Fallback: hvis filen mangler innhold, bruk pkg.version direkte.
function appVersjon(): string {
  return versjon.versjon || `V${pkg.version}`
}

const nextConfig: NextConfig = {
  // Lokal ergonomi (#659): lar e2e-suiten bygge til en EGEN katalog enn
  // `.next`, slik at en samtidig kjørende `npm run dev` (som skriver til
  // `.next` med sin egen dev-manifest-struktur) ikke kolliderer med e2e sin
  // `next build && next start`. Ingen `--dist-dir`-CLI-flagg finnes i Next
  // 15.5 (verifisert) — dette er eneste vei. e2e/helpers/bygg-artefakt-vakt.ts
  // leser SAMME variabel med SAMME fallback, ellers leser vakten feil katalog.
  // Opt-in: variabelen settes ingen steder av oss — den er dokumentert i
  // e2e/README.md § NEXT_DIST_DIR som noe du kan sette i .env.local selv.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  env: {
    BUILD_TIMESTAMP: new Date().toLocaleString('nb-NO', { timeZone: 'Europe/Oslo', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    APP_VERSION: appVersjon(),
  },
  // Server actions sin default body-grense på 1 MB er for liten for
  // video-opplasting. Vi gir 52 MB — litt slack over MAKS_BYTES (50 MB)
  // i video-opplasting.ts slik at multipart-overhead ikke spiser av grensa.
  // NB: I Next 15.5.x ligger `serverActions` fortsatt under `experimental`
  // i config-schemaet. Top-level-plassering gir warning «Unrecognized key».
  experimental: {
    serverActions: {
      bodySizeLimit: '52mb',
    },
  },
  images: {
    // Bisect-test 4/N etter regresjon i #215 / PR #242: + smal imageSizes.
    // Hvis bildene brekker her, vet vi at imageSizes-listen er skyldig.
    minimumCacheTTL: 60 * 60 * 24 * 31,
    formats: ['image/webp'],
    deviceSizes: [640, 828, 1200],
    imageSizes: [64, 128, 256],
    // #659, REVIDERT ETTER FØRSTE CI-KJØRING: her sto tidligere
    // `unoptimized: E2E_UNOPTIMIZED_IMAGES && !VERCEL`, ment å fjerne
    // serverens utgående kall mot fixtur.r2.dev under e2e. Den gjorde
    // problemet VERRE, ikke bedre, og er derfor fjernet igjen.
    //
    // Mekanismen: med optimizer PÅ henter SERVEREN bildet, får 500 på ~70 ms
    // og gir opp — nettleseren ser en ferdig (om enn feilet) respons, og
    // `load` fyrer. Med `unoptimized` rendres rå `src`, så NETTLESEREN ber
    // direkte om https://fixtur.r2.dev/… Den forespørselen henger i stedet
    // for å feile raskt, `load` fyrer aldri, og Playwrights `waitForURL`
    // (som venter på nettopp `load`) timet ut på 60 s. Fire tester i
    // e2e/tidligere.spec.ts falt på det i run 34373667058 — konsistent, ikke
    // flakiness.
    //
    // Lærdommen er verdt å beholde: en «rask feil» kan være bedre enn ingen
    // forespørsel, når det som venter er et load-event. Skal den utgående
    // avhengigheten bort, hører fiksen på KLIENTSIDEN
    // (`page.route('**/fixtur.r2.dev/**', r => r.abort())` i en delt
    // fixture), ikke i bildekonfigurasjonen — se #659.
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
      // Custom domain for R2 (når aktivert). next.config.ts kan ikke
      // importere fra lib/, så vi leser process.env direkte her.
      {
        protocol: 'https',
        hostname: process.env.NEXT_PUBLIC_R2_CUSTOM_DOMAIN ?? 'bilder.klubb.example.com',
      },
    ],
  },
}

// withSentryConfig wrapper aktiverer Sentry server-side via instrumentation.ts.
// Vi har ingen sentry.client.config.ts, så browser-SDK initialiseres aldri
// i klienten — klient-feil sendes via /api/logg-feil + beacon istedenfor. Se #366.
// silent: true demper Sentry-build-output.
export default withSentryConfig(nextConfig, {
  silent: true,
})
