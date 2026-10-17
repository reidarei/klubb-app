// @vitest-environment jsdom
// Innloggingssidens feiltekster (#869): bare invalid_credentials betyr «feil
// passord». Alt annet (429, nettverk, hook-/serverfeil) skal ikke late som det.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react'
import LoginSide from '@/app/(auth)/login/page'
import { innloggingsFeil } from '@/lib/innlogging-feil'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

const signInWithPassword = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signInWithPassword, resetPasswordForEmail: vi.fn() } }),
}))
vi.mock('@/lib/pending-nav', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/pending-nav')>()),
  lesPendingNav: vi.fn(async () => null),
  slettPendingNav: vi.fn(async () => undefined),
}))
vi.mock('@/lib/klient-logg', () => ({ sendFeilBeacon: vi.fn() }))
const { sendFeilBeacon } = await import('@/lib/klient-logg') as unknown as {
  sendFeilBeacon: ReturnType<typeof vi.fn>
}

describe('innloggingsFeil()', () => {
  it('invalid_credentials → gammel tekst, ingen beacon', () => {
    expect(innloggingsFeil({ code: 'invalid_credentials', status: 400 }))
      .toEqual({ tekst: 'Feil e-post eller passord.', beacon: null })
  })
  it('429 → rate-limit-tekst, warn', () => {
    expect(innloggingsFeil({ code: 'over_request_rate_limit', status: 429 }))
      .toEqual({ tekst: 'For mange forsøk. Vent litt og prøv igjen.', beacon: { nivaa: 'warn' } })
    expect(innloggingsFeil({ status: 429 }).beacon).toEqual({ nivaa: 'warn' })
  })
  it('status 0 → nettverkstekst, warn', () => {
    expect(innloggingsFeil({ status: 0 }))
      .toEqual({ tekst: 'Fikk ikke kontakt. Sjekk nettet og prøv igjen.', beacon: { nivaa: 'warn' } })
  })
  it('500 / unexpected_failure → «noe gikk galt», error', () => {
    for (const e of [{ code: 'unexpected_failure', status: 500 }, { status: 500 }, { code: 'noe_annet', status: 422 }]) {
      expect(innloggingsFeil(e))
        .toEqual({ tekst: 'Noe gikk galt hos oss — prøv igjen om litt', beacon: { nivaa: 'error' } })
    }
  })
})

describe('LoginSide — feiltekst og beacon', () => {
  beforeEach(() => sendFeilBeacon.mockClear())
  afterEach(() => { cleanup(); signInWithPassword.mockReset() })

  async function provMed(error: object) {
    signInWithPassword.mockResolvedValue({ error })
    render(<LoginSide />)
    fireEvent.change(screen.getByLabelText('E-post'), { target: { value: 'ole@example.com' } })
    fireEvent.change(screen.getByLabelText('Passord'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: /logg inn/i }))
    await waitFor(() => expect(signInWithPassword).toHaveBeenCalled())
  }

  it('invalid_credentials: gammel tekst, ingen beacon', async () => {
    await provMed({ code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' })
    expect(await screen.findByText('Feil e-post eller passord.')).toBeTruthy()
    expect(sendFeilBeacon).not.toHaveBeenCalled()
  })

  it('500 unexpected_failure: ny tekst, beacon på nivå error', async () => {
    await provMed({ code: 'unexpected_failure', status: 500, message: 'Error running hook URI' })
    expect(await screen.findByText('Noe gikk galt hos oss — prøv igjen om litt')).toBeTruthy()
    expect(sendFeilBeacon).toHaveBeenCalledWith(
      'klient.innlogging.feilet', 'Error running hook URI', undefined,
      { code: 'unexpected_failure', status: 500 }, 'error')
  })

  it('429 og status 0: egne tekster, beacon på nivå warn', async () => {
    await provMed({ code: 'over_request_rate_limit', status: 429, message: 'rate' })
    expect(await screen.findByText('For mange forsøk. Vent litt og prøv igjen.')).toBeTruthy()
    expect(sendFeilBeacon.mock.calls[0][4]).toBe('warn')
    cleanup(); sendFeilBeacon.mockClear()
    await provMed({ status: 0, message: 'Failed to fetch' })
    expect(await screen.findByText('Fikk ikke kontakt. Sjekk nettet og prøv igjen.')).toBeTruthy()
    expect(sendFeilBeacon.mock.calls[0][4]).toBe('warn')
  })
})
