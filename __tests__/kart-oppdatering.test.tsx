/**
 * Pinner refresh-kontrakten på kartet (#718).
 *
 * Bakgrunn: pull-to-refresh er slått av på /kart (siden er scroll-låst, så en
 * dra-ned-gest leses alltid som panorering), og «Oppdater»-knappen er
 * erstatningen. Kontrakten har to sider, og den ene er en NEGATIV assert:
 *
 *  1. Går delingen bra, skal det IKKE kalles router.refresh() — delPosisjon
 *     gjør revalidatePath('/kart') selv på serveren, og en refresh i tillegg
 *     ville vært en ekstra RSC-runde for data vi allerede har bedt om. Det er
 *     hele ytelsesvalget i #718, og uten denne testen er det én uskyldig
 *     «forenkling» unna å bli reversert.
 *  2. Feiler noe FØR revalideringen — ingen GPS, nektet tilgang, delPosisjon
 *     som svarer { ok: false } eller kaster — må kartet friskes opp eksplisitt,
 *     ellers blir det stående med gamle data etter et trykk på «Oppdater».
 *
 * Testene rendrer den ekte komponenten og styrer Geolocation API-et, i stedet
 * for å teste en kopi av logikken.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent, act, waitFor } from '@testing-library/react'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}))

const delPosisjon = vi.fn()
vi.mock('@/lib/actions/posisjon', () => ({
  delPosisjon: (...a: unknown[]) => delPosisjon(...a),
  stoppDeling: vi.fn(async () => ({ ok: true })),
  plingEtterPosisjon: vi.fn(async () => ({ ok: true })),
}))

vi.mock('@/lib/actions/kart-markering', () => ({
  settMarkering: vi.fn(async () => ({ ok: true })),
  slettMarkering: vi.fn(async () => ({ ok: true })),
}))

const sendFeilBeacon = vi.fn()
vi.mock('@/lib/klient-logg', () => ({ sendFeilBeacon: (...a: unknown[]) => sendFeilBeacon(...a) }))

import PosisjonsKart, { type Mann } from '@/components/kart/PosisjonsKart'

// Fanger callback-paret fra hvert getCurrentPosition-kall, slik at testen selv
// bestemmer NÅR GPS svarer — den kontrollen er det som gjør «mens hentingen
// pågår» observerbar i det hele tatt.
type GpsKall = { ok: PositionCallback; feil: PositionErrorCallback }

let gpsKall: GpsKall[] = []
const getCurrentPosition = vi.fn((ok: PositionCallback, feil: PositionErrorCallback) => {
  gpsKall.push({ ok, feil })
})

function settGeolocation(verdi: unknown) {
  Object.defineProperty(window.navigator, 'geolocation', { value: verdi, configurable: true })
}

const POSISJON = {
  coords: { latitude: 59.85, longitude: 10.82, accuracy: 12 },
} as unknown as GeolocationPosition

// GeolocationPositionError finnes ikke i jsdom, og koden leser code mot
// konstantene PÅ selve feilobjektet — derfor må de være med her.
function gpsFeil(code: 1 | 2 | 3, melding = 'testfeil'): GeolocationPositionError {
  return {
    code,
    message: melding,
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  } as GeolocationPositionError
}

const MEG = 'meg-1'

function mann(): Mann {
  return {
    profilId: MEG,
    navn: 'Test Testesen',
    bildeUrl: null,
    rolle: 'medlem',
    delerTil: new Date(Date.now() + 3_600_000).toISOString(),
    spor: [
      { id: 'p1', lat: 59.8, lng: 10.8, noeyaktighetM: 10, registrert: new Date().toISOString() },
    ],
  }
}

function monter({ deler }: { deler: boolean }) {
  return render(
    <PosisjonsKart
      menn={deler ? [mann()] : []}
      markeringer={[]}
      megId={MEG}
      underArrangement={false}
      erAdmin={false}
      fallbackSenter={{ lat: 59.9, lng: 10.8 }}
      visChat={false}
      chatMeldinger={[]}
      chatProfiler={[]}
      timeplanArrangement={null}
      timeplanPoster={[]}
      timeplanFeil={false}
      deltSted={null}
      pingKandidater={[]}
      reisemodus={false}
    />,
  )
}

/** Trykker «Oppdater»/«Del posisjonen min» og gir tilbake GPS-kallet trykket utløste. */
async function trykkOppdater(): Promise<GpsKall> {
  const foer = gpsKall.length
  await act(async () => {
    fireEvent.click(screen.getByTestId('del-knapp'))
  })
  expect(gpsKall.length).toBe(foer + 1)
  return gpsKall[gpsKall.length - 1]
}

