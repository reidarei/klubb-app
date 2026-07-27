import { describe, it, expect, afterEach, vi } from 'vitest'
import { absoluttUrl, BASE_URL } from '@/lib/config'

// Enhetstester for URL-normaliseringen som lukket #507 (relative varsel-URL-er
// ble ødelagte lenker i e-post). Testene i varsler.test.ts går via full
// sendVarsel; her dekkes edge-casene helperen faktisk er skrevet for.
describe('absoluttUrl', () => {
  it('prefikser BASE_URL på en sti som starter med /', () => {
    expect(absoluttUrl('/chat')).toBe(`${BASE_URL}/chat`)
  })

  it('lar en absolutt http/https-URL være uendret', () => {
    expect(absoluttUrl('https://example.com/x')).toBe('https://example.com/x')
    expect(absoluttUrl('http://example.com/x')).toBe('http://example.com/x')
  })

  it('kjenner igjen absolutt URL uansett bokstavstørrelse på protokollen', () => {
    expect(absoluttUrl('HTTPS://example.com/x')).toBe('HTTPS://example.com/x')
  })

  it('gir protokoll-relativ URL https-prefiks (ubrukelig i e-post uten)', () => {
    expect(absoluttUrl('//example.com/x')).toBe('https://example.com/x')
  })

  it('returnerer en sti uten ledende / uendret i stedet for å kaste', () => {
    // Varsler skal aldri feile på en dårlig URL — kallestedet logges i
    // lib/varsler.ts i stedet (varsel.url.relativ).
    expect(absoluttUrl('chat')).toBe('chat')
  })
})

describe('getBaseUrl', () => {
  const opprinnelig = process.env.NEXT_PUBLIC_BASE_URL

  afterEach(() => {
    if (opprinnelig === undefined) delete process.env.NEXT_PUBLIC_BASE_URL
    else process.env.NEXT_PUBLIC_BASE_URL = opprinnelig
    vi.resetModules()
  })

  // Modulen må lastes på nytt fordi BASE_URL beregnes ved import.
  async function baseUrlMed(env: string) {
    process.env.NEXT_PUBLIC_BASE_URL = env
    vi.resetModules()
    const { getBaseUrl } = await import('@/lib/config')
    return getBaseUrl()
  }

  it('stripper trailing slash fra NEXT_PUBLIC_BASE_URL', async () => {
    expect(await baseUrlMed('https://klubben.no/')).toBe('https://klubben.no')
  })

  it('lar URL uten trailing slash være uendret', async () => {
    expect(await baseUrlMed('https://klubben.no')).toBe('https://klubben.no')
  })
})
