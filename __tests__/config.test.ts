import { describe, it, expect, afterEach, vi } from 'vitest'
import { absoluttUrl, BASE_URL } from '@/lib/config'
import { KLUBB_DOMENE } from '@/lib/klubb-config'

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

// getBaseUrl() beregnes ved modul-load (BASE_URL = getBaseUrl()), så hver
// case må stubbe env FØR et friskt import og resette modulcachen etterpå —
// ellers lekker én cases env inn i neste (#687).
describe('getBaseUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  async function hentGetBaseUrl() {
    vi.resetModules()
    const mod = await import('@/lib/config')
    return mod.getBaseUrl
  }

  it('eksplisitt NEXT_PUBLIC_BASE_URL vinner over VERCEL_ENV=production', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://www.klubb.example.com')
    vi.stubEnv('VERCEL_ENV', 'production')
    const getBaseUrl = await hentGetBaseUrl()
    expect(getBaseUrl()).toBe('https://www.klubb.example.com')
  })

  it('stripper trailing slash fra NEXT_PUBLIC_BASE_URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://klubben.no/')
    const getBaseUrl = await hentGetBaseUrl()
    expect(getBaseUrl()).toBe('https://klubben.no')
  })

  it('lar URL uten trailing slash være uendret', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://klubben.no')
    const getBaseUrl = await hentGetBaseUrl()
    expect(getBaseUrl()).toBe('https://klubben.no')
  })

  it('VERCEL_ENV=preview + VERCEL_URL uten eksplisitt override → deployets egen host', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '')
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('VERCEL_URL', 'klubb-git-feature-abc.vercel.app')
    const getBaseUrl = await hentGetBaseUrl()
    expect(getBaseUrl()).toBe('https://klubb-git-feature-abc.vercel.app')
  })

  it('VERCEL_ENV=preview uten VERCEL_URL kaster i stedet for å falle til prod-URL (#687-review)', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '')
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('VERCEL_URL', '')
    // NODE_ENV=production er ikke pynt i denne testen — det er nøyaktig slik
    // Vercel bygger en preview. Uten det eksplisitte kastet ville neste gren
    // returnert PROD_URL, og preview-varsler ville pekt inn i produksjon.
    vi.stubEnv('NODE_ENV', 'production')
    vi.resetModules()
    await expect(import('@/lib/config')).rejects.toThrow(/VERCEL_ENV=preview/)
  })

  it('VERCEL_ENV=production uten eksplisitt override kaster (#687)', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '')
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('VERCEL_URL', 'klubb.vercel.app')
    vi.resetModules()
    // export const BASE_URL = getBaseUrl() kjører på modul-load — kastet
    // skjer altså under selve importen, ikke ved et etterfølgende kall. En
    // prod-deploy uten eksplisitt BASE_URL skal stoppe BYGGET, ikke gjette
    // seg til en URL som kan avvike fra den kanoniske verten.
    await expect(import('@/lib/config')).rejects.toThrow(/NEXT_PUBLIC_BASE_URL/)
  })

  it('lokalt prod-bygg uten Vercel (NODE_ENV=production, ingen VERCEL_ENV) → PROD_URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '')
    vi.stubEnv('VERCEL_ENV', '')
    vi.stubEnv('VERCEL_URL', '')
    vi.stubEnv('NODE_ENV', 'production')
    const getBaseUrl = await hentGetBaseUrl()
    expect(getBaseUrl()).toBe(`https://${KLUBB_DOMENE}`)
  })

  it('ellers (test/dev) → localhost', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '')
    vi.stubEnv('VERCEL_ENV', '')
    vi.stubEnv('VERCEL_URL', '')
    vi.stubEnv('NODE_ENV', 'test')
    const getBaseUrl = await hentGetBaseUrl()
    expect(getBaseUrl()).toBe('http://localhost:3000')
  })
})

describe('relativUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  async function hentRelativUrlMed(baseUrl: string) {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', baseUrl)
    vi.resetModules()
    const mod = await import('@/lib/config')
    return mod.relativUrl
  }

  it('egen origin → pathname alene', async () => {
    const relativUrl = await hentRelativUrlMed('https://klubb.example.com')
    expect(relativUrl('https://klubb.example.com/chat')).toEqual({ sti: '/chat', utfall: 'ok' })
  })

  // Regresjonspinne mot #687: BASE_URL var apex mens appen serveres fra www.
  // Service Workeren avviste enhver push-URL som kryss-origin fordi de to
  // strengene aldri er like — relativUrl() må derfor godta www-søskenet.
  it('apex når BASE_URL er www, og omvendt → ok (www/apex-toleransen, #687)', async () => {
    const medWww = await hentRelativUrlMed('https://www.klubb.example.com')
    expect(medWww('https://klubb.example.com/chat')).toEqual({ sti: '/chat', utfall: 'ok' })

    const medApex = await hentRelativUrlMed('https://klubb.example.com')
    expect(medApex('https://www.klubb.example.com/chat')).toEqual({ sti: '/chat', utfall: 'ok' })
  })

  it('bevarer path, query og hash (reelle push-mål: /album/a?bilde=b#c)', async () => {
    const relativUrl = await hentRelativUrlMed('https://klubb.example.com')
    expect(relativUrl('https://klubb.example.com/album/a?bilde=b#c')).toEqual({
      sti: '/album/a?bilde=b#c',
      utfall: 'ok',
    })
  })

  it('fremmed origin → sti "/" og utfall fremmed, tar aldri pathname fra inputen', async () => {
    const relativUrl = await hentRelativUrlMed('https://klubb.example.com')
    expect(relativUrl('https://evil.example/hemmelig')).toEqual({ sti: '/', utfall: 'fremmed' })
  })

  it('malformert URL → sti "/" og utfall ugyldig', async () => {
    const relativUrl = await hentRelativUrlMed('https://klubb.example.com')
    expect(relativUrl('http://[')).toEqual({ sti: '/', utfall: 'ugyldig' })
  })

  it('relativ input (allerede en sti) → ok', async () => {
    const relativUrl = await hentRelativUrlMed('https://klubb.example.com')
    expect(relativUrl('/chat')).toEqual({ sti: '/chat', utfall: 'ok' })
  })
})
