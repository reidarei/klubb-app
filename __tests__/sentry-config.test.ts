// Pinner at PII-vaktene faktisk er KOBLET PÅ i begge Sentry-runtimene.
// __tests__/sentry-scrub.test.ts beviser at beforeBreadcrumb dropper console-
// kategorien, men en vakt ingen kaller er verdiløs — og feilen ville vært
// usynlig (Sentry ville bare fortsatt å motta breadcrumbs). Se #498-review.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type * as Sentry from '@sentry/nextjs'

const { mockInit } = vi.hoisted(() => ({ mockInit: vi.fn() }))

vi.mock('@sentry/nextjs', () => ({ init: mockInit }))

type Scrub = typeof import('@/lib/sentry-scrub')

// Sentry.init kjøres på modul-load, så hver config må importeres etter mocken.
// vi.resetModules() gjør at hver import faktisk kjører init på nytt — men
// da får configen også et FERSKT sentry-scrub-modul. Derfor hentes scrub-
// referansene fra samme (nullstilte) registry, ellers ville identitets-
// sammenligningen under feile på modul-instans, ikke på faktisk feilkobling.
async function lastConfig(sti: string): Promise<{ opts: Sentry.NodeOptions; scrub: Scrub }> {
  mockInit.mockClear()
  vi.resetModules()
  await import(sti)
  const scrub = (await import('@/lib/sentry-scrub')) as Scrub
  expect(mockInit).toHaveBeenCalledTimes(1)
  return { opts: mockInit.mock.calls[0][0] as Sentry.NodeOptions, scrub }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe.each([
  ['server', '@/sentry.server.config'],
  ['edge', '@/sentry.edge.config'],
])('Sentry.init (%s-runtime)', (_navn, sti) => {
  it('kobler på scrubbEvent som beforeSend', async () => {
    const { opts, scrub } = await lastConfig(sti)
    expect(opts.beforeSend).toBe(scrub.scrubbEvent)
  })

  it('kobler på beforeBreadcrumb — console-breadcrumbs må dø her', async () => {
    const { opts, scrub } = await lastConfig(sti)
    expect(opts.beforeBreadcrumb).toBe(scrub.beforeBreadcrumb)
    // Kjør den faktiske hooken slik init fikk den — pinner ende-til-ende at
    // en console-breadcrumb med radverdier ikke slipper ut av prosessen.
    expect(
      opts.beforeBreadcrumb?.(
        { category: 'console', message: 'Key (epost)=(ola@nordmann.no) already exists.' },
        {},
      ),
    ).toBeNull()
  })

  it('sender ingen traces (kvote- og ytelsesvalg fra #366)', async () => {
    const { opts } = await lastConfig(sti)
    expect(opts.tracesSampleRate).toBe(0)
  })
})
