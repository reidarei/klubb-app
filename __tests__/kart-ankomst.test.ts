// Pinner ANKOMST-BESLUTNINGEN for en delt steds-lenke (#753) — ikke selve
// flyvningen, som ikke finnes å observere i jsdom (se lib/kart-ankomst.ts).

import { describe, it, expect, vi, afterEach } from 'vitest'
import { planleggAnkomst, foretrekkerRedusertBevegelse } from '@/lib/kart-ankomst'
import { KART_DELT_STED_ZOOM, POSISJON_KART_ZOOM } from '@/lib/konstanter'

describe('planleggAnkomst()', () => {
  it('normal ankomst: fødes vidt, ender innzoomet, og animerer', () => {
    const ankomst = planleggAnkomst(false)
    expect(ankomst.startZoom).toBeLessThan(ankomst.sluttZoom)
    expect(ankomst.sluttZoom).toBe(KART_DELT_STED_ZOOM)
    expect(ankomst.animer).toBe(true)
    expect(ankomst.varighetSek).toBeGreaterThan(0)
  })

  it('regresjonsvakt (#753): sluttzoomen skal være vesentlig nærmere enn POSISJON_KART_ZOOM — det var jo klagen', () => {
    const ankomst = planleggAnkomst(false)
    expect(ankomst.sluttZoom).toBeGreaterThan(POSISJON_KART_ZOOM)
  })

  it('sluttzoomen overstiger aldri flislagets maxZoom (19) — et nivå over gir grå ruter', () => {
    const ankomst = planleggAnkomst(false)
    expect(ankomst.sluttZoom).toBeLessThanOrEqual(19)
  })

  it('redusert bevegelse: lander direkte på sluttutsnittet, ingen animasjon — funksjonen består, bevegelsen forsvinner', () => {
    const ankomst = planleggAnkomst(true)
    expect(ankomst.startZoom).toBe(ankomst.sluttZoom)
    expect(ankomst.sluttZoom).toBe(KART_DELT_STED_ZOOM)
    expect(ankomst.animer).toBe(false)
  })
})

describe('foretrekkerRedusertBevegelse()', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returnerer false uten window.matchMedia (jsdom-guarden #753 handler om)', () => {
    // jsdom har ikke matchMedia i utgangspunktet (__tests__/setup.ts polyfyller
    // det ikke) — dette er derfor allerede miljøets naturlige tilstand, men vi
    // stubber eksplisitt bort et eventuelt matchMedia for å gjøre forutsetningen
    // eksplisitt uavhengig av testmiljøets fremtidige oppsett.
    vi.stubGlobal('matchMedia', undefined)
    expect(foretrekkerRedusertBevegelse()).toBe(false)
  })

  it('leser mq.matches når matchMedia finnes', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    expect(foretrekkerRedusertBevegelse()).toBe(true)
  })
})
