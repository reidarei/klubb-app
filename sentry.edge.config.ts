// Sentry-initialisering for Edge-runtime (middleware, edge API-ruter).
// Importeres via instrumentation.ts ved NEXT_RUNTIME === 'edge'. Se #366.
// Bruker samme PII-scrubbing som server-config — via felles lib/sentry-scrub.

import * as Sentry from '@sentry/nextjs'
import { SENTRY_DSN } from '@/lib/config'
import { scrubbEvent, beforeBreadcrumb } from '@/lib/sentry-scrub'

Sentry.init({
  dsn: SENTRY_DSN,
  tracesSampleRate: 0,
  environment: process.env.VERCEL_ENV ?? 'development',
  beforeSend: scrubbEvent,
  // Dropper console-breadcrumbs før de forlater prosessen — consoleIntegration
  // er default-på og ville ellers båret PostgREST-radverdier forbi beforeSend.
  // Se #498-review (BLOCKER).
  beforeBreadcrumb,
})
