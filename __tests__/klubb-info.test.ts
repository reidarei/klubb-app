import { describe, it, expect, vi } from 'vitest'

// lib/klubb-info.ts importerer server-klienten; de rene hjelperne trenger den ikke.
vi.mock('@/lib/supabase/server', () => ({ createServerClient: vi.fn() }))

import { delIAvsnitt, lesStiftet, stiftetTilDato } from '@/lib/klubb-info'

describe('delIAvsnitt', () => {
  it('deler på blanke linjer og trimmer', () => {
    expect(delIAvsnitt('Første.\n\n  Andre.  \n \n\nTredje.')).toEqual(['Første.', 'Andre.', 'Tredje.'])
  })
  it('enkelt linjeskift holder avsnittet samlet', () => {
    expect(delIAvsnitt('Linje en\nlinje to')).toEqual(['Linje en\nlinje to'])
  })
})

describe('lesStiftet / stiftetTilDato', () => {
  it('leser og skriver samme dato', () => {
    const s = lesStiftet('2007-11-24')
    expect(s).toEqual({ aar: 2007, maaned: 11, dag: 24 })
    expect(stiftetTilDato(s!)).toBe('2007-11-24')
  })
  it('avviser feil form', () => {
    expect(lesStiftet(null)).toBeNull()
    expect(lesStiftet('24.11.2007')).toBeNull()
  })
})
