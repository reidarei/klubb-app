// Pinner #688 sitt kjernescenario: et push-klikk-mål lest fra Cache Storage
// på /login skal bæres gjennom en vellykket innlogging, i stedet for å falle
// til agendaen slik #688 beskriver. Testen dekker de fire utfallene som
// avgjør om `router.push` lander på målet eller på '/'.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react'
import LoginSide from '@/app/(auth)/login/page'
import { PUSH_KLIKK_LOGIN_VINDU_MS } from '@/lib/konstanter'

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}))

const signInWithPassword = vi.fn(async () => ({ error: null }))
const resetPasswordForEmail = vi.fn(async () => ({ error: null }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { signInWithPassword, resetPasswordForEmail },
  }),
}))

vi.mock('@/lib/pending-nav', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/pending-nav')>()),
  lesPendingNav: vi.fn(),
  slettPendingNav: vi.fn(),
}))

vi.mock('@/lib/klient-logg', () => ({ sendFeilBeacon: vi.fn() }))

const { lesPendingNav, slettPendingNav } = await import('@/lib/pending-nav') as unknown as {
  lesPendingNav: ReturnType<typeof vi.fn>
  slettPendingNav: ReturnType<typeof vi.fn>
}
const { sendFeilBeacon } = await import('@/lib/klient-logg') as unknown as {
  sendFeilBeacon: ReturnType<typeof vi.fn>
}

// SW-mock med fangst av 'message'-lytteren, slik at broadcast-stien kan
// trigges direkte. jsdom har ingen navigator.serviceWorker i det hele tatt,
// så uten denne ser komponenten ingen SW og hopper over lytteren.
function stubServiceWorker() {
  const lyttere: ((e: MessageEvent) => void)[] = []
  vi.stubGlobal('navigator', {
    ...window.navigator,
    serviceWorker: {
      addEventListener: (type: string, fn: (e: MessageEvent) => void) => {
        if (type === 'message') lyttere.push(fn)
      },
      removeEventListener: () => {},
    },
  })
  return {
    send(data: unknown) {
      for (const fn of lyttere) fn({ data } as MessageEvent)
    },
    antallLyttere: () => lyttere.length,
  }
}

async function loggInn() {
  fireEvent.change(screen.getByLabelText('E-post'), { target: { value: 'ole@example.com' } })
  fireEvent.change(screen.getByLabelText('Passord'), { target: { value: 'hemmelig' } })
  fireEvent.click(screen.getByRole('button', { name: /logg inn/i }))
  await waitFor(() => expect(push).toHaveBeenCalled())
}

