// #688: push-telemetri (push.klikk m.fl.) har en EGEN rate-limit-bøtte,
// adskilt fra vanlige klientfeil. Uten skillet konkurrerer de om samme
// LOGG_FEIL_RATE_LIMIT_PER_MIN, og en droppet push-beacon er umulig å skille
// fra en tapt navigasjon (grunn 3 i #688-issuet).
//
// Bøttene (rateBuckets) er modul-lokale og lever videre MELLOM testene i
// denne fila (se __tests__/logg-feil-route-strippet.test.ts) — hver test
// bruker derfor sin egen IP, ellers ville rekkefølgen testene kjører i
// påvirke resultatet.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  LOGG_FEIL_RATE_LIMIT_PER_MIN,
  PUSH_TELEMETRI_RATE_LIMIT_PER_MIN,
} from '@/lib/konstanter'

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
  })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: () => ({ insert: vi.fn(async () => ({ error: null })) }) })),
}))

vi.mock('@/lib/logg', () => ({
  logg: { warn: vi.fn(), feil: vi.fn(), info: vi.fn() },
}))

const { POST } = await import('@/app/api/logg-feil/route')

function lagRequest(ip: string, event: string) {
  return new Request('http://localhost/api/logg-feil', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
    body: JSON.stringify({ event, nivaa: 'warn', kontekst: {} }),
  }) as unknown as Parameters<typeof POST>[0]
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/logg-feil — egen rate-limit-bøtte for push-telemetri (#688)', () => {
  it('vanlige klientfeil fyller sin bøtte og gir 429, mens push.klikk fra samme IP rett etterpå gir 204', async () => {
    const ip = '10.1.0.1'
    for (let i = 0; i < LOGG_FEIL_RATE_LIMIT_PER_MIN; i++) {
      const res = await POST(lagRequest(ip, 'klient.test'))
      expect(res.status, `klient.test-kall #${i + 1}`).toBe(204)
    }
    const overskredet = await POST(lagRequest(ip, 'klient.test'))
    expect(overskredet.status).toBe(429)

    // push.klikk fra SAMME ip er upåvirket — egen bøtte.
    const push = await POST(lagRequest(ip, 'push.klikk'))
    expect(push.status).toBe(204)
  })

  it('push-telemetri fyller sin (høyere) bøtte og gir 429, mens en vanlig klientfeil fra samme IP rett etterpå gir 204', async () => {
    const ip = '10.1.0.2'
    for (let i = 0; i < PUSH_TELEMETRI_RATE_LIMIT_PER_MIN; i++) {
      const res = await POST(lagRequest(ip, 'push.klikk.navigert'))
      expect(res.status, `push.klikk.navigert-kall #${i + 1}`).toBe(204)
    }
    const overskredet = await POST(lagRequest(ip, 'push.klikk.navigert'))
    expect(overskredet.status).toBe(429)

    // Vanlig klientfeil fra SAMME ip er upåvirket — egen bøtte.
    const klientfeil = await POST(lagRequest(ip, 'klient.test'))
    expect(klientfeil.status).toBe(204)
  })

  it('ulike push-telemetri-events fra samme IP deler bøtte (namespace er IP+profil, ikke event)', async () => {
    const ip = '10.1.0.3'
    const events = ['push.klikk', 'push.klikk.navigert', 'push.klikk.innlogging', 'klient.pushklikk.foreldet', 'klient.pushklikk.oppgitt']
    let sendt = 0
    // Send til rett under grensen ved å veksle mellom eventnavnene.
    while (sendt < PUSH_TELEMETRI_RATE_LIMIT_PER_MIN) {
      const res = await POST(lagRequest(ip, events[sendt % events.length]))
      expect(res.status).toBe(204)
      sendt++
    }
    const overskredet = await POST(lagRequest(ip, events[0]))
    expect(overskredet.status).toBe(429)
  })
})
