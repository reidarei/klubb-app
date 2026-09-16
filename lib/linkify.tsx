'use client'

// Sentral linkify-utility. Rendrer URLer i tekst som klikkbare lenker.
// Brukes i chat-bobler, meldingskort, kommentarer og arrangementsbeskrivelser.
// Markert 'use client' fordi <a onClick> ikke kan serialiseres i Server Components. se #350
//
// Pure-helper `splittPaaUrler` er skilt ut i lib/linkify-core.ts slik at
// tester kan importere den uten å trekke inn JSX-transformasjon.

import React from 'react'
import { useRouter } from 'next/navigation'
import { splittPaaUrler } from '@/lib/linkify-core'
import { lokalSti } from '@/lib/pending-nav'

export { splittPaaUrler } from '@/lib/linkify-core'
export type { LinkDel } from '@/lib/linkify-core'

/**
 * Er lenka til appen selv? Returnerer i så fall stien å navigere til.
 *
 * Deler en lenke til f.eks. /kart i et innlegg, skal trykket holde deg INNE i
 * appen. Fram til #703 fikk hver eneste URL `target="_blank"`, som på en
 * installert PWA betyr at Safari åpnes oppå — man mister appen, sesjonen ser
 * ut til å være borte, og veien tilbake er å lukke nettleseren manuelt.
 *
 * `lokalSti()` gjenbrukes fordi den allerede bærer open-redirect-vakten (den
 * avviser `//host`, som er same-origin men resolver eksternt). Her legges kun
 * www-søskenet oppå: domenet er kjøpt på apex, så folk skriver like gjerne
 * `klubb.example.com/kart` som www-varianten, og begge er «appen» for
 * den som leser innlegget. Selve vurderingen gjøres i nettleseren, der
 * `window.location` finnes — lib/config er server-only og kan ikke leses her.
 */
function appSti(href: string): string | null {
  const direkte = lokalSti(href)
  if (direkte) return direkte
  if (typeof window === 'undefined') return null
  try {
    const u = new URL(href)
    const uten = (h: string) => h.replace(/^www\./i, '')
    if (uten(u.host) !== uten(window.location.host)) return null
    // Bygg om mot VÅR origin og kjør gjennom vakten på nytt, i stedet for å
    // stole på pathname direkte — da beholdes `//host`-sjekken.
    return lokalSti(u.pathname + u.search + u.hash)
  } catch {
    return null
  }
}

const lenkeStil: React.CSSProperties = {
  color: 'var(--accent)',
  textDecoration: 'underline',
  // overflowWrap: 'anywhere' brytes pent på vilkårlig sted ved
  // overflow, men foretrekker fortsatt naturlige break-punkter
  // (slashes, bindestreker). break-all var for aggressivt og
  // brøt URLer midt i ord uten grunn. se #350
  overflowWrap: 'anywhere',
}

/**
 * Rendrer tekst der URLer er gjort om til klikkbare lenker.
 * stopPropagation hindrer at chat-bobler med touch-handlere "spiser" klikket.
 *
 * `inneILenke`: sett når teksten rendres inni et kort som selv er en <Link>
 * (MeldingKort, KommentarerPaaKort). Nøstet <a>-i-<a> er ugyldig HTML —
 * parseren auto-lukker den ytre og DOM-en matcher ikke Reacts tre ved
 * hydrering (#418-krasj i prod, se #465). Da rendres URL-en som
 * <span role="link"> med window.open i stedet.
 */
export function Linkified({ text, inneILenke = false }: { text: string; inneILenke?: boolean }) {
  const router = useRouter()
  const deler = splittPaaUrler(text)

  if (deler.length === 0) return null

  return (
    <>
      {deler.map((del, i) => {
        if (del.type === 'url') {
          if (inneILenke) {
            const aapne = (e: React.SyntheticEvent) => {
              // preventDefault stopper den ytre kort-Link-ens navigasjon,
              // stopPropagation hindrer at klikket når dens onClick-handlere.
              e.preventDefault()
              e.stopPropagation()
              // Peker lenka inn i appen, navigerer vi der i stedet for å
              // sparke brukeren ut i Safari (#703).
              const sti = appSti(del.href)
              if (sti) {
                router.push(sti)
                return
              }
              window.open(del.href, '_blank', 'noopener,noreferrer')
            }
            return (
              <span
                key={i}
                role="link"
                tabIndex={0}
                onClick={aapne}
                onKeyDown={(e) => { if (e.key === 'Enter') aapne(e) }}
                style={{ ...lenkeStil, cursor: 'pointer' }}
              >
                {del.verdi}
              </span>
            )
          }
          // MERK at target/rel er de samme uansett om lenka er intern: markupen
          // må være identisk på server og klient, ellers hydrerer den ikke
          // (React #418 — samme klasse som #466 og #698). Det er KLIKKET som
          // avgjør, og det avgjøres i nettleseren der window.location finnes.
          // Svikter JS, faller man tilbake til å åpne lenka som før — en
          // dårligere, men fungerende vei.
          return (
            <a
              key={i}
              href={del.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              onClick={(e) => {
                e.stopPropagation()
                const sti = appSti(del.href)
                if (sti) {
                  e.preventDefault()
                  router.push(sti)
                }
              }}
              style={lenkeStil}
            >
              {del.verdi}
            </a>
          )
        }
        return <React.Fragment key={i}>{del.verdi}</React.Fragment>
      })}
    </>
  )
}