beforeEach(() => {
  push.mockClear()
  refresh.mockClear()
  signInWithPassword.mockClear()
  lesPendingNav.mockReset()
  lesPendingNav.mockResolvedValue(null)
  slettPendingNav.mockReset()
  slettPendingNav.mockResolvedValue(undefined)
  sendFeilBeacon.mockClear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('LoginSide — push-klikk-mål gjennom innlogging (#688)', () => {
  it('fersk, lokal oppføring → router.push til målet (inkl. hash), beacon med klikk_id', async () => {
    lesPendingNav.mockResolvedValue({
      url: '/tidligere#test',
      ts: Date.now(),
      klikk_id: 'klikk-123',
    })

    render(<LoginSide />)
    await waitFor(() => expect(lesPendingNav).toHaveBeenCalled())
    await loggInn()

    expect(push).toHaveBeenCalledWith('/tidligere#test')
    expect(slettPendingNav).not.toHaveBeenCalled()
    expect(sendFeilBeacon).toHaveBeenCalledWith(
      'push.klikk.innlogging',
      expect.any(String),
      undefined,
      { kilde: 'login', klikk_id: 'klikk-123', maal: '/tidligere#test' },
      'warn',
    )
  })

  it('ingen oppføring → router.push("/"), ingen beacon', async () => {
    lesPendingNav.mockResolvedValue(null)

    render(<LoginSide />)
    await waitFor(() => expect(lesPendingNav).toHaveBeenCalled())
    await loggInn()

    expect(push).toHaveBeenCalledWith('/')
    expect(sendFeilBeacon).not.toHaveBeenCalled()
  })

  it('fremmed (kryss-origin) URL → router.push("/"), oppføringen slettet', async () => {
    lesPendingNav.mockResolvedValue({
      url: 'https://evil.example/x',
      ts: Date.now(),
    })

    render(<LoginSide />)
    await waitFor(() => expect(slettPendingNav).toHaveBeenCalled())
    await loggInn()

    expect(push).toHaveBeenCalledWith('/')
    expect(sendFeilBeacon).not.toHaveBeenCalled()
  })

  it('for gammel oppføring (utenfor PUSH_KLIKK_LOGIN_VINDU_MS) → router.push("/"), slettet', async () => {
    lesPendingNav.mockResolvedValue({
      url: '/chat',
      ts: Date.now() - PUSH_KLIKK_LOGIN_VINDU_MS - 1000,
    })

    render(<LoginSide />)
    await waitFor(() => expect(slettPendingNav).toHaveBeenCalled())
    await loggInn()

    expect(push).toHaveBeenCalledWith('/')
    expect(sendFeilBeacon).not.toHaveBeenCalled()
  })
})

// Tilstand 3 i den manuelle iPhone-testen: appen står ALT åpen og synlig på
// /login når varselet kommer. clients.focus() fyrer da ingen
// visibilitychange (public/sw.js beskriver samme tilfelle), så mount-
// oppslaget og visibility-lytteren var begge stumme — refen forble tom og
// innloggingen gikk fortsatt til '/' (review av PR #690).
describe('LoginSide — SW-broadcast som trigger når siden alt er synlig', () => {
  it('message fra SW leser cache-entryen på nytt, og innloggingen lander på målet', async () => {
    const sw = stubServiceWorker()
    // Ingen oppføring ved mount (varselet kom ETTER at siden var oppe) —
    // andre oppslag, trigget av broadcasten, finner den.
    lesPendingNav.mockResolvedValueOnce(null)
    lesPendingNav.mockResolvedValue({
      url: '/arrangementer/7#kommentarer',
      ts: Date.now(),
      klikk_id: 'klikk-sync',
    })

    render(<LoginSide />)
    await waitFor(() => expect(lesPendingNav).toHaveBeenCalledTimes(1))
    expect(sw.antallLyttere()).toBe(1)

    sw.send({ type: 'navigate', url: '/arrangementer/7#kommentarer' })
    await waitFor(() => expect(lesPendingNav).toHaveBeenCalledTimes(2))
    await loggInn()

    expect(push).toHaveBeenCalledWith('/arrangementer/7#kommentarer')
    expect(sendFeilBeacon).toHaveBeenCalledWith(
      'push.klikk.innlogging',
      expect.any(String),
      undefined,
      { kilde: 'login', klikk_id: 'klikk-sync', maal: '/arrangementer/7#kommentarer' },
      'warn',
    )
  })

  it('cache-skrivingen i SW feilet: URL-en fra selve meldingen brukes som fallback', async () => {
    const sw = stubServiceWorker()
    lesPendingNav.mockResolvedValue(null)

    render(<LoginSide />)
    await waitFor(() => expect(lesPendingNav).toHaveBeenCalled())

    sw.send({ type: 'navigate', url: '/chat' })
    await waitFor(() => expect(lesPendingNav).toHaveBeenCalledTimes(2))
    await loggInn()

    expect(push).toHaveBeenCalledWith('/chat')
  })

  it('kryss-origin URL i meldingen ignoreres', async () => {
    const sw = stubServiceWorker()
    lesPendingNav.mockResolvedValue(null)

    render(<LoginSide />)
    await waitFor(() => expect(lesPendingNav).toHaveBeenCalled())

    sw.send({ type: 'navigate', url: 'https://evil.example/x' })
    await waitFor(() => expect(lesPendingNav).toHaveBeenCalledTimes(2))
    await loggInn()

    expect(push).toHaveBeenCalledWith('/')
  })
})

// Vinduet ble tidligere kun sjekket der oppføringen ble LEST. Blir en mann
// stående på login lenger enn PUSH_KLIKK_LOGIN_VINDU_MS, ble et foreldet mål
// brukt likevel (review av PR #690).
describe('LoginSide — vinduet valideres på nytt ved innsending', () => {
  it('målet er blitt for gammelt mens han sto på login: lander på "/" og oppføringen forkastes', async () => {
    const start = Date.now()
    let naa = start
    vi.spyOn(Date, 'now').mockImplementation(() => naa)
    lesPendingNav.mockResolvedValue({ url: '/chat', ts: start, klikk_id: 'klikk-treg' })

    render(<LoginSide />)
    await waitFor(() => expect(lesPendingNav).toHaveBeenCalled())

    // Han lot siden ligge og logget inn lenge etterpå.
    naa = start + PUSH_KLIKK_LOGIN_VINDU_MS + 1000
    await loggInn()

    expect(push).toHaveBeenCalledWith('/')
    expect(slettPendingNav).toHaveBeenCalled()
    expect(sendFeilBeacon).toHaveBeenCalledWith(
      'klient.pushklikk.foreldet',
      expect.any(String),
      undefined,
      undefined,
      'warn',
    )
    expect(sendFeilBeacon).not.toHaveBeenCalledWith(
      'push.klikk.innlogging',
      expect.any(String),
      undefined,
      expect.any(Object),
      'warn',
    )
  })

  it('fortsatt innenfor vinduet ved innsending: lander på målet', async () => {
    const start = Date.now()
    let naa = start
    vi.spyOn(Date, 'now').mockImplementation(() => naa)
    lesPendingNav.mockResolvedValue({ url: '/chat', ts: start })

    render(<LoginSide />)
    await waitFor(() => expect(lesPendingNav).toHaveBeenCalled())

    naa = start + PUSH_KLIKK_LOGIN_VINDU_MS - 1000
    await loggInn()

    expect(push).toHaveBeenCalledWith('/chat')
  })
})
