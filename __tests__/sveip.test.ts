// Pinner reglene for fane-sveip. Selve gesten kan ikke testes automatisk —
// Playwright reproduserer ikke iOS' kantgester (CLAUDE.md § Policy: Visuell
// verifikasjon) — så det som kan pinnes er regnestykket bak den.

import { describe, it, expect } from 'vitest'
import {
  sveipRetning,
  nabofaneIndeks,
  KANT_SONE_PX,
  SVEIP_TERSKEL_PX,
} from '@/lib/sveip'
import { synligeFaner, toppnivaaFaneIndeks, erAktivFane, FANER } from '@/lib/navigasjon'

const BREDDE = 390 // iPhone 14/15-bredde

function sveip(over: Partial<Parameters<typeof sveipRetning>[0]>) {
  return sveipRetning({ dx: 0, dy: 0, startX: BREDDE / 2, vindusbredde: BREDDE, ...over })
}

describe('sveipRetning', () => {
  it('drag mot venstre gir neste fane, som en bildekarusell', () => {
    expect(sveip({ dx: -100 })).toBe('neste')
  })

  it('drag mot høyre gir forrige fane', () => {
    expect(sveip({ dx: 100 })).toBe('forrige')
  })

  it('lar kantsonen være i fred — der eier iOS gesten', () => {
    // Reagerte vi her også, ville én sveip både gått tilbake OG byttet fane.
    expect(sveip({ dx: -100, startX: KANT_SONE_PX - 1 })).toBeNull()
    expect(sveip({ dx: 100, startX: BREDDE - KANT_SONE_PX + 1 })).toBeNull()
  })

  it('freder begge kanter, ikke bare venstre', () => {
    // Asymmetri her ville vært umulig for en bruker å forutse.
    expect(sveip({ dx: -100, startX: 2 })).toBeNull()
    expect(sveip({ dx: -100, startX: BREDDE - 2 })).toBeNull()
  })

  it('ignorerer korte drag', () => {
    expect(sveip({ dx: -(SVEIP_TERSKEL_PX - 1) })).toBeNull()
    expect(sveip({ dx: -SVEIP_TERSKEL_PX })).toBe('neste')
  })

  it('ignorerer skrå bevegelser — ellers bytter scrolling fane under fingeren', () => {
    // Lang nok vannrett komponent, men brukeren scroller åpenbart nedover.
    expect(sveip({ dx: -80, dy: 200 })).toBeNull()
  })

  it('godtar en litt skrå, men tydelig vannrett sveip', () => {
    expect(sveip({ dx: -100, dy: 30 })).toBe('neste')
  })

  it('behandler oppover og nedover likt', () => {
    expect(sveip({ dx: -80, dy: -200 })).toBeNull()
  })
})

describe('nabofaneIndeks', () => {
  it('finner naboen i begge retninger', () => {
    expect(nabofaneIndeks(1, 4, 'neste')).toBe(2)
    expect(nabofaneIndeks(1, 4, 'forrige')).toBe(0)
  })

  it('wrapper ikke rundt i noen ende', () => {
    // Å hoppe fra Agenda til Fond ytterst til høyre ville føltes som en feil,
    // og enden av rekka er eneste tilbakemelding på at man ER i enden.
    expect(nabofaneIndeks(0, 4, 'forrige')).toBeNull()
    expect(nabofaneIndeks(3, 4, 'neste')).toBeNull()
  })

  it('håndterer én enkelt fane uten å peke utenfor', () => {
    expect(nabofaneIndeks(0, 1, 'neste')).toBeNull()
    expect(nabofaneIndeks(0, 1, 'forrige')).toBeNull()
  })
})

describe('synligeFaner — sveiperekkefølgen er den brukeren ser', () => {
  it('vanlig medlem uten fond får Agenda, Chat, Klubb', () => {
    expect(synligeFaner('medlem', false, true).map(f => f.nokkel)).toEqual([
      'agenda',
      'chat',
      'klubb',
    ])
  })

  it('admin ser Fond selv når flagget er av', () => {
    expect(synligeFaner('admin', false, true).map(f => f.nokkel)).toEqual([
      'agenda',
      'chat',
      'klubb',
      'fond',
    ])
  })

  it('medlem ser Fond når flagget er på', () => {
    expect(synligeFaner('medlem', true, true).map(f => f.nokkel)).toContain('fond')
  })

  it('chat kan skrus av for medlemmer, men aldri for admin', () => {
    expect(synligeFaner('medlem', false, false).map(f => f.nokkel)).not.toContain('chat')
    expect(synligeFaner('admin', false, false).map(f => f.nokkel)).toContain('chat')
  })

  it('en skjult fane kan ikke sveipes til — naboen hopper over den', () => {
    // Hele grunnen til at listen er delt med headeren: sveiper man til en fane
    // som ikke vises, står man på en side uten vei tilbake i navigasjonen.
    const faner = synligeFaner('medlem', false, false)
    const fraAgenda = nabofaneIndeks(0, faner.length, 'neste')
    expect(faner[fraAgenda!].nokkel).toBe('klubb')
  })
})

describe('toppnivaaFaneIndeks — sveip kun på selve fane-sidene', () => {
  const faner = synligeFaner('medlem', false, true)

  it('kjenner igjen de eksakte fane-sidene', () => {
    expect(toppnivaaFaneIndeks(faner, '/')).toBe(0)
    expect(toppnivaaFaneIndeks(faner, '/chat')).toBe(1)
    expect(toppnivaaFaneIndeks(faner, '/klubbinfo')).toBe(2)
  })

  it('sier nei på undersider — der er sveipen iOS sin tilbake-gest', () => {
    expect(toppnivaaFaneIndeks(faner, '/arrangementer/123')).toBe(-1)
    expect(toppnivaaFaneIndeks(faner, '/album/abc')).toBe(-1)
    expect(toppnivaaFaneIndeks(faner, '/profil')).toBe(-1)
  })

  it('er strengere enn headerens erAktivFane — de svarer på ulike spørsmål', () => {
    // Headeren skal markere Agenda som aktiv på /arrangementer/123.
    // Sveipen skal likevel ikke gjøre noe der.
    const agenda = FANER[0]
    expect(erAktivFane(agenda, '/arrangementer/123')).toBe(true)
    expect(toppnivaaFaneIndeks(faner, '/arrangementer/123')).toBe(-1)
  })
})