beforeEach(() => {
  gpsKall = []
  refresh.mockClear()
  delPosisjon.mockReset()
  delPosisjon.mockResolvedValue({ ok: true })
  getCurrentPosition.mockClear()
  sendFeilBeacon.mockClear()
  settGeolocation({ getCurrentPosition })
})

afterEach(cleanup)

describe('kartets «Oppdater» — når friskes kartet opp, og når ikke', () => {
  it('vellykket deling gir INGEN ekstra router.refresh (delPosisjon revaliderer selv)', async () => {
    monter({ deler: false })
    const kall = await trykkOppdater()

    await act(async () => {
      kall.ok(POSISJON)
    })

    expect(delPosisjon).toHaveBeenCalledWith(59.85, 10.82, 12)
    // Kjernen i hele filen: én vellykket deling = én serverrunde.
    expect(refresh).not.toHaveBeenCalled()
    expect(screen.queryByTestId('kart-feil')).toBeNull()
  })

  it('nektet GPS friskes opp likevel — andres bevegelser skal inn selv om din egen feiler', async () => {
    monter({ deler: false })
    const kall = await trykkOppdater()

    await act(async () => {
      kall.feil(gpsFeil(1, 'User denied Geolocation'))
    })

    expect(delPosisjon).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('kart-feil')).toHaveTextContent('Innstillinger')
    // Warn, ikke error: at en mann sier nei er ikke en programfeil.
    expect(sendFeilBeacon).toHaveBeenCalledWith(
      'klient.posisjon.nektet',
      expect.any(String),
      undefined,
      expect.objectContaining({ fingerprint: 'nektet' }),
      'warn',
    )
  })

  it('telefon uten Geolocation API friskes opp — det kommer aldri en kvittering å revalidere på', async () => {
    settGeolocation(undefined)
    monter({ deler: false })

    await act(async () => {
      fireEvent.click(screen.getByTestId('del-knapp'))
    })

    expect(getCurrentPosition).not.toHaveBeenCalled()
    expect(delPosisjon).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('kart-feil')).toHaveTextContent(
      'Denne telefonen gir ikke appen tilgang til posisjon.',
    )
  })

  it('delPosisjon som svarer ok: false friskes opp (den nådde aldri revalidatePath)', async () => {
    delPosisjon.mockResolvedValue({ ok: false, melding: 'Du deler ikke akkurat nå.' })
    monter({ deler: false })
    const kall = await trykkOppdater()

    await act(async () => {
      kall.ok(POSISJON)
    })

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('kart-feil')).toHaveTextContent('Du deler ikke akkurat nå.')
  })

  it('delPosisjon som kaster friskes opp, og feilen havner i UI-et i stedet for som unhandled rejection', async () => {
    delPosisjon.mockRejectedValue(new Error('Ikke innlogget'))
    monter({ deler: false })
    const kall = await trykkOppdater()

    await act(async () => {
      kall.ok(POSISJON)
    })

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('kart-feil')).toHaveTextContent(
      'Klarte ikke lagre posisjonen. Prøv igjen.',
    )
  })
})

