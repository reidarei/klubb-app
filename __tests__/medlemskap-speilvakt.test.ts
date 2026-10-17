// Prod-vakten for speilet profiles <-> medlemskap (#868): alarmerer på avvik og
// på en 2. klubb, og kaster aldri.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFeil } = vi.hoisted(() => ({ mockFeil: vi.fn() }))
vi.mock('@/lib/logg', () => ({ logg: { feil: mockFeil, warn: vi.fn() } }))

import { sjekkMedlemskapSpeil } from '@/lib/medlemskap-speilvakt'

function klient(rpc: () => unknown) {
  // Minimal admin-klient: vakten bruker bare rpc().
  return { rpc: vi.fn(rpc) } as unknown as Parameters<typeof sjekkMedlemskapSpeil>[0]
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFeil.mockResolvedValue(undefined)
})

describe('sjekkMedlemskapSpeil', () => {
  it('logger ingenting ved avvik=0 og én klubb', async () => {
    const admin = klient(() => ({ data: [{ avvik: 0, klubber: 1 }], error: null }))
    await sjekkMedlemskapSpeil(admin)
    expect(admin.rpc).toHaveBeenCalledWith('medlemskap_speil_avvik')
    expect(mockFeil).not.toHaveBeenCalled()
  })

  it('logger medlemskap.speil.avvik når avvik > 0', async () => {
    await sjekkMedlemskapSpeil(klient(() => ({ data: [{ avvik: 2, klubber: 1 }], error: null })))
    expect(mockFeil).toHaveBeenCalledWith(
      'medlemskap.speil.avvik',
      expect.objectContaining({ message: 'medlemskap.speil.avvik: avvik=2 klubber=1' }),
      { ctx: { count: 2 } },
    )
  })

  it('logger medlemskap.speil.avvik når en 2. klubb har medlemskap (fristen for PR C)', async () => {
    await sjekkMedlemskapSpeil(klient(() => ({ data: [{ avvik: 0, klubber: 2 }], error: null })))
    expect(mockFeil).toHaveBeenCalledWith('medlemskap.speil.avvik', expect.any(Error), { ctx: { count: 0 } })
  })

  it('tolker bigint levert som streng', async () => {
    await sjekkMedlemskapSpeil(klient(() => ({ data: [{ avvik: '0', klubber: '2' }], error: null })))
    expect(mockFeil).toHaveBeenCalledWith('medlemskap.speil.avvik', expect.any(Error), expect.anything())
  })

  it('logger oppslag.feilet når RPC-en svarer med error', async () => {
    await sjekkMedlemskapSpeil(klient(() => ({ data: null, error: { message: 'nede', code: '500' } })))
    expect(mockFeil).toHaveBeenCalledWith('medlemskap.speil.oppslag.feilet', expect.anything())
  })

  it('logger oppslag.feilet når raden mangler', async () => {
    await sjekkMedlemskapSpeil(klient(() => ({ data: [], error: null })))
    expect(mockFeil).toHaveBeenCalledWith('medlemskap.speil.oppslag.feilet', expect.any(Error))
  })

  it('logger oppslag.feilet og resolver når rpc kaster', async () => {
    const admin = klient(() => { throw new Error('nettverk') })
    await expect(sjekkMedlemskapSpeil(admin)).resolves.toBeUndefined()
    expect(mockFeil).toHaveBeenCalledWith('medlemskap.speil.oppslag.feilet', expect.any(Error))
  })

  it('resolver også når loggingen selv kaster', async () => {
    mockFeil.mockRejectedValue(new Error('logg nede'))
    const admin = klient(() => { throw new Error('nettverk') })
    await expect(sjekkMedlemskapSpeil(admin)).resolves.toBeUndefined()
  })
})
