// Pinner Treffflate-primitiven (#700): tap-flaten når alltid 44 px på begge akser,
// uten å endre det synlige elementet, og geometrien kan ikke overstyres via style.

import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import Treffflate, { treffflateRundt } from '@/components/ui/Treffflate'

afterEach(cleanup)

describe('treffflateRundt() — utregnet utvidelse per akse', () => {
  it.each([
    [20, 12],
    [26, 9],
    [28, 8],
    [30, 7],
    [32, 6],
    [44, 0],
    [60, 0],
  ])('hoyde %i px → utvidY %i px', (hoyde, forventet) => {
    expect(treffflateRundt({ hoyde }).utvidY).toBe(forventet)
  })

  it('bredde 28 / høyde 26 → utvidX 8, utvidY 9', () => {
    const { utvidX, utvidY } = treffflateRundt({ bredde: 28, hoyde: 26 })
    expect(utvidX).toBe(8)
    expect(utvidY).toBe(9)
  })

  it('uten bredde: ingen horisontale felt i stil, kun longhands', () => {
    const { stil } = treffflateRundt({ hoyde: 20 })
    expect(stil).toEqual({
      paddingTop: 12,
      paddingBottom: 12,
      marginTop: -12,
      marginBottom: -12,
    })
  })

  it('med bredde: longhands på begge akser, ingen shorthand-nøkler', () => {
    const { stil } = treffflateRundt({ bredde: 28, hoyde: 26 })
    expect(stil).toEqual({
      paddingTop: 9,
      paddingBottom: 9,
      marginTop: -9,
      marginBottom: -9,
      paddingLeft: 8,
      paddingRight: 8,
      marginLeft: -8,
      marginRight: -8,
    })
    expect(stil).not.toHaveProperty('padding')
    expect(stil).not.toHaveProperty('margin')
  })

  it('minsteRadGap/minsteKolonneGap er dobbelt av utvidY/utvidX', () => {
    const t = treffflateRundt({ bredde: 28, hoyde: 26 })
    expect(t.minsteRadGap).toBe(t.utvidY * 2)
    expect(t.minsteKolonneGap).toBe(t.utvidX * 2)
  })
})

describe('<Treffflate> — rendret button', () => {
  it('kvadratisk synlig (tall): width/height ≥ 44, margin = -utvid alle kanter', () => {
    const { container } = render(<Treffflate synlig={20}>x</Treffflate>)
    const knapp = container.querySelector('button')!
    expect(parseFloat(knapp.style.width)).toBe(20 + 2 * 12)
    expect(parseFloat(knapp.style.height)).toBe(20 + 2 * 12)
    expect(parseFloat(knapp.style.width)).toBeGreaterThanOrEqual(44)
    expect(parseFloat(knapp.style.height)).toBeGreaterThanOrEqual(44)
    expect(parseFloat(knapp.style.marginTop)).toBe(-12)
    expect(parseFloat(knapp.style.marginBottom)).toBe(-12)
    expect(parseFloat(knapp.style.marginLeft)).toBe(-12)
    expect(parseFloat(knapp.style.marginRight)).toBe(-12)
  })

  it('rektangulær synlig ({bredde,hoyde}): width/height følger hver sin akse', () => {
    const { container } = render(<Treffflate synlig={{ bredde: 28, hoyde: 26 }}>x</Treffflate>)
    const knapp = container.querySelector('button')!
    expect(parseFloat(knapp.style.width)).toBe(28 + 2 * 8)
    expect(parseFloat(knapp.style.height)).toBe(26 + 2 * 9)
  })

  it('allerede ≥44 px (44, 60): ingen utvidelse, men fortsatt ≥44', () => {
    for (const storrelse of [44, 60]) {
      const { container, unmount } = render(<Treffflate synlig={storrelse}>x</Treffflate>)
      const knapp = container.querySelector('button')!
      expect(parseFloat(knapp.style.width)).toBe(storrelse)
      expect(parseFloat(knapp.style.marginTop)).toBe(0)
      expect(parseFloat(knapp.style.width)).toBeGreaterThanOrEqual(44)
      unmount()
    }
  })

  it('kallerens style kan ikke overstyre geometrien', () => {
    // as any: TypeScript hindrer allerede width/margin/padding i style-typen —
    // testen beviser at det OGSÅ stemmer ved runtime, ikke bare i typene.
    const ulovligStyle = { width: 999, marginTop: 0, color: 'red' } as any
    const { container } = render(
      <Treffflate synlig={20} style={ulovligStyle}>
        x
      </Treffflate>,
    )
    const knapp = container.querySelector('button')!
    expect(parseFloat(knapp.style.width)).toBe(20 + 2 * 12)
    expect(parseFloat(knapp.style.marginTop)).toBe(-12)
    // Ikke-geometriske felt i style SKAL slippe gjennom uendret.
    expect(knapp.style.color).toBe('red')
  })

  it('barn, aria-label og disabled videresendes til knappen', () => {
    const { container, getByLabelText } = render(
      <Treffflate synlig={20} aria-label="Test-knapp" disabled>
        <span data-testid="barn">i</span>
      </Treffflate>,
    )
    const knapp = container.querySelector('button')!
    expect(knapp.getAttribute('type')).toBe('button')
    expect(knapp.disabled).toBe(true)
    expect(getByLabelText('Test-knapp')).toBe(knapp)
    expect(container.querySelector('[data-testid="barn"]')).not.toBeNull()
  })
})
