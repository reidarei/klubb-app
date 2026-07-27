import { describe, it, expect } from 'vitest'
import type * as Sentry from '@sentry/nextjs'
import { scrubbEvent, beforeBreadcrumb } from '@/lib/sentry-scrub'

// Minimalt ErrorEvent-skjelett — vi trenger bare feltene beforeSend faktisk
// leser/muterer (exception.values[].value, message, extra, request).
function lagEvent(overrides: Partial<Sentry.ErrorEvent>): Sentry.ErrorEvent {
  return { ...overrides } as Sentry.ErrorEvent
}

describe('scrubbEvent – droppliste (#498)', () => {
  it('dropper events der exception-meldingen er «Ikke innlogget»', () => {
    const event = lagEvent({
      exception: { values: [{ type: 'Error', value: 'Ikke innlogget' }] },
    })

    expect(scrubbEvent(event)).toBeNull()
  })

  it('dropper events der message-feltet er «Ikke innlogget»', () => {
    const event = lagEvent({ message: 'Ikke innlogget' })

    expect(scrubbEvent(event)).toBeNull()
  })

  it('dropper ikke ukjente/vilkårlige meldinger', () => {
    const event = lagEvent({
      exception: { values: [{ type: 'Error', value: 'Noe helt uventet skjedde' }] },
    })

    expect(scrubbEvent(event)).not.toBeNull()
  })
})

describe('scrubbEvent – masking av radverdier (#498)', () => {
  it('maskerer «=(...)»-literaler i exception-meldingen', () => {
    const event = lagEvent({
      exception: {
        values: [
          { type: 'Error', value: 'duplicate key value violates unique constraint "profiles_epost_key"\nKey (epost)=(hemmelig@test.no) already exists' },
        ],
      },
    })

    const resultat = scrubbEvent(event)

    const verdi = resultat?.exception?.values?.[0]?.value ?? ''
    expect(verdi).not.toContain('hemmelig@test.no')
    expect(verdi).toContain('Key (epost)=(…) already exists')
  })

  it('maskerer flere «=(...)»-par på samme linje (som ett grådig spenn)', () => {
    const event = lagEvent({
      exception: {
        values: [{ type: 'Error', value: 'Key (a)=(1), Key (b)=(2) already exists' }],
      },
    })

    const verdi = scrubbEvent(event)?.exception?.values?.[0]?.value ?? ''
    // Grådig match slår sammensatte constraints sammen til én maske. Bevisst
    // over-maskering (#498-review MINOR 4) — vi mister at det var to nøkler,
    // men ingen av verdiene overlever, og det er den riktige feilretningen.
    expect(verdi).toBe('Key (a)=(…) already exists')
    expect(verdi).not.toContain('(1)')
    expect(verdi).not.toContain('(2)')
  })

  it('maskerer også et fritt message-felt', () => {
    const event = lagEvent({ message: 'Key (telefon)=(12345678) already exists' })

    expect(scrubbEvent(event)?.message).toBe('Key (telefon)=(…) already exists')
  })

  it('maskerer radverdi som selv inneholder parentes (kallenavn, #498-review)', () => {
    // Non-greedy ([^)]*) stoppet på den indre «)» og lot «Nordmann» overleve.
    const event = lagEvent({
      exception: {
        values: [{ type: 'Error', value: 'Key (navn)=(Ola (Reka) Nordmann) already exists.' }],
      },
    })

    const verdi = scrubbEvent(event)?.exception?.values?.[0]?.value ?? ''
    expect(verdi).not.toContain('Nordmann')
    expect(verdi).not.toContain('Reka')
    expect(verdi).toBe('Key (navn)=(…) already exists.')
  })

  it('masken stopper ved linjeskift (én maske per linje)', () => {
    const event = lagEvent({
      message: 'Key (epost)=(a@b.no) exists\nDetail: Key (navn)=(Ola) exists',
    })

    expect(scrubbEvent(event)?.message).toBe(
      'Key (epost)=(…) exists\nDetail: Key (navn)=(…) exists',
    )
  })
})

describe('beforeBreadcrumb – console-kategorien droppes (#498-review BLOCKER)', () => {
  it('dropper console-breadcrumb som bærer en PostgREST-radverdi', () => {
    // Nøyaktig strengen reviewer verifiserte overlevde beforeSend som breadcrumb.
    const breadcrumb = {
      category: 'console',
      level: 'error' as const,
      message: 'Key (epost)=(ola@nordmann.no) already exists.',
      data: { arguments: ['Key (epost)=(ola@nordmann.no) already exists.'] },
    }

    expect(beforeBreadcrumb(breadcrumb)).toBeNull()
  })

  it('dropper console-breadcrumbs uansett nivå — hele kategorien er borte', () => {
    expect(beforeBreadcrumb({ category: 'console', message: 'helt harmløst' })).toBeNull()
    expect(beforeBreadcrumb({ category: 'console', level: 'info', message: 'info' })).toBeNull()
  })

  it('slipper gjennom breadcrumbs fra andre kategorier', () => {
    const http = { category: 'http', data: { method: 'GET', status_code: 500 } }
    expect(beforeBreadcrumb(http)).toBe(http)

    const uten = { message: 'ingen kategori' }
    expect(beforeBreadcrumb(uten)).toBe(uten)
  })
})

describe('scrubbEvent – eksisterende extra/request-scrubbing (uendret)', () => {
  it('beholder kun whitelist-godkjente extra-nøkler', () => {
    const event = lagEvent({
      extra: { event: 'test.event', hemmelig: 'skal bort', code: '23505' },
    })

    expect(scrubbEvent(event)?.extra).toEqual({ event: 'test.event', code: '23505' })
  })

  it('fjerner request.data/headers/cookies/url', () => {
    const event = lagEvent({
      request: { data: 'body', headers: { a: '1' }, cookies: { b: '2' }, url: 'https://x.no' },
    })

    const resultat = scrubbEvent(event)
    expect(resultat?.request?.data).toBeUndefined()
    expect(resultat?.request?.headers).toBeUndefined()
    expect(resultat?.request?.cookies).toBeUndefined()
    // url fjernes også (#498-review) — query-strengen er ustyrt.
    expect(resultat?.request?.url).toBeUndefined()
  })
})
