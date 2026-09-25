// #700-review: «+»-knappens treffflate vokser utvidY oppover, og pickeren (z-index 10)
// ligger over forelderen — avstanden må dekke utvidelsen, ellers stjeler pickeren trykk.
// jsdom har ingen layout, så geometrien pinnes via de rendrede stilverdiene.

import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import ReaksjonBadges from '@/components/agenda/ReaksjonBadges'
import { PICKER_AVSTAND_PX } from '@/components/agenda/ReaksjonPicker'
import { REAKSJON_EMOJIS } from '@/lib/konstanter'

afterEach(cleanup)

function monter(medPluss: boolean) {
  return render(
    <ReaksjonBadges
      brukerId="meg"
      reaksjoner={[{ emoji: '👍', profilIder: ['meg'] }]}
      toggle={() => {}}
      isPending={false}
      apen
      lukk={() => {}}
      onPlussKlikk={medPluss ? () => {} : undefined}
    />,
  )
}

// Pickeren er div-en som eier emoji-knappene; avstanden står i bottom: calc(100% + Npx).
function pickerAvstand(container: HTMLElement): number {
  const picker = [...container.querySelectorAll('div')].find(d =>
    d.style.bottom.startsWith('calc'),
  )
  expect(picker, 'fant ingen åpen picker').toBeDefined()
  expect(picker!.querySelectorAll('button').length).toBe(REAKSJON_EMOJIS.length)
  const m = picker!.style.bottom.replace(/\s+/g, ' ').match(/calc\(100% \+ (\d+(?:\.\d+)?)px\)/)
  expect(m, `uventet bottom: ${picker!.style.bottom}`).not.toBeNull()
  return parseFloat(m![1])
}

describe('ReaksjonPicker overlapper ikke «+»-treffflaten (#700)', () => {
  it('åpen picker ligger minst like høyt over forelderen som +-flaten vokser oppover', () => {
    const { container, getByLabelText } = monter(true)
    const pluss = getByLabelText('Legg til reaksjon') as HTMLElement
    // Treffflaten vokser -marginTop px over radens topp (se Treffflate.tsx).
    const utvidOpp = -parseFloat(pluss.style.marginTop)
    expect(utvidOpp).toBeGreaterThan(0)
    expect(pickerAvstand(container)).toBeGreaterThanOrEqual(utvidOpp)
  })

  it('uten +-knapp beholder pickeren standardavstanden (ingen visuell endring på agenda)', () => {
    const { container } = monter(false)
    expect(pickerAvstand(container)).toBe(PICKER_AVSTAND_PX)
  })
})
