import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  finnPaagaaendeArrangement,
  finnPaagaaendeArrangementStrengt,
  ARRANGEMENT_ANTATT_TIMER,
} from '@/lib/posisjon'
import { DbFeil } from '@/lib/logg'
import type { SupabaseClient } from '@supabase/supabase-js'

// Pinner regelen #735 rettet: et arrangement MED sluttid pågår til sluttiden,
// uansett hvor lenge siden det startet. Fram til da lå 12-timersgrensen i
// spørringen og gjaldt begge grener, så en flerdagstur sluttet å være
// «pågående» fra og med dag 2 — midt i turen. Konkret tilfelle: Reisekomiteen
// 17.–20. september 2026, som falt ut 17. kl. 21 UTC med tre døgn igjen.
//
// Testen stubber Supabase-kjeden framfor å treffe en database: regelen vi
// vokter bor i .find()-en etter spørringen, ikke i spørringen.
function stubKlient(rader: Array<Record<string, unknown>>) {
  const kjede = {
    select: () => kjede,
    lte: () => kjede,
    gte: () => kjede,
    order: () => kjede,
    limit: () => Promise.resolve({ data: rader, error: null }),
  }
  return { from: () => kjede } as unknown as SupabaseClient
}

// Samme kjede, men spørringen feiler. Brukes til å pinne skillet mellom de to
// variantene (#723-review).
function stubKlientMedFeil(code = 'PGRST000') {
  const kjede = {
    select: () => kjede,
    lte: () => kjede,
    gte: () => kjede,
    order: () => kjede,
    limit: () => Promise.resolve({ data: null, error: { code, message: 'nede' } }),
  }
  return { from: () => kjede } as unknown as SupabaseClient
}

const timer = (n: number) => n * 60 * 60 * 1000

afterEach(() => vi.useRealTimers())

describe('finnPaagaaendeArrangement — varighet (#735)', () => {
  it('en flerdagstur pågår fortsatt på dag 2, lenge etter 12-timersvinduet', async () => {
    const start = new Date('2026-09-17T09:00:00Z')
    const slutt = new Date('2026-09-20T16:00:00Z')
    vi.useFakeTimers().setSystemTime(new Date('2026-09-18T12:00:00Z'))

    const tur = await finnPaagaaendeArrangement(
      stubKlient([
        { id: 'a1', tittel: 'Reisekomiteen', start_tidspunkt: start.toISOString(), slutt_tidspunkt: slutt.toISOString() },
      ]),
    )
    expect(tur?.tittel).toBe('Reisekomiteen')
  })

  it('samme tur er over etter sluttiden', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-20T17:00:00Z'))
    const tur = await finnPaagaaendeArrangement(
      stubKlient([
        { id: 'a1', tittel: 'Reisekomiteen', start_tidspunkt: '2026-09-17T09:00:00Z', slutt_tidspunkt: '2026-09-20T16:00:00Z' },
      ]),
    )
    expect(tur).toBeNull()
  })

  it('uten sluttid gjelder fortsatt antatt varighet — ellers ville et gammelt arrangement pågått evig', async () => {
    const naa = new Date('2026-09-18T12:00:00Z')
    vi.useFakeTimers().setSystemTime(naa)
    const foerVinduet = new Date(naa.getTime() - timer(ARRANGEMENT_ANTATT_TIMER + 1)).toISOString()
    const iVinduet = new Date(naa.getTime() - timer(2)).toISOString()

    expect(
      await finnPaagaaendeArrangement(
        stubKlient([{ id: 'a1', tittel: 'Gammelt møte', start_tidspunkt: foerVinduet, slutt_tidspunkt: null }]),
      ),
    ).toBeNull()

    expect(
      (await finnPaagaaendeArrangement(
        stubKlient([{ id: 'a2', tittel: 'Kveldens møte', start_tidspunkt: iVinduet, slutt_tidspunkt: null }]),
      ))?.tittel,
    ).toBe('Kveldens møte')
  })

  it('velger den som startet sist når to overlapper', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-18T12:00:00Z'))
    // Spørringen sorterer start_tidspunkt desc, så stubben leverer i samme rekkefølge.
    const tur = await finnPaagaaendeArrangement(
      stubKlient([
        { id: 'sist', tittel: 'Sist startet', start_tidspunkt: '2026-09-18T08:00:00Z', slutt_tidspunkt: '2026-09-19T08:00:00Z' },
        { id: 'foerst', tittel: 'Først startet', start_tidspunkt: '2026-09-17T09:00:00Z', slutt_tidspunkt: '2026-09-20T16:00:00Z' },
      ]),
    )
    expect(tur?.tittel).toBe('Sist startet')
  })
})

// «Ingen tur pågår» og «oppslaget feilet» så identiske ut i returverdien `null`
// fram til #723-reviewen. Kartmodus (reisemodus/møtemodus) må kunne skille dem
// for å kunne logge kartmodus.oppslag.feilet; posisjonsdeling må FORTSATT
// fail-ope. Testen
// pinner begge halvdelene, så en fremtidig forenkling til én variant feiler her
// i stedet for å bli oppdaget i prod som stillhet.
describe('finnPaagaaendeArrangement — feil vs. ingen tur (#723)', () => {
  it('den strenge varianten kaster DbFeil med PostgREST-koden i behold', async () => {
    await expect(finnPaagaaendeArrangementStrengt(stubKlientMedFeil('42501'))).rejects.toMatchObject({
      name: 'DbFeil',
      code: '42501',
    })
  })

  it('den vanlige varianten er uendret fail-open: null, men logget', async () => {
    const logglinjer = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      expect(await finnPaagaaendeArrangement(stubKlientMedFeil('42501'))).toBeNull()
      const events = logglinjer.mock.calls.map(([linje]) => String(linje))
      expect(events.some(l => l.includes('posisjon.paagaaende.feilet') && l.includes('42501'))).toBe(true)
    } finally {
      logglinjer.mockRestore()
    }
  })

  it('DbFeil er klassen, ikke en naken Error — koden må overleve innpakkingen', () => {
    expect(new DbFeil('x', 'PGRST116').code).toBe('PGRST116')
  })
})
