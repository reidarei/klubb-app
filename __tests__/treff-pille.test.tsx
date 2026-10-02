// @vitest-environment jsdom
// Pinner TreffPille/TekstLenke (#700 PR 3): usynlig utvidelse på det ytre elementet,
// kallerens vertikale marger legges SAMMEN med den negative treffflate-marginen,
// og det synlige (bakgrunn/kant) havner på det indre laget.

import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { PilleKnapp, PilleLenke, PilleAnker } from '@/components/ui/TreffPille'
import TekstLenke from '@/components/ui/TekstLenke'
import TilbakeKnapp from '@/components/ui/TilbakeKnapp'
import { treffflateRundt } from '@/components/ui/Treffflate'
import { MIN_TREFFMAAL_PX } from '@/lib/konstanter'

afterEach(cleanup)

describe('PilleKnapp', () => {
  it('ytre knapp: usynlig, padding + lik negativ margin, kallerens marginBottom summeres', () => {
    const { utvidY } = treffflateRundt({ hoyde: 30 })
    render(
      <PilleKnapp style={{ marginBottom: 20 }} pilleStil={{ background: 'red', padding: '8px 14px' }}>
        Endre
      </PilleKnapp>,
    )
    const knapp = screen.getByRole('button')
    expect(knapp.style.paddingTop).toBe(`${utvidY}px`)
    expect(knapp.style.paddingBottom).toBe(`${utvidY}px`)
    expect(knapp.style.marginTop).toBe(`${-utvidY}px`)
    expect(knapp.style.marginBottom).toBe(`${20 - utvidY}px`)
    expect(knapp.style.minWidth).toBe(`${MIN_TREFFMAAL_PX}px`)
    // Ingen synlig bakgrunn på det ytre laget — den ligger på det indre.
    expect(knapp.style.background).toBe('none')
    const indre = knapp.firstElementChild as HTMLElement
    expect(indre.style.background).toBe('red')
    expect(indre.style.padding).toBe('8px 14px')
  })

  it('type="button" som standard, men submit kan overstyres', () => {
    render(<PilleKnapp pilleStil={{}} type="submit">Send</PilleKnapp>)
    expect(screen.getByRole('button').getAttribute('type')).toBe('submit')
    cleanup()
    render(<PilleKnapp pilleStil={{}}>Send</PilleKnapp>)
    expect(screen.getByRole('button').getAttribute('type')).toBe('button')
  })
})

describe('PilleLenke / PilleAnker', () => {
  it('PilleLenke og PilleAnker rendrer en <a> med href og indre pille', () => {
    render(
      <>
        <PilleLenke href="/a" pilleStil={{ background: 'red' }}>A</PilleLenke>
        <PilleAnker href="/api/x" pilleStil={{ background: 'blue' }}>B</PilleAnker>
      </>,
    )
    const lenker = screen.getAllByRole('link')
    expect(lenker.map(l => l.getAttribute('href'))).toEqual(['/a', '/api/x'])
    expect((lenker[1].firstElementChild as HTMLElement).style.background).toBe('blue')
  })
})

describe('TekstLenke', () => {
  it('utvider usynlig i høyden med lik negativ margin og har minWidth 44', () => {
    const { utvidY } = treffflateRundt({ hoyde: 12 })
    render(<TekstLenke href="/x" style={{ marginBottom: 14 }}>Se alle</TekstLenke>)
    const a = screen.getByRole('link')
    expect(a.style.paddingTop).toBe(`${utvidY}px`)
    expect(a.style.marginTop).toBe(`${-utvidY}px`)
    expect(a.style.marginBottom).toBe(`${14 - utvidY}px`)
    expect(a.style.minWidth).toBe(`${MIN_TREFFMAAL_PX}px`)
  })
})

describe('TilbakeKnapp', () => {
  it('er 44 px i flyten uten vertikal negativ margin, med tilgjengelig navn', () => {
    render(<TilbakeKnapp href="/album" til="Album" />)
    const a = screen.getByRole('link', { name: 'Tilbake til Album' })
    expect(a.style.width).toBe(`${MIN_TREFFMAAL_PX}px`)
    expect(a.style.height).toBe(`${MIN_TREFFMAAL_PX}px`)
    expect(a.style.marginTop).toBe('')
  })
})
