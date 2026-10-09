// sendVarsel kaster kun FØR utsendingsløkka (VarselUtfall-invarianten i
// lib/varsler.ts). Løkka selv har ingen try/catch rundt sendPush og
// sendEpostBatch — invarianten hviler på at de to aldri kaster. Alle andre
// varsel-tester mocker dem bort, så den forutsetningen pinnes her (#851).
// varsel_logg-inserten (den tredje per-mottaker-operasjonen) er dekket i
// __tests__/varsler.test.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSendNotification, mockSetVapid, mockLoggFeil, config } = vi.hoisted(() => ({
  mockSendNotification: vi.fn(),
  mockSetVapid: vi.fn(),
  mockLoggFeil: vi.fn().mockResolvedValue(undefined),
  config: { VAPID_CONTACT_EMAIL: 'drift@klubb.test' },
}))

vi.mock('web-push', () => ({
  default: { sendNotification: mockSendNotification, setVapidDetails: mockSetVapid },
}))
vi.mock('@/lib/config', () => ({
  get VAPID_CONTACT_EMAIL() {
    return config.VAPID_CONTACT_EMAIL
  },
}))
vi.mock('@/lib/logg', () => ({ logg: { feil: mockLoggFeil, warn: vi.fn() } }))

const SUB = { endpoint: 'https://push.example.com/x', p256dh: 'k', auth: 'a' }
const PAYLOAD = { tittel: 'T', melding: 'M' }

beforeEach(() => {
  vi.resetModules() // init() husker «initialisert» på modulnivå
  mockSendNotification.mockReset()
  mockSetVapid.mockReset()
  mockLoggFeil.mockClear()
  config.VAPID_CONTACT_EMAIL = 'drift@klubb.test'
})

describe('sendPush kaster aldri', () => {
  it('web-push avviser (ikke 410)', async () => {
    mockSendNotification.mockRejectedValue(Object.assign(new Error('500'), { statusCode: 500 }))
    const { sendPush } = await import('@/lib/push')
    await expect(sendPush(SUB, PAYLOAD)).resolves.toBeUndefined()
    expect(mockLoggFeil).toHaveBeenCalledWith('varsel.push.feilet', expect.anything())
  })

  it('VAPID-kontakt mangler', async () => {
    config.VAPID_CONTACT_EMAIL = ''
    const { sendPush } = await import('@/lib/push')
    await expect(sendPush(SUB, PAYLOAD)).resolves.toBeUndefined()
    expect(mockSendNotification).not.toHaveBeenCalled()
    expect(mockLoggFeil).toHaveBeenCalledWith('varsel.push.oppsett.feilet', expect.anything())
  })

  it('ugyldige VAPID-nøkler (setVapidDetails kaster)', async () => {
    mockSetVapid.mockImplementation(() => {
      throw new Error('Vapid public key should be 65 bytes long')
    })
    const { sendPush } = await import('@/lib/push')
    await expect(sendPush(SUB, PAYLOAD)).resolves.toBeUndefined()
    expect(mockLoggFeil).toHaveBeenCalledWith('varsel.push.oppsett.feilet', expect.anything())
  })
})

describe('sendEpostBatch kaster aldri', () => {
  const EPOST = [{ til: 'a@klubb.test', emne: 'E', html: '<p>x</p>' }]

  it('nettverksfeil', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))
    const { sendEpostBatch } = await import('@/lib/epost')
    await expect(sendEpostBatch(EPOST)).resolves.toBeUndefined()
    expect(mockLoggFeil).toHaveBeenCalledWith('varsel.epost.feilet', expect.anything())
    vi.unstubAllGlobals()
  })

  it('Resend svarer med feilstatus', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nei', { status: 422 })))
    const { sendEpostBatch } = await import('@/lib/epost')
    await expect(sendEpostBatch(EPOST)).resolves.toBeUndefined()
    expect(mockLoggFeil).toHaveBeenCalledWith('varsel.epost.feilet', expect.anything(), expect.anything())
    vi.unstubAllGlobals()
  })
})
