/**
 * Tester for «Nærmeste pub» (#727): naermesteFraOverpass() (ren logikk) og
 * finnNaermestePub() (mocket fetch — ingen ekte Overpass-kall).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/config', () => ({
  BASE_URL: 'https://klubben.test',
  VAPID_CONTACT_EMAIL: 'kontakt@klubben.test',
}))

import { finnNaermestePub, naermesteFraOverpass } from '@/lib/geokoding'

const fra = { lat: 59.9139, lng: 10.7522 }

describe('naermesteFraOverpass()', () => {
  it('velger nærmeste, uavhengig av rekkefølge, og leser center for ways', () => {
    const treff = naermesteFraOverpass(
      [
        { type: 'node', id: 1, lat: 59.93, lon: 10.78, tags: { name: 'Langt unna' } },
        { type: 'way', id: 2, center: { lat: 59.9145, lon: 10.7525 }, tags: { name: 'Nærmest' } },
        { type: 'node', id: 3, lat: 59.92, lon: 10.76, tags: { name: 'Midt imellom' } },
      ],
      fra,
    )
    expect(treff?.navn).toBe('Nærmest')
    expect(treff?.id).toBe('way/2')
    expect(treff?.beskrivelse).toMatch(/m unna$/)
  })

  it('hopper over elementer uten koordinater, og gir null når ingen er igjen', () => {
    expect(naermesteFraOverpass([{ type: 'node', id: 1 }], fra)).toBeNull()
    expect(naermesteFraOverpass([], fra)).toBeNull()
  })

  it('bruker adresse i beskrivelsen og fallback-navn uten name', () => {
    const treff = naermesteFraOverpass(
      [{ type: 'node', id: 1, lat: 59.9139, lon: 10.7522, tags: { 'addr:street': 'Storgata', 'addr:housenumber': '5', 'addr:city': 'Oslo' } }],
      fra,
    )
    expect(treff?.navn).toBe('Utested (uten navn)')
    expect(treff?.beskrivelse).toContain('Storgata 5, Oslo')
  })
})

describe('finnNaermestePub()', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('poster Overpass-spørring med User-Agent og returnerer nærmeste treff', async () => {
    // Formatet Overpass gir for `out center;`: noder med lat/lon på toppnivå,
    // ways/relations med kun `center` (ingen lat/lon). Begge skal kunne vinne.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        version: 0.6,
        elements: [
          { type: 'node', id: 7, lat: 59.914, lon: 10.753, tags: { amenity: 'pub', name: 'The Pub' } },
          { type: 'way', id: 8, center: { lat: 59.95, lon: 10.8 }, nodes: [1, 2, 3], tags: { amenity: 'pub', name: 'Langt unna' } },
        ],
      }),
    } as Response)
    const svar = await finnNaermestePub(fra)
    expect(svar).toMatchObject({ utfall: 'treff', treff: [{ id: 'node/7', navn: 'The Pub', lat: 59.914, lng: 10.753 }] })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://overpass-api.de/api/interpreter')
    expect((init.headers as Record<string, string>)['User-Agent']).toContain('klubben.test')
    const query = new URLSearchParams(String(init.body)).get('data') ?? ''
    // Bar og biergarten teller som pub; restauranter kun via navnet, filtrert
    // på et avgrenset sett (`.mat`) — se kommentaren i geokoding.ts.
    for (const k of ['pub', 'bar', 'biergarten']) expect(query).toContain(`nwr["amenity"="${k}"]`)
    expect(query).toMatch(/nwr\.mat\["name"~"[^"]*bodega[^"]*",i\]\["name"!~"[^"]*kaffe[^"]*",i\]/)
    // `out center tags;` utelater node-koordinatene — se kommentaren i geokoding.ts.
    expect(query).toMatch(/out center;$/)
  })

  it('gir «ingen» ved tom liste, «feil» ved ikke-OK og «tidsavbrudd» ved abort', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ elements: [] }) } as Response)
    expect((await finnNaermestePub(fra)).utfall).toBe('ingen')
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) } as Response)
    expect((await finnNaermestePub(fra)).utfall).toBe('feil')
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('abort'), { name: 'AbortError' }))
    expect((await finnNaermestePub(fra)).utfall).toBe('tidsavbrudd')
  })
})
