/**
 * KommentarerPaaKort — de tre tilstandene rundt "knapp uten innhold" (#648).
 *
 * Bakgrunn: agenda-queryen henter de 30 globalt nyeste kommentarene innenfor
 * samme 12-mnd-vindu (cutoffIso) som arrangementene, på tvers av alle
 * arrangementer, og caper til 3 per kort. Et kort hvis kommentarer alle lå
 * utenfor det uttaket fikk telleren (totaltAntall) uten at kommentarer/
 * visteKommentarer hadde noe innhold — chevron-header som togglet en tom
 * seksjon, og et inline kommentarfelt som sto synlig fordi `apen` aldri fikk
 * noen chevron å bli lukket av.
 *
 * Testene pinner de tre avledede tilstandene: tallrik-men-tom (naviger),
 * faktisk innhold (chevron), og ingen kommentarer i det hele tatt (inline
 * felt fra start) — pluss samspillet mellom startKollapset og en optimistisk
 * rad, som er der #648-fiksen først introduserte en regresjon.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import KommentarerPaaKort, { type KommentarKortData } from '@/components/agenda/KommentarerPaaKort'
import ArrangementKort from '@/components/agenda/ArrangementKort'
import { sendChatMelding } from '@/lib/actions/chat'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}))
vi.mock('@/lib/actions/chat', () => ({
  sendChatMelding: vi.fn(),
}))

afterEach(() => {
  cleanup()
  push.mockClear()
  vi.mocked(sendChatMelding).mockReset()
})

/**
 * Lar send-handlingen henge: den optimistiske raden ryddes bort igjen når
 * transitionen fullfører (backstop-filteret i handleSend), og server-refresh
 * er mocket bort her — så en resolvet promise ville gjort raden usynlig av
 * grunner som ikke har noe med kollaps-tilstanden å gjøre.
 */
function sendHenger() {
  vi.mocked(sendChatMelding).mockReturnValue(new Promise<never>(() => {}))
}

function kommentar(id: string, innhold: string): KommentarKortData {
  return {
    id,
    innhold,
    opprettet: new Date().toISOString(),
    avsender: { navn: 'Ola Nordmann', bilde_url: null, rolle: null },
  }
}

describe('KommentarerPaaKort — tom liste med teller (#648)', () => {
  it('viser ingen chevron/aria-expanded, ingen inline-felt, og en navigerende label med tallet', () => {
    render(
      <KommentarerPaaKort
        kommentarer={[]}
        scope={{ type: 'arrangement', id: 'a1' }}
        totaltAntall={6}
      />,
    )

    // Ingen inline input
    expect(screen.queryByPlaceholderText('Skriv en kommentar…')).toBeNull()

    // Navigerende label med tallet — role="button" for tastatur-tilgjengelighet,
    // men INGEN aria-expanded (den ekspanderer ingenting), og en aria-label
    // som forteller at trykk navigerer bort, ikke toggler.
    const label = screen.getByText('6 kommentarer')
    expect(label.getAttribute('aria-expanded')).toBeNull()
    // Tallet står først i labelen — aria-label overstyrer tekstinnholdet, så
    // en ren handlingstekst ville skjult antallet for skjermleser.
    expect(label.getAttribute('aria-label')).toBe('6 kommentarer — åpne for å lese')

    fireEvent.click(label)
    expect(push).toHaveBeenCalledWith('/arrangementer/a1')
  })
})

describe('KommentarerPaaKort — faktisk innhold', () => {
  it('viser chevron-header som toggler listen', () => {
    const kommentarer = [kommentar('k1', 'Første'), kommentar('k2', 'Andre'), kommentar('k3', 'Tredje')]
    render(
      <KommentarerPaaKort
        kommentarer={kommentarer}
        scope={{ type: 'arrangement', id: 'a1' }}
        totaltAntall={3}
      />,
    )

    const header = screen.getByRole('button', { name: '3 kommentarer' })
    expect(header.getAttribute('aria-expanded')).toBe('true')

    // Listen er synlig fra start (default ekspandert)
    expect(screen.getByText('Første')).toBeInTheDocument()

    fireEvent.click(header)
    expect(header.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Første')).toBeNull()

    // Navigasjon skal ikke trigges av chevron-varianten
    expect(push).not.toHaveBeenCalled()
  })
})

describe('KommentarerPaaKort — ingen kommentarer', () => {
  it('viser inline-feltet fra start når det ikke finnes noen kommentar', () => {
    render(
      <KommentarerPaaKort
        kommentarer={[]}
        scope={{ type: 'arrangement', id: 'a1' }}
        totaltAntall={0}
      />,
    )

    expect(screen.queryByText(/kommentar/i, { selector: 'span' })).toBeNull()
    expect(screen.getByPlaceholderText('Skriv en kommentar…')).toBeInTheDocument()
  })
})

function skrivOgSend(tekst: string) {
  const felt = screen.getByPlaceholderText('Skriv en kommentar…')
  fireEvent.change(felt, { target: { value: tekst } })
  fireEvent.click(screen.getByRole('button', { name: 'Send kommentar' }))
}

describe('KommentarerPaaKort — optimistisk rad vs. kollaps', () => {
  it('viser raden umiddelbart når et kollapset kort først åpnes og så kommenteres', () => {
    sendHenger()
    // Produksjonstilfellet for startKollapset=true: kortet HAR kommentarer,
    // men de er gamle (KOMMENTARER_KOLLAPS_DAGER). Inline-feltet er da skjult
    // til medlemmet selv åpner seksjonen med chevronen.
    render(
      <KommentarerPaaKort
        kommentarer={[kommentar('k1', 'Gammel prat')]}
        scope={{ type: 'arrangement', id: 'a1' }}
        startKollapset
        totaltAntall={1}
        brukerNavn="Kari Nordmann"
      />,
    )

    expect(screen.queryByPlaceholderText('Skriv en kommentar…')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '1 kommentar' }))

    skrivOgSend('Fersk kommentar')
    expect(screen.getByText('Fersk kommentar')).toBeInTheDocument()
  })
})

describe('ArrangementKort — kort uten kommentarer starter aldri kollapset (#648)', () => {
  it('viser medlemmets egen kommentar umiddelbart etter send', () => {
    sendHenger()
    // Regresjonsvakt: da skalKollapse også slo inn på tom liste, ble
    // startKollapset=true → apen=false, og den optimistiske raden var usynlig
    // selv om medlemmet nettopp hadde trykket send. `apen` er state satt ved
    // mount og retter seg ikke etter at propen senere endrer seg.
    render(
      <ArrangementKort
        arr={{
          id: 'a1',
          type: 'moete',
          tittel: 'Månedsmøte',
          start_tidspunkt: new Date(Date.now() + 86_400_000).toISOString(),
          oppmoetested: null,
          antallJa: 0,
          minStatus: null,
        }}
        kommentarer={[]}
        totaltKommentarer={0}
        brukerNavn="Kari Nordmann"
      />,
    )

    skrivOgSend('Første kommentar')
    expect(screen.getByText('Første kommentar')).toBeInTheDocument()
  })
})