describe('kartets «Oppdater» — knappetilstand', () => {
  it('knappen er låst og sier «Henter …» så lenge GPS ikke har svart', async () => {
    monter({ deler: true })
    // Sidelast-oppdateringen for den som allerede deler er stille: den skal
    // verken låse knappen eller vise noe.
    expect(screen.getByTestId('del-knapp')).not.toBeDisabled()
    expect(screen.getByTestId('del-knapp')).toHaveTextContent('Oppdater')

    const kall = await trykkOppdater()
    expect(screen.getByTestId('del-knapp')).toBeDisabled()
    expect(screen.getByTestId('del-knapp')).toHaveTextContent('Henter …')
    // Låsen gjelder hele raden: ellers kunne man slutte å dele midt i en
    // henting som er på vei til å skrive et nytt punkt.
    expect(screen.getByTestId('stopp-knapp')).toBeDisabled()

    await act(async () => {
      kall.ok(POSISJON)
    })
    expect(screen.getByTestId('del-knapp')).not.toBeDisabled()
    expect(screen.getByTestId('del-knapp')).toHaveTextContent('Oppdater')
  })

  it('den stille sidelast-oppdateringen viser aldri feil og friskes aldri opp', async () => {
    monter({ deler: true })
    expect(gpsKall.length).toBe(1)

    await act(async () => {
      gpsKall[0].feil(gpsFeil(1))
    })

    expect(screen.queryByTestId('kart-feil')).toBeNull()
    expect(refresh).not.toHaveBeenCalled()
    // Den stille varianten er nettopp den som kan avsløre en glemt tillatelse
    // i iOS-PWA-en, så den logges — med auto-prefiks for å kunne skilles.
    expect(sendFeilBeacon).toHaveBeenCalledWith(
      'klient.posisjon.nektet',
      expect.any(String),
      undefined,
      expect.objectContaining({ fingerprint: 'auto-nektet' }),
      'warn',
    )
  })
})

describe('kartets «Oppdater» for den som IKKE deler — egen pille, felles lås', () => {
  // Denne pilla er hele grunnen til at en mann som følger turen uten å dele
  // egen posisjon har en vei til friske data i det hele tatt (#718). Fram til
  // review-en av #718 klikket ingen test på den: alle testene over trykker
  // «Del posisjonen min» (`del-knapp`). En brukket onClick, en endret testid
  // eller en feilkoblet disabled kunne altså fjerne den eneste refresh-veien
  // uten at suiten ble rød.

  it('ett trykk på pilla gir nøyaktig én router.refresh() — og rører ikke GPS', async () => {
    monter({ deler: false })

    await act(async () => {
      fireEvent.click(screen.getByTestId('oppdater-kart-knapp'))
    })

    expect(refresh).toHaveBeenCalledTimes(1)
    // Den skal friske opp kartet, ikke melde ham inn: ingen GPS-forespørsel,
    // ingen delPosisjon. Deler man ikke, skal et trykk her ikke begynne å dele.
    expect(getCurrentPosition).not.toHaveBeenCalled()
    expect(delPosisjon).not.toHaveBeenCalled()
  })

  it('pilla er låst mens GPS-hentingen fra nabopilla pågår', async () => {
    monter({ deler: false })
    expect(screen.getByTestId('oppdater-kart-knapp')).not.toBeDisabled()

    // `meg` er fortsatt null mens hentingen pågår, så denne grenen står montert
    // og pilla er synlig. Uten felles `opptatt`-lås ville den vært klikkbar, og
    // hvert trykk et router.refresh() i kappløp med den hentOgLagre selv ender i.
    const kall = await trykkOppdater()
    expect(screen.getByTestId('oppdater-kart-knapp')).toBeDisabled()

    await act(async () => {
      fireEvent.click(screen.getByTestId('oppdater-kart-knapp'))
    })
    expect(refresh).not.toHaveBeenCalled()

    await act(async () => {
      kall.ok(POSISJON)
    })
    // Vellykket deling revaliderer på serveren, så fortsatt ingen refresh —
    // og pilla er åpen igjen for neste gang han vil se hvor de andre er.
    expect(refresh).not.toHaveBeenCalled()
    expect(screen.getByTestId('oppdater-kart-knapp')).not.toBeDisabled()
  })
})
