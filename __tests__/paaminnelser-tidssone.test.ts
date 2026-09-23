// Cron-regresjonstest for #675: dagStreng(addDays(norskDatoNaa(), n)) i
// lib/actions/paaminnelser.ts var riktig KUN fordi produksjonsserveren
// (Vercel, Dublin) tilfeldigvis står i UTC. Egen fil, adskilt fra
// __tests__/paaminnelser.test.ts og __tests__/paaminnelser-kaaring.test.ts
// — de mocker bort HELE @/lib/dato (vi.mock er fil-scopet), mens denne
// bruker den EKTE lib/dato.ts og i stedet fryser klokka med vi.useFakeTimers.
//
// Verifisert rød på main (før #675-fiksen) 2026-09-18: se PR-beskrivelsen —
// git stash push lib/actions/paaminnelser.ts lib/dato.ts, kjør denne fila,
// se den feile, git stash pop.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { lagChain } from './helpers/supabase-mock'

const mockSendPaaminne = vi.fn().mockResolvedValue(undefined)
const mockSendPurring = vi.fn().mockResolvedValue(undefined)
const mockSendArrangorPurring = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/varsler', () => ({
  sendPaaminneVarsler: (...a: unknown[]) => mockSendPaaminne(...a),
  sendPurringVarsler: (...a: unknown[]) => mockSendPurring(...a),
  sendArrangorPurringVarsler: (...a: unknown[]) => mockSendArrangorPurring(...a),
}))

const mockLoggFeil = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/logg', () => ({
  logg: { warn: vi.fn(), feil: (...a: unknown[]) => mockLoggFeil(...a) },
}))

import { kjorPaaminnelser } from '@/lib/actions/paaminnelser'

const OPPRINNELIG_TZ = process.env.TZ

// Samme knep som __tests__/dato-tidssone-matrise.test.ts, men async fordi
// kjorPaaminnelser er det — TZ restaureres FØRST etter at kjorPaaminnelser
// faktisk er ferdig, ikke bare etter at den synkrone prefiksen har returnert
// et pending Promise.
async function medTidssone<T>(tz: string, fn: () => Promise<T>): Promise<T> {
  process.env.TZ = tz
  try {
    return await fn()
  } finally {
    if (OPPRINNELIG_TZ === undefined) delete process.env.TZ
    else process.env.TZ = OPPRINNELIG_TZ
  }
}

afterAll(() => {
  if (OPPRINNELIG_TZ === undefined) delete process.env.TZ
  else process.env.TZ = OPPRINNELIG_TZ
})

// Fanger opp BEGGE grensene — .gte(…) og .lt(…) på 'start_tidspunkt' — for
// FØRSTE kall mot 'arrangementer'. Det er 7-dagers-spørringen
// (hentForDag(admin, PAAMINNELSE_DAGER.LANG)), som er første element i
// Promise.all-arrayet i kjorPaaminnelser. Ingen treff simuleres (data er alltid
// tom) — testen bryr seg kun om SPØRRINGSGRENSENE cronet faktisk sender, ikke
// om resultatet.
//
// Øvre grense fanges fordi vinduet er HALVÅPENT, [midnatt, neste midnatt): en
// test som bare så .gte ville forblitt grønn om .lt regresserte tilbake til det
// gamle T23:59:59-kuttet eller til feil dag-offset (review av #755).
type Fangst = { gte: string | null; lt: string | null }

function lagAdminMedFangst(fanget7: Fangst) {
  let arrangementerKall = 0
  return {
    from: vi.fn((tabell: string) => {
      if (tabell === 'arrangementer') {
        arrangementerKall++
        const chain = lagChain([])
        chain.gte = vi.fn((col: string, val: string) => {
          if (arrangementerKall === 1 && col === 'start_tidspunkt') {
            fanget7.gte = val
          }
          return chain
        })
        chain.lt = vi.fn((col: string, val: string) => {
          if (arrangementerKall === 1 && col === 'start_tidspunkt') {
            fanget7.lt = val
          }
          return chain
        })
        return chain
      }
      // 'poll' (fresh + retry, kalt fra behandleKaaringspoller) og
      // 'arrangoransvar' trenger ingen fangst her — tom liste holder dem
      // ute av testens vei (koe.length === 0 gir tidlig retur).
      return lagChain([])
    }),
  } as unknown as Parameters<typeof kjorPaaminnelser>[0]
}

describe('kjorPaaminnelser — 7-dagers-vinduet er tidssone-uavhengig (#675)', () => {
  beforeAll(() => {
    vi.useFakeTimers()
    // 11. september 2026, 01:30 norsk tid (sommertid, UTC+2) — timen der
    // UTC-dagen (10.) og Oslo-dagen (11.) divergerer. «I dag» i Oslo er 11.,
    // så 7-dagers-vinduet skal starte 18. september.
    vi.setSystemTime(new Date('2026-09-10T23:30:00Z'))
  })
  afterAll(() => {
    vi.useRealTimers()
  })

  // Norsk midnatt 18. september 2026, sommertid (UTC+2) → 17. sept 22:00 UTC.
  const FORVENTET_GTE_7 = '2026-09-17T22:00:00.000Z'
  // Øvre grense: NESTE norske midnatt (19. september 00:00, fortsatt UTC+2) →
  // 18. sept 22:00 UTC. Eksakt literal, ikke utledet av FORVENTET_GTE_7 + 24 t
  // — en utledning ville vært enig med produksjonskoden også når begge tok feil,
  // og det er nøyaktig fella #675 handlet om. Her er døgnet 24 timer fordi
  // vinduet ligger midt i sommertid; at selve midnatts-konverteringen også
  // treffer på vinterens UTC+1 er dekket av vintertid-blokka i
  // __tests__/dato-tidssone-matrise.test.ts.
  const FORVENTET_LT_7 = '2026-09-18T22:00:00.000Z'

  const SONER = ['UTC', 'Europe/Oslo', 'America/Los_Angeles', 'Pacific/Kiritimati']

  for (const tz of SONER) {
    it(`7-dagers-vinduet er 18. september (halvåpent) uansett prosess-TZ (${tz})`, async () => {
      await medTidssone(tz, async () => {
        const fanget7: Fangst = { gte: null, lt: null }
        const admin = lagAdminMedFangst(fanget7)

        await kjorPaaminnelser(admin)

        expect(fanget7.gte).toBe(FORVENTET_GTE_7)
        expect(fanget7.lt).toBe(FORVENTET_LT_7)
      })
    })
  }
})
