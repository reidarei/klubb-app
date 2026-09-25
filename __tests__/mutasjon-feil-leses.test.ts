// #760: forkastede mutasjonsresultater kastes nå (kritisk) eller logges (kompenserende/best-effort).
// Mock-oppsett kopiert fra __tests__/actions-ikke-funnet.test.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lagChain } from './helpers/supabase-mock'

const { mockFrom, mockSupabase, mockDeleteUser, mockRevalidatePath } = vi.hoisted(() => {
  const mockFrom = vi.fn<(tabell: string) => unknown>()
  const mockDeleteUser = vi.fn()
  const mockSupabase = {
    from: mockFrom,
    auth: { admin: { deleteUser: mockDeleteUser } },
  }
  const mockRevalidatePath = vi.fn()
  return { mockFrom, mockSupabase, mockDeleteUser, mockRevalidatePath }
})

vi.mock('@/lib/auth', () => ({
  ensureAdmin: vi.fn().mockResolvedValue({
    supabase: mockSupabase,
    user: { id: 'admin-1' },
    profil: { rolle: 'admin' },
  }),
  ensureInnlogget: vi.fn().mockResolvedValue({ supabase: mockSupabase, user: { id: 'admin-1' } }),
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => mockSupabase }))
vi.mock('@/lib/supabase/server', () => ({ createServerClient: vi.fn().mockResolvedValue(mockSupabase) }))
vi.mock('@/lib/auth-cache', () => ({
  getProfil: vi.fn().mockResolvedValue({ rolle: 'admin' }),
  getInnloggetBruker: vi.fn().mockResolvedValue({ id: 'admin-1' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => mockRevalidatePath(...a) }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((..._a: unknown[]): never => { throw new Error('NEXT_REDIRECT') }),
}))
vi.mock('@/lib/varsler', () => ({
  sendVarsel: vi.fn().mockResolvedValue({}),
  sendNyPollVarsler: vi.fn().mockResolvedValue(undefined),
  sendKaaringspollOpprettetVarsel: vi.fn().mockResolvedValue(undefined),
  sendKaaringspollVinnerVarsel: vi.fn().mockResolvedValue(undefined),
  sendNyttArrangementVarsler: vi.fn().mockResolvedValue(undefined),
  sendOppdatertVarsler: vi.fn().mockResolvedValue(undefined),
  sendPurringVarsler: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/varsler-kaaringspoll', () => ({
  behandleKaaringspollAvsluttResultat: vi.fn().mockResolvedValue(undefined),
  stempleVinnerVarslet: vi.fn().mockResolvedValue(undefined),
  stempleKaaringspollVarslet: vi.fn().mockResolvedValue(undefined),
  erKaaringUtfall: vi.fn().mockReturnValue(false),
}))
vi.mock('@/lib/logg', () => ({ logg: { warn: vi.fn(), feil: vi.fn() } }))
vi.mock('@/lib/r2', () => ({ r2StiFraUrl: vi.fn(), slettR2: vi.fn() }))

import { slettMedlem } from '@/lib/actions/profil'
import { oppdaterVedtekt } from '@/lib/actions/vedtekter'
import { oppdaterBursdagsgratulasjon } from '@/app/(app)/innstillinger/actions'
import { opprettPoll } from '@/lib/actions/poll'
import { opprettKaaringspoll } from '@/lib/actions/kaaringspoll'
import { oppdaterKontantSaldo } from '@/lib/actions/fond'
import { opprettMelding } from '@/lib/actions/meldinger'
import { logg } from '@/lib/logg'
import { ensureAdmin } from '@/lib/auth'

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── slettMedlem (lib/actions/profil.ts) ────────────────────────────────────

describe('slettMedlem', () => {
  const id = 'medlem-1'
  const avhengigeTabeller = ['paameldinger', 'push_subscriptions', 'arrangoransvar'] as const

  it.each(avhengigeTabeller)(
    'kaster og kaller IKKE deleteUser når slettingen/oppdateringen av %s feiler',
    async (feilendeTabell) => {
      mockFrom.mockImplementation((tabell: string) =>
        lagChain(null, tabell === feilendeTabell ? { message: `${feilendeTabell} feilet` } : null),
      )
      mockDeleteUser.mockResolvedValue({ error: null })

      await expect(slettMedlem(id)).rejects.toThrow(`${feilendeTabell} feilet`)
      expect(mockDeleteUser).not.toHaveBeenCalled()
    },
  )

  it('kaller deleteUser nøyaktig én gang når alle avhengige rader ble ryddet uten feil', async () => {
    mockFrom.mockImplementation(() => lagChain(null))
    mockDeleteUser.mockResolvedValue({ error: null })

    // redirect() er stubbet til å kaste — det er forventet etter vellykket sletting
    await expect(slettMedlem(id)).rejects.toThrow('NEXT_REDIRECT')
    expect(mockDeleteUser).toHaveBeenCalledTimes(1)
    expect(mockDeleteUser).toHaveBeenCalledWith(id)
  })
})

// ─── oppdaterVedtekt (lib/actions/vedtekter.ts) ─────────────────────────────

describe('oppdaterVedtekt — insert/update-feil', () => {
  const input = { slug: 'vedtekter', nyttInnhold: 'nytt', vedtaksdato: '2026-01-01', endringsnotat: 'endra' }

  it('kaster når versjonerings-inserten feiler, og oppdaterer IKKE gjeldende innhold', async () => {
    mockFrom.mockImplementation((tabell: string) => {
      if (tabell === 'vedtekter') return lagChain({ id: 'v1', innhold: 'gammelt' })
      if (tabell === 'vedtekter_versjoner') return lagChain(null, { message: 'insert feilet' })
      return lagChain(null)
    })

    await expect(oppdaterVedtekt(input)).rejects.toThrow('Kunne ikke lagre vedtektsversjon: insert feilet')

    // 'vedtekter' skal kun ha vært spurt ÉN gang (select) — update skal aldri ha skjedd
    const vedtekterKall = mockFrom.mock.calls.filter(([t]) => t === 'vedtekter')
    expect(vedtekterKall).toHaveLength(1)
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('kaster når selve oppdateringen feiler, etter at versjoneringen lyktes', async () => {
    let vedtekterKall = 0
    const selectChain = lagChain({ id: 'v1', innhold: 'gammelt' })
    const updateChain = lagChain(null, { message: 'update feilet' })
    mockFrom.mockImplementation((tabell: string) => {
      if (tabell === 'vedtekter') {
        vedtekterKall++
        return vedtekterKall === 1 ? selectChain : updateChain
      }
      if (tabell === 'vedtekter_versjoner') return lagChain(null)
      return lagChain(null)
    })

    await expect(oppdaterVedtekt(input)).rejects.toThrow('Kunne ikke oppdatere vedtekten: update feilet')
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })
})

// ─── oppdaterBursdagsgratulasjon (app/(app)/innstillinger/actions.ts) ───────

describe('oppdaterBursdagsgratulasjon', () => {
  it('kaster når profiles-oppdateringen feiler', async () => {
    mockFrom.mockImplementation(() => lagChain(null, { message: 'DB nede' }))

    await expect(oppdaterBursdagsgratulasjon(true)).rejects.toThrow(
      'Kunne ikke lagre bursdagsgratulasjon-valget: DB nede',
    )
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('skriver kun egen rad via ensureAdmin-klienten og revaliderer /innstillinger', async () => {
    const chain = lagChain(null)
    mockFrom.mockImplementation(() => chain)

    await expect(oppdaterBursdagsgratulasjon(true)).resolves.toBeUndefined()
    expect(ensureAdmin).toHaveBeenCalledTimes(1)
    expect(mockFrom).toHaveBeenCalledWith('profiles')
    expect(chain.update).toHaveBeenCalledWith({ bursdagsgratulasjon_aktiv: true })
    expect(chain.eq).toHaveBeenCalledWith('id', 'admin-1')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/innstillinger')
  })

  it('avviser ikke-admin med kast og skriver ingenting', async () => {
    vi.mocked(ensureAdmin).mockRejectedValueOnce(new Error('Ikke admin'))

    await expect(oppdaterBursdagsgratulasjon(true)).rejects.toThrow('Ikke admin')
    expect(mockFrom).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })
})

// ─── opprettPoll (lib/actions/poll.ts) — kompenserende sletting ────────────

describe('opprettPoll — kompenserende sletting feiler også', () => {
  it('kaster valgErr-meldingen og logger poll.opprett.opprydding.feilet', async () => {
    const input = {
      spoersmaal: 'Hvem vinner sommerfesten?',
      svarfrist: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      flervalg: false,
      valg: ['Alternativ A', 'Alternativ B'],
    }

    let pollKall = 0
    mockFrom.mockImplementation((tabell: string) => {
      if (tabell === 'poll') {
        pollKall++
        return pollKall === 1
          ? lagChain({ id: 'poll-x' }) // insert().select('id').single()
          : lagChain(null, { message: 'poll-sletting feilet', code: 'DB1' }) // kompenserende delete
      }
      if (tabell === 'poll_valg') return lagChain(null, { message: 'valg feilet', code: '23505' })
      return lagChain(null)
    })

    await expect(opprettPoll(input)).rejects.toThrow('valg feilet')
    expect(logg.feil).toHaveBeenCalledWith(
      'poll.opprett.opprydding.feilet',
      expect.objectContaining({ message: 'poll-sletting feilet' }),
      expect.objectContaining({ ctx: expect.objectContaining({ code: 'DB1', sample: 'poll-x' }) }),
    )
  })
})

// ─── opprettKaaringspoll (lib/actions/kaaringspoll.ts) — kompenserende sletting ─

describe('opprettKaaringspoll — kompenserende sletting feiler også', () => {
  it('kaster valgErr-meldingen og logger kaaringspoll.opprett.opprydding.feilet', async () => {
    const input = {
      kaaringMalId: 'mal-1',
      aar: 2026,
      svarfrist: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }
    const mal = { id: 'mal-1', navn: 'Årets gutt', kandidat_kilde: 'profil' }
    const medlemmer = [{ id: 'p1', navn: 'Ola' }, { id: 'p2', navn: 'Kari' }]

    let pollKall = 0
    mockFrom.mockImplementation((tabell: string) => {
      if (tabell === 'kaaringmaler') return lagChain(mal)
      if (tabell === 'profiles') return lagChain(medlemmer)
      if (tabell === 'poll') {
        pollKall++
        return pollKall === 1
          ? lagChain({ id: 'kpoll-1' })
          : lagChain(null, { message: 'kpoll-sletting feilet', code: 'DB2' })
      }
      if (tabell === 'poll_valg') return lagChain(null, { message: 'valg feilet kåring', code: '23505' })
      return lagChain(null)
    })

    await expect(opprettKaaringspoll(input)).rejects.toThrow('valg feilet kåring')
    expect(logg.feil).toHaveBeenCalledWith(
      'kaaringspoll.opprett.opprydding.feilet',
      expect.objectContaining({ message: 'kpoll-sletting feilet' }),
      expect.objectContaining({ ctx: expect.objectContaining({ code: 'DB2', sample: 'kpoll-1' }) }),
    )
  })
})

// ─── skrivHistorikk via oppdaterKontantSaldo (lib/actions/fond.ts) ──────────

describe('skrivHistorikk (via oppdaterKontantSaldo)', () => {
  it('logger fond.historikk.feilet og lar selve saldo-oppdateringen fullføre', async () => {
    mockFrom.mockImplementation((tabell: string) => {
      if (tabell === 'fond_kontant') return lagChain({ saldo: 100 })
      if (tabell === 'fond_verdi_historikk') return lagChain(null, { message: 'historikk feilet', code: 'DB3' })
      return lagChain(null)
    })

    await expect(oppdaterKontantSaldo(500)).resolves.toBeUndefined()
    expect(logg.feil).toHaveBeenCalledWith(
      'fond.historikk.feilet',
      expect.objectContaining({ message: 'historikk feilet' }),
      expect.objectContaining({ ctx: expect.objectContaining({ code: 'DB3', sample: 'kontant' }) }),
    )
    expect(mockRevalidatePath).toHaveBeenCalledWith('/fond')
  })
})

// ─── opprettMelding (lib/actions/meldinger.ts) — kompenserende sletting ────

describe('opprettMelding — kompenserende sletting feiler også', () => {
  it('kaster «Bildeopplasting feilet» og logger melding.opprett.opprydding.feilet', async () => {
    const input = { innhold: 'Kul kveld i går', bilde_urls: ['https://cdn.example.com/bilde.jpg'] }

    let meldingerKall = 0
    mockFrom.mockImplementation((tabell: string) => {
      if (tabell === 'meldinger') {
        meldingerKall++
        return meldingerKall === 1
          ? lagChain({ id: 'm1' }) // insert().select('id').single()
          : lagChain(null, { message: 'melding-sletting feilet', code: 'DB4' }) // kompenserende delete
      }
      if (tabell === 'melding_bilder') return lagChain(null, { message: 'bilde feilet', code: '23505' })
      return lagChain(null)
    })

    await expect(opprettMelding(input)).rejects.toThrow('Bildeopplasting feilet: bilde feilet')
    expect(logg.feil).toHaveBeenCalledWith(
      'melding.opprett.opprydding.feilet',
      expect.objectContaining({ message: 'melding-sletting feilet' }),
      expect.objectContaining({ ctx: expect.objectContaining({ code: 'DB4', sample: 'm1' }) }),
    )
  })
})
