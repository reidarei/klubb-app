/**
 * Pinner at app/error.tsx aldri viser rå feiltekst til brukeren.
 *
 * Bakgrunn: Next 15 maskerer feilmeldinger som stammer fra server components
 * i prod-bygg og bytter dem med en engelsk boilerplate («An error occurred in
 * the Server Components render. The specific message is omitted in production
 * builds…»). Da vi begynte å kaste synlige feil i stedet for å svelge dem
 * (Policy: Databasespørringer), betydde det at brukeren fikk fem linjer
 * engelsk teknobabbel i stedet for en tom side. Boundaryen skal derfor alltid
 * vise fast norsk tekst — selve meldingen går til feil_logg via beaconen.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import Error, { FEIL_BRODTEKST } from '@/app/error'

// Ordrett boilerplate Next 15 setter inn i prod når en server component kaster.
const NEXT_BOILERPLATE =
  'An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.'

beforeEach(() => {
  // sendBeacon finnes ikke i jsdom — stubbes så useEffect ikke kaster.
  vi.stubGlobal('navigator', { ...window.navigator, sendBeacon: vi.fn() })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function lagFeil(message: string, digest?: string): Error & { digest?: string } {
  const feil = new globalThis.Error(message) as globalThis.Error & { digest?: string }
  if (digest) feil.digest = digest
  return feil
}

describe('app/error.tsx', () => {
  it('viser fast norsk brødtekst i stedet for Next-boilerplaten', () => {
    render(<Error error={lagFeil(NEXT_BOILERPLATE, 'a1b2c3d4')} reset={() => {}} />)

    expect(screen.getByText(FEIL_BRODTEKST)).toBeInTheDocument()
    // Ikke ett ord av boilerplaten skal nå skjermen.
    expect(document.body.textContent).not.toContain('An error occurred')
    expect(document.body.textContent).not.toContain('omitted in production builds')
    expect(document.body.textContent).not.toContain('digest property')
  })

  it('lekker heller ikke en rå intern feilmelding (f.eks. PostgREST-tekst)', () => {
    const raa = 'Kunne ikke hente statistikk: JSON object requested, multiple (or no) rows returned'
    render(<Error error={lagFeil(raa, 'deadbeef')} reset={() => {}} />)

    expect(document.body.textContent).not.toContain('JSON object requested')
    expect(document.body.textContent).not.toContain(raa)
    expect(screen.getByText(FEIL_BRODTEKST)).toBeInTheDocument()
  })

  it('brødteksten er norsk og handlingsrettet — ikke en teknisk streng', () => {
    // Vakt mot at noen «forbedrer» teksten tilbake til error.message-varianten.
    expect(FEIL_BRODTEKST).toMatch(/Prøv igjen/)
    expect(FEIL_BRODTEKST).not.toMatch(/[Ee]rror|[Ss]erver [Cc]omponents|digest/)
  })

  it('beholder digest-hashen — den er nøkkelen inn i feil_logg', () => {
    render(<Error error={lagFeil(NEXT_BOILERPLATE, 'a1b2c3d4')} reset={() => {}} />)
    expect(screen.getByText(/a1b2c3d4/)).toBeInTheDocument()
  })

  it('viser ingen feilkode-linje når digest mangler', () => {
    render(<Error error={lagFeil('noe rart')} reset={() => {}} />)
    expect(screen.queryByText(/Feilkode/)).not.toBeInTheDocument()
  })

  it('beholder «Prøv igjen» og «Til forsiden»', () => {
    const reset = vi.fn()
    render(<Error error={lagFeil(NEXT_BOILERPLATE, 'x1')} reset={reset} />)

    const proev = screen.getByRole('button', { name: 'Prøv igjen' })
    expect(proev).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Til forsiden' })).toBeInTheDocument()
    proev.click()
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('sender fortsatt den ekte meldingen til feil-loggen', () => {
    const sendBeacon = vi.fn()
    vi.stubGlobal('navigator', { ...window.navigator, sendBeacon })
    render(<Error error={lagFeil(NEXT_BOILERPLATE, 'a1b2c3d4')} reset={() => {}} />)

    expect(sendBeacon).toHaveBeenCalledTimes(1)
    const [url, blob] = sendBeacon.mock.calls[0] as [string, Blob]
    expect(url).toBe('/api/logg-feil')
    expect(blob).toBeInstanceOf(Blob)
  })
})
