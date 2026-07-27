// Sentry-initialisering for Node.js-runtime (server components, server actions,
// API-ruter). Importeres via instrumentation.ts ved NEXT_RUNTIME === 'nodejs'.
// Klient-init gjøres IKKE her — vi bruker /api/logg-feil + beacon istedenfor
// Sentry browser-SDK for å holde klient-bundlen ren. Se #366.

import * as Sentry from '@sentry/nextjs'
import { SENTRY_DSN } from '@/lib/config'
import { scrubbEvent, beforeBreadcrumb } from '@/lib/sentry-scrub'

Sentry.init({
  dsn: SENTRY_DSN,
  // Ingen traces — vi ønsker kun feil-rapportering, ikke ytelsesprofiling.
  // Traces ville spist kvoten og legger til instrumenteringskostnader.
  tracesSampleRate: 0,
  environment: process.env.VERCEL_ENV ?? 'development',
  beforeSend: scrubbEvent,
  // Dropper console-breadcrumbs før de forlater prosessen — consoleIntegration
  // er default-på og ville ellers båret PostgREST-radverdier forbi beforeSend.
  // Se #498-review (BLOCKER).
  beforeBreadcrumb,
})
