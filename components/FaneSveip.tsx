'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { synligeFaner, toppnivaaFaneIndeks } from '@/lib/navigasjon'
import { sveipRetning, nabofaneIndeks } from '@/lib/sveip'

type Props = {
  rolle?: string | null
  visFond?: boolean
  /** Default true — chat skal aldri forsvinne pga. manglende prop (som TopHeader). */
  visChat?: boolean
}

/**
 * Vannrett sveip bytter fane, på samme måte som en bildekarusell.
 *
 * Rendres usynlig ved siden av TopHeader og lytter på hele vinduet. Tre ting
 * er verdt å vite om avgrensningene:
 *
 * 1. **Kun på selve fane-sidene** (`/`, `/chat`, `/klubbinfo`, `/fond`), ikke
 *    på undersidene deres. På `/arrangementer/123` er sveipen mot høyre iOS'
 *    tilbake-gest, og den er mer verdt der enn et faneskifte.
 * 2. **Kantsonen er fredet** — se KANT_SONE_PX i lib/sveip.ts. Systemgesten
 *    kan ikke skrus av, så vi deler skjermen med den i stedet for å slåss.
 * 3. **Alle lytterne er passive.** Vi kaller aldri preventDefault, så gesten
 *    kan ikke gjøre scrollingen hakkete (jf. ytelseskravet i CLAUDE.md).
 *
 * Følger samme touch-oppsett som DraNedForOppdater, inkludert touchcancel:
 * iOS sender den ved systemavbrudd (varsel, kontrollsenter) og da uteblir
 * touchend helt.
 */
export default function FaneSveip({ rolle, visFond = false, visChat = true }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    const faner = synligeFaner(rolle, visFond, visChat)
    const indeks = toppnivaaFaneIndeks(faner, pathname)
    // Ikke på en fane-side — ingen lyttere i det hele tatt, så undersider
    // koster ingenting.
    if (indeks === -1) return

    let startX = 0
    let startY = 0
    let sporer = false

    function start(e: TouchEvent) {
      // Flerfinger er zoom eller noe annet brukeren mener — aldri et faneskifte.
      if (e.touches.length !== 1) {
        sporer = false
        return
      }
      const t = e.touches[0]

      // Flater med egne vannrette gester eller egen sidescrolling melder seg av.
      // `closest` fanger også treff dypt inne i flaten, ikke bare på selve raden.
      const maal = e.target instanceof Element ? e.target : null
      if (maal?.closest('[data-sveip-fri]')) {
        sporer = false
        return
      }
      if (maal && harVannrettScroll(maal)) {
        sporer = false
        return
      }

      startX = t.clientX
      startY = t.clientY
      sporer = true
    }

    function end(e: TouchEvent) {
      if (!sporer) return
      sporer = false
      // touchend fyres også når én av flere fingre slippes.
      if (e.touches.length > 0) return
      const t = e.changedTouches[0]
      if (!t) return

      const retning = sveipRetning({
        dx: t.clientX - startX,
        dy: t.clientY - startY,
        startX,
        vindusbredde: window.innerWidth,
      })
      if (!retning) return

      const maalIndeks = nabofaneIndeks(indeks, faner.length, retning)
      if (maalIndeks === null) return
      router.push(faner[maalIndeks].href)
    }

    function cancel() {
      sporer = false
    }

    window.addEventListener('touchstart', start, { passive: true })
    window.addEventListener('touchend', end, { passive: true })
    window.addEventListener('touchcancel', cancel, { passive: true })
    return () => {
      window.removeEventListener('touchstart', start)
      window.removeEventListener('touchend', end)
      window.removeEventListener('touchcancel', cancel)
    }
  }, [pathname, rolle, visFond, visChat, router])

  return null
}

/**
 * True hvis gesten startet inne i noe som selv kan scrolles sidelengs.
 *
 * Uten denne ville en vannrett dradd tabell eller karusell både scrollet
 * innholdet og byttet fane. Vi går oppover i treet fordi fingeren som regel
 * treffer et barn av selve scroll-containeren.
 */
function harVannrettScroll(el: Element): boolean {
  let node: Element | null = el
  while (node && node !== document.body) {
    if (node.scrollWidth > node.clientWidth) {
      const overflow = getComputedStyle(node).overflowX
      if (overflow === 'auto' || overflow === 'scroll') return true
    }
    node = node.parentElement
  }
  return false
}
