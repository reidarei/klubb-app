import { describe, it, expect, vi, beforeEach } from 'vitest'

// onRequestError står INNE i Next sin feilhåndtering. Kaster den, legger den
// seg oppå — og kan maskere — den ekte feilen den nettopp skulle beskrive.
// Denne fila pinner at den aldri gjør det, uansett hva loggingen finner på.

const mockLoggRenderFeil = vi.fn()
vi.mock('@/lib/logg', () => ({
  loggRenderFeil: (...args: unknown[]) => mockLoggRenderFeil(...args),
}))

const mockCaptureRequestError = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  captureRequestError: (...args: unknown[]) => mockCaptureRequestError(...args),
}))

// SENTRY_DSN tom = den vanlige tilstanden i dev, og muligens i prod. Hele
// poenget med #631 er at feil_logg-skrivingen skjer UANSETT.
vi.mock('@/lib/config', () => ({ SENTRY_DSN: '' }))

import { onRequestError } from '@/instrumentation'

type OnRequestErrorArgs = Parameters<typeof onRequestError>

// Minimal request/context — vi bryr oss bare om routePath.
function kallMed(error: unknown, routePath = '/') {
  return onRequestError(
    ...([
      error,
      { path: routePath, method: 'GET', headers: {} },
      { routerKind: 'App Router', routePath, routeType: 'render' },
    ] as unknown as OnRequestErrorArgs)
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('onRequestError — server-render-feil (#631)', () => {
  it('videreformidler digest og rutemønster til feil_logg', async () => {
    mockLoggRenderFeil.mockResolvedValue(undefined)
    const feil = Object.assign(new Error('Kunne ikke hente arrangementer'), {
      digest: '217913069',
    })

    await kallMed(feil, '/')

    expect(mockLoggRenderFeil).toHaveBeenCalledWith({
      error: feil,
      rute: '/',
      digest: '217913069',
    })
  })

  it('logger selv når SENTRY_DSN er tom — det er hele poenget med #631', async () => {
    mockLoggRenderFeil.mockResolvedValue(undefined)

    await kallMed(new Error('noe gikk galt'))

    expect(mockLoggRenderFeil).toHaveBeenCalledTimes(1)
    // Uten DSN skal Sentry aldri røres.
    expect(mockCaptureRequestError).not.toHaveBeenCalled()
  })

  it('kaster ikke når loggingen selv avviser', async () => {
    mockLoggRenderFeil.mockRejectedValue(new Error('feil_logg utilgjengelig'))

    await expect(kallMed(new Error('den ekte feilen'))).resolves.toBeUndefined()
  })

  it('kaster ikke når loggingen kaster synkront', async () => {
    mockLoggRenderFeil.mockImplementation(() => {
      throw new Error('uventet')
    })

    await expect(kallMed(new Error('den ekte feilen'))).resolves.toBeUndefined()
  })

  it('siste skanse logger tidspunkt og feilklasse — ellers er den ikke til å feilsøke', async () => {
    // Copilot-funn på #637: en catch som bare sier «loggingen feilet» gjør det
    // umulig å se HVORFOR vi mistet sporet, akkurat når vi trengte det.
    mockLoggRenderFeil.mockRejectedValue(new TypeError('import mislyktes'))
    const loggSpion = vi.spyOn(console, 'log')

    await kallMed(new Error('den ekte feilen'))

    const linje = loggSpion.mock.calls
      .map(c => String(c[0]))
      .find(l => l.includes('server.render.logging.feilet'))
    expect(linje).toBeDefined()

    const rad = JSON.parse(linje!)
    expect(rad.nivaa).toBe('warn')
    expect(rad.navn).toBe('TypeError')
    expect(Number.isNaN(Date.parse(rad.ts))).toBe(false)
    // Meldingen skal ALDRI med: vi er utenfor maskerRadverdier() her, og en
    // videresendt PostgREST-melding kan bære radverdier.
    expect(linje).not.toContain('import mislyktes')
  })

  it('sender undefined digest videre uten å kaste når feilen mangler den', async () => {
    mockLoggRenderFeil.mockResolvedValue(undefined)

    await expect(kallMed(null)).resolves.toBeUndefined()
    expect(mockLoggRenderFeil).toHaveBeenCalledWith(
      expect.objectContaining({ digest: undefined }),
    )
  })
})
