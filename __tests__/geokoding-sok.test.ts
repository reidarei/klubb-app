/**
 * Tester for lib/geokoding.ts: sokSteder() (#757) og en regresjonstest på
 * geokod() (uendret oppførsel etter uttrekket av nominatimFetch()/
 * nominatimUserAgent()).
 *
 * Mocker global fetch — ingen ekte Nominatim-kall. lib/config mockes med
 * faste verdier så User-Agent-strengen er forutsigbar på tvers av miljø.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/config', () => ({
  BASE_URL: 'https://klubben.test',
  VAPID_CONTACT_EMAIL: 'kontakt@klubben.test',
}))

import { geokod, sokSteder } from '@/lib/geokoding'
import { STED_SOK_MAKS_TREFF } from '@/lib/konstanter'

function jsonRespons(data: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => data,
  } as Response
}

describe('sokSteder() (#757)', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('bygger riktig URL (format, limit, q, User-Agent) uten nærhet', async () => {
    fetchMock.mockResolvedValueOnce(jsonRespons([]))
    await sokSteder('Karl Johans gate')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe('https://nominatim.openstreetmap.org/search')
    expect(parsed.searchParams.get('format')).toBe('jsonv2')
    expect(parsed.searchParams.get('limit')).toBe(String(STED_SOK_MAKS_TREFF))
    expect(parsed.searchParams.get('q')).toBe('Karl Johans gate')
    expect(parsed.searchParams.get('addressdetails')).toBe('1')
    expect(parsed.searchParams.has('viewbox')).toBe(false)
    expect(parsed.searchParams.has('bounded')).toBe(false)
    const headers = init.headers as Record<string, string>
    expect(headers['User-Agent']).toContain('klubb-app/1.0')
    expect(headers['User-Agent']).toContain('klubben.test')
  })

  it('med nærhet: sender viewbox rundet til 1 desimal og bounded=0 (preferanse, ikke filter)', async () => {
    fetchMock.mockResolvedValueOnce(jsonRespons([]))
    await sokSteder('Lorry', { lat: 59.923, lng: 10.741 })

    const [url] = fetchMock.mock.calls[0] as [string]
    const parsed = new URL(url)
    expect(parsed.searchParams.get('bounded')).toBe('0')
    // lat/lng rundet til 1 desimal: 59.9 / 10.7, viewbox = venstre,topp,høyre,bunn
    const viewbox = parsed.searchParams.get('viewbox')
    expect(viewbox).toBe('10.2,60.4,11.2,59.4')
  })

  it('mapper Nominatim-rader til StedTreff (navn fra display_name når name mangler)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonRespons([
        {
          place_id: 12345,
          name: '',
          display_name: 'Lorry, Parkveien, Oslo, Norge',
          lat: '59.9234',
          lon: '10.7267',
        },
        {
          place_id: 999,
          name: 'Grünerløkka',
          display_name: 'Grünerløkka, Oslo, Norge',
          lat: '59.923',
          lon: '10.758',
        },
      ]),
    )
    const svar = await sokSteder('lorry')
    expect(svar.utfall).toBe('treff')
    if (svar.utfall !== 'treff') throw new Error('forventet treff')
    expect(svar.treff).toHaveLength(2)
    expect(svar.treff[0]).toEqual({
      id: '12345',
      navn: 'Lorry',
      beskrivelse: 'Lorry, Parkveien, Oslo, Norge',
      lat: 59.9234,
      lng: 10.7267,
    })
    expect(svar.treff[1].navn).toBe('Grünerløkka')
  })

  // Et adressesøk ga bare «5B» i timeplanen: en adresse har ingen name,
  // og første ledd i display_name er husnummeret (#757).
  it("adresse blir «gate nummer», ikke bare husnummeret", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonRespons([
        {
          place_id: 1,
          name: "",
          display_name: "5B, Storgata, Sentrum, Oslo, 0184, Norge",
          address: { road: "Storgata", house_number: "5B" },
          lat: "59.85",
          lon: "10.83",
        },
        {
          place_id: 2,
          name: "Lorry",
          display_name: "Lorry, 12, Parkveien, Oslo, Norge",
          address: { road: "Parkveien", house_number: "12" },
          lat: "59.92",
          lon: "10.72",
        },
      ]),
    )
    const svar = await sokSteder("storgata 5b")
    if (svar.utfall !== "treff") throw new Error("forventet treff")
    expect(svar.treff[0].navn).toBe("Storgata 5B")
    // Et sted med eget navn (restaurant) beholder navnet — gate + nummer kun når name mangler.
    expect(svar.treff[1].navn).toBe("Lorry")
  })

  it('tom liste fra Nominatim gir utfall "ingen"', async () => {
    fetchMock.mockResolvedValueOnce(jsonRespons([]))
    const svar = await sokSteder('finnesikke123')
    expect(svar).toEqual({ utfall: 'ingen' })
  })

  it('tom søketekst gir "ingen" uten å kalle fetch', async () => {
    const svar = await sokSteder('   ')
    expect(svar).toEqual({ utfall: 'ingen' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('AbortError (timeout) gir utfall "tidsavbrudd"', async () => {
    fetchMock.mockImplementationOnce(() => {
      const err = new DOMException('The operation was aborted', 'AbortError')
      return Promise.reject(err)
    })
    const svar = await sokSteder('noe')
    expect(svar).toEqual({ utfall: 'tidsavbrudd' })
  })

  it('ikke-OK status gir utfall "feil"', async () => {
    fetchMock.mockResolvedValueOnce(jsonRespons({}, false, 503))
    const svar = await sokSteder('noe')
    expect(svar).toEqual({ utfall: 'feil' })
  })

  it('uventet svarformat (ikke array) gir utfall "feil"', async () => {
    fetchMock.mockResolvedValueOnce(jsonRespons({ error: 'Unable to geocode' }))
    const svar = await sokSteder('noe')
    expect(svar).toEqual({ utfall: 'feil' })
  })

  it('ugyldig JSON gir utfall "feil"', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token')
      },
    } as unknown as Response)
    const svar = await sokSteder('noe')
    expect(svar).toEqual({ utfall: 'feil' })
  })
})

describe('geokod() — regresjon etter uttrekk av nominatimFetch()', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('bygger URL med limit=1 og format=json (ikke jsonv2)', async () => {
    fetchMock.mockResolvedValueOnce(jsonRespons([{ lat: '59.91', lon: '10.75' }]))
    await geokod('Oslo')
    const [url] = fetchMock.mock.calls[0] as [string]
    const parsed = new URL(url)
    expect(parsed.searchParams.get('format')).toBe('json')
    expect(parsed.searchParams.get('limit')).toBe('1')
    expect(parsed.searchParams.get('q')).toBe('Oslo')
  })

  it('returnerer koordinat ved treff', async () => {
    fetchMock.mockResolvedValueOnce(jsonRespons([{ lat: '59.91', lon: '10.75' }]))
    const svar = await geokod('Oslo')
    expect(svar).toEqual({ lat: 59.91, lng: 10.75 })
  })

  it('returnerer null ved tomt treff, feil status eller nettverksfeil (best-effort, uendret)', async () => {
    fetchMock.mockResolvedValueOnce(jsonRespons([]))
    expect(await geokod('finnesikke')).toBeNull()

    fetchMock.mockResolvedValueOnce(jsonRespons({}, false, 500))
    expect(await geokod('feiler')).toBeNull()

    fetchMock.mockRejectedValueOnce(new Error('network down'))
    expect(await geokod('nettverksfeil')).toBeNull()
  })

  it('tom/whitespace-tekst gir null uten å kalle fetch', async () => {
    expect(await geokod('   ')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
